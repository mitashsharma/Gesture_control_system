'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Grid3X3, Info } from 'lucide-react';
import { useState } from 'react';
import { GESTURE_CLASSES } from '@/lib/data';
import type { MatrixStats } from '@/lib/simulation';
import type { ModelMode } from '@/lib/store';
import { cn } from '@/lib/cn';

/**
 * Interactive N×N confusion-matrix heatmap.
 *
 * Tooltips are pure CSS (`group-hover`) — hovering never mounts a React
 * portal or moves the pointer through JS, so the interaction stays free.
 */
export function ConfusionMatrix({
  stats,
  mode,
}: {
  stats: MatrixStats;
  mode: ModelMode;
}) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const n = stats.matrix.length;
  const maxOff = Math.max(
    ...stats.matrix.flatMap((row, r) => row.filter((_, c) => c !== r)),
    1,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-violet-600" />
          <span className="text-[12.5px] font-semibold text-ink">Confusion matrix</span>
          <span className="font-mono text-[10px] text-ink-mute">
            {n}×{n} · rows = target, cols = predicted
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-[10.5px] text-ink-mute">
          <Info className="h-3.5 w-3.5" />
          hover a cell for precision / recall
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
          className="mt-4"
          onMouseLeave={() => setHover(null)}
        >
          {/* predicted axis */}
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `76px repeat(${n}, minmax(0, 1fr))` }}
          >
            <div className="flex items-end justify-start pb-1">
              <span className="text-[9px] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                Target ↓
              </span>
            </div>
            {GESTURE_CLASSES.map((label, c) => (
              <div
                key={`c-${label}`}
                className={cn(
                  'truncate pb-1 text-center text-[9.5px] font-medium transition-colors',
                  hover?.c === c ? 'text-violet-700' : 'text-ink-mute',
                )}
                title={label}
              >
                {label}
              </div>
            ))}
          </div>

          {stats.matrix.map((row, r) => (
            <div
              key={`r-${r}`}
              className="mt-1 grid gap-1"
              style={{ gridTemplateColumns: `76px repeat(${n}, minmax(0, 1fr))` }}
            >
              <div
                className={cn(
                  'flex items-center truncate pr-1.5 text-[10px] font-medium transition-colors',
                  hover?.r === r ? 'text-cyan-700' : 'text-ink-soft',
                )}
                title={GESTURE_CLASSES[r]}
              >
                {GESTURE_CLASSES[r]}
              </div>

              {row.map((value, c) => {
                const isDiag = r === c;
                const intensity = isDiag ? value / stats.maxCell : value / maxOff;
                const alpha = 0.1 + Math.min(1, intensity) * 0.78;
                const bg = isDiag
                  ? `rgba(56, 178, 200, ${alpha.toFixed(3)})`
                  : `rgba(244, 63, 94, ${(0.09 + Math.min(1, intensity) * 0.72).toFixed(3)})`;
                const lit = alpha > 0.62;
                const active = hover?.r === r && hover?.c === c;

                return (
                  <div key={`cell-${r}-${c}`} className="group relative">
                    <button
                      type="button"
                      onMouseEnter={() => setHover({ r, c })}
                      onFocus={() => setHover({ r, c })}
                      aria-label={`${GESTURE_CLASSES[r]} predicted as ${GESTURE_CLASSES[c]}: ${value} samples`}
                      className={cn(
                        'relative flex aspect-square w-full items-center justify-center rounded-md border font-mono text-[11px] font-semibold transition-all duration-200',
                        lit ? 'text-white' : 'text-ink',
                        active
                          ? 'z-20 scale-105 border-white shadow-lg'
                          : 'border-white/70 hover:scale-105 hover:border-white',
                      )}
                      style={{
                        backgroundColor: bg,
                        boxShadow: active
                          ? isDiag
                            ? '0 0 0 1px rgba(34,211,238,0.6), 0 8px 22px -8px rgba(34,211,238,0.7)'
                            : '0 0 0 1px rgba(244,63,94,0.55), 0 8px 22px -8px rgba(244,63,94,0.6)'
                          : undefined,
                      }}
                    >
                      {value}
                    </button>

                    {/* Tooltip — mounted only for the hovered/focused cell, so the
                        tree holds one of these instead of 25. */}
                    {active ? (
                      <div className="animate-tip-in pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-44 rounded-xl border border-white bg-white p-2.5 shadow-xl shadow-indigo-500/15">
                        <div className="text-[10px] leading-tight font-semibold text-ink">
                          {GESTURE_CLASSES[r]}
                          <span className="mx-1 text-ink-mute">→</span>
                          {GESTURE_CLASSES[c]}
                        </div>
                        <dl className="mt-1.5 space-y-0.5 font-mono text-[9.5px] text-ink-soft">
                          <div className="flex justify-between">
                            <dt>samples</dt>
                            <dd className="font-semibold text-ink">{value}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt>class precision</dt>
                            <dd>{stats.precision[c].toFixed(2)}%</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt>class recall</dt>
                            <dd>{stats.recall[r].toFixed(2)}%</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt>F1</dt>
                            <dd>{stats.f1[r].toFixed(2)}%</dd>
                          </div>
                          <div className="flex justify-between border-t border-slate-200 pt-0.5">
                            <dt>{isDiag ? 'true positives' : 'confusions'}</dt>
                            <dd className={isDiag ? 'text-emerald-600' : 'text-rose-600'}>
                              {((value / stats.total) * 100).toFixed(2)}%
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}

          {/* per-class precision footer */}
          <div
            className="mt-2 grid gap-1 border-t border-slate-200 pt-2"
            style={{ gridTemplateColumns: `76px repeat(${n}, minmax(0, 1fr))` }}
          >
            <div className="text-[9px] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Precision
            </div>
            {stats.precision.map((p, c) => (
              <div
                key={`p-${c}`}
                className={cn(
                  'text-center font-mono text-[10px] tabular-nums',
                  hover?.c === c ? 'font-semibold text-violet-700' : 'text-ink-soft',
                )}
              >
                {p.toFixed(1)}%
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <LegendSwatch
          label="Correct predictions"
          gradient="linear-gradient(90deg, rgba(56,178,200,0.12), rgba(56,178,200,0.9))"
        />
        <LegendSwatch
          label="Misclassifications"
          gradient="linear-gradient(90deg, rgba(244,63,94,0.10), rgba(244,63,94,0.82))"
        />
      </div>
    </div>
  );
}

function LegendSwatch({ label, gradient }: { label: string; gradient: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-16 rounded-full border border-white/80"
        style={{ backgroundImage: gradient }}
      />
      <span className="text-[10.5px] text-ink-mute">{label}</span>
    </div>
  );
}
