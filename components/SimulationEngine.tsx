'use client';

import { useEffect, useRef } from 'react';
import { ENGINES } from '@/lib/data';
import { useLiveInterval } from '@/lib/hooks';
import { latencyHistory } from '@/lib/history';
import { nextLatency } from '@/lib/simulation';
import { LATENCY_THRESHOLD, setMode, systemStore, useSystem } from '@/lib/store';

const TICK_MS = 800;
const BREACH_SAMPLES = 2; // sustained breaches before the watchdog fires

/**
 * The single clock for the whole dashboard.
 *
 *  - one `setInterval` for the entire page (no per-widget timers),
 *  - self-suspending: `useLiveInterval` tears the timer down whenever the tab
 *    is hidden or the master switch is off, so a backgrounded window costs
 *    literally zero CPU,
 *  - holds no React state; it writes straight into the store, so only widgets
 *    subscribed to a changed slice re-render.
 */
export function SimulationEngine() {
  const streak = useRef(0);
  const seeded = useRef(false);
  const running = useSystem((s) => s.running);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const start: number[] = [];
    let v = 116;
    for (let i = 0; i < 24; i++) {
      v = nextLatency('cnn', v);
      start.push(Math.round(v * 10) / 10);
    }
    latencyHistory.reset(start);
    // Cold boot: report a warm-up pass so the UI tells the truth on load.
    systemStore.set({ loading: true });
    const t = setTimeout(() => systemStore.set({ loading: false }), 900);
    return () => clearTimeout(t);
  }, []);

  useLiveInterval(
    () => {
      const s = systemStore.getSnapshot();
      const latency = Math.round(nextLatency(s.mode, s.latency) * 10) / 10;
      const jitter = Math.round(Math.abs(latency - s.latency) * 10) / 10;
      const fps = Math.round(Math.min(60, 1000 / Math.max(16.7, latency)) * 10) / 10;
      const base = ENGINES[s.mode].accuracy;
      const accuracy = Math.round((base + (Math.random() - 0.5) * 0.3) * 10) / 10;

      latencyHistory.push(latency);

      const breaching = s.mode === 'cnn' && latency > LATENCY_THRESHOLD;
      streak.current = breaching ? streak.current + 1 : 0;

      if (breaching && s.autoFallback && streak.current >= BREACH_SAMPLES) {
        streak.current = 0;
        systemStore.set({
          latency,
          jitter,
          fps,
          accuracy,
          hotSwaps: s.hotSwaps + 1,
        });
        setMode('prebuilt');
        return;
      }

      systemStore.set({ latency, jitter, fps, accuracy });
    },
    TICK_MS,
    running,
  );

  return null;
}
