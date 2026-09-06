'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, Zap } from 'lucide-react';
import { dismissAlert, useSystem } from '@/lib/store';
import { cn } from '@/lib/cn';

const TONES = {
  warn: {
    ring: 'border-amber-300/80',
    wash: 'from-amber-50/95 via-orange-50/90 to-rose-50/85',
    bar: 'bg-gradient-to-r from-amber-400 to-orange-500',
    icon: 'text-amber-600',
    Icon: AlertTriangle,
  },
  info: {
    ring: 'border-cyan-300/80',
    wash: 'from-cyan-50/95 via-sky-50/90 to-indigo-50/85',
    bar: 'bg-gradient-to-r from-cyan-400 to-indigo-500',
    icon: 'text-cyan-600',
    Icon: Info,
  },
  ok: {
    ring: 'border-emerald-300/80',
    wash: 'from-emerald-50/95 via-teal-50/90 to-cyan-50/85',
    bar: 'bg-gradient-to-r from-emerald-400 to-teal-500',
    icon: 'text-emerald-600',
    Icon: CheckCircle2,
  },
} as const;

/** Global hot-swap / engine-switch alert. */
export function ToastHost() {
  const alert = useSystem((s) => s.alert);
  const tone = alert ? TONES[alert.tone] : null;
  const Icon = tone?.Icon ?? Info;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4 sm:top-24"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {alert ? (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className={cn(
              'pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border bg-gradient-to-br shadow-xl shadow-amber-500/10 backdrop-blur-md',
              tone!.ring,
              tone!.wash,
            )}
          >
            <div className="flex items-start gap-3 p-3.5">
              <span className="relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/80 shadow-sm">
                <Icon className={cn("h-4 w-4", tone!.icon)} />
                {alert.tone === 'warn' ? (
                  <span className="absolute inset-0 rounded-xl border border-amber-400/50 animate-pulse-ring" />
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  {alert.title}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{alert.body}</p>
              </div>
              <button
                type="button"
                onClick={dismissAlert}
                aria-label="Dismiss notification"
                className="rounded-lg p-1 text-ink-mute transition-colors hover:bg-white/70 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <motion.div
              className={cn('h-0.5 origin-left', tone!.bar)}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 7, ease: 'linear' }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
