'use client';

import { motion } from 'framer-motion';
import {
  Boxes,
  Camera,
  ChevronRight,
  Cpu,
  Hand,
  Mic,
  MousePointerClick,
  Workflow,
} from 'lucide-react';
import { PIPELINE, TECH_STACK } from '@/lib/data';
import { useInView } from '@/lib/hooks';
import { Chip, GlassCard, SectionHeading } from './ui';

const ICONS = [Camera, Hand, Cpu, MousePointerClick, Mic];

export function Pipeline() {
  const { ref, inView } = useInView<HTMLDivElement>('60px', 0.15);

  return (
    <section id="pipeline" className="section-offload relative scroll-mt-28 px-4 py-16">
      <div className="mx-auto max-w-6xl" ref={ref}>
        <SectionHeading
          eyebrow="Architecture"
          title="Data-flow pipeline & technology stack"
          description="Five stages from raw camera frames to injected Windows input events, with the voice channel running in parallel and fused at the action resolver."
          icon={<Workflow className="h-3.5 w-3.5" />}
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-5">
          {PIPELINE.map((step, i) => {
            const Icon = ICONS[i];
            const isWatchdog = step.index === 3;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 24 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 24,
                  delay: i * 0.07,
                }}
                className="relative"
              >
                <GlassCard
                  flat
                  glow
                  className={
                    isWatchdog
                      ? 'h-full border-amber-200/90 bg-gradient-to-b from-amber-50/80 to-white/80 p-4'
                      : 'h-full p-4'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        isWatchdog
                          ? 'grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/25'
                          : 'grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-md shadow-cyan-500/20'
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-[10px] font-semibold text-ink-mute">
                      STEP {String(step.index).padStart(2, '0')}
                    </span>
                  </div>

                  <h3 className="mt-3 text-[13px] leading-snug font-semibold text-ink">
                    {step.title}
                  </h3>
                  <Chip tone={isWatchdog ? 'amber' : 'cyan'} className="mt-2">
                    {step.tech}
                  </Chip>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-ink-soft">{step.detail}</p>

                  <div className="mt-3 flex items-center gap-1.5 border-t border-white/80 pt-2.5 font-mono text-[10px] text-ink-mute">
                    <Boxes className="h-3 w-3" />
                    {step.throughput}
                  </div>
                </GlassCard>

                {/* connector — dashed line + chevron, CSS-animated stroke only */}
                {i < PIPELINE.length - 1 ? (
                  <div className="absolute top-1/2 -right-4 z-10 hidden -translate-y-1/2 lg:block">
                    <svg width="32" height="16" viewBox="0 0 32 16" aria-hidden="true">
                      <line
                        x1="0"
                        y1="8"
                        x2="26"
                        y2="8"
                        stroke="url(#flowGrad)"
                        strokeWidth="1.5"
                        strokeDasharray="6 6"
                        className="animate-flow-dash"
                      />
                      <defs>
                        <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#22d3ee" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <ChevronRight className="absolute top-1/2 right-0 h-3.5 w-3.5 -translate-y-1/2 text-violet-500" />
                  </div>
                ) : null}

                {/* mobile connector */}
                {i < PIPELINE.length - 1 ? (
                  <div className="flex justify-center py-1 lg:hidden">
                    <ChevronRight className="h-4 w-4 rotate-90 text-violet-400" />
                  </div>
                ) : null}
              </motion.div>
            );
          })}
        </div>

        <GlassCard flat className="mt-6 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
              Tech stack
            </span>
            <div className="flex flex-wrap gap-2">
              {TECH_STACK.map((tech, i) => (
                <motion.span
                  key={tech}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={inView ? { opacity: 1, scale: 1 } : {}}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 20,
                    delay: 0.15 + i * 0.035,
                  }}
                  className="rounded-lg border border-white/90 bg-white/70 px-2.5 py-1 font-mono text-[11px] font-medium text-ink-soft transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:bg-white hover:text-ink hover:shadow-sm"
                >
                  {tech}
                </motion.span>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}
