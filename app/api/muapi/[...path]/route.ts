import { NextRequest, NextResponse } from 'next/server';

/**
 * Thin pass-through proxy to api.muapi.ai.
 *
 * Exists only because MuAPI doesn't send CORS headers for browser origins
 * (the original open-generative-ai repo needed a Vite dev proxy for the same
 * reason). The user's API key travels in the x-api-key header and is never
 * stored server-side.
 */

const MUAPI_BASE = 'https://api.muapi.ai';
const ALLOWED_PREFIX = '/api/v1/';

async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  const targetPath = `/${path.join('/')}`;
  if (!targetPath.startsWith(ALLOWED_PREFIX)) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 400 });
  }
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing x-api-key header' }, { status: 401 });
  }

  const url = `${MUAPI_BASE}${targetPath}${request.nextUrl.search}`;
  const headers: Record<string, string> = { 'x-api-key': apiKey };
  const contentType = request.headers.get('content-type');
  // Pass multipart bodies (file upload) through untouched; JSON likewise.
  if (contentType) headers['content-type'] = contentType;

  const upstream = await fetch(url, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    // @ts-expect-error — duplex is required by undici when streaming a body.
    duplex: 'half',
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}
