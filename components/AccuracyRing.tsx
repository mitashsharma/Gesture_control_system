'use client';

import { motion } from 'framer-motion';
import { Target, TrendingUp } from 'lucide-react';
import { GESTURE_CLASSES } from '@/lib/data';
import type { MatrixStats } from '@/lib/simulation';
import { cn } from '@/lib/cn';

const R = 54;
const C = 2 * Math.PI * R;

export function AccuracyRing({
  value,
  stats,
  mode,
}: {
  value: number;
  stats: MatrixStats;
  mode: string;
}) {
  const offset = C * (1 - Math.min(1, Math.max(0, value / 100)));
  const angle = (value / 100) * 360 - 90;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative h-[142px] w-[142px] shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="55%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <circle cx="70" cy="70" r={R} fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <motion.circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: offset }}
            transition={{ type: 'spring', stiffness: 90, damping: 22 }}
            style={{ filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.45))' }}
          />
        </svg>
        {/* Leading-edge glow dot — transform-only, so it stays on the compositor */}
        <motion.span
          className="pointer-events-none absolute inset-0"
          initial={{ rotate: -90 }}
          animate={{ rotate: angle }}
          transition={{ type: 'spring', stiffness: 90, damping: 22 }}
        >
          <span
            className="absolute top-[13px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_3px_rgba(139,92,246,0.6)]"
            style={{ border: '2px solid #8b5cf6' }}
          />
        </motion.span>

        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-mono text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">
              {value.toFixed(1)}
              <span className="text-[14px] text-ink-mute">%</span>
            </div>
            <div className="mt-1 text-[9.5px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
              Accuracy
            </div>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 space-y-2.5">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-600" />
          <span className="text-[12.5px] font-semibold text-ink">Per-class F1 score</span>
          <span className="ml-auto font-mono text-[11px] text-ink-mute">
            macro {stats.macroF1.toFixed(2)}%
          </span>
        </div>

        {GESTURE_CLASSES.map((label, i) => {
          const f1 = stats.f1[i];
          return (
            <div key={`${mode}-${label}`} className="group/bar">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="truncate text-ink-soft">{label}</span>
                <span className="font-mono tabular-nums text-ink">{f1.toFixed(2)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: f1 / 100 }}
                  transition={{ type: 'spring', stiffness: 90, damping: 20, delay: i * 0.05 }}
                  className={cn(
                    'h-full origin-left rounded-full bg-gradient-to-r',
                    f1 >= 98.5
                      ? 'from-emerald-400 to-teal-500'
                      : f1 >= 97
                        ? 'from-cyan-400 to-indigo-500'
                        : 'from-amber-400 to-orange-500',
                  )}
                />
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-1.5 pt-1 text-[10.5px] text-ink-mute">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          {stats.total.toLocaleString()} validation samples · {GESTURE_CLASSES.length} classes · 5-fold CV
        </div>
      </div>
    </div>
  );
}
