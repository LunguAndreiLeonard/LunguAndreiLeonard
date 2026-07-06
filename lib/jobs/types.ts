import type { GenerationMode, JobLifecycleStatus } from '../providers/types';

export interface JobParamsSnapshot {
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  quality?: string;
  generateAudio?: boolean;
  seed?: number;
  imageUrls?: string[];
  sourceRequestId?: string;
  sourceVideoUrl?: string;
  /** Raw template field values, kept so "re-run with edits" can refill the form. */
  templateInputs?: Record<string, string>;
}

export interface JobRecord {
  /** Local id (uuid), independent of the provider's job id. */
  id: string;
  provider: string;
  model: string;
  mode: GenerationMode;
  templateId?: string;
  templateName?: string;
  compiledPrompt: string;
  negativePrompt?: string;
  params: JobParamsSnapshot;
  status: JobLifecycleStatus;
  progress?: number;
  resultUrl?: string;
  /** Result copied to Supabase Storage (M3, optional). */
  archivedUrl?: string;
  error?: string;
  costEstimate?: number | null;
  providerJobId?: string;
  providerContext?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Storage abstraction for job history. LocalStorageJobStore ships first;
 * SupabaseJobStore implements the same interface once credentials exist.
 * All methods are async so the swap is invisible to callers.
 */
export interface JobStore {
  list(): Promise<JobRecord[]>;
  get(id: string): Promise<JobRecord | undefined>;
  upsert(job: JobRecord): Promise<void>;
  remove(id: string): Promise<void>;
  /** Notifies on any change (including from other tabs where detectable). */
  subscribe(listener: () => void): () => void;
}
