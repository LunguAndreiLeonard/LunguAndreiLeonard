/**
 * Template system types + prompt compiler. Client-safe (no fs) — the fs
 * loader lives in ./loader.ts and is server-only.
 */

export const TEMPLATE_CATEGORIES = ['product', 'cinematic', 'social', 'talking-head', 'vfx'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface TemplateInput {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required?: boolean;
  placeholder?: string;
  /** Used when an optional input is left empty. */
  default?: string;
  /** For type 'select'. */
  options?: string[];
}

export interface TemplateRecommended {
  model?: string;
  duration?: number;
  aspectRatio?: string;
  quality?: string;
  resolution?: string;
}

export interface VideoTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description?: string;
  /** Used later to generate a preview thumbnail for the card. */
  thumbnailPrompt: string;
  inputs: TemplateInput[];
  /** Prompt with {key} placeholders + camera vocabulary. */
  promptTemplate: string;
  negativePrompt?: string;
  recommended: TemplateRecommended;
  referenceImages: { min: number; max: number; hint?: string };
}

/**
 * Replace {key} placeholders. Returns the list of unresolved required keys.
 * Empty optional inputs fall back to their `default`, or are removed with the
 * surrounding whitespace/punctuation tidied up.
 */
export function compilePrompt(
  template: VideoTemplate,
  values: Record<string, string>,
): { prompt: string; missing: string[] } {
  const missing = template.inputs
    .filter((i) => i.required && !values[i.key]?.trim())
    .map((i) => i.key);
  const defaults = Object.fromEntries(template.inputs.map((i) => [i.key, i.default ?? '']));
  let prompt = template.promptTemplate.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]?.trim();
    if (value) return value;
    // Required-but-empty keys stay visible as {key} so the user sees the gap.
    if (missing.includes(key)) return match;
    return defaults[key] ?? match;
  });
  // Tidy artifacts from removed optional placeholders: "on , then" → "on, then" etc.
  prompt = prompt
    .replace(/\s+([,.;])/g, '$1')
    .replace(/\b(on|in|at|with|of)\s*([,.;])/gi, '$2')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { prompt, missing };
}

/** Runtime validation for template JSON files — bad files are skipped with a warning. */
export function validateTemplate(raw: unknown, source: string): VideoTemplate {
  const fail = (msg: string): never => {
    throw new Error(`Template ${source}: ${msg}`);
  };
  if (!raw || typeof raw !== 'object') fail('not an object');
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== 'string' || !t.id) fail('missing "id"');
  if (typeof t.name !== 'string' || !t.name) fail('missing "name"');
  if (!TEMPLATE_CATEGORIES.includes(t.category as TemplateCategory)) {
    fail(`invalid category "${String(t.category)}" (expected ${TEMPLATE_CATEGORIES.join(' | ')})`);
  }
  if (typeof t.promptTemplate !== 'string' || !t.promptTemplate) fail('missing "promptTemplate"');
  if (typeof t.thumbnailPrompt !== 'string') fail('missing "thumbnailPrompt"');
  if (!Array.isArray(t.inputs)) fail('missing "inputs" array');
  for (const input of t.inputs as unknown[]) {
    const i = input as Record<string, unknown>;
    if (typeof i.key !== 'string' || typeof i.label !== 'string') fail('input needs "key" and "label"');
    if (!['text', 'textarea', 'select'].includes(String(i.type))) fail(`input "${String(i.key)}" has invalid type`);
  }
  const ref = t.referenceImages as Record<string, unknown> | undefined;
  if (!ref || typeof ref.min !== 'number' || typeof ref.max !== 'number') {
    fail('missing "referenceImages" {min, max}');
  }
  if (!t.recommended || typeof t.recommended !== 'object') fail('missing "recommended"');
  return raw as VideoTemplate;
}
