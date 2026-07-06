'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useJobs, useMounted } from '@/lib/hooks';
import { jobStore } from '@/lib/jobs/local';
import { formatUsd } from '@/lib/pricing';
import type { JobRecord } from '@/lib/jobs/types';

const STATUS_STYLE: Record<JobRecord['status'], string> = {
  queued: 'bg-white/10 text-white/60',
  running: 'bg-primary/15 text-primary',
  completed: 'bg-emerald-400/15 text-emerald-300',
  failed: 'bg-red-400/15 text-red-300',
};

async function downloadVideo(url: string, filename: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank'); // CORS fallback: open in a tab
  }
}

function JobCard({ job }: { job: JobRecord }) {
  const [expanded, setExpanded] = useState(false);
  const active = job.status === 'queued' || job.status === 'running';

  return (
    <div className="glass overflow-hidden fade-in-up">
      {job.status === 'completed' && job.resultUrl && (
        <video
          src={job.archivedUrl ?? job.resultUrl}
          controls
          playsInline
          preload="metadata"
          className="max-h-96 w-full bg-black"
        />
      )}
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[job.status]}`}>
            {job.status}
            {active && job.progress !== undefined && ` ${job.progress}%`}
          </span>
          {job.templateName && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/60">{job.templateName}</span>
          )}
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
            {job.provider} · {job.model} · {job.mode}
          </span>
          <span className="ml-auto text-[10px] text-white/35">{new Date(job.createdAt).toLocaleString()}</span>
        </div>

        {active && (
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 pulse-glow"
              style={{ width: `${Math.max(5, job.progress ?? (job.status === 'running' ? 40 : 10))}%` }}
            />
          </div>
        )}

        <p
          className={`cursor-pointer text-xs leading-relaxed text-white/55 ${expanded ? '' : 'line-clamp-2'}`}
          onClick={() => setExpanded((e) => !e)}
          title="Click to expand"
        >
          {job.compiledPrompt}
        </p>

        {job.error && <p className="text-xs text-red-300">{job.error}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="mr-auto text-[10px] text-white/35">
            {job.params.aspectRatio} · {job.params.duration ? `${job.params.duration}s` : 'auto'} ·{' '}
            {job.params.resolution ?? job.params.quality ?? '—'} · est. {formatUsd(job.costEstimate ?? null)}
          </span>
          {job.status === 'completed' && job.resultUrl && (
            <>
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() => void downloadVideo(job.resultUrl!, `${job.templateId ?? 'video'}-${job.id.slice(0, 8)}.mp4`)}
              >
                Download
              </button>
              <Link className="btn-ghost px-3 py-1.5 text-xs" href={`/generate?continue=${job.id}`}>
                Continue
              </Link>
            </>
          )}
          <Link className="btn-ghost px-3 py-1.5 text-xs" href={`/generate?rerun=${job.id}`}>
            Re-run with edits
          </Link>
          <button
            className="btn-ghost px-3 py-1.5 text-xs text-red-300/80 hover:text-red-200"
            onClick={() => void jobStore.remove(job.id)}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HistoryList() {
  const jobs = useJobs();
  const mounted = useMounted();
  const [statusFilter, setStatusFilter] = useState('all');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');

  const templateOptions = useMemo(
    () => [...new Set(jobs.map((j) => j.templateName).filter((x): x is string => !!x))],
    [jobs],
  );
  const modelOptions = useMemo(() => [...new Set(jobs.map((j) => `${j.provider}:${j.model}`))], [jobs]);

  const filtered = jobs.filter((j) => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    if (templateFilter !== 'all' && j.templateName !== templateFilter) return false;
    if (modelFilter !== 'all' && `${j.provider}:${j.model}` !== modelFilter) return false;
    return true;
  });

  if (!mounted) return <div className="glass p-8 text-center text-white/40">Loading…</div>;

  return (
    <div className="fade-in-up">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-white/50">
            Jobs keep polling here even after a page reload.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input-glass w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          {templateOptions.length > 0 && (
            <select className="input-glass w-auto" value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}>
              <option value="all">All templates</option>
              {templateOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          {modelOptions.length > 1 && (
            <select className="input-glass w-auto" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
              <option value="all">All models</option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass p-10 text-center text-white/40">
          {jobs.length === 0 ? (
            <>
              Nothing here yet.{' '}
              <Link href="/" className="text-primary hover:underline">
                Pick a template
              </Link>{' '}
              and generate your first video.
            </>
          ) : (
            'Nothing matches those filters.'
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
