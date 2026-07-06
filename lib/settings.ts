'use client';

/**
 * App settings, persisted in localStorage (this is a self-hosted single-user
 * tool — keys deliberately never touch a server database).
 */

export interface Settings {
  activeProvider: string;
  apiKeys: Record<string, string>;
  /** Per `${provider}:${model}` per-second USD overrides, merged over defaults. */
  pricingOverrides: Record<string, Record<string, number>>;
  /** M3: copy finished videos to Supabase Storage (needs credentials). */
  archiveResults: boolean;
}

const STORAGE_KEY = 'studio.settings.v1';

const DEFAULTS: Settings = {
  activeProvider: 'mock',
  apiKeys: {},
  pricingOverrides: {},
  archiveResults: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: Settings | null = null;

export function loadSettings(): Settings {
  if (cache) return cache;
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

export function saveSettings(next: Settings): void {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[settings] persist failed:', e);
  }
  listeners.forEach((l) => l());
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  return next;
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getApiKey(providerId: string): string {
  return loadSettings().apiKeys[providerId] ?? '';
}
