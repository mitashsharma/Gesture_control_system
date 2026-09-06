'use client';

/**
 * Minimal observable store backed by `useSyncExternalStore`.
 *
 * Why not React Context?
 *  A context value that changes every ~800ms (live latency/FPS) would
 *  re-render *every* consumer in the tree. With selector-based
 *  subscriptions a component only re-renders when the primitive slice it
 *  actually reads changes. That keeps React work proportional to the
 *  number of visible live widgets instead of the size of the page.
 */

import { useRef, useSyncExternalStore } from 'react';

export type ModelMode = 'cnn' | 'prebuilt';
export type MotionLevel = 'full' | 'minimal';

export interface SystemState {
  /** Active inference engine. */
  mode: ModelMode;
  /** Allow the watchdog to hot-swap automatically on latency breach. */
  autoFallback: boolean;
  /** Rolling inference latency in ms. */
  latency: number;
  /** Derived frames-per-second of the recognition loop. */
  fps: number;
  /** Frame-to-frame variance in ms. */
  jitter: number;
  /** How many automatic hot-swaps have fired. */
  hotSwaps: number;
  /** Rolling mean accuracy of the active engine. */
  accuracy: number;
  /** True while the engine reports it is warming up / loading weights. */
  loading: boolean;
  /** Transient banner payload (hot-swap notice, manual switch, …). */
  alert: { id: number; tone: 'warn' | 'info' | 'ok'; title: string; body: string } | null;
  /** Global animation budget. */
  motion: MotionLevel;
  /** Global simulation master switch — pauses every timer/rAF loop. */
  running: boolean;
}

const THRESHOLD = 150; // ms — latency budget before the watchdog intervenes

const initialState: SystemState = {
  mode: 'cnn',
  autoFallback: true,
  latency: 118,
  fps: 8,
  jitter: 12,
  hotSwaps: 0,
  accuracy: 98.4,
  loading: false,
  alert: null,
  motion: 'full',
  running: true,
};

let state: SystemState = initialState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const systemStore = {
  getSnapshot: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(patch: Partial<SystemState>) {
    state = { ...state, ...patch };
    emit();
  },
  get threshold() {
    return THRESHOLD;
  },
};

/** Selector hook — re-renders only when the selected slice changes. */
export function useSystem<T>(selector: (s: SystemState) => T): T {
  const selectorRef = useRef(selector);
  const cacheRef = useRef<{ has: boolean; value: T }>({ has: false, value: undefined as T });
  selectorRef.current = selector;

  // Cached, so repeated calls within a render (and during prerender) are
  // referentially stable — required by useSyncExternalStore.
  const getSelected = () => {
    const next = selectorRef.current(systemStore.getSnapshot());
    const cache = cacheRef.current;
    if (!cache.has || !Object.is(cache.value, next)) {
      cacheRef.current = { has: true, value: next };
    }
    return cacheRef.current.value;
  };

  // Third argument = server snapshot, so the page can still be prerendered.
  return useSyncExternalStore(systemStore.subscribe, getSelected, getSelected);
}

/* ---------------------------- actions ---------------------------- */

export const LATENCY_THRESHOLD = THRESHOLD;

let alertTimer: ReturnType<typeof setTimeout> | null = null;

export function pushAlert(tone: 'warn' | 'info' | 'ok', title: string, body: string, ttl = 7000) {
  const id = Date.now();
  systemStore.set({ alert: { id, tone, title, body } });
  if (alertTimer) clearTimeout(alertTimer);
  alertTimer = setTimeout(() => {
    if (systemStore.getSnapshot().alert?.id === id) systemStore.set({ alert: null });
  }, ttl);
}

export function dismissAlert() {
  if (alertTimer) clearTimeout(alertTimer);
  systemStore.set({ alert: null });
}

/** Manual switch between engines — simulates a weight (re)load. */
export function setMode(mode: ModelMode, opts: { manual?: boolean } = {}) {
  const prev = systemStore.getSnapshot();
  if (prev.mode === mode) return;
  systemStore.set({ mode, loading: true, fps: 0 });
  pushAlert(
    opts.manual ? 'info' : 'warn',
    opts.manual
      ? mode === 'cnn'
        ? 'Switched to Custom CNN Model (PyBind11)'
        : 'Switched to Prebuilt Lightweight Fallback Model'
      : 'High latency detected',
    opts.manual
      ? mode === 'cnn'
        ? 'Loading Custom_Gesture_CNN_v2 weights via pybind11 binding…'
        : 'MediaPipe Default Hands Engine engaged — zero-copy landmark pipeline.'
      : `Hot-swapping to Prebuilt Lightweight Detection Model (MediaPipe Default Hands Engine) — CNN latency exceeded the ${THRESHOLD} ms budget.`,
  );
  // Simulated cold-start cost of the swapped engine.
  setTimeout(() => {
    if (systemStore.getSnapshot().mode === mode) systemStore.set({ loading: false });
  }, mode === 'cnn' ? 1400 : 420);
}

export function setAutoFallback(autoFallback: boolean) {
  systemStore.set({ autoFallback });
  pushAlert(
    autoFallback ? 'ok' : 'info',
    autoFallback ? 'Automatic fallback watchdog armed' : 'Automatic fallback watchdog disarmed',
    autoFallback
      ? `Engines will hot-swap when latency stays above ${THRESHOLD} ms.`
      : 'The active engine will be kept regardless of measured latency.',
    4200,
  );
}

export function setMotion(motion: MotionLevel) {
  systemStore.set({ motion });
}

export function setRunning(running: boolean) {
  systemStore.set({ running });
}
