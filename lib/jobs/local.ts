'use client';

import type { JobRecord, JobStore } from './types';

const STORAGE_KEY = 'studio.jobs.v1';
/** Keep history bounded so we never hit the localStorage quota. */
const MAX_JOBS = 200;

/**
 * Reference images can be multi-megabyte data: URIs (fal/mock uploads).
 * Persisting those would blow the ~5 MB localStorage quota after a handful of
 * jobs, so they are replaced with a marker on write. Re-run still works — the
 * user just re-attaches the image.
 */
function stripInlineImages(job: JobRecord): JobRecord {
  const imageUrls = job.params.imageUrls?.map((u) => (u.startsWith('data:') ? 'inline:stripped' : u));
  return { ...job, params: { ...job.params, imageUrls } };
}

export class LocalStorageJobStore implements JobStore {
  private listeners = new Set<() => void>();
  private cache: JobRecord[] | null = null;
  private storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      this.cache = null;
      this.emit();
    }
  };

  private read(): JobRecord[] {
    if (this.cache) return this.cache;
    if (typeof window === 'undefined') return [];
    try {
      this.cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as JobRecord[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private write(jobs: JobRecord[]): void {
    const bounded = jobs
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_JOBS);
    this.cache = bounded;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded.map(stripInlineImages)));
    } catch (e) {
      console.warn('[jobs] persist failed:', e);
    }
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  async list(): Promise<JobRecord[]> {
    return [...this.read()];
  }

  async get(id: string): Promise<JobRecord | undefined> {
    return this.read().find((j) => j.id === id);
  }

  async upsert(job: JobRecord): Promise<void> {
    const jobs = this.read().filter((j) => j.id !== job.id);
    jobs.push({ ...job, updatedAt: new Date().toISOString() });
    this.write(jobs);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((j) => j.id !== id));
  }

  subscribe(listener: () => void): () => void {
    if (this.listeners.size === 0 && typeof window !== 'undefined') {
      window.addEventListener('storage', this.storageHandler);
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && typeof window !== 'undefined') {
        window.removeEventListener('storage', this.storageHandler);
      }
    };
  }
}

/** The active store. Swapped for SupabaseJobStore in M3 once credentials exist. */
export const jobStore: JobStore = new LocalStorageJobStore();
