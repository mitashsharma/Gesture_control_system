'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDocumentVisible, useElementSize, useRafLoop } from './hooks';

export type DrawFn = (
  ctx: CanvasRenderingContext2D,
  time: number,
  dt: number,
  w: number,
  h: number,
) => void;

/** Device pixel ratio is clamped — rendering 4× pixels on a retina panel for a
 *  decorative animation is pure waste. */
const DPR_CAP = 2;

/**
 * One canvas scene = one rAF loop that:
 *   • stops entirely when the tab is hidden, the section is off-screen, or the
 *     master "simulation" switch is off,
 *   • is frame-rate capped (default 30 fps) so a decorative animation never
 *     competes with the compositor,
 *   • re-allocates its backing store only when the box actually resizes.
 */
export function useCanvasScene(
  draw: DrawFn,
  opts: { active: boolean; fpsCap?: number; staticDraw?: DrawFn },
) {
  const { active, fpsCap = 30 } = opts;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { ref: boxRef, width, height } = useElementSize<HTMLDivElement>();
  const docVisible = useDocumentVisible();

  // Resize / DPR handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 2 || height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (canvas.width === bw && canvas.height === bh) return;
    canvas.width = bw;
    canvas.height = bh;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height]);

  const running = active && docVisible && width > 2 && height > 2;
  const frameMs = 1000 / fpsCap;
  const acc = useRef(0);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useRafLoop(
    (time, dt) => {
      acc.current += dt;
      if (acc.current < frameMs) return; // frame-rate cap
      const step = acc.current;
      acc.current = 0;
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && width > 2 && height > 2) drawRef.current(ctx, time, step, width, height);
    },
    running,
  );

  /** Paint one frame for reduced-motion users (no loop). */
  const paintStatic = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && width > 2 && height > 2) (opts.staticDraw ?? drawRef.current)(ctx, 0, 0, width, height);
  }, [opts.staticDraw, width, height]);

  return { canvasRef, boxRef, width, height, paintStatic, running } as const;
}

/* ------------------------- drawing helpers ------------------------- */

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function paintBase(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(248,250,255,0.94)');
  g.addColorStop(1, 'rgba(241,245,252,0.94)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(100,116,139,0.16)';
  for (let x = 24; x < w; x += 24) {
    for (let y = 24; y < h; y += 24) ctx.fillRect(x, y, 1, 1);
  }
}

/**
 * Static scene backdrop cached on an offscreen canvas.
 *
 * The base wash + dot grid + any chrome that depends only on the box size is
 * painted ONCE per resize and then blitted with a single drawImage. Painting
 * ~800 grid dots and building a fresh gradient every frame was the single
 * biggest CPU cost in the demo scenes.
 */
export class Backdrop {
  private buffer: HTMLCanvasElement | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;

  blit(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    decorate?: (c: CanvasRenderingContext2D, w: number, h: number) => void,
  ) {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    if (!this.buffer || this.w !== w || this.h !== h || this.dpr !== dpr) {
      this.buffer = document.createElement('canvas');
      this.buffer.width = Math.max(1, Math.round(w * dpr));
      this.buffer.height = Math.max(1, Math.round(h * dpr));
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      const g = this.buffer.getContext('2d');
      if (g) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintBase(g, w, h);
        decorate?.(g, w, h);
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.buffer.width, this.buffer.height);
    ctx.drawImage(this.buffer, 0, 0);
    ctx.restore();
  }
}

/** Kept for callers that do not need caching. */
export function clear(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  paintBase(ctx, w, h);
}

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export interface Pt {
  x: number;
  y: number;
}

const FINGERS = [
  { mcp: 5, angle: -1.22, len: 0.26, curl: 0.55, phase: 0.0 },
  { mcp: 9, angle: -1.52, len: 0.29, curl: 0.5, phase: 0.9 },
  { mcp: 13, angle: -1.83, len: 0.27, curl: 0.58, phase: 1.7 },
  { mcp: 17, angle: -2.14, len: 0.22, curl: 0.66, phase: 2.5 },
];

const MCP_OFFSETS: Record<number, Pt> = {
  5: { x: -0.2, y: -0.44 },
  9: { x: 0.0, y: -0.5 },
  13: { x: 0.2, y: -0.46 },
  17: { x: 0.37, y: -0.33 },
};

/**
 * Deterministic pseudo-hand: 21 points that move smoothly with time.
 * Cheap enough to run at 30 fps without allocation pressure.
 */
export function handLandmarks(t: number, w: number, h: number, out: Pt[]): Pt[] {
  const cx = w * (0.45 + 0.15 * Math.sin(t * 0.52));
  const cy = h * (0.7 + 0.09 * Math.cos(t * 0.41));
  const s = Math.min(w, h) * 0.34;
  const breathe = 1 + 0.05 * Math.sin(t * 1.4);

  out[0] = { x: cx, y: cy };

  for (const f of FINGERS) {
    const off = MCP_OFFSETS[f.mcp];
    let px = cx + off.x * s;
    let py = cy + off.y * s;
    out[f.mcp] = { x: px, y: py };
    let ang = f.angle;
    for (let k = 1; k <= 3; k++) {
      ang += f.curl * 0.34 * Math.sin(t * 1.15 + f.phase + k * 0.5);
      px += Math.cos(ang) * f.len * s * breathe * (1 - k * 0.1);
      py += Math.sin(ang) * f.len * s * breathe * (1 - k * 0.1);
      out[f.mcp + k] = { x: px, y: py };
    }
  }

  // thumb
  let px = cx - 0.3 * s;
  let py = cy - 0.12 * s;
  out[1] = { x: px, y: py };
  let ang = -2.62 + 0.22 * Math.sin(t * 0.9);
  for (let k = 2; k <= 4; k++) {
    ang += 0.16 * Math.sin(t * 1.3 + k);
    px += Math.cos(ang) * 0.2 * s * breathe;
    py += Math.sin(ang) * 0.2 * s * breathe;
    out[k] = { x: px, y: py };
  }

  return out;
}
