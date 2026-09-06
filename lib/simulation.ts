import { ENGINES, GESTURE_CLASSES } from './data';
import type { ModelMode } from './store';

export type InputSource = 'Gesture' | 'Voice';

export interface LogEntry {
  id: number;
  time: string;
  source: InputSource;
  command: string;
  action: string;
  confidence: number;
  latency: number;
}

interface CommandDef {
  command: string;
  action: string;
  source: InputSource;
  /** 0-1 relative frequency. */
  weight: number;
}

const COMMANDS: CommandDef[] = [
  { command: 'Swipe Left', action: 'Switch Tab', source: 'Gesture', weight: 1.0 },
  { command: 'Swipe Right', action: 'Switch Tab (Next)', source: 'Gesture', weight: 0.9 },
  { command: 'Pinch Click', action: 'Left Click', source: 'Gesture', weight: 1.0 },
  { command: 'Pinch Hold', action: 'Drag Cursor', source: 'Gesture', weight: 0.8 },
  { command: 'Scroll Up', action: 'Scroll Viewport', source: 'Gesture', weight: 0.85 },
  { command: 'Palm Stop', action: 'Halt Action Queue', source: 'Gesture', weight: 0.5 },
  { command: 'Fist Drag', action: 'Move Window', source: 'Gesture', weight: 0.6 },
  { command: 'Peace Sign', action: 'Capture Screenshot', source: 'Gesture', weight: 0.4 },
  { command: 'Thumb Up', action: 'Confirm Intent', source: 'Gesture', weight: 0.45 },
  { command: 'Open Notepad', action: 'Launch App', source: 'Voice', weight: 1.0 },
  { command: 'Volume up', action: 'Media: Volume +10%', source: 'Voice', weight: 0.7 },
  { command: 'Close window', action: 'Close Active Window', source: 'Voice', weight: 0.75 },
  { command: 'Take a screenshot', action: 'Capture Screen', source: 'Voice', weight: 0.55 },
  { command: 'Lock the computer', action: 'Win+L Lock', source: 'Voice', weight: 0.3 },
  { command: 'Play music', action: 'Launch Media Player', source: 'Voice', weight: 0.5 },
  { command: 'Search gesture dataset', action: 'Open Browser Search', source: 'Voice', weight: 0.4 },
];

const CUMULATIVE = (() => {
  const total = COMMANDS.reduce((s, c) => s + c.weight, 0);
  let acc = 0;
  return COMMANDS.map((c) => (acc += c.weight / total));
})();

function pick(): CommandDef {
  const r = Math.random();
  for (let i = 0; i < CUMULATIVE.length; i++) {
    if (r <= CUMULATIVE[i]) return COMMANDS[i];
  }
  return COMMANDS[0];
}

const pad = (n: number, l = 2) => String(n).padStart(l, '0');

export function timestamp(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let seq = 0;

/** One synthetic I/O event, costed against the active engine. */
export function makeLogEntry(mode: ModelMode, at = new Date()): LogEntry {
  const def = pick();
  const spec = ENGINES[mode];
  const [lo, hi] = spec.latency;
  const latency = Math.round(lo + Math.random() * (hi - lo));
  const confBase = def.source === 'Gesture' ? 99.6 : 98.9;
  const spread = mode === 'cnn' ? 5.2 : 7.4;
  return {
    id: ++seq,
    time: timestamp(at),
    source: def.source,
    command: def.command,
    action: def.action,
    confidence: Math.round((confBase - Math.random() * spread) * 10) / 10,
    latency,
  };
}

/** Seed the terminal so it never renders empty on first paint. */
export function seedLog(mode: ModelMode, count = 6): LogEntry[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) =>
    makeLogEntry(mode, new Date(now - (count - i) * 2600)),
  ).reverse();
}

/* --------------------- latency random walk ---------------------- */

let target = 128;

/**
 * Mean-reverting random walk with occasional contention spikes for the CNN
 * and a tight, low-noise profile for the prebuilt engine.
 */
export function nextLatency(mode: ModelMode, current: number): number {
  if (mode === 'prebuilt') {
    const [lo, hi] = ENGINES.prebuilt.latency;
    const mid = (lo + hi) / 2;
    return Math.min(hi, Math.max(lo, current + (mid - current) * 0.4 + (Math.random() - 0.5) * 3));
  }
  // Occasionally jump the attraction point to simulate GPU contention.
  if (Math.random() < 0.14) target = 175 + Math.random() * 70;
  else if (Math.random() < 0.35) target = 112 + Math.random() * 26;
  const next = current + (target - current) * 0.22 + (Math.random() - 0.5) * 11;
  return Math.min(248, Math.max(96, next));
}

/* ------------------- confusion matrix metrics -------------------- */

export interface MatrixStats {
  matrix: number[][];
  total: number;
  accuracy: number;
  precision: number[];
  recall: number[];
  f1: number[];
  macroF1: number;
  maxCell: number;
}

const cache = new Map<string, MatrixStats>();

export function matrixStats(mode: ModelMode, matrix: number[][]): MatrixStats {
  const key = `${mode}:${matrix.length}:${matrix[0][0]}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const n = matrix.length;
  const rowSums = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: n }, (_, c) =>
    matrix.reduce((a, row) => a + row[c], 0),
  );
  const total = rowSums.reduce((a, b) => a + b, 0);
  const diag = matrix.reduce((a, row, i) => a + row[i], 0);
  const precision = colSums.map((s, i) => (s ? (matrix[i][i] / s) * 100 : 0));
  const recall = rowSums.map((s, i) => (s ? (matrix[i][i] / s) * 100 : 0));
  const f1 = precision.map((p, i) => {
    const r = recall[i];
    return p + r ? (2 * p * r) / (p + r) : 0;
  });

  const stats: MatrixStats = {
    matrix,
    total,
    accuracy: (diag / total) * 100,
    precision,
    recall,
    f1,
    macroF1: f1.reduce((a, b) => a + b, 0) / n,
    maxCell: Math.max(...matrix.flat()),
  };
  cache.set(key, stats);
  return stats;
}

export const CLASS_COLORS = [
  '#06b6d4',
  '#6366f1',
  '#8b5cf6',
  '#0ea5e9',
  '#a855f7',
] as const;

export { GESTURE_CLASSES };
