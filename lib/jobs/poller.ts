'use client';

import { getProvider } from '../providers';
import { getApiKey } from '../settings';
import { jobStore } from './local';
import type { JobRecord } from './types';

/**
 * Client-side polling manager. One timer loop per active job; survives page
 * reloads because `resumePendingJobs()` (called once on app mount) re-arms a
 * loop for every non-terminal job in the store.
 */

const POLL_INTERVAL_MS = 3_500;
const MAX_CONSECUTIVE_ERRORS = 8;
const MAX_JOB_AGE_MS = 45 * 60 * 1000; // consider a job dead after 45 min

const active = new Map<string, ReturnType<typeof setTimeout>>();

export function isPolling(jobId: string): boolean {
  return active.has(jobId);
}

export function stopPolling(jobId: string): void {
  const timer = active.get(jobId);
  if (timer) clearTimeout(timer);
  active.delete(jobId);
}

export function startPolling(job: JobRecord): void {
  if (active.has(job.id)) return;
  if (job.status === 'completed' || job.status === 'failed') return;
  let consecutiveErrors = 0;

  const tick = async () => {
    const current = await jobStore.get(job.id);
    if (!current || current.status === 'completed' || current.status === 'failed') {
      stopPolling(job.id);
      return;
    }
    if (Date.now() - new Date(current.createdAt).getTime() > MAX_JOB_AGE_MS) {
      stopPolling(job.id);
      await jobStore.upsert({ ...current, status: 'failed', error: 'Timed out waiting for the provider.' });
      return;
    }

    try {
      const provider = getProvider(current.provider);
      const result = await provider.pollJob(
        {
          jobId: current.providerJobId ?? '',
          context: current.providerContext,
          model: current.model,
          mode: current.mode,
        },
        getApiKey(current.provider),
      );
      consecutiveErrors = 0;

      if (result.status === 'completed' || result.status === 'failed') {
        stopPolling(job.id);
        await jobStore.upsert({
          ...current,
          status: result.status,
          progress: result.status === 'completed' ? 100 : current.progress,
          resultUrl: result.resultUrl ?? current.resultUrl,
          error: result.error,
        });
        return;
      }
      if (result.status !== current.status || result.progress !== current.progress) {
        await jobStore.upsert({ ...current, status: result.status, progress: result.progress });
      }
    } catch (e) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        stopPolling(job.id);
        await jobStore.upsert({
          ...current,
          status: 'failed',
          error: e instanceof Error ? e.message : 'Polling failed repeatedly.',
        });
        return;
      }
    }
    active.set(job.id, setTimeout(tick, POLL_INTERVAL_MS));
  };

  active.set(job.id, setTimeout(tick, POLL_INTERVAL_MS));
}

/** Re-arm polling for every job that was still in flight when the page died. */
export async function resumePendingJobs(): Promise<number> {
  const jobs = await jobStore.list();
  const pending = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  pending.forEach(startPolling);
  return pending.length;
}
