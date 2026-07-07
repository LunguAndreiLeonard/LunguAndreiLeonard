import 'server-only';
import fs from 'fs';
import path from 'path';
import { validateTemplate, type VideoTemplate } from './types';

/**
 * Build/request-time template loader. Drop a .json file into /templates and
 * it appears in the gallery — no code changes, no index to update. Invalid
 * files are skipped with a console warning instead of crashing the app.
 */

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

export function loadTemplates(): VideoTemplate[] {
  let files: string[];
  try {
    files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
  } catch (e) {
    console.warn('[templates] cannot read /templates:', e);
    return [];
  }

  const templates: VideoTemplate[] = [];
  const seen = new Set<string>();
  for (const file of files.sort()) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8')) as unknown;
      const template = validateTemplate(raw, file);
      if (seen.has(template.id)) {
        console.warn(`[templates] duplicate id "${template.id}" in ${file} — skipped`);
        continue;
      }
      seen.add(template.id);
      templates.push(template);
    } catch (e) {
      console.warn(`[templates] skipped ${file}:`, e instanceof Error ? e.message : e);
    }
  }
  return templates;
}

export function loadTemplate(id: string): VideoTemplate | undefined {
  return loadTemplates().find((t) => t.id === id);
}
