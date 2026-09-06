'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cpu,
  Gauge,
  ShieldCheck,
  ShieldOff,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ENGINES } from '@/lib/data';
import {
  LATENCY_THRESHOLD,
  setAutoFallback,
  setMode,
  useSystem,
  type ModelMode,
} from '@/lib/store';
import { Chip, GlassCard, LiveDot, SPRING } from './ui';
import { cn } from '@/lib/cn';

const OPTIONS: { mode: ModelMode; icon: typeof Cpu; tone: string }[] = [
  { mode: 'cnn', icon: Cpu, tone: 'from-cyan-400 to-indigo-500' },
  { mode: 'prebuilt', icon: Zap, tone: 'from-amber-400 to-orange-500' },
];

export function ModelControl() {
  const mode = useSystem((s) => s.mode);
  const latency = useSystem((s) => s.latency);
  const auto = useSystem((s) => s.autoFallback);
  const loading = useSystem((s) => s.loading);
  const hotSwaps = useSystem((s) => s.hotSwaps);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const spec = ENGINES[mode];
  const breach = latency > LATENCY_THRESHOLD;
  const margin = LATENCY_THRESHOLD - latency;

  return (
    <GlassCard flat className="overflow-hidden">
      {/* ------------------------- status banner ------------------------- */}
      <div
        className={cn(
          'relative flex flex-col gap-3 border-b px-4 py-3.5 transition-colors duration-500 sm:flex-row sm:items-center',
          breach
            ? 'border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50/80 to-white'
            : 'border-cyan-200/70 bg-gradient-to-r from-cyan-50 via-white to-violet-50/60',
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/90 shadow-sm">
            {breach ? (
              <AlertTriangle className="text-amber-500" size={18} />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            )}
            {breach ? (
              <span className="absolute inset-0 rounded-xl border border-amber-400/60 animate-pulse-ring" />
            ) : null}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LiveDot tone={breach ? 'amber' : 'emerald'} />
              <span className="text-[13px] font-semibold text-ink">
                {loading
                  ? 'Engine warming up…'
                  : breach
                    ? 'Latency budget exceeded — watchdog engaged'
                    : 'Inference within latency budget'}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-ink-soft">
              {breach
                ? `Hot-swap armed: ${latency.toFixed(1)} ms > ${LATENCY_THRESHOLD} ms threshold`
                : `${margin.toFixed(1)} ms of headroom below the ${LATENCY_THRESHOLD} ms threshold`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Chip tone={breach ? 'amber' : 'cyan'}>
            <Gauge className="h-3.5 w-3.5" />
            {latency.toFixed(1)} ms
          </Chip>
          <Chip tone={auto ? 'emerald' : 'neutral'}>
            {auto ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
            Watchdog {auto ? 'armed' : 'disarmed'}
          </Chip>
          <Chip tone="violet">{hotSwaps} hot-swap{hotSwaps === 1 ? '' : 's'}</Chip>
        </div>
      </div>

      {/* --------------------------- controls ---------------------------- */}
      <div className="grid gap-4 p-4 md:grid-cols-[1.35fr_1fr]">
        <div className="relative" ref={wrapRef}>
          <label className="text-[10px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
            Model execution mode
          </label>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              'mt-1.5 flex w-full items-center gap-3 rounded-xl border bg-white/75 px-3 py-2.5 text-left transition-all duration-200',
              open
                ? 'border-violet-300 shadow-md shadow-violet-500/10'
                : 'border-white/90 hover:border-violet-200 hover:shadow-sm',
            )}
          >
            <span
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm',
                OPTIONS.find((o) => o.mode === mode)!.tone,
              )}
            >
              {mode === 'cnn' ? <Cpu className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">
                {spec.label}
              </span>
              <span className="block truncate font-mono text-[10.5px] text-ink-mute">
                {spec.name}
              </span>
            </span>
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING}>
              <ChevronDown className="h-4 w-4 text-ink-mute" />
            </motion.span>
          </button>

          <AnimatePresence>
            {open ? (
              <motion.ul
                role="listbox"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={SPRING}
                className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/90 bg-white/90 p-1.5 shadow-xl shadow-indigo-500/10 backdrop-blur-md"
              >
                {OPTIONS.map(({ mode: m, icon: Icon, tone }) => {
                  const s = ENGINES[m];
                  const active = m === mode;
                  return (
                    <li key={m}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setOpen(false);
                          setMode(m, { manual: true });
                        }}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                          active ? 'bg-gradient-to-r from-cyan-50 to-violet-50' : 'hover:bg-slate-50',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br text-white',
                            tone,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                            {s.label}
                            {active ? <Check className="h-3.5 w-3.5 text-cyan-600" /> : null}
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] text-ink-mute">
                            {s.name} · {s.accuracy}% acc · {s.latency[0]}–{s.latency[1]} ms
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
              Automatic fallback
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={auto}
              onClick={() => setAutoFallback(!auto)}
              className={cn(
                'mt-1.5 flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-300',
                auto
                  ? 'border-emerald-300/80 bg-emerald-50/70'
                  : 'border-white/90 bg-white/60 hover:bg-white/80',
              )}
            >
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-ink">
                  Hot-swap on latency breach
                </span>
                <span className="block text-[10.5px] text-ink-mute">
                  Triggers past {LATENCY_THRESHOLD} ms for 2 consecutive samples
                </span>
              </span>
              <span
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300',
                  auto ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-slate-300',
                )}
              >
                <motion.span
                  animate={{ x: auto ? 20 : 0 }}
                  transition={SPRING}
                  className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow"
                />
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMode(mode === 'cnn' ? 'prebuilt' : 'cnn', { manual: true })}
            disabled={loading}
            className="group flex items-center justify-center gap-2 rounded-xl border border-white/90 bg-white/70 px-3 py-2.5 text-[12.5px] font-semibold text-ink transition-all hover:scale-[1.01] hover:border-violet-200 hover:bg-white disabled:pointer-events-none disabled:opacity-50"
          >
            <Zap className="h-4 w-4 text-violet-600 transition-transform group-hover:scale-110" />
            {loading
              ? 'Swapping engine…'
              : mode === 'cnn'
                ? 'Force swap to fallback engine'
                : 'Force swap back to custom CNN'}
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
