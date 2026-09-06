'use client';

import { GitBranch, Hand, Heart, Terminal } from 'lucide-react';
import { PROJECT, TECH_STACK } from '@/lib/data';
import { useScrollToSection } from '@/lib/hooks';

const LINKS = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Model Analytics' },
  { id: 'logs', label: 'Live Logs' },
  { id: 'demo', label: 'Gesture Demo' },
  { id: 'team', label: 'Team' },
  { id: 'status', label: 'Status' },
];

export function Footer() {
  const scrollTo = useScrollToSection();

  return (
    <footer className="relative mt-8 px-4 pb-10">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-white/85 bg-gradient-to-br from-white/80 via-white/60 to-cyan-50/50 shadow-sm">
        <div className="grid gap-8 p-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-600 text-white shadow-md shadow-cyan-500/25">
                <Hand className="h-4 w-4" />
              </span>
              <div>
                <div className="text-[13.5px] font-semibold text-ink">{PROJECT.title}</div>
                <div className="font-mono text-[10.5px] text-ink-mute">{PROJECT.reviewId}</div>
              </div>
            </div>
            <p className="mt-3 max-w-sm text-[11.5px] leading-relaxed text-ink-soft">
              {PROJECT.subtitle}. Department of Computer Science & Engineering · academic year
              2025–26.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {TECH_STACK.slice(0, 7).map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-white/85 bg-white/70 px-2 py-0.5 font-mono text-[10px] text-ink-mute"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <nav aria-label="Footer">
            <h3 className="text-[10px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
              Sections
            </h3>
            <ul className="mt-3 space-y-1.5">
              {LINKS.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(l.id)}
                    className="text-[12px] text-ink-soft transition-colors hover:text-cyan-700"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="text-[10px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
              Runtime
            </h3>
            <ul className="mt-3 space-y-1.5 text-[12px] text-ink-soft">
              <li className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-violet-500" />
                gesture_daemon.py · Python 3.8.5
              </li>
              <li className="flex items-center gap-2">
                <Hand className="h-3.5 w-3.5 text-cyan-500" />
                MediaPipe Hands · 21 landmarks
              </li>
              <li className="flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5 text-ink-mute" />
                Build {PROJECT.version}
              </li>
            </ul>
            <p className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-mute">
              Built with
              <Heart className="h-3 w-3 text-rose-400" />
              Next.js · Tailwind · Framer Motion
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/80 bg-white/50 px-6 py-3">
          <span className="font-mono text-[10.5px] text-ink-mute">
            © 2026 Gesture Controlled System · academic project
          </span>
          <span className="font-mono text-[10.5px] text-ink-mute">
            status: approved with modifications
          </span>
        </div>
      </div>
    </footer>
  );
}
