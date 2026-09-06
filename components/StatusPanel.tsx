'use client';

import { motion } from 'framer-motion';
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { MODIFICATIONS, PROJECT, TIMELINE } from '@/lib/data';
import { useInView } from '@/lib/hooks';
import { Chip, GlassCard, SectionHeading, SPRING } from './ui';
import { cn } from '@/lib/cn';

const SEVERITY = {
  critical: { tone: 'rose' as const, label: 'Critical' },
  major: { tone: 'amber' as const, label: 'Major' },
  minor: { tone: 'cyan' as const, label: 'Minor' },
};

export function StatusPanel() {
  const { ref, inView } = useInView<HTMLDivElement>('60px', 0.1);
  const closed = MODIFICATIONS.filter((m) => m.status === 'closed').length;
  const pct = Math.round((closed / MODIFICATIONS.length) * 100);

  return (
    <section id="status" className="section-offload relative scroll-mt-28 px-4 py-16">
      <div className="mx-auto max-w-6xl" ref={ref}>
        <SectionHeading
          eyebrow="Status"
          title="Evaluation outcome & closure tracker"
          description="The panel was accepted at the final evaluation subject to four modifications. Three are closed in this build; the remaining item is a documentation task."
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
          {/* approval card */}
          <GlassCard
            flat
            className="relative overflow-hidden border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-cyan-50/80 p-5"
          >
            <span className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br from-amber-300/25 to-cyan-300/20 blur-2xl" />

            <div className="relative">
              <div className="flex items-center gap-2">
                <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-white/90 shadow-sm">
                  <BadgeCheck className="h-5 w-5 text-amber-500" />
                  <span className="absolute inset-0 rounded-xl border border-amber-400/50 animate-pulse-ring" />
                </span>
                <div>
                  <div className="text-[10px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
                    Evaluation outcome
                  </div>
                  <div className="text-[15px] font-semibold text-ink">{PROJECT.status}</div>
                </div>
              </div>

              <dl className="mt-5 space-y-2 text-[12px]">
                <MetaRow icon={<FileText className="h-3.5 w-3.5" />} k="Review reference" v={PROJECT.reviewId} />
                <MetaRow icon={<ClipboardCheck className="h-3.5 w-3.5" />} k="Build under review" v={PROJECT.version} />
                <MetaRow icon={<CalendarClock className="h-3.5 w-3.5" />} k="Final evaluation" v="28 April 2026" />
                <MetaRow icon={<ShieldCheck className="h-3.5 w-3.5" />} k="External evaluator" v="Prof. R. K. Tripathi" />
              </dl>

              <div className="mt-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold text-ink-soft">
                    Modifications closed
                  </span>
                  <span className="font-mono text-[12px] font-semibold text-ink tabular-nums">
                    {closed}/{MODIFICATIONS.length} · {pct}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={inView ? { scaleX: pct / 100 } : {}}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    className="h-full origin-left rounded-full bg-gradient-to-r from-amber-400 via-cyan-400 to-violet-500"
                  />
                </div>
              </div>
            </div>
          </GlassCard>

          {/* modifications */}
          <GlassCard flat className="p-5">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-violet-600" />
              <span className="text-[12.5px] font-semibold text-ink">
                Modifications requested by the panel
              </span>
            </div>

            <ul className="mt-4 space-y-2.5">
              {MODIFICATIONS.map((m, i) => (
                <motion.li
                  key={m.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ ...SPRING, delay: i * 0.07 }}
                  className={cn(
                    'rounded-xl border p-3 transition-shadow duration-300 hover:shadow-md',
                    m.status === 'closed'
                      ? 'border-white/85 bg-white/60'
                      : 'border-amber-200 bg-amber-50/60',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] font-semibold text-ink-mute">{m.id}</span>
                    <span className="text-[12px] font-semibold text-ink">{m.title}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <Chip tone={SEVERITY[m.severity].tone}>{SEVERITY[m.severity].label}</Chip>
                      <Chip tone={m.status === 'closed' ? 'emerald' : 'amber'}>
                        {m.status === 'closed' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                        {m.status === 'closed' ? 'Closed' : 'Open'}
                      </Chip>
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{m.note}</p>
                </motion.li>
              ))}
            </ul>
          </GlassCard>
        </div>

        {/* timeline */}
        <GlassCard flat className="mt-5 p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-cyan-600" />
            <span className="text-[12.5px] font-semibold text-ink">Project timeline</span>
          </div>
          <ol className="mt-5 flex flex-col gap-4 sm:flex-row sm:gap-0">
            {TIMELINE.map((t, i) => (
              <li key={t.label} className="relative flex flex-1 items-start gap-3 sm:flex-col sm:gap-2">
                <div className="flex w-full items-center">
                  <span
                    className={cn(
                      'z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 bg-white',
                      t.state === 'done'
                        ? 'border-cyan-400 text-cyan-500'
                        : 'border-amber-400 text-amber-500',
                    )}
                  >
                    {t.state === 'done' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </span>
                  {i < TIMELINE.length - 1 ? (
                    <span
                      className={cn(
                        'h-0.5 flex-1 sm:w-full sm:flex-none',
                        t.state === 'done' ? 'bg-gradient-to-r from-cyan-300 to-violet-300' : 'bg-slate-200',
                      )}
                    />
                  ) : null}
                </div>
                <div className="sm:pr-4">
                  <div className="text-[12px] font-semibold text-ink">{t.label}</div>
                  <div className="font-mono text-[10.5px] text-ink-mute">{t.date}</div>
                </div>
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>
    </section>
  );
}

function MetaRow({ k, v, icon }: { k: string; v: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-cyan-600">{icon}</span>
      <dt className="text-ink-mute">{k}</dt>
      <dd className="ml-auto font-mono font-medium text-ink">{v}</dd>
    </div>
  );
}
