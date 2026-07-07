import type { GenerationParams } from './providers/types';

/**
 * Cost estimation. Rates are USD per second of output video, keyed by
 * resolution (models with a resolution knob) or quality tier (models with a
 * quality knob), with a 'default' fallback.
 *
 * ⚠️ These defaults are best-effort approximations of published provider
 * pricing and WILL drift — they are editable per entry on the Settings page,
 * and overrides are stored locally.
 */

export type RateTable = Record<string, number>; // tier -> USD/second

export const DEFAULT_PRICING: Record<string, RateTable> = {
  // fal.ai — queue API pricing for Seedance (per second of video)
  'fal:seedance-2.0': { '480p': 0.15, '720p': 0.3, '1080p': 0.68, default: 0.3 },
  'fal:seedance-2.0-fast': { '480p': 0.08, '720p': 0.15, default: 0.15 },
  'fal:seedance-1.5-pro': { '480p': 0.02, '720p': 0.06, '1080p': 0.12, default: 0.06 },
  // MuAPI — Seedance family (per second, by quality/resolution tier)
  'muapi:seedance-2.0': { basic: 0.12, high: 0.25, default: 0.12 },
  'muapi:seedance-1.5-pro': { '480p': 0.02, '720p': 0.06, '1080p': 0.12, default: 0.06 },
  'muapi:seedance-1.5-pro-fast': { '720p': 0.04, '1080p': 0.08, default: 0.04 },
  'mock:mock-seedance': { default: 0 },
  'mock:mock-basic': { default: 0 },
};

export function pricingKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

export function effectiveRates(
  providerId: string,
  modelId: string,
  overrides: Record<string, RateTable>,
): RateTable {
  const key = pricingKey(providerId, modelId);
  return { ...(DEFAULT_PRICING[key] ?? {}), ...(overrides[key] ?? {}) };
}

/** Returns estimated USD cost, or null when we have no rate for the model. */
export function estimateCost(
  providerId: string,
  params: Pick<GenerationParams, 'model' | 'duration' | 'resolution' | 'quality'>,
  overrides: Record<string, RateTable> = {},
): number | null {
  const rates = effectiveRates(providerId, params.model, overrides);
  if (Object.keys(rates).length === 0) return null;
  const tier = params.resolution ?? params.quality ?? 'default';
  const perSecond = rates[tier] ?? rates['default'];
  if (perSecond === undefined) return null;
  // duration 0 = "auto": assume 5s for the estimate.
  const seconds = params.duration && params.duration > 0 ? params.duration : 5;
  return Math.round(perSecond * seconds * 100) / 100;
}

export function formatUsd(amount: number | null): string {
  if (amount === null) return '—';
  if (amount === 0) return 'free (dry run)';
  return `$${amount.toFixed(2)}`;
}
