import {
  aggregateCapabilities,
  type GenerationParams,
  type JobPollResult,
  type ModelSpec,
  type PollHandle,
  type ProviderCapabilities,
  type SubmittedJob,
  type VideoProvider,
} from './types';

/**
 * Dry-run provider: no API key, no network. Jobs "render" for ~8 seconds with
 * fake progress, then resolve to a public sample clip. Lets the whole UI —
 * templates, queue, history, resume-after-reload — be exercised without any
 * account.
 *
 * Timing state lives in the poll handle context (submittedAt), not in module
 * memory, so mock jobs survive a page reload like real ones.
 */

const RENDER_MS = 8_000;
const SAMPLE_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
];

const MODELS: ModelSpec[] = [
  {
    id: 'mock-seedance',
    name: 'Mock Seedance (dry run)',
    modes: ['t2v', 'i2v', 'continuation'],
    aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    durations: [0, 5, 8, 10, 15],
    resolutions: ['480p', '720p', '1080p'],
    qualities: ['high', 'basic'],
    maxRefImages: 9,
    audio: true,
    continuationInput: 'video_url',
  },
  {
    id: 'mock-basic',
    name: 'Mock Basic (t2v only, minimal caps)',
    modes: ['t2v'],
    aspectRatios: ['16:9', '9:16'],
    durations: [5],
    resolutions: ['720p'],
    qualities: [],
    maxRefImages: 0,
    audio: false,
  },
];

export const mockProvider: VideoProvider = {
  id: 'mock',
  name: 'Mock (dry run)',
  keyless: true,

  getCapabilities(): ProviderCapabilities {
    return aggregateCapabilities(MODELS);
  },

  async submitJob(params: GenerationParams): Promise<SubmittedJob> {
    if (!params.prompt.trim()) throw new Error('Mock provider: prompt is empty.');
    // Deterministic-ish id without Date.now collisions across tabs.
    const jobId = `mock_${crypto.randomUUID()}`;
    return { jobId, context: { submittedAt: String(Date.now()) } };
  },

  async pollJob(handle: PollHandle): Promise<JobPollResult> {
    const submittedAt = Number(handle.context?.submittedAt ?? 0);
    if (!submittedAt) return { status: 'failed', error: 'Mock job lost its submit timestamp.' };
    const elapsed = Date.now() - submittedAt;
    if (elapsed < RENDER_MS) {
      return {
        status: elapsed < RENDER_MS / 4 ? 'queued' : 'running',
        progress: Math.min(99, Math.round((elapsed / RENDER_MS) * 100)),
      };
    }
    // Stable pick per job id so re-polls agree.
    const idx = [...handle.jobId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % SAMPLE_VIDEOS.length;
    return { status: 'completed', progress: 100, resultUrl: SAMPLE_VIDEOS[idx] };
  },

  async uploadFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
  },
};
