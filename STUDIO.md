# Studio — self-hosted AI video generation

A Higgsfield-style AI video studio you run yourself: pick a cinematic template, fill in a
subject, choose a provider (MuAPI or fal.ai — your own API keys), generate, and manage the
results in a persistent job history.

Based on [open-generative-ai](https://github.com/vkfolio/open-generative-ai) (MIT) — the
MuAPI protocol, model capability data and the glassmorphism aesthetic are ported from it;
the app itself is a TypeScript rewrite with a provider abstraction and template system.

> Note: `README.md` in this repository is the owner's GitHub profile page — this file is
> the project documentation.

## Stack

- Next.js (App Router) + TypeScript strict + Tailwind CSS v4 — deploys on Vercel
- No database yet: settings, API keys and job history live in `localStorage`
  (Supabase persistence is milestone M3, behind the same `JobStore` interface)
- No auth, no billing — single-user, self-hosted

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (includes type checking)
```

Works with **zero configuration**: the default provider is **Mock (dry run)**, which fakes
an 8-second render and returns a sample clip — the whole flow (templates → generate →
progress → history → re-run) is testable without any account.

To generate real videos: Settings → paste your MuAPI key and/or fal.ai key → pick the
provider on the Generate page.

## Architecture

```
lib/providers/       VideoProvider interface + implementations
  types.ts           submitJob / pollJob / getCapabilities / uploadFile
  muapi.ts           MuAPI (via /api/muapi proxy — MuAPI lacks CORS headers)
  fal.ts             fal.ai queue API (browser-direct; queue.fal.run sends CORS)
  mock.ts            keyless dry-run provider
lib/templates/       template types, prompt compiler, fs loader (server-only)
lib/jobs/            JobStore interface, LocalStorageJobStore, polling manager
lib/pricing.ts       per-second rate tables + cost estimation (editable in Settings)
lib/settings.ts      localStorage settings (provider, keys, pricing overrides)
templates/*.json     the template library — drop a JSON file in, it appears
app/                 pages: / (gallery), /generate, /history, /settings
app/api/muapi/       pass-through proxy to api.muapi.ai (keys never stored server-side)
```

### Templates

Templates are typed JSON validated at load time (invalid files are skipped with a console
warning, never crash the app):

```json
{
  "id": "crash-zoom-product",
  "name": "Crash Zoom — Product Reveal",
  "category": "product",
  "thumbnailPrompt": "…",
  "inputs": [{ "key": "subject", "label": "Subject", "type": "text", "required": true }],
  "promptTemplate": "Crash zoom shot: … {subject} …",
  "negativePrompt": "…",
  "recommended": { "model": "seedance-2.0", "duration": 5, "aspectRatio": "9:16", "quality": "high" },
  "referenceImages": { "min": 0, "max": 1, "hint": "…" }
}
```

`{key}` placeholders are replaced by the form values; the compiled prompt is editable
under "Advanced" before submitting.

### Providers & capabilities

The UI is driven by `getCapabilities()` — models, aspect ratios, durations, resolutions,
quality tiers, max reference images, audio support. Anything a provider/model can't do is
hidden or disabled, never submitted. Continuation differs per provider and is modeled
explicitly: MuAPI extends by the original generation's `request_id`; fal.ai continues from
the source **video URL** via Seedance's reference-to-video endpoint.

### Jobs

Submitting creates a `JobRecord` in the `JobStore` and starts a client-side poll loop
(3.5 s interval). On any page load, every non-terminal job in the store gets its poll loop
re-armed — pending generations survive reloads. History supports filtering by
status/template/model, inline playback, download, re-run-with-edits, and continuation.

## Milestones

- **M1** ✅ provider abstraction (MuAPI / fal.ai / mock), settings, capability-driven UI
- **M2** ✅ template system + gallery + 10 seed templates
- **M3** ◐ `JobStore` + localStorage implementation ✅ — Supabase (`SupabaseJobStore`,
  raw SQL migration, result archiving to Supabase Storage) pending credentials
- **M4** ✅ cost estimation, batch mode, mobile-friendly dark UI
