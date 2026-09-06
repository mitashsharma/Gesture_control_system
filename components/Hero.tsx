'use client';

import { motion } from 'framer-motion';
import {
  ArrowDown,
  Cpu,
  Gauge,
  Radar,
  Sparkles,
  TerminalSquare,
  Zap,
} from 'lucide-react';
import { useLatencyHistory } from '@/lib/history';
import { useScrollToSection } from '@/lib/hooks';
import { ENGINES, META_CHIPS, PROJECT } from '@/lib/data';
import { LATENCY_THRESHOLD, useSystem } from '@/lib/store';
import { Chip, GlassCard, LiveDot, SPRING, Sparkline, Stat } from './ui';
import { cn } from '@/lib/cn';

const CHIP_ICONS = [Radar, Sparkles, Cpu];

export function Hero() {
  const scrollTo = useScrollToSection();

  return (
    <section id="overview" className="relative scroll-mt-28 px-4 pt-28 pb-10 sm:pt-36">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        {/* ---------------------------- copy ---------------------------- */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.08 }}
          >
            <Chip tone="violet" className="mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              Final Year Project · Computer Vision
            </Chip>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.12 }}
            className="gradient-text text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-6xl"
          >
            {PROJECT.title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.18 }}
            className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg"
          >
            {PROJECT.subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.24 }}
            className="mt-6 flex flex-wrap gap-2"
          >
            {META_CHIPS.map((chip, i) => {
              const Icon = CHIP_ICONS[i];
              return (
                <Chip key={chip} tone="cyan">
                  <Icon className="h-3.5 w-3.5 text-cyan-600" />
                  {chip}
                </Chip>
              );
            })}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.3 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              onClick={() => scrollTo('analytics')}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.02] active:scale-[0.99]"
            >
              <span className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-white/25 transition-transform duration-700 group-hover:translate-x-[320%]" />
              <Gauge className="relative h-4 w-4" />
              Model Analytics
            </button>
            <button
              type="button"
              onClick={() => scrollTo('logs')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/90 bg-white/70 px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-white"
            >
              <TerminalSquare className="h-4 w-4 text-violet-600" />
              Live Command Log
            </button>
          </motion.div>

          <dl className="mt-9 grid max-w-lg grid-cols-3 gap-3">
            {[
              { k: 'Gesture classes', v: '5' },
              { k: 'Landmarks / frame', v: '21' },
              { k: 'Latency budget', v: '150 ms' },
            ].map((item) => (
              <div key={item.k} className="rounded-xl border border-white/80 bg-white/50 px-3 py-2.5">
                <dt className="text-[10px] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  {item.k}
                </dt>
                <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">{item.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* -------------------------- vitals card ------------------------- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.2 }}
        >
          <GlassCard className="p-4 sm:p-5" glow>
            <HeroVitals />
          </GlassCard>
        </motion.div>
      </div>

      <motion.button
        type="button"
        onClick={() => scrollTo('analytics')}
        aria-label="Scroll to model analytics"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="mx-auto mt-10 hidden h-9 w-9 place-items-center rounded-full border border-white/80 bg-white/60 text-ink-mute transition-colors hover:text-ink sm:grid"
      >
        <ArrowDown className="h-4 w-4" />
      </motion.button>
    </section>
  );
}

/** Compact live engine readout. Subscribes to four primitives only. */
function HeroVitals() {
  const mode = useSystem((s) => s.mode);
  const latency = useSystem((s) => s.latency);
  const fps = useSystem((s) => s.fps);
  const accuracy = useSystem((s) => s.accuracy);
  const hotSwaps = useSystem((s) => s.hotSwaps);
  const loading = useSystem((s) => s.loading);
  const history = useLatencyHistory();

  const spec = ENGINES[mode];
  const breach = latency > LATENCY_THRESHOLD;
  const pct = Math.min(100, (latency / 260) * 100);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LiveDot tone={breach ? 'amber' : 'cyan'} />
          <span className="text-[11px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
            Inference Engine
          </span>
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold',
            loading
              ? 'border-slate-300 bg-slate-100 text-ink-mute'
              : breach
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-emerald-300 bg-emerald-50 text-emerald-700',
          )}
        >
          {loading ? 'LOADING' : breach ? 'OVER BUDGET' : 'NOMINAL'}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/80 bg-white/60 p-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-white">
          {mode === 'cnn' ? <Cpu className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className="truncate font-mono text-[12px] font-semibold text-ink">{spec.name}</div>
          <div className="truncate text-[10px] text-ink-mute">{spec.framework}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-end justify-between">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Frame latency
          </span>
          <span
            className={cn(
              'font-mono text-lg font-semibold tabular-nums',
              breach ? 'text-amber-600' : 'text-cyan-700',
            )}
          >
            {latency.toFixed(1)}
            <span className="ml-0.5 text-[11px] text-ink-mute">ms</span>
          </span>
        </div>

        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-200/70">
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out',
              breach
                ? 'bg-gradient-to-r from-amber-400 to-rose-500'
                : 'bg-gradient-to-r from-cyan-400 to-violet-500',
            )}
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute inset-y-0 w-0.5 bg-amber-500"
            style={{ left: `${(LATENCY_THRESHOLD / 260) * 100}%` }}
            title={`${LATENCY_THRESHOLD} ms budget`}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-mute">
          <span>0</span>
          <span className="text-amber-600">▲ {LATENCY_THRESHOLD} ms budget</span>
          <span>260</span>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 rounded-xl border border-white/80 bg-white/55 px-3 py-2">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Latency history
          </div>
          <div className="mt-1 font-mono text-[10px] text-ink-mute">
            last {history.length} samples · watchdog @ {LATENCY_THRESHOLD} ms
          </div>
        </div>
        <Sparkline values={[...history]} threshold={LATENCY_THRESHOLD} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Throughput" value={fps.toFixed(1)} unit="fps" tone="cyan" />
        <Stat label="Accuracy" value={accuracy.toFixed(1)} unit="%" tone="violet" />
        <Stat label="Hot-swaps" value={hotSwaps} tone="amber" hint="auto fallbacks" />
      </div>
    </div>
  );
}
