'use client';

import { motion } from 'framer-motion';
import {
  Activity,
  Boxes,
  Camera,
  Cpu,
  Hand,
  Play,
  Sparkles,
  Square,
  TriangleAlert,
  WandSparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from '@/lib/hooks';
import { extensionScore } from '@/lib/gestures';
import {
  BACKEND_LABEL,
  liveEngine,
  SOURCE_LABEL,
  useLiveEngine,
  type LiveSourceId,
} from '@/lib/liveEngine';
import { useLiveLog } from '@/lib/liveLog';
import { useSystem } from '@/lib/store';
import { Chip, GlassCard, LiveDot, SectionHeading, Stat } from './ui';
import { cn } from '@/lib/cn';

const SOURCES: { id: LiveSourceId; label: string; icon: typeof Camera; hint: string }[] = [
  {
    id: 'webcam',
    label: 'Webcam',
    icon: Camera,
    hint: 'Real frames from your camera, recognised locally — nothing leaves the browser.',
  },
  {
    id: 'synthetic',
    label: 'Synthetic hand',
    icon: WandSparkles,
    hint: 'An articulated hand is rendered to a canvas and fed through the same pipeline, so the model runs with no camera and no permissions.',
  },
];

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;

export function LiveModel() {
  const snap = useLiveEngine();
  const running = useSystem((s) => s.running);
  const hotSwaps = useSystem((s) => s.hotSwaps);
  const intents = useLiveLog();
  const { ref, inView } = useInView<HTMLDivElement>('120px');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    liveEngine.attachCanvas(canvasRef.current);
    return () => liveEngine.attachCanvas(null);
  }, []);

  // Bring the model up on its own the first time the section is seen, using the
  // synthetic source so no permission prompt interrupts the page.
  useEffect(() => {
    if (!inView || touched.current || snap.status !== 'idle') return;
    if (!running) return;
    touched.current = true;
    void liveEngine.start('synthetic');
  }, [inView, running, snap.status]);

  // The master switch stops the recognition loop too.
  useEffect(() => {
    if (!running && snap.status === 'running') void liveEngine.stop();
  }, [running, snap.status]);

  const onStart = useCallback((source: LiveSourceId) => {
    touched.current = true;
    void liveEngine.start(source);
  }, []);

  const onStop = useCallback(() => {
    touched.current = true;
    void liveEngine.stop();
  }, []);

  const source = SOURCES.find((s) => s.id === snap.source)!;
  const live = snap.status === 'running';
  const f = snap.features;

  return (
    <section id="live" className="section-offload relative scroll-mt-28 px-4 py-16">
      <div className="mx-auto max-w-6xl" ref={ref}>
        <SectionHeading
          eyebrow="Live Model"
          title="The recogniser, actually running"
          description="Hand Landmarker (BlazePalm + 21-point landmark regression) executes in this page over WASM/WebGL, and the landmark graph is classified by the geometric engine in lib/gestures.ts. Every number below is measured from real inference — no simulation."
          icon={<Activity className="h-3.5 w-3.5" />}
        />

        <GlassCard flat className="mt-8 overflow-hidden">
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-white/80 bg-gradient-to-r from-slate-50/90 to-white/60 p-2.5">
            <div
              role="tablist"
              aria-label="Input source"
              className="flex items-center gap-1 rounded-lg border border-white/90 bg-white/70 p-0.5"
            >
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={snap.source === s.id}
                  onClick={() => onStart(s.id)}
                  className={cn(
                    'relative rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors',
                    snap.source === s.id ? 'text-ink' : 'text-ink-mute hover:text-ink-soft',
                  )}
                >
                  {snap.source === s.id ? (
                    <motion.span
                      layoutId="live-source"
                      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                      className="absolute inset-0 rounded-md border border-cyan-300/60 bg-gradient-to-b from-white to-cyan-50 shadow-sm"
                    />
                  ) : null}
                  <span className="relative flex items-center gap-1.5">
                    <s.icon className="h-3.5 w-3.5" />
                    {s.label}
                  </span>
                </button>
              ))}
            </div>

            {live ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-1.5 text-[11.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
              >
                <Square className="h-3 w-3" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStart(snap.source)}
                disabled={snap.status === 'loading'}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-300/70 bg-cyan-50 px-3 py-1.5 text-[11.5px] font-semibold text-cyan-800 transition-colors hover:bg-cyan-100 disabled:opacity-60"
              >
                <Play className="h-3 w-3" />
                {snap.status === 'loading' ? 'Loading model…' : 'Start'}
              </button>
            )}

            <span className="ml-auto flex flex-wrap items-center gap-1.5 pr-0.5">
              <Chip tone={live ? 'emerald' : snap.status === 'error' ? 'rose' : 'amber'}>
                <LiveDot tone={live ? 'emerald' : snap.status === 'error' ? 'rose' : 'amber'} />
                {snap.status === 'running'
                  ? 'inferring'
                  : snap.status === 'loading'
                    ? 'loading'
                    : snap.status === 'error'
                      ? 'error'
                      : 'idle'}
              </Chip>
              <Chip tone="violet">
                <Cpu className="h-3 w-3" />
                {BACKEND_LABEL[snap.backend]}
              </Chip>
              {snap.backend === 'landmark' ? (
                <Chip tone="cyan">
                  <Boxes className="h-3 w-3" />
                  {snap.delegate} · weights {snap.modelOrigin}
                </Chip>
              ) : null}
              <Chip tone="neutral">
                <Sparkles className="h-3 w-3" />
                {snap.frames} frames
              </Chip>
            </span>
          </div>

          <div className="grid gap-3.5 p-3.5 sm:p-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            {/* ------------------------------ viewport ----------------------------- */}
            <div className="flex flex-col gap-3">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/90 bg-[#0b1220]">
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

                {snap.status === 'idle' ? (
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div className="px-6">
                      <Hand className="mx-auto h-7 w-7 text-slate-500" />
                      <p className="mt-2 text-[12px] text-slate-300">
                        Press <span className="font-semibold">Start</span> to load the Hand
                        Landmarker and begin recognition.
                      </p>
                    </div>
                  </div>
                ) : null}

                {snap.status === 'loading' ? (
                  <div className="absolute inset-0 grid place-items-center bg-[#0b1220]/70">
                    <div className="text-center">
                      <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300" />
                      <p className="mt-3 font-mono text-[11.5px] text-slate-300">
                        fetching hand_landmarker.task…
                      </p>
                    </div>
                  </div>
                ) : null}

                {snap.status === 'error' ? (
                  <div className="absolute inset-0 grid place-items-center bg-[#0b1220]/85 px-6 text-center">
                    <div>
                      <TriangleAlert className="mx-auto h-6 w-6 text-amber-400" />
                      <p className="mt-2 font-mono text-[11.5px] text-rose-200">{snap.error}</p>
                      <button
                        type="button"
                        onClick={() => onStart('synthetic')}
                        className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[11.5px] font-medium text-slate-100 hover:bg-white/20"
                      >
                        Run on the synthetic hand instead
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat
                  label="inference"
                  value={snap.latency.toFixed(1)}
                  unit="ms"
                  tone={snap.latency > 150 ? 'amber' : 'cyan'}
                  hint="per backend pass"
                />
                <Stat label="throughput" value={snap.fps.toFixed(1)} unit="fps" hint="achieved loop rate" />
                <Stat
                  label="mean top-1"
                  value={snap.confidence.toFixed(1)}
                  unit="%"
                  tone="violet"
                  hint="accepted frames"
                />
                <Stat
                  label="intents"
                  value={snap.intents}
                  tone="emerald"
                  hint={`${hotSwaps} hot-swap${hotSwaps === 1 ? '' : 's'}`}
                />
              </div>

              <p className="text-[11.5px] leading-relaxed text-ink-soft">
                <span className="font-semibold text-ink">{source.label}</span> — {source.hint}
              </p>

              {snap.backend === 'contour' ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                  <span className="font-semibold">Classical CV fallback.</span> The Hand
                  Landmarker weights could not be loaded, so recognition is running on skin
                  segmentation + convex-hull analysis. It holds Palm Stop, Fist Drag, Peace
                  Sign, Point and the swipe/scroll gestures — but{' '}
                  <span className="font-semibold">
                    Pinch Click and Thumb Up need the landmark model
                  </span>{' '}
                  (a pinch closes the very gap it would measure, and a raised thumb is
                  indistinguishable from knuckles in a silhouette).
                </p>
              ) : null}
            </div>

            {/* ------------------------------ readouts ----------------------------- */}
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-white/80 bg-white/60 p-3">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Recognised gesture
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="text-xl font-semibold tracking-tight text-ink">
                    {snap.label}
                  </span>
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-cyan-700">
                    {snap.confidence.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-[width] duration-150"
                    style={{ width: `${Math.min(100, snap.confidence)}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip tone="neutral">pose · {snap.pose}</Chip>
                  <Chip tone={snap.motion === 'none' ? 'neutral' : 'cyan'}>
                    motion · {snap.motion}
                  </Chip>
                  {snap.handedness ? <Chip tone="violet">{snap.handedness} hand</Chip> : null}
                  {f ? <Chip tone="neutral">feature quality {Math.round(f.quality * 100)}%</Chip> : null}
                </div>
              </div>

              <div className="rounded-xl border border-white/80 bg-white/60 p-3">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Finger extension
                </div>
                <ul className="mt-2 space-y-1.5">
                  {FINGERS.map((name, i) => {
                    const v = f ? extensionScore(i, f.ratios[i]) : 0;
                    return (
                      <li key={name} className="flex items-center gap-2">
                        <span className="w-12 text-[10.5px] text-ink-soft">{name}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
                          <span
                            className="block h-full rounded-full bg-cyan-400 transition-[width] duration-150"
                            style={{ width: `${Math.round(v * 100)}%` }}
                          />
                        </span>
                        <span className="w-9 text-right font-mono text-[10px] tabular-nums text-ink-mute">
                          {f ? f.ratios[i].toFixed(2) : '—'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Feature label="hand scale" value={f?.scale.toFixed(3)} />
                <Feature label="pinch d" value={f?.pinch.toFixed(3)} />
                <Feature label="thumb span" value={f?.thumbSpan.toFixed(3)} />
                <Feature label="thumb lift" value={f?.thumbLift.toFixed(3)} />
                <Feature label="palm facing" value={f?.facing.toFixed(2)} />
                <Feature
                  label="wrist x·y"
                  value={f ? `${f.wristX.toFixed(2)}·${f.wristY.toFixed(2)}` : undefined}
                />
              </div>

              <div className="min-h-[92px] flex-1 rounded-xl border border-white/80 bg-white/60 p-3">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Injected intents
                </div>
                {intents.length === 0 ? (
                  <p className="mt-2 text-[11px] text-ink-mute">
                    No gesture has crossed the debounce threshold yet — hold a pose for ~200 ms.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1 font-mono text-[10.5px]">
                    {intents
                      .slice(-5)
                      .reverse()
                      .map((e) => (
                        <li key={e.id} className="flex items-center gap-1.5">
                          <span className="text-ink-mute">[{e.time}]</span>
                          <span className="font-medium text-ink">{e.command}</span>
                          <span className="text-ink-mute">→</span>
                          <span className="text-violet-700">{e.action}</span>
                          {e.repeat ? (
                            <span className="rounded bg-slate-100 px-1 text-[9px] text-ink-mute">
                              hold
                            </span>
                          ) : null}
                          <span className="ml-auto text-ink-mute">
                            {e.confidence.toFixed(1)}% · {e.latency} ms
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}

function Feature({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-white/80 bg-white/55 px-2.5 py-1.5">
      <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink-mute uppercase">
        {label}
      </div>
      <div className="font-mono text-[12px] font-semibold tabular-nums text-ink">
        {value ?? '—'}
      </div>
    </div>
  );
}
