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

/**
 * MuAPI (api.muapi.ai) provider.
 *
 * Protocol (ported from open-generative-ai): POST /api/v1/{endpoint} with an
 * x-api-key header returns { request_id }; poll GET
 * /api/v1/predictions/{id}/result until status is completed/failed.
 *
 * Requests are routed through our own /api/muapi/* route handler because
 * MuAPI does not reliably send CORS headers for browser calls (the original
 * repo needed a dev proxy for the same reason).
 */

const PROXY_BASE = '/api/muapi';

interface MuModel extends ModelSpec {
  endpoints: Partial<Record<GenerationMode, string>>;
  /** Which payload field carries reference images in i2v mode. */
  imageField?: 'image_url' | 'images_list';
  /** Models with a resolution knob vs a quality knob differ in payload. */
  hasGenerateAudioFlag?: boolean;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const MODELS: MuModel[] = [
  {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    modes: ['t2v', 'i2v', 'continuation'],
    aspectRatios: ['16:9', '9:16', '4:3', '3:4'],
    durations: [5, 10, 15],
    resolutions: [],
    qualities: ['high', 'basic'],
    maxRefImages: 1,
    audio: true,
    continuationInput: 'request_id',
    endpoints: {
      t2v: 'seedance-v2.0-t2v',
      i2v: 'seedance-v2.0-i2v',
      continuation: 'seedance-v2.0-extend',
    },
    imageField: 'images_list',
  },
  {
    id: 'seedance-1.5-pro',
    name: 'Seedance 1.5 Pro',
    modes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1', '3:4', '4:3', '21:9'],
    durations: range(4, 12),
    resolutions: ['480p', '720p', '1080p'],
    qualities: [],
    maxRefImages: 1,
    audio: true,
    endpoints: {
      t2v: 'seedance-v1.5-pro-t2v',
      i2v: 'seedance-v1.5-pro-i2v',
    },
    imageField: 'image_url',
    hasGenerateAudioFlag: true,
  },
  {
    id: 'seedance-1.5-pro-fast',
    name: 'Seedance 1.5 Pro Fast',
    modes: ['t2v', 'i2v'],
    aspectRatios: ['16:9', '9:16', '1:1', '3:4', '4:3', '21:9'],
    durations: range(4, 12),
    resolutions: ['720p', '1080p'],
    qualities: [],
    maxRefImages: 1,
    audio: true,
    endpoints: {
      t2v: 'seedance-v1.5-pro-t2v-fast',
      i2v: 'seedance-v1.5-pro-i2v-fast',
    },
    imageField: 'image_url',
    hasGenerateAudioFlag: true,
  },
];

function findModel(id: string): MuModel {
  const model = MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`MuAPI: unknown model "${id}"`);
  return model;
}

/** Seedance has no separate negative-prompt field; fold it into the prompt. */
export function foldNegativePrompt(prompt: string, negativePrompt?: string): string {
  const neg = negativePrompt?.trim();
  return neg ? `${prompt.trim()} Avoid: ${neg}.` : prompt.trim();
}

function buildPayload(params: GenerationParams, model: MuModel): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (params.mode === 'continuation') {
    if (!params.sourceRequestId) {
      throw new Error('MuAPI continuation needs the request id of the original generation.');
    }
    payload.request_id = params.sourceRequestId;
    if (params.prompt.trim()) payload.prompt = foldNegativePrompt(params.prompt, params.negativePrompt);
    if (params.duration) payload.duration = params.duration;
    if (params.quality) payload.quality = params.quality;
    return payload;
  }

  payload.prompt = foldNegativePrompt(params.prompt, params.negativePrompt);
  if (params.aspectRatio) payload.aspect_ratio = params.aspectRatio;
  if (params.duration) payload.duration = params.duration;
  if (params.resolution && model.resolutions.length > 0) payload.resolution = params.resolution;
  if (params.quality && model.qualities.length > 0) payload.quality = params.quality;
  if (model.hasGenerateAudioFlag && params.generateAudio !== undefined) {
    payload.generate_audio = params.generateAudio;
  }
  if (params.seed !== undefined && params.seed !== -1) payload.seed = params.seed;

  if (params.mode === 'i2v') {
    const images = params.imageUrls ?? [];
    if (images.length === 0) throw new Error('i2v needs at least one reference image.');
    if (model.imageField === 'images_list') payload.images_list = images;
    else payload.image_url = images[0];
  }

  return payload;
}

async function muFetch(path: string, apiKey: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${PROXY_BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), 'x-api-key': apiKey },
  });
  return response;
}

export const muApiProvider: VideoProvider = {
  id: 'muapi',
  name: 'MuAPI',

  getCapabilities(): ProviderCapabilities {
    return aggregateCapabilities(MODELS);
  },

  async submitJob(params: GenerationParams, apiKey: string): Promise<SubmittedJob> {
    const model = findModel(params.model);
    const endpoint = model.endpoints[params.mode];
    if (!endpoint) throw new Error(`MuAPI: ${model.name} does not support ${params.mode}.`);

    const response = await muFetch(`/api/v1/${endpoint}`, apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(params, model)),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MuAPI submit failed: ${response.status} — ${text.slice(0, 200)}`);
    }
    const data = (await response.json()) as { request_id?: string; id?: string };
    const jobId = data.request_id ?? data.id;
    if (!jobId) throw new Error('MuAPI submit returned no request id.');
    return { jobId };
  },

  async pollJob(handle: PollHandle, apiKey: string): Promise<JobPollResult> {
    const response = await muFetch(`/api/v1/predictions/${handle.jobId}/result`, apiKey);
    if (!response.ok) {
      // Transient server hiccups shouldn't kill the job — report still running.
      if (response.status >= 500) return { status: 'running' };
      const text = await response.text();
      return { status: 'failed', error: `Poll failed: ${response.status} — ${text.slice(0, 200)}` };
    }
    const data = (await response.json()) as {
      status?: string;
      error?: string;
      outputs?: string[];
      url?: string;
      output?: { url?: string };
    };
    const status = data.status?.toLowerCase() ?? '';
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      const resultUrl = data.outputs?.[0] ?? data.url ?? data.output?.url;
      if (!resultUrl) return { status: 'failed', error: 'Job completed but no output URL was returned.' };
      return { status: 'completed', resultUrl };
    }
    if (status === 'failed' || status === 'error') {
      return { status: 'failed', error: data.error || 'Generation failed.' };
    }
    return { status: status === 'queued' || status === 'pending' ? 'queued' : 'running' };
  },

  async uploadFile(file: File, apiKey: string, onProgress?: (pct: number) => void): Promise<string> {
    // XHR instead of fetch for upload progress events.
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${PROXY_BASE}/api/v1/upload_file`);
      xhr.setRequestHeader('x-api-key', apiKey);
      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as { url?: string; file_url?: string; data?: { url?: string } };
            const url = data.url ?? data.file_url ?? data.data?.url;
            if (url) resolve(url);
            else reject(new Error('MuAPI upload returned no URL.'));
          } catch {
            reject(new Error('MuAPI upload returned an unreadable response.'));
          }
        } else {
          reject(new Error(`MuAPI upload failed: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during file upload.'));
      xhr.send(formData);
    });
  },
};
