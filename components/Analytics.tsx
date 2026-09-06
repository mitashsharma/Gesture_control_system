'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Boxes,
  Cpu,
  Gauge,
  Layers,
  LineChart,
  ScanFace,
  Timer,
  Zap,
} from 'lucide-react';
import { CONFUSION, ENGINES } from '@/lib/data';
import { matrixStats } from '@/lib/simulation';
import { LATENCY_THRESHOLD, useSystem } from '@/lib/store';
import { AccuracyRing } from './AccuracyRing';
import { ConfusionMatrix } from './ConfusionMatrix';
import { ModelControl } from './ModelControl';
import { Chip, GlassCard, SectionHeading, Stat } from './ui';
import { cn } from '@/lib/cn';

export function Analytics() {
  const mode = useSystem((s) => s.mode);
  const latency = useSystem((s) => s.latency);
  const fps = useSystem((s) => s.fps);
  const jitter = useSystem((s) => s.jitter);
  const accuracy = useSystem((s) => s.accuracy);
  const loading = useSystem((s) => s.loading);

  const spec = ENGINES[mode];
  const stats = matrixStats(mode, CONFUSION[mode]);
  const breach = latency > LATENCY_THRESHOLD;

  return (
    <section id="analytics" className="section-offload relative scroll-mt-28 px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Model Analytics"
          title="Evaluation, latency watchdog & engine arbitration"
          description="Live inference telemetry for whichever engine currently owns the pipeline, with the watchdog that hot-swaps to the prebuilt fallback the moment the custom CNN slips past its frame budget."
          icon={<Activity className="h-3.5 w-3.5" />}
        />

        <div className="mt-8 space-y-5">
          <ModelControl />

          <div className="grid gap-5 lg:grid-cols-[1.02fr_0.98fr]">
            {/* ---------------------- model details ---------------------- */}
            <GlassCard flat className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-cyan-600" />
                  <span className="text-[12.5px] font-semibold text-ink">Active model</span>
                </div>
                <Chip tone={loading ? 'neutral' : breach ? 'amber' : 'emerald'}>
                  {loading ? 'loading weights' : breach ? 'over budget' : 'healthy'}
                </Chip>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={spec.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
                >
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/85 bg-gradient-to-br from-cyan-50/80 to-violet-50/70 p-3">
                    <span
                      className={cn(
                        'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-md',
                        mode === 'cnn'
                          ? 'bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-cyan-500/25'
                          : 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/25',
                      )}
                    >
                      {mode === 'cnn' ? <Cpu className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[13px] font-semibold text-ink">
                        {spec.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-ink-soft">
                        {spec.framework}
                      </div>
                    </div>
                  </div>

                  <dl className="mt-3 space-y-1.5">
                    <Row icon={<Layers className="h-3.5 w-3.5" />} k="Device acceleration" v={spec.device} />
                    <Row icon={<Boxes className="h-3.5 w-3.5" />} k="Model size" v={spec.params} />
                    <Row icon={<ScanFace className="h-3.5 w-3.5" />} k="Input tensor" v={spec.input} />
                    <Row icon={<Timer className="h-3.5 w-3.5" />} k="Cold-start cost" v={`${spec.coldStart} ms`} />
                    <Row
                      icon={<LineChart className="h-3.5 w-3.5" />}
                      k="Reference accuracy"
                      v={`${spec.accuracy}% on custom dataset`}
                    />
                  </dl>

                  <p className="mt-3 text-[11.5px] leading-relaxed text-ink-soft">{spec.blurb}</p>
                </motion.div>
              </AnimatePresence>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat
                  label="Latency"
                  value={latency.toFixed(1)}
                  unit="ms"
                  tone={breach ? 'amber' : 'cyan'}
                />
                <Stat label="Throughput" value={fps.toFixed(1)} unit="fps" tone="cyan" />
                <Stat label="Jitter" value={jitter.toFixed(1)} unit="ms" tone="violet" />
                <Stat label="Accuracy" value={accuracy.toFixed(1)} unit="%" tone="emerald" />
              </div>
            </GlassCard>

            {/* -------------------- accuracy indicator -------------------- */}
            <GlassCard flat className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-violet-600" />
                  <span className="text-[12.5px] font-semibold text-ink">
                    Classification accuracy
                  </span>
                </div>
                <Chip tone="violet">{spec.accuracy}% reference</Chip>
              </div>
              <div className="mt-4">
                <AccuracyRing value={accuracy} stats={stats} mode={mode} />
              </div>
            </GlassCard>
          </div>

          {/* ---------------------- confusion matrix ---------------------- */}
          <GlassCard flat className="p-4 sm:p-5">
            <ConfusionMatrix stats={stats} mode={mode} />
          </GlassCard>

          {/* -------------------- engine comparison ---------------------- */}
          <GlassCard flat className="overflow-x-auto p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-[12.5px] font-semibold text-ink">Engine comparison</span>
            </div>
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="text-[10px] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                  <th className="pb-2 font-semibold">Engine</th>
                  <th className="pb-2 font-semibold">Latency band</th>
                  <th className="pb-2 font-semibold">Accuracy</th>
                  <th className="pb-2 font-semibold">Cold start</th>
                  <th className="pb-2 font-semibold">Role</th>
                </tr>
              </thead>
              <tbody className="text-[11.5px]">
                {(Object.keys(ENGINES) as Array<keyof typeof ENGINES>).map((key) => {
                  const e = ENGINES[key];
                  const active = key === mode;
                  return (
                    <tr
                      key={key}
                      className={cn(
                        'border-t border-slate-200/80 transition-colors',
                        active && 'bg-gradient-to-r from-cyan-50/80 to-violet-50/60',
                      )}
                    >
                      <td className="py-2.5 pr-3">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              active ? 'bg-cyan-500' : 'bg-slate-300',
                            )}
                          />
                          <span className="font-mono font-semibold text-ink">{e.name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-ink-soft">
                        {e.latency[0]}–{e.latency[1]} ms
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-ink-soft">{e.accuracy}%</td>
                      <td className="py-2.5 pr-3 font-mono text-ink-soft">{e.coldStart} ms</td>
                      <td className="py-2.5 text-ink-soft">
                        {key === 'cnn' ? 'Primary · highest accuracy' : 'Fallback · always available'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}

function Row({ k, v, icon }: { k: string; v: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/60">
      <span className="text-cyan-600">{icon}</span>
      <dt className="text-[11px] text-ink-mute">{k}</dt>
      <dd className="ml-auto truncate font-mono text-[11px] font-medium text-ink">{v}</dd>
    </div>
  );
}
