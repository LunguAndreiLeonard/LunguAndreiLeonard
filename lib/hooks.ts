'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { loadSettings, subscribeSettings, type Settings } from './settings';
import { jobStore } from './jobs/local';
import type { JobRecord } from './jobs/types';

const SETTINGS_FALLBACK: Settings = {
  activeProvider: 'mock',
  apiKeys: {},
  pricingOverrides: {},
  archiveResults: false,
};

/** Reactive settings. Server snapshot is a stable fallback (pre-hydration). */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, loadSettings, () => SETTINGS_FALLBACK);
}

/** Reactive job list, newest first. */
export function useJobs(): JobRecord[] {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const refresh = useCallback(() => {
    void jobStore.list().then((list) => {
      setJobs(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });
  }, []);
  useEffect(() => {
    refresh();
    return jobStore.subscribe(refresh);
  }, [refresh]);
  return jobs;
}

/** True once the component is mounted client-side (avoids hydration flashes). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
