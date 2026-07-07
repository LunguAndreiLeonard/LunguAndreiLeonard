'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { resumePendingJobs } from '@/lib/jobs/poller';
import { useJobs, useMounted, useSettings } from '@/lib/hooks';
import { getProvider } from '@/lib/providers';

const NAV = [
  { href: '/', label: 'Templates' },
  { href: '/generate', label: 'Generate' },
  { href: '/history', label: 'History' },
  { href: '/settings', label: 'Settings' },
];

/**
 * App chrome: header nav + active-jobs badge. Also the single place that
 * resumes polling for in-flight jobs after a page load.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mounted = useMounted();
  const jobs = useJobs();
  const settings = useSettings();

  useEffect(() => {
    void resumePendingJobs();
  }, []);

  const activeCount = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
  const providerName = (() => {
    try {
      return getProvider(settings.activeProvider).name;
    } catch {
      return settings.activeProvider;
    }
  })();

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-black font-black text-sm">
              S
            </div>
            <span className="font-bold tracking-tight hidden sm:inline">Studio</span>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white'
                  }`}
                >
                  {item.label}
                  {item.href === '/history' && mounted && activeCount > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-black pulse-glow">
                      {activeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/settings"
            className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 hover:text-white shrink-0"
            title="Active provider — change in Settings"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {mounted ? providerName : '…'}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-white/5 py-4 text-center text-xs text-white/30">
        Studio — self-hosted AI video. Based on{' '}
        <a
          href="https://github.com/vkfolio/open-generative-ai"
          className="underline hover:text-white/60"
          target="_blank"
          rel="noreferrer"
        >
          open-generative-ai
        </a>{' '}
        (MIT).
      </footer>
    </div>
  );
}
