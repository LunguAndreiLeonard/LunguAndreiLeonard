/**
 * Provider abstraction layer.
 *
 * Every video backend (MuAPI, fal.ai, mock) implements `VideoProvider`.
 * The UI is driven entirely by `getCapabilities()` — options a provider or
 * model doesn't support are hidden/disabled, never submitted.
 */

export type GenerationMode = 't2v' | 'i2v' | 'continuation';

export type JobLifecycleStatus = 'queued' | 'running' | 'completed' | 'failed';

/** How a provider identifies the source clip for a continuation job. */
export type ContinuationInput = 'request_id' | 'video_url';

export interface ModelSpec {
  /** Stable internal id, unique within a provider (e.g. "seedance-2.0"). */
  id: string;
  name: string;
  modes: GenerationMode[];
  aspectRatios: string[];
  /** Durations in seconds. 0 means "auto" (provider picks). */
  durations: number[];
  resolutions: string[];
  /** Quality tiers, empty when the model has no quality knob. */
  qualities: string[];
  /** Max reference images accepted in i2v mode. 0 = i2v unsupported. */
  maxRefImages: number;
  /** Whether the model can generate audio. */
  audio: boolean;
  /** Only meaningful when modes includes 'continuation'. */
  continuationInput?: ContinuationInput;
}

export interface ProviderCapabilities {
  models: ModelSpec[];
  /** Union across models — convenience for coarse UI checks. */
  aspectRatios: string[];
  durations: number[];
  maxRefImages: number;
  audio: boolean;
}

export interface GenerationParams {
  mode: GenerationMode;
  /** ModelSpec.id */
  model: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  /** Seconds; 0 = auto. */
  duration?: number;
  resolution?: string;
  quality?: string;
  generateAudio?: boolean;
  seed?: number;
  /** i2v reference images (https or data: URLs). */
  imageUrls?: string[];
  /** Continuation source — one of the two, per the model's continuationInput. */
  sourceRequestId?: string;
  sourceVideoUrl?: string;
}

export interface SubmittedJob {
  /** Provider-side job/request id. */
  jobId: string;
  /**
   * Opaque provider data required to poll later (e.g. fal's status/response
   * URLs). Persisted with the job record and passed back to pollJob verbatim.
   */
  context?: Record<string, string>;
}

export interface JobPollResult {
  status: JobLifecycleStatus;
  /** 0..100 when the provider reports it. */
  progress?: number;
  resultUrl?: string;
  error?: string;
}

export interface PollHandle {
  jobId: string;
  context?: Record<string, string>;
  /** ModelSpec.id and mode the job was submitted with. */
  model: string;
  mode: GenerationMode;
}

export interface VideoProvider {
  readonly id: string;
  readonly name: string;
  /** True when the provider works without an API key (mock/dry-run). */
  readonly keyless?: boolean;
  getCapabilities(): ProviderCapabilities;
  submitJob(params: GenerationParams, apiKey: string): Promise<SubmittedJob>;
  pollJob(handle: PollHandle, apiKey: string): Promise<JobPollResult>;
  /** Upload a local file, returning a URL usable in GenerationParams. */
  uploadFile(file: File, apiKey: string, onProgress?: (pct: number) => void): Promise<string>;
}

export function getModelSpec(caps: ProviderCapabilities, modelId: string): ModelSpec | undefined {
  return caps.models.find((m) => m.id === modelId);
}

/** Union helper used by providers to build the aggregate capability fields. */
export function aggregateCapabilities(models: ModelSpec[]): ProviderCapabilities {
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  return {
    models,
    aspectRatios: uniq(models.flatMap((m) => m.aspectRatios)),
    durations: uniq(models.flatMap((m) => m.durations)).sort((a, b) => a - b),
    maxRefImages: Math.max(0, ...models.map((m) => m.maxRefImages)),
    audio: models.some((m) => m.audio),
  };
}
