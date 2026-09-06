'use client';

import { useSyncExternalStore } from 'react';

/**
 * Ring-buffered latency history kept OUT of the main store so that only the
 * sparkline subscribes to it. Snapshot identity changes only when the buffer
 * actually changes, which keeps `useSyncExternalStore` cheap.
 */
const CAPACITY = 48;
let buffer: readonly number[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export const latencyHistory = {
  getSnapshot: () => buffer,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  push(value: number) {
    const next = buffer.length >= CAPACITY ? buffer.slice(1) : buffer.slice();
    next.push(Math.round(value * 10) / 10);
    buffer = next;
    listeners.forEach((l) => l());
  },
  reset(values: readonly number[] = []) {
    buffer = values;
    notify();
  },
};

export function useLatencyHistory(): readonly number[] {
  return useSyncExternalStore(
    latencyHistory.subscribe,
    latencyHistory.getSnapshot,
    latencyHistory.getSnapshot,
  );
}
