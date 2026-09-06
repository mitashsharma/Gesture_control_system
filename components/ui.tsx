'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const SPRING = { type: 'spring', stiffness: 300, damping: 20 } as const;
export const SPRING_SOFT = { type: 'spring', stiffness: 220, damping: 26 } as const;

export function GlassCard({
  className,
  flat = false,
  glow = false,
  children,
  ...rest
}: HTMLMotionProps<'div'> & { flat?: boolean; glow?: boolean }) {
  return (
    <motion.div
      whileHover={glow ? { y: -3 } : undefined}
      transition={SPRING}
      className={cn(
        'relative rounded-2xl',
        flat ? 'glass-flat' : 'glass',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  icon,
  align = 'left',
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  align?: 'left' | 'center';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' && 'items-center text-center',
      )}
    >
      <span className="inline-flex items-center gap-2 self-start rounded-full border border-cyan-500/25 bg-cyan-50/70 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-cyan-700 uppercase">
        {icon}
        {eyebrow}
      </span>
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function Chip({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'cyan' | 'violet' | 'amber' | 'rose' | 'emerald';
}) {
  const tones: Record<string, string> = {
    neutral: 'border-slate-300/70 bg-white/70 text-ink-soft',
    cyan: 'border-cyan-300/70 bg-cyan-50/80 text-cyan-800',
    violet: 'border-violet-300/70 bg-violet-50/80 text-violet-800',
    amber: 'border-amber-300/70 bg-amber-50/80 text-amber-800',
    rose: 'border-rose-300/70 bg-rose-50/80 text-rose-800',
    emerald: 'border-emerald-300/70 bg-emerald-50/80 text-emerald-800',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveDot({
  tone = 'cyan',
  className,
}: {
  tone?: 'cyan' | 'amber' | 'emerald' | 'rose';
  className?: string;
}) {
  const map = {
    cyan: 'bg-cyan-500',
    amber: 'bg-amber-500',
    emerald: 'bg-emerald-500',
    rose: 'bg-rose-500',
  } as const;
  return (
    <span className={cn('relative inline-flex h-2 w-2', className)}>
      <span
        className={cn('absolute inset-0 rounded-full opacity-60 animate-pulse-ring', map[tone])}
      />
      <span className={cn('relative h-2 w-2 rounded-full', map[tone])} />
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = 'cyan',
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'cyan' | 'violet' | 'amber' | 'emerald';
}) {
  const accent = {
    cyan: 'text-cyan-700',
    violet: 'text-violet-700',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
  }[tone];
  return (
    <div className="rounded-xl border border-white/80 bg-white/55 px-3 py-2.5">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn('font-mono text-xl font-semibold tabular-nums', accent)}>
          {value}
        </span>
        {unit ? <span className="text-[11px] text-ink-mute">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-0.5 text-[10px] text-ink-mute">{hint}</div> : null}
    </div>
  );
}

/** Compact latency history plot — one polyline, no per-point nodes. */
export function Sparkline({
  values,
  threshold,
  width = 148,
  height = 38,
  tone = '#22d3ee',
}: {
  values: number[];
  threshold: number;
  width?: number;
  height?: number;
  tone?: string;
}) {
  if (values.length < 2) {
    return <div style={{ width, height }} />;
  }
  const max = Math.max(threshold * 1.35, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(' ');
  const yThresh = height - ((threshold - min) / span) * height;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <line
        x1={0}
        x2={width}
        y1={yThresh}
        y2={yThresh}
        stroke="#f59e0b"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.65}
      />
      <polyline
        points={pts}
        fill="none"
        stroke={tone}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
