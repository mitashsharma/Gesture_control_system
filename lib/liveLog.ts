'use client';

/**
 * Ring buffer for intents produced by the LIVE model.
 *
 * Kept outside both the React tree and the synthetic log generator so the
 * terminal can show real recognition events the instant they happen, without
 * re-rendering anything that is not looking at them.
 */

import { useSyncExternalStore } from 'react';
import type { LogEntry } from './simulation';
import type { GestureLabel } from './gestures';

export interface LiveIntent extends LogEntry {
  source: 'Gesture';
  label: GestureLabel;
  backend: string;
  repeat: boolean;
}

const CAPACITY = 40;
/** Live ids live in their own range so they never collide with synthetic ones. */
let seq = 100000;

let buffer: readonly LiveIntent[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export const liveLog = {
  getSnapshot: () => buffer,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  push(entry: Omit<LiveIntent, 'id'>) {
    const next = buffer.length >= CAPACITY ? buffer.slice(1) : buffer.slice();
    next.push({ ...entry, id: ++seq } as LiveIntent);
    buffer = next;
    notify();
  },
  clear() {
    if (!buffer.length) return;
    buffer = [];
    notify();
  },
  get count() {
    return buffer.length;
  },
};

export function useLiveLog(): readonly LiveIntent[] {
  return useSyncExternalStore(liveLog.subscribe, liveLog.getSnapshot, liveLog.getSnapshot);
}
