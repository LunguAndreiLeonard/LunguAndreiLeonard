'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PROVIDERS,
  getProvider,
  getModelSpec,
  type GenerationMode,
  type GenerationParams,
  type ModelSpec,
} from '@/lib/providers';
import { compilePrompt, type VideoTemplate } from '@/lib/templates/types';
import { useJobs, useMounted, useSettings } from '@/lib/hooks';
import { updateSettings } from '@/lib/settings';
import { estimateCost, formatUsd } from '@/lib/pricing';
import { jobStore } from '@/lib/jobs/local';
import { startPolling } from '@/lib/jobs/poller';
import type { JobRecord } from '@/lib/jobs/types';

interface Props {
  templates: VideoTemplate[];
  initialTemplateId?: string;
  rerunJobId?: string;
  continueJobId?: string;
}

const MODE_LABELS: Record<GenerationMode, string> = {
  t2v: 'Text → Video',
  i2v: 'Image → Video',
  continuation: 'Continue Video',
};

interface RefImage {
  url: string;
  name: string;
  uploading?: boolean;
}

function pickSupported<T>(preferred: T | undefined, allowed: T[]): T | undefined {
  if (preferred !== undefined && allowed.includes(preferred)) return preferred;
  return allowed[0];
}

export default function GenerateForm({ templates, initialTemplateId, rerunJobId, continueJobId }: Props) {
  const router = useRouter();
  const mounted = useMounted();
  const settings = useSettings();
  const jobs = useJobs();

  const [templateId, setTemplateId] = useState<string | undefined>(initialTemplateId);
  const template = templates.find((t) => t.id === templateId);

  const [providerId, setProviderId] = useState(settings.activeProvider);
  const provider = useMemo(() => {
    try {
      return getProvider(providerId);
    } catch {
      return getProvider('mock');
    }
  }, [providerId]);
  const caps = provider.getCapabilities();

  const [mode, setMode] = useState<GenerationMode>('t2v');
  const modeModels = useMemo(() => caps.models.filter((m) => m.modes.includes(mode)), [caps, mode]);

  const [modelId, setModelId] = useState<string>('');
  const model: ModelSpec | undefined = getModelSpec(caps, modelId) ?? modeModels[0];

  // Template field values + freeform prompt (used when no template selected).
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [freePrompt, setFreePrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');

  // Advanced: user can override the compiled prompt; editing sets the dirty flag.
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [aspectRatio, setAspectRatio] = useState<string | undefined>();
  const [duration, setDuration] = useState<number | undefined>();
  const [resolution, setResolution] = useState<string | undefined>();
  const [quality, setQuality] = useState<string | undefined>();
  const [generateAudio, setGenerateAudio] = useState(true);

  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [sourceJobId, setSourceJobId] = useState('');
  const [manualSource, setManualSource] = useState('');

  const [batchMode, setBatchMode] = useState(false);
  const [batchSubjects, setBatchSubjects] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedFromJob = useRef(false);

  const apiKey = settings.apiKeys[provider.id] ?? '';
  const needsKey = !provider.keyless && !apiKey;

  // ── derived prompt ──────────────────────────────────────────────────────
  const compiled = useMemo(() => {
    if (!template) return { prompt: freePrompt, missing: [] as string[] };
    return compilePrompt(template, inputValues);
  }, [template, inputValues, freePrompt]);
  const effectivePrompt = promptOverride ?? compiled.prompt;

  // ── keep option state within the selected model's capabilities ─────────
  useEffect(() => {
    if (!model) return;
    setModelId(model.id);
    setAspectRatio((v) => pickSupported(v, model.aspectRatios));
    setDuration((v) => pickSupported(v, model.durations));
    setResolution((v) => (model.resolutions.length ? pickSupported(v, model.resolutions) : undefined));
    setQuality((v) => (model.qualities.length ? pickSupported(v, model.qualities) : undefined));
    setRefImages((imgs) => imgs.slice(0, model.maxRefImages));
  }, [model]);

  // Model list depends on mode — make sure the selection stays valid.
  useEffect(() => {
    if (modeModels.length > 0 && !modeModels.some((m) => m.id === modelId)) {
      setModelId(modeModels[0]!.id);
    }
  }, [modeModels, modelId]);

  // ── apply template recommendations once when a template is chosen ──────
  useEffect(() => {
    if (!template) return;
    const rec = template.recommended;
    if (rec.model && caps.models.some((m) => m.id === rec.model)) setModelId(rec.model);
    if (rec.aspectRatio) setAspectRatio(rec.aspectRatio);
    if (rec.duration !== undefined) setDuration(rec.duration);
    if (rec.resolution) setResolution(rec.resolution);
    if (rec.quality) setQuality(rec.quality);
    setNegativePrompt(template.negativePrompt ?? '');
    setPromptOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // ── hydrate from an existing job (?rerun= / ?continue=) ────────────────
  useEffect(() => {
    if (hydratedFromJob.current) return;
    const sourceId = rerunJobId ?? continueJobId;
    if (!sourceId) return;
    void jobStore.get(sourceId).then((job) => {
      if (!job || hydratedFromJob.current) return;
      hydratedFromJob.current = true;
      setProviderId(job.provider);
      setModelId(job.model);
      if (rerunJobId) {
        setMode(job.mode);
        setTemplateId(job.templateId);
        setInputValues(job.params.templateInputs ?? {});
        setFreePrompt(job.compiledPrompt);
        setPromptOverride(job.compiledPrompt);
        setShowAdvanced(true);
      } else {
        setMode('continuation');
        setSourceJobId(job.id);
      }
      setNegativePrompt(job.negativePrompt ?? '');
      if (job.params.aspectRatio) setAspectRatio(job.params.aspectRatio);
      if (job.params.duration !== undefined) setDuration(job.params.duration);
      if (job.params.resolution) setResolution(job.params.resolution);
      if (job.params.quality) setQuality(job.params.quality);
    });
  }, [rerunJobId, continueJobId]);

  // ── continuation sources: completed jobs usable by the selected model ──
  const continuationSources = useMemo(() => {
    if (!model || mode !== 'continuation') return [];
    return jobs.filter((j) => {
      if (j.status !== 'completed') return false;
      if (model.continuationInput === 'request_id') {
        // request ids only mean something to the provider that issued them
        return j.provider === provider.id && !!j.providerJobId;
      }
      return !!j.resultUrl;
    });
  }, [jobs, model, mode, provider.id]);

  // ── cost ────────────────────────────────────────────────────────────────
  const batchList = batchMode
    ? batchSubjects.split('\n').map((s) => s.trim()).filter(Boolean)
    : [];
  const jobCount = batchMode ? Math.max(batchList.length, 0) : 1;
  const unitCost = estimateCost(provider.id, { model: model?.id ?? '', duration, resolution, quality }, settings.pricingOverrides);
  const totalCost = unitCost === null ? null : Math.round(unitCost * jobCount * 100) / 100;

  // Which template input gets swapped per batch line: the first required text input.
  const batchKey = template?.inputs.find((i) => i.required && i.type !== 'select')?.key ?? 'subject';

  // ── handlers ────────────────────────────────────────────────────────────
  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || !model) return;
      setError(null);
      const room = model.maxRefImages - refImages.length;
      for (const file of Array.from(files).slice(0, room)) {
        const placeholder: RefImage = { url: '', name: file.name, uploading: true };
        setRefImages((prev) => [...prev, placeholder]);
        try {
          const url = await provider.uploadFile(file, apiKey);
          setRefImages((prev) => prev.map((r) => (r === placeholder ? { url, name: file.name } : r)));
        } catch (e) {
          setRefImages((prev) => prev.filter((r) => r !== placeholder));
          setError(e instanceof Error ? e.message : 'Upload failed.');
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [model, provider, apiKey, refImages.length],
  );

  const buildParams = useCallback(
    (prompt: string): GenerationParams => {
      const params: GenerationParams = {
        mode,
        model: model!.id,
        prompt,
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio,
        duration,
        resolution,
        quality,
        generateAudio: model!.audio ? generateAudio : undefined,
      };
      if (mode === 'i2v') params.imageUrls = refImages.filter((r) => !r.uploading && r.url).map((r) => r.url);
      if (mode === 'continuation') {
        const source = jobs.find((j) => j.id === sourceJobId);
        if (model!.continuationInput === 'request_id') {
          params.sourceRequestId = source?.providerJobId ?? (manualSource.trim() || undefined);
        } else {
          params.sourceVideoUrl = source?.resultUrl ?? (manualSource.trim() || undefined);
        }
      }
      return params;
    },
    [mode, model, negativePrompt, aspectRatio, duration, resolution, quality, generateAudio, refImages, jobs, sourceJobId, manualSource],
  );

  const submit = useCallback(async () => {
    if (!model) return;
    setError(null);

    if (template && !promptOverride && compiled.missing.length > 0 && !(batchMode && compiled.missing.every((k) => k === batchKey))) {
      setError(`Fill in: ${compiled.missing.join(', ')}`);
      return;
    }
    const prompts: Array<{ prompt: string; inputs: Record<string, string> }> = [];
    if (batchMode) {
      if (batchList.length === 0) {
        setError('Batch mode: add at least one subject line.');
        return;
      }
      for (const subject of batchList) {
        const values = { ...inputValues, [batchKey]: subject };
        const prompt = template ? compilePrompt(template, values).prompt : effectivePrompt.replaceAll(`{${batchKey}}`, subject);
        prompts.push({ prompt, inputs: values });
      }
    } else {
      if (!effectivePrompt.trim()) {
        setError('Prompt is empty.');
        return;
      }
      prompts.push({ prompt: effectivePrompt, inputs: inputValues });
    }

    setSubmitting(true);
    try {
      for (const { prompt, inputs } of prompts) {
        const params = buildParams(prompt);
        const submitted = await provider.submitJob(params, apiKey);
        const now = new Date().toISOString();
        const job: JobRecord = {
          id: crypto.randomUUID(),
          provider: provider.id,
          model: model.id,
          mode,
          templateId: template?.id,
          templateName: template?.name,
          compiledPrompt: prompt,
          negativePrompt: params.negativePrompt,
          params: {
            aspectRatio: params.aspectRatio,
            duration: params.duration,
            resolution: params.resolution,
            quality: params.quality,
            generateAudio: params.generateAudio,
            imageUrls: params.imageUrls,
            sourceRequestId: params.sourceRequestId,
            sourceVideoUrl: params.sourceVideoUrl,
            templateInputs: inputs,
          },
          status: 'queued',
          costEstimate: unitCost,
          providerJobId: submitted.jobId,
          providerContext: submitted.context,
          createdAt: now,
          updatedAt: now,
        };
        await jobStore.upsert(job);
        startPolling(job);
      }
      updateSettings({ activeProvider: provider.id });
      router.push('/history');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  }, [model, template, promptOverride, compiled.missing, batchMode, batchKey, batchList, inputValues, effectivePrompt, buildParams, provider, apiKey, mode, unitCost, router]);

  if (!mounted) {
    return <div className="glass p-8 text-center text-white/40">Loading…</div>;
  }

  const missingSource =
    mode === 'continuation' && !sourceJobId && !manualSource.trim();
  const missingRefImages = mode === 'i2v' && refImages.filter((r) => r.url).length < Math.max(1, template?.referenceImages.min ?? 1);
  const disabled =
    submitting || needsKey || !model || missingSource || (mode === 'i2v' && missingRefImages) || refImages.some((r) => r.uploading);

  return (
    <div className="fade-in-up mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{template ? template.name : 'Generate'}</h1>
          <p className="mt-1 text-sm text-white/50">
            {template ? template.description : 'Freeform generation — or pick a template for a head start.'}
          </p>
        </div>
        {template && (
          <button className="btn-ghost shrink-0 text-xs" onClick={() => { setTemplateId(undefined); setPromptOverride(null); }}>
            Clear template
          </button>
        )}
      </div>

      {/* Provider + mode */}
      <div className="glass p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-white/60">Provider</span>
            <select className="input-glass" value={provider.id} onChange={(e) => setProviderId(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-white/60">Model</span>
            <select className="input-glass" value={model?.id ?? ''} onChange={(e) => setModelId(e.target.value)}>
              {modeModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['t2v', 'i2v', 'continuation'] as const).map((m) => {
            const supported = caps.models.some((spec) => spec.modes.includes(m));
            if (!supported) return null; // graceful degradation: provider can't do it → hide
            return (
              <button key={m} className="chip" data-active={mode === m} onClick={() => setMode(m)}>
                {MODE_LABELS[m]}
              </button>
            );
          })}
        </div>

        {needsKey && (
          <p className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs text-yellow-200">
            {provider.name} needs an API key.{' '}
            <Link href="/settings" className="font-semibold underline">
              Add it in Settings
            </Link>{' '}
            — or switch to the Mock provider to dry-run the UI.
          </p>
        )}
      </div>

      {/* Template inputs / freeform prompt */}
      <div className="glass p-4 space-y-4">
        {template ? (
          <>
            {template.inputs.map((input) => (
              <label key={input.key} className="block">
                <span className="mb-1 block text-xs font-semibold text-white/60">
                  {input.label}
                  {input.required && <span className="text-primary"> *</span>}
                  {batchMode && input.key === batchKey && (
                    <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">batched below</span>
                  )}
                </span>
                {input.type === 'select' ? (
                  <select
                    className="input-glass"
                    value={inputValues[input.key] ?? ''}
                    onChange={(e) => setInputValues((v) => ({ ...v, [input.key]: e.target.value }))}
                  >
                    <option value="">— pick —</option>
                    {input.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : input.type === 'textarea' ? (
                  <textarea
                    className="input-glass min-h-20"
                    placeholder={input.placeholder}
                    value={inputValues[input.key] ?? ''}
                    disabled={batchMode && input.key === batchKey}
                    onChange={(e) => setInputValues((v) => ({ ...v, [input.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    className="input-glass"
                    placeholder={input.placeholder}
                    value={inputValues[input.key] ?? ''}
                    disabled={batchMode && input.key === batchKey}
                    onChange={(e) => setInputValues((v) => ({ ...v, [input.key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
          </>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-white/60">Prompt</span>
            <textarea
              className="input-glass min-h-28"
              placeholder="Describe the shot — subject, camera move, lens, lighting, mood…"
              value={freePrompt}
              onChange={(e) => {
                setFreePrompt(e.target.value);
                setPromptOverride(null);
              }}
            />
          </label>
        )}

        {/* Batch mode */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-white/60">
            <input type="checkbox" checked={batchMode} onChange={(e) => setBatchMode(e.target.checked)} className="accent-[#d9ff00]" />
            Batch mode — one job per line ({template ? `swaps “${batchKey}”` : `swaps {${batchKey}} in the prompt`})
          </label>
          {batchMode && (
            <textarea
              className="input-glass min-h-24 font-mono text-xs"
              placeholder={'black ceramic dental aligner case\nsage green water bottle\nwalnut mechanical keyboard'}
              value={batchSubjects}
              onChange={(e) => setBatchSubjects(e.target.value)}
            />
          )}
        </div>

        {/* Advanced: compiled prompt + negative prompt */}
        <div>
          <button className="text-xs font-semibold text-white/50 hover:text-white" onClick={() => setShowAdvanced((s) => !s)}>
            {showAdvanced ? '▾' : '▸'} Advanced — final prompt & negative prompt
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-xs font-semibold text-white/60">
                  <span>Compiled prompt {promptOverride !== null && <em className="text-primary">(edited)</em>}</span>
                  {promptOverride !== null && (
                    <button className="text-white/40 underline hover:text-white" onClick={() => setPromptOverride(null)}>
                      reset to template
                    </button>
                  )}
                </span>
                <textarea
                  className="input-glass min-h-32 font-mono text-xs leading-relaxed"
                  value={effectivePrompt}
                  onChange={(e) => setPromptOverride(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-white/60">Negative prompt</span>
                <textarea
                  className="input-glass min-h-16 font-mono text-xs"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Mode-specific inputs */}
      {mode === 'i2v' && model && model.maxRefImages > 0 && (
        <div className="glass p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">
              Reference images ({refImages.length}/{Math.min(model.maxRefImages, template?.referenceImages.max || model.maxRefImages)})
            </span>
            <button
              className="btn-ghost text-xs"
              disabled={refImages.length >= model.maxRefImages}
              onClick={() => fileInputRef.current?.click()}
            >
              + Add image
            </button>
          </div>
          {template?.referenceImages.hint && <p className="text-xs text-white/40">{template.referenceImages.hint}</p>}
          <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => void handleUpload(e.target.files)} />
          {refImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {refImages.map((img, i) => (
                <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                  {img.uploading ? (
                    <div className="flex h-full items-center justify-center text-[10px] text-white/40">uploading…</div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                  )}
                  <button
                    className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] text-white/80 hover:text-white"
                    onClick={() => setRefImages((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'continuation' && model && (
        <div className="glass p-4 space-y-3">
          <span className="block text-xs font-semibold text-white/60">
            Source video {model.continuationInput === 'request_id' ? '(same-provider job)' : ''}
          </span>
          <select className="input-glass" value={sourceJobId} onChange={(e) => setSourceJobId(e.target.value)}>
            <option value="">— pick a completed job —</option>
            {continuationSources.map((j) => (
              <option key={j.id} value={j.id}>
                {(j.templateName ?? j.compiledPrompt).slice(0, 60)} · {new Date(j.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
          <input
            className="input-glass"
            placeholder={
              model.continuationInput === 'request_id'
                ? '…or paste a provider request id'
                : '…or paste a video URL'
            }
            value={manualSource}
            onChange={(e) => setManualSource(e.target.value)}
          />
        </div>
      )}

      {/* Generation options — capability-driven */}
      {model && (
        <div className="glass grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-white/60">Aspect ratio</span>
            <select className="input-glass" value={aspectRatio ?? ''} onChange={(e) => setAspectRatio(e.target.value)}>
              {model.aspectRatios.map((ar) => (
                <option key={ar} value={ar}>
                  {ar}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-white/60">Duration</span>
            <select className="input-glass" value={duration ?? 0} onChange={(e) => setDuration(Number(e.target.value))}>
              {model.durations.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? 'auto' : `${d}s`}
                </option>
              ))}
            </select>
          </label>
          {model.resolutions.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-white/60">Resolution</span>
              <select className="input-glass" value={resolution ?? ''} onChange={(e) => setResolution(e.target.value)}>
                {model.resolutions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          {model.qualities.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-white/60">Quality</span>
              <select className="input-glass" value={quality ?? ''} onChange={(e) => setQuality(e.target.value)}>
                {model.qualities.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </label>
          )}
          {model.audio && (
            <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-white/60">
              <input
                type="checkbox"
                checked={generateAudio}
                onChange={(e) => setGenerateAudio(e.target.checked)}
                className="accent-[#d9ff00]"
              />
              Audio
            </label>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>
      )}

      {/* Cost + submit */}
      <div className="glass sticky bottom-3 flex items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <span className="text-white/50">Est. cost:</span>{' '}
          <span className="font-bold text-primary">{formatUsd(totalCost)}</span>
          {batchMode && jobCount > 0 && (
            <span className="ml-1 text-xs text-white/40">
              ({jobCount} job{jobCount === 1 ? '' : 's'} × {formatUsd(unitCost)})
            </span>
          )}
          <span className="ml-2 block text-[10px] text-white/30 sm:inline">rates editable in Settings</span>
        </div>
        <button className="btn-primary" disabled={disabled} onClick={() => void submit()}>
          {submitting ? 'Submitting…' : batchMode ? `Generate ${jobCount || '…'} videos` : 'Generate'}
        </button>
      </div>
    </div>
  );
}
