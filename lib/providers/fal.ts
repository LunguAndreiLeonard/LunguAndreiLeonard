import {
  aggregateCapabilities,
  type GenerationParams,
  type GenerationMode,
  type JobPollResult,
  type ModelSpec,
  type PollHandle,
  type ProviderCapabilities,
  type SubmittedJob,
  type VideoProvider,
} from './types';
import { foldNegativePrompt } from './muapi';

/**
 * fal.ai provider, built on their queue API (verified against fal docs,
 * June 2026):
 *
 *   submit:  POST https://queue.fal.run/{endpoint-id}
 *            Authorization: Key {FAL_KEY}
 *            → { request_id, status_url, response_url, cancel_url, queue_position }
 *   status:  GET {status_url}   → { status: IN_QUEUE | IN_PROGRESS | COMPLETED, queue_position? }
 *   result:  GET {response_url} → model output, e.g. { video: { url }, seed }
 *
 * We persist status_url/response_url in the job context instead of deriving
 * them (fal collapses nested endpoint paths in those URLs, so deriving is
 * fragile). queue.fal.run sends CORS headers, so the browser calls it
 * directly — no proxy needed.
 *
 * Continuation: Seedance 2.0 has no dedicated extend endpoint on fal; it is
 * done through reference-to-video with the source clip in video_urls.
 */

const QUEUE_BASE = 'https://queue.fal.run';

interface FalModel extends ModelSpec {
  endpoints: Partial<Record<GenerationMode, string>>;
}

const MODELS: FalModel[] = [
  {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    modes: ['t2v', 'i2v', 'continuation'],
    aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    durations: [0, 5, 8, 10], // 0 = auto
    resolutions: ['480p', '720p', '1080p'],
    qualities: [],
    maxRefImages: 9,
    audio: true,
    continuationInput: 'video_url',
    endpoints: {
      t2v: 'bytedance/seedance-2.0/text-to-video',
      i2v: 'bytedance/seedance-2.0/image-to-video',
      continuation: 'bytedance/seedance-2.0/reference-to-video',
    },
  },
  {
    id: 'seedance-2.0-fast',
    name: 'Seedance 2.0 Fast',
    modes: ['t2v', 'i2v', 'continuation'],
    aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    durations: [0, 5, 8, 10],
    resolutions: ['480p', '720p'],
    qualities: [],
    maxRefImages: 9,
    audio: true,
    continuationInput: 'video_url',
    endpoints: {
      t2v: 'bytedance/seedance-2.0/fast/text-to-video',
      i2v: 'bytedance/seedance-2.0/fast/image-to-video',
      continuation: 'bytedance/seedance-2.0/fast/reference-to-video',
    },
  },
  {
    id: 'seedance-1.5-pro',
    name: 'Seedance 1.5 Pro',
    modes: ['t2v', 'i2v'],
    aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    resolutions: ['480p', '720p', '1080p'],
    qualities: [],
    maxRefImages: 1,
    audio: true,
    endpoints: {
      t2v: 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video',
      i2v: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
    },
  },
];

function findModel(id: string): FalModel {
  const model = MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`fal.ai: unknown model "${id}"`);
  return model;
}

function buildPayload(params: GenerationParams, model: FalModel): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    prompt: foldNegativePrompt(params.prompt, params.negativePrompt),
  };
  if (params.aspectRatio) payload.aspect_ratio = params.aspectRatio;
  // fal's Seedance endpoints take duration as a string enum ("5", "auto").
  payload.duration = params.duration ? String(params.duration) : 'auto';
  if (params.resolution) payload.resolution = params.resolution;
  if (params.generateAudio !== undefined) payload.generate_audio = params.generateAudio;
  if (params.seed !== undefined && params.seed !== -1) payload.seed = params.seed;

  if (params.mode === 'i2v') {
    const images = params.imageUrls ?? [];
    if (images.length === 0) throw new Error('i2v needs at least one reference image.');
    if (images.length > 1) {
      // Multiple references are a reference-to-video call (see submitJob,
      // which swaps the endpoint accordingly) and use image_urls.
      payload.image_urls = images;
    } else {
      payload.image_url = images[0];
    }
  }

  if (params.mode === 'continuation') {
    if (!params.sourceVideoUrl) {
      throw new Error('fal.ai continuation needs the URL of the source video.');
    }
    payload.video_urls = [params.sourceVideoUrl];
    // reference-to-video addresses attachments as @Video1 etc.; make the
    // intent explicit if the user's prompt doesn't mention it already.
    const prompt = String(payload.prompt);
    if (!prompt.includes('@Video1')) {
      payload.prompt = `Continue the scene from @Video1. ${prompt}`;
    }
  }

  return payload;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' };
}

