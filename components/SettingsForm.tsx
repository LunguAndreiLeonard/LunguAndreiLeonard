'use client';

import { useState } from 'react';
import { PROVIDERS } from '@/lib/providers';
import { useMounted, useSettings } from '@/lib/hooks';
import { updateSettings } from '@/lib/settings';
import { DEFAULT_PRICING, effectiveRates, pricingKey } from '@/lib/pricing';

export default function SettingsForm() {
  const mounted = useMounted();
  const settings = useSettings();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  if (!mounted) return <div className="glass p-8 text-center text-white/40">Loading…</div>;

  const setKey = (providerId: string, value: string) => {
    updateSettings({ apiKeys: { ...settings.apiKeys, [providerId]: value.trim() } });
  };

  const setRate = (key: string, tier: string, value: string) => {
    const num = Number(value);
    if (Number.isNaN(num) || num < 0) return;
    updateSettings({
      pricingOverrides: {
        ...settings.pricingOverrides,
        [key]: { ...(settings.pricingOverrides[key] ?? {}), [tier]: num },
      },
    });
  };

  return (
    <div className="fade-in-up mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-white/50">
          Everything here lives in your browser&apos;s localStorage — nothing is sent to a server except the
          provider APIs themselves.
        </p>
      </div>

      {/* Provider + keys */}
      <section className="glass space-y-4 p-5">
        <h2 className="font-semibold">Provider</h2>
        <label className="block max-w-xs">
          <span className="mb-1 block text-xs font-semibold text-white/60">Active provider</span>
          <select
            className="input-glass"
            value={settings.activeProvider}
            onChange={(e) => updateSettings({ activeProvider: e.target.value })}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-3">
          {PROVIDERS.filter((p) => !p.keyless).map((p) => (
            <label key={p.id} className="block">
              <span className="mb-1 block text-xs font-semibold text-white/60">{p.name} API key</span>
              <div className="flex gap-2">
                <input
                  className="input-glass font-mono text-xs"
                  type={revealed[p.id] ? 'text' : 'password'}
                  placeholder={p.id === 'fal' ? 'fal key id:secret' : 'x-api-key value'}
                  value={settings.apiKeys[p.id] ?? ''}
                  onChange={(e) => setKey(p.id, e.target.value)}
                  autoComplete="off"
                />
                <button
                  className="btn-ghost shrink-0 text-xs"
                  onClick={() => setRevealed((r) => ({ ...r, [p.id]: !r[p.id] }))}
                >
                  {revealed[p.id] ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
          ))}
          <p className="text-xs text-white/40">
            The Mock provider needs no key and fakes an 8-second render — use it to test templates, batching and
            history with zero spend.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="glass space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Cost estimation rates</h2>
          <p className="mt-1 text-xs text-white/40">
            USD per second of output video, per tier. Defaults are approximations of published provider pricing —
            correct them here as providers change their prices. Overrides are highlighted.
          </p>
        </div>
        <div className="space-y-4">
          {Object.keys(DEFAULT_PRICING)
            .filter((key) => !key.startsWith('mock:'))
            .map((key) => {
              const [providerId, modelId] = key.split(':') as [string, string];
              const rates = effectiveRates(providerId, modelId, settings.pricingOverrides);
              return (
                <div key={key}>
                  <span className="mb-1.5 block text-xs font-bold text-white/70">{key}</span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(rates).map(([tier, rate]) => {
                      const overridden = settings.pricingOverrides[pricingKey(providerId, modelId)]?.[tier] !== undefined;
                      return (
                        <label key={tier} className="flex items-center gap-1.5 text-xs text-white/50">
                          {tier}
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={`input-glass w-24 py-1.5 text-xs ${overridden ? 'border-primary/50' : ''}`}
                            value={rate}
                            onChange={(e) => setRate(key, tier, e.target.value)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      {/* Storage (M3 — Supabase archive lands once credentials exist) */}
      <section className="glass space-y-3 p-5">
        <h2 className="font-semibold">Result storage</h2>
        <label className="flex items-start gap-2 text-sm text-white/60">
          <input type="checkbox" checked={false} disabled className="mt-0.5 accent-[#d9ff00]" />
          <span>
            Archive finished videos to Supabase Storage (provider URLs expire).
            <span className="block text-xs text-white/35">
              Coming with the Supabase upgrade — needs project credentials.
            </span>
          </span>
        </label>
      </section>

      <section className="glass space-y-2 p-5">
        <h2 className="font-semibold text-red-300/90">Danger zone</h2>
        <button
          className="btn-ghost text-xs text-red-300/80 hover:text-red-200"
          onClick={() => {
            if (confirm('Clear all job history? This cannot be undone.')) {
              localStorage.removeItem('studio.jobs.v1');
              location.reload();
            }
          }}
        >
          Clear job history
        </button>
      </section>
    </div>
  );
}
