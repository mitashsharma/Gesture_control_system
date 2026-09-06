'use client';

import { motion } from 'framer-motion';
import { Gauge, Pause, Play, Sparkles, Timer, Waves, Zap } from 'lucide-react';
import { useDocumentVisible, usePrefersReducedMotion } from '@/lib/hooks';
import { setMotion, setRunning, useSystem } from '@/lib/store';
import { Chip, GlassCard, LiveDot, SectionHeading } from './ui';
import { cn } from '@/lib/cn';

const OPTIMISATIONS = [
  {
    icon: Timer,
    title: 'One clock for the whole page',
    detail: 'A single 800 ms interval drives latency, FPS, jitter and accuracy. No per-widget timers.',
  },
  {
    icon: Gauge,
    title: 'Selector-scoped subscriptions',
    detail:
      'Widgets read the store through useSyncExternalStore selectors, so a latency tick re-renders four small readouts instead of the entire tree.',
  },
  {
    icon: Waves,
    title: 'Frame-capped canvas loops',
    detail:
      'Demo scenes render at 30 fps with a clamped device-pixel ratio (max 2) and stop entirely when scrolled out of view.',
  },
  {
    icon: Zap,
    title: 'Visibility-aware timers',
    detail:
      'The log stream and every rAF loop tear themselves down when the tab is hidden or the window loses focus — a backgrounded page costs zero CPU.',
  },
  {
    icon: Sparkles,
    title: 'Compositor-only animation',
    detail:
      'All transitions animate transform and opacity; backdrop-filter is limited to the sticky nav and transient overlays — the 29 content cards use a plain translucent fill instead.',
  },
  {
    icon: Pause,
    title: 'Bounded work',
    detail:
      'The command log is a 60-entry ring buffer, the latency sparkline keeps 48 samples, and off-screen sections use content-visibility: auto.',
  },
];

export function PerfGuard() {
  const running = useSystem((s) => s.running);
  const motionLevel = useSystem((s) => s.motion);
  const latency = useSystem((s) => s.latency);
  const fps = useSystem((s) => s.fps);
  const docVisible = useDocumentVisible();
  const reduced = usePrefersReducedMotion();

  return (
    <section id="performance" className="section-offload relative scroll-mt-28 px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Runtime"
          title="Performance budget & master controls"
          description="This dashboard is deliberately cheap to run: it is designed to sit open beside a compiler, a browser with forty tabs, or the Python daemon itself without stealing frames."
          icon={<Gauge className="h-3.5 w-3.5" />}
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <GlassCard flat className="p-5">
            <div className="flex items-center gap-2">
              <LiveDot tone={running ? 'emerald' : 'amber'} />
              <span className="text-[12.5px] font-semibold text-ink">Master controls</span>
            </div>

            <div className="mt-4 space-y-2.5">
              <Switch
                label="Live simulation"
                hint={running ? 'Telemetry ticking at 800 ms' : 'All timers stopped'}
                checked={running}
                onChange={setRunning}
                onIcon={<Play className="h-3.5 w-3.5" />}
                offIcon={<Pause className="h-3.5 w-3.5" />}
              />
              <Switch
                label="Decorative motion"
                hint={motionLevel === 'full' ? 'Canvas scenes animating' : 'Static single frame'}
                checked={motionLevel === 'full'}
                onChange={(v) => setMotion(v ? 'full' : 'minimal')}
                onIcon={<Sparkles className="h-3.5 w-3.5" />}
                offIcon={<Pause className="h-3.5 w-3.5" />}
              />
            </div>

            <dl className="mt-5 space-y-1.5 rounded-xl border border-white/85 bg-white/55 p-3 font-mono text-[10.5px]">
              <Readout k="simulation clock" v={running ? '800 ms' : 'stopped'} ok={running} />
              <Readout k="canvas rAF loops" v="≤ 1 (visible tab only)" ok />
              <Readout k="frame cap" v="30 fps · DPR ≤ 2" ok />
              <Readout k="log ring buffer" v="60 entries" ok />
              <Readout k="document visible" v={docVisible ? 'yes' : 'no'} ok={docVisible} />
              <Readout k="prefers-reduced-motion" v={reduced ? 'honoured' : 'not set'} ok />
              <Readout k="current latency" v={`${latency.toFixed(1)} ms`} ok={latency <= 150} />
              <Readout k="current throughput" v={`${fps.toFixed(1)} fps`} ok={fps >= 6} />
            </dl>
          </GlassCard>

          <div className="grid gap-3 sm:grid-cols-2">
            {OPTIMISATIONS.map((o, i) => (
              <motion.div
                key={o.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ type: 'spring', stiffness: 260, damping: 24, delay: i * 0.05 }}
              >
                <GlassCard flat glow className="h-full p-4">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-sm">
                    <o.icon className="h-4 w-4" />
                  </span>
                  <h3 className="mt-2.5 text-[12.5px] font-semibold text-ink">{o.title}</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{o.detail}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
  onIcon,
  offIcon,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-300',
        checked
          ? 'border-cyan-300/80 bg-cyan-50/60'
          : 'border-white/90 bg-white/60 hover:bg-white/80',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-ink">{label}</span>
        <span className="block text-[10.5px] text-ink-mute">{hint}</span>
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300',
          checked ? 'bg-gradient-to-r from-cyan-400 to-violet-500' : 'bg-slate-300',
        )}
      >
        <motion.span
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="absolute top-0.5 left-0.5 grid h-5 w-5 place-items-center rounded-full bg-white text-slate-500 shadow"
        >
          {checked ? onIcon : offIcon}
        </motion.span>
      </span>
    </button>
  );
}

function Readout({ k, v, ok }: { k: string; v: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-mute">{k}</dt>
      <dd className="flex items-center gap-1.5 font-semibold text-ink">
        <Chip tone={ok ? 'emerald' : 'amber'} className="px-1.5 py-0">{ok ? 'ok' : '—'}</Chip>
        {v}
      </dd>
    </div>
  );
}