/** Extract a playable URL from the many shapes fal outputs use. */
function extractResultUrl(output: unknown): string | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const o = output as { video?: { url?: string }; url?: string; videos?: Array<{ url?: string }> };
  return o.video?.url ?? o.url ?? o.videos?.[0]?.url;
}

export const falProvider: VideoProvider = {
  id: 'fal',
  name: 'fal.ai',

  getCapabilities(): ProviderCapabilities {
    return aggregateCapabilities(MODELS);
  },

  async submitJob(params: GenerationParams, apiKey: string): Promise<SubmittedJob> {
    const model = findModel(params.model);
    let endpoint = model.endpoints[params.mode];
    // The plain image-to-video endpoint takes exactly one image_url; several
    // reference images are only supported by reference-to-video.
    if (params.mode === 'i2v' && (params.imageUrls?.length ?? 0) > 1) {
      endpoint = model.endpoints.continuation;
      if (!endpoint) throw new Error(`fal.ai: ${model.name} supports only one reference image.`);
    }
    if (!endpoint) throw new Error(`fal.ai: ${model.name} does not support ${params.mode}.`);

    const response = await fetch(`${QUEUE_BASE}/${endpoint}`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(buildPayload(params, model)),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`fal.ai submit failed: ${response.status} — ${text.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    };
    if (!data.request_id) throw new Error('fal.ai submit returned no request id.');
    return {
      jobId: data.request_id,
      context: {
        statusUrl: data.status_url ?? `${QUEUE_BASE}/${endpoint}/requests/${data.request_id}/status`,
        responseUrl: data.response_url ?? `${QUEUE_BASE}/${endpoint}/requests/${data.request_id}`,
      },
    };
  },

  async pollJob(handle: PollHandle, apiKey: string): Promise<JobPollResult> {
    const statusUrl = handle.context?.statusUrl;
    const responseUrl = handle.context?.responseUrl;
    if (!statusUrl || !responseUrl) {
      return { status: 'failed', error: 'Missing fal.ai poll URLs for this job.' };
    }

    const statusRes = await fetch(statusUrl, { headers: authHeaders(apiKey) });
    if (!statusRes.ok) {
      if (statusRes.status >= 500) return { status: 'running' };
      const text = await statusRes.text();
      return { status: 'failed', error: `fal.ai status failed: ${statusRes.status} — ${text.slice(0, 200)}` };
    }
    const status = (await statusRes.json()) as { status?: string; queue_position?: number };

    if (status.status === 'IN_QUEUE') return { status: 'queued' };
    if (status.status === 'IN_PROGRESS') return { status: 'running' };
    if (status.status !== 'COMPLETED') return { status: 'running' };

    // COMPLETED covers both success and model-level failure; the result
    // endpoint tells us which.
    const resultRes = await fetch(responseUrl, { headers: authHeaders(apiKey) });
    if (!resultRes.ok) {
      const text = await resultRes.text();
      return { status: 'failed', error: `fal.ai result failed: ${resultRes.status} — ${text.slice(0, 300)}` };
    }
    const output = (await resultRes.json()) as unknown;
    const resultUrl = extractResultUrl(output);
    if (!resultUrl) {
      const detail = (output as { detail?: unknown })?.detail;
      return { status: 'failed', error: detail ? JSON.stringify(detail).slice(0, 300) : 'Job completed but no video URL was returned.' };
    }
    return { status: 'completed', resultUrl };
  },

  async uploadFile(file: File): Promise<string> {
    // fal accepts data: URIs anywhere a URL input is expected, which keeps us
    // off their (SDK-only) storage API. Fine for reference images.
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('Reference file too large for inline upload to fal.ai (8 MB max). Resize it first.');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
  },
};
