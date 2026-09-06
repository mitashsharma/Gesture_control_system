'use client';

import { motion } from 'framer-motion';
import { GraduationCap, Users } from 'lucide-react';
import { MENTORS, TEAM } from '@/lib/data';
import { useInView } from '@/lib/hooks';
import { GlassCard, SectionHeading, SPRING } from './ui';
import { cn } from '@/lib/cn';

export function Team() {
  const { ref, inView } = useInView<HTMLDivElement>('60px', 0.12);

  return (
    <section id="team" className="section-offload relative scroll-mt-28 px-4 py-16">
      <div className="mx-auto max-w-6xl" ref={ref}>
        <SectionHeading
          eyebrow="Team"
          title="Undergraduate project team"
          description="Five-person team from the Department of Computer Science & Engineering, each owning one layer of the recognition-to-action stack."
          icon={<Users className="h-3.5 w-3.5" />}
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((m, i) => (
            <motion.div
              key={m.name}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ ...SPRING, delay: i * 0.06 }}
            >
              <GlassCard
                flat
                glow
                className="group h-full overflow-hidden p-4 transition-shadow duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-[13px] font-bold text-white shadow-md transition-transform duration-300 group-hover:scale-105',
                      m.hue,
                    )}
                  >
                    {m.initials}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-[13.5px] font-semibold text-ink">{m.name}</h3>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-cyan-700">{m.role}</p>
                  </div>
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-ink-soft">{m.focus}</p>
                <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-slate-200/70">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={inView ? { scaleX: 1 } : {}}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 + i * 0.06 }}
                    className={cn('h-full origin-left bg-gradient-to-r', m.hue)}
                  />
                </div>
              </GlassCard>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ ...SPRING, delay: TEAM.length * 0.06 }}
          >
            <GlassCard
              flat
              className="flex h-full flex-col justify-center gap-3 border-violet-200/70 bg-gradient-to-br from-violet-50/80 to-cyan-50/60 p-4"
            >
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-violet-600" />
                <span className="text-[12.5px] font-semibold text-ink">Mentorship</span>
              </div>
              {MENTORS.map((p) => (
                <div key={p.name} className="rounded-lg border border-white/80 bg-white/70 px-3 py-2">
                  <div className="text-[12px] font-semibold text-ink">{p.name}</div>
                  <div className="text-[10.5px] text-ink-mute">{p.role}</div>
                </div>
              ))}
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
