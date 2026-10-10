'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Hand, Menu, Radar, ShieldCheck, TerminalSquare, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useScrollToSection, useScrolledPast } from '@/lib/hooks';
import { cn } from '@/lib/cn';

const LINKS = [
  { id: 'overview', label: 'Overview', icon: Hand },
  { id: 'analytics', label: 'Model Analytics', icon: Activity },
  { id: 'live', label: 'Live Model', icon: Radar },
  { id: 'logs', label: 'Live Logs', icon: TerminalSquare },
  { id: 'demo', label: 'Gesture Demo', icon: Hand },
  { id: 'status', label: 'Status', icon: ShieldCheck },
] as const;

/** Which section owns the viewport right now — one observer, no scroll handler. */
function useActiveSection() {
  const [active, setActive] = useState<string>('overview');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the scroll band.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );
    LINKS.forEach((l) => {
      const el = document.getElementById(l.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return active;
}

export function Nav() {
  const scrolled = useScrolledPast(28);
  const active = useActiveSection();
  const scrollTo = useScrollToSection();
  const [open, setOpen] = useState(false);

  return (
    <motion.header
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.05 }}
      className="fixed inset-x-0 top-3 z-40 px-3 sm:top-4 sm:px-4"
    >
      <nav
        className={cn(
          'mx-auto flex max-w-6xl items-center gap-3 rounded-2xl border px-3 py-2.5 transition-shadow duration-300 sm:px-4',
          'glass backdrop-blur-md',
          scrolled
            ? 'border-white/90 shadow-lg shadow-indigo-500/10'
            : 'shadow-md shadow-indigo-500/5',
        )}
        aria-label="Primary"
      >
        <button
          type="button"
          onClick={() => scrollTo('overview')}
          className="group flex shrink-0 items-center gap-2.5"
        >
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-600 shadow-md shadow-cyan-500/30">
            <Hand className="text-white" size={18} />
            <span className="absolute inset-0 rounded-xl ring-1 ring-white/40" />
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-[13px] font-semibold tracking-tight text-ink">
              Gesture Controlled System
            </span>
            <span className="font-mono text-[10px] text-ink-mute">CSE-CV-2026/0417</span>
          </span>
        </button>

        {/* Desktop links — layoutId gives a shared-element underline for free */}
        <ul className="mx-auto hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => {
            const isActive = active === link.id;
            return (
              <li key={link.id}>
                <button
                  type="button"
                  onClick={() => scrollTo(link.id)}
                  className={cn(
                    'relative rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                    isActive ? 'text-ink' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="nav-active"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      className="absolute inset-0 rounded-lg border border-cyan-300/50 bg-gradient-to-b from-white/90 to-cyan-50/70 shadow-sm"
                    />
                  ) : null}
                  <span className="relative">{link.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <StatusPill />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle navigation"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/80 bg-white/60 text-ink-soft transition-colors hover:text-ink lg:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="mx-auto mt-2 max-w-6xl overflow-hidden rounded-2xl border border-white/85 glass p-2 lg:hidden"
          >
            {LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  scrollTo(link.id);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  active === link.id
                    ? 'bg-gradient-to-r from-cyan-50 to-violet-50 text-ink'
                    : 'text-ink-soft hover:bg-white/70',
                )}
              >
                <link.icon className="h-4 w-4 text-cyan-600" />
                {link.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}

/** Glowing amber/cyan approval badge. */
function StatusPill() {
  return (
    <div className="group relative hidden items-center gap-2 overflow-hidden rounded-full border border-amber-300/70 bg-gradient-to-r from-amber-50 via-white to-cyan-50 px-3 py-1.5 sm:flex">
      <span className="shimmer-hover absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-white/70" />
      <span className="relative flex h-2 w-2">
        <span className="absolute inset-0 rounded-full bg-amber-400 opacity-70 animate-pulse-ring" />
        <span className="relative h-2 w-2 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,0.45)]" />
      </span>
      <span className="relative text-[11px] font-semibold tracking-wide whitespace-nowrap text-amber-800">
        Status: Approved with Modifications
      </span>
    </div>
  );
}
