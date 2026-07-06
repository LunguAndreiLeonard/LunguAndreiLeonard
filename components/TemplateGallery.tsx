'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TEMPLATE_CATEGORIES, type VideoTemplate } from '@/lib/templates/types';

const CATEGORY_LABELS: Record<string, string> = {
  product: 'Product',
  cinematic: 'Cinematic',
  social: 'Social',
  'talking-head': 'Talking Head',
  vfx: 'VFX',
};

/** Deterministic accent gradient per template until real thumbnails exist. */
function cardGradient(id: string): string {
  const hue = [...id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
  return `linear-gradient(135deg, hsl(${hue} 80% 12%), hsl(${(hue + 60) % 360} 70% 22%))`;
}

export default function TemplateGallery({ templates }: { templates: VideoTemplate[] }) {
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.promptTemplate.toLowerCase().includes(q)
      );
    });
  }, [templates, category, search]);

  return (
    <div className="fade-in-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
        <p className="mt-1 text-sm text-white/50">
          Pick a cinematic recipe, fill in your subject, generate.{' '}
          <Link href="/generate" className="text-primary hover:underline">
            Or start from a blank prompt →
          </Link>
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="input-glass sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <button className="chip" data-active={category === 'all'} onClick={() => setCategory('all')}>
            All
          </button>
          {TEMPLATE_CATEGORIES.map((c) => (
            <button key={c} className="chip" data-active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c] ?? c}
            </button>
          ))}
        </div>
      </div>

      {templates.length === 0 && (
        <div className="glass p-8 text-center text-white/50">
          No templates found. Drop <code className="text-primary">.json</code> files into{' '}
          <code className="text-primary">/templates</code> to populate the gallery.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <Link
            key={t.id}
            href={`/generate?template=${encodeURIComponent(t.id)}`}
            className="glass glass-hover group overflow-hidden"
          >
            <div
              className="flex h-32 items-end p-4"
              style={{ background: cardGradient(t.id) }}
            >
              <span className="rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur">
                {CATEGORY_LABELS[t.category] ?? t.category}
              </span>
            </div>
            <div className="p-4">
              <h2 className="font-semibold group-hover:text-primary transition-colors">{t.name}</h2>
              {t.description && <p className="mt-1 text-xs leading-relaxed text-white/50">{t.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-white/40">
                {t.recommended.aspectRatio && <span className="rounded bg-white/5 px-1.5 py-0.5">{t.recommended.aspectRatio}</span>}
                {t.recommended.duration && <span className="rounded bg-white/5 px-1.5 py-0.5">{t.recommended.duration}s</span>}
                {t.recommended.model && <span className="rounded bg-white/5 px-1.5 py-0.5">{t.recommended.model}</span>}
                {t.referenceImages.max > 0 && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5">
                    {t.referenceImages.min > 0 ? `needs ${t.referenceImages.min} ref img` : 'ref img optional'}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && templates.length > 0 && (
        <p className="mt-8 text-center text-sm text-white/40">Nothing matches that filter.</p>
      )}
    </div>
  );
}
