'use client';

import { useEffect, useRef, useState } from 'react';
import { Backdrop, HAND_CONNECTIONS, handLandmarks, roundRect, useCanvasScene, type Pt } from '@/lib/canvas';

/* =====================================================================
 *  Shared HUD state helper — canvases never push per-frame state into
 *  React; they only update the DOM overlay when a label actually changes.
 * ==================================================================== */
function useLabelState<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const ref = useRef(initial);
  const set = (next: T) => {
    if (Object.is(ref.current, next)) return;
    ref.current = next;
    setValue(next);
  };
  return [value, set] as const;
}

/* =====================================================================
 *  1. CURSOR TRACKING
 * ==================================================================== */

const CURSOR_MODES = [
  { label: 'Open Palm', intent: 'Coarse cursor move', conf: 99.2 },
  { label: 'Index Point', intent: 'Precision tracking', conf: 97.8 },
  { label: 'Pinch Hold', intent: 'Drag cursor', conf: 98.4 },
] as const;

export function CursorScene({ active }: { active: boolean }) {
  const pts = useRef<Pt[]>(new Array(21));
  const cursor = useRef<Pt>({ x: 0, y: 0 });
  const trail = useRef<Pt[]>([]);
  const bg = useRef<Backdrop>(new Backdrop());
  const [mode, setMode] = useLabelState(0);

  const draw = (_ctx: CanvasRenderingContext2D, time: number, dt: number, w: number, h: number) => {
    const ctx = _ctx;
    const t = time / 1000;
    bg.current.blit(ctx, w, h);

    const bucket = Math.floor(t / 3.1) % CURSOR_MODES.length;
    setMode(bucket);

    const lm = handLandmarks(t, w, h, pts.current);
    const scale = Math.min(w, h) * 0.34;

    // skeleton
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(99,102,241,0.42)';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(lm[a].x, lm[a].y);
      ctx.lineTo(lm[b].x, lm[b].y);
    }
    ctx.stroke();

    // palm fill
    ctx.fillStyle = 'rgba(34,211,238,0.07)';
    ctx.beginPath();
    ctx.moveTo(lm[0].x, lm[0].y);
    [5, 9, 13, 17].forEach((i) => ctx.lineTo(lm[i].x, lm[i].y));
    ctx.closePath();
    ctx.fill();

    // landmarks
    for (let i = 0; i < 21; i++) {
      const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      ctx.beginPath();
      ctx.arc(lm[i].x, lm[i].y, tip ? 4 : 2.4, 0, Math.PI * 2);
      ctx.fillStyle = tip ? '#8b5cf6' : 'rgba(99,102,241,0.75)';
      ctx.fill();
      if (tip) {
        ctx.beginPath();
        ctx.arc(lm[i].x, lm[i].y, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139,92,246,0.14)';
        ctx.fill();
      }
    }

    // cursor with exponential smoothing (frame-rate independent)
    const k = 1 - Math.exp(-dt / 90);
    const target = lm[8];
    if (cursor.current.x === 0 && cursor.current.y === 0) {
      cursor.current = { x: target.x, y: target.y };
    }
    cursor.current.x += (target.x - cursor.current.x) * k;
    cursor.current.y += (target.y - cursor.current.y) * k;

    // cursor trail (bounded ring of recent positions)
    const path = trail.current;
    path.push({ x: cursor.current.x, y: cursor.current.y });
    if (path.length > 18) path.shift();
    ctx.lineWidth = 2;
    for (let i = 1; i < path.length; i++) {
      ctx.strokeStyle = `rgba(34,211,238,${(i / path.length) * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(path[i - 1].x, path[i - 1].y);
      ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    }

    // crosshair
    const cx = cursor.current.x;
    const cy = cursor.current.y;
    ctx.strokeStyle = 'rgba(34,211,238,0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // cursor glyph
    const pulse = 1 + 0.14 * Math.sin(t * 3.4);
    ctx.beginPath();
    ctx.arc(cx, cy, 13 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34,211,238,0.12)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#06b6d4';
    ctx.stroke();

    // coordinate readout
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(71,85,105,0.85)';
    ctx.fillText(
      `x ${Math.round((cx / w) * 1920)}  y ${Math.round((cy / h) * 1080)}`,
      cx + 12,
      cy - 10,
    );
    ctx.fillText(`scale ${scale.toFixed(0)}px · 21 pts`, 12, h - 12);
  };

  const { canvasRef, boxRef, paintStatic } = useCanvasScene(draw, { active, fpsCap: 24 });
  useStaticPaint(active, paintStatic);
  const m = CURSOR_MODES[mode];

  return (
    <SceneFrame boxRef={boxRef} canvasRef={canvasRef} tone="cyan">
      <HudBadge label={m.label} intent={m.intent} conf={m.conf} tone="cyan" />
      <SceneLegend text="Index fingertip (LM-08) drives the OS cursor via PyAutoGUI.moveTo()" />
    </SceneFrame>
  );
}

/* =====================================================================
 *  2. CLICKS & SCROLLING
 * ==================================================================== */

interface Ripple {
  x: number;
  y: number;
  age: number;
  kind: 'click' | 'swipe';
}

const ROWS = [
  'documents / report_final.docx',
  'documents / gesture_dataset.zip',
  'downloads / mediapipe-0.8.9',
  'pictures / confusion_matrix.png',
  'projects / gesture-system',
  'notes / evaluation_feedback.md',
  'archives / prototype_v1.zip',
  'temp / landmark_dump.json',
];

export function ClickScene({ active }: { active: boolean }) {
  const bg = useRef<Backdrop>(new Backdrop());
  const ripples = useRef<Ripple[]>([]);
  const scroll = useRef({ offset: 0, target: 0 });
  const nextEvent = useRef({ click: 900, swipe: 2200 });
  const [event, setEvent] = useLabelState('Pinch Click → Left Click');
  const [counts, setCounts] = useState({ click: 0, swipe: 0 });

  const draw = (ctx: CanvasRenderingContext2D, time: number, dt: number, w: number, h: number) => {
    const t = time / 1000;
    const pad = Math.min(24, w * 0.06);
    const wx = pad;
    const wy = pad;
    const ww = w - pad * 2;
    const wh = h - pad * 2;

    // Base wash + dot grid + the static window chrome are painted once per
    // resize and blitted; only the scrolling rows, ripples and fingertip
    // are redrawn per frame.
    bg.current.blit(ctx, w, h, (c) => {
      roundRect(c, wx, wy, ww, wh, 12);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fill();
      c.strokeStyle = 'rgba(203,213,225,0.9)';
      c.lineWidth = 1;
      c.stroke();

      c.save();
      roundRect(c, wx, wy, ww, 26, 12);
      c.clip();
      c.fillStyle = 'rgba(241,245,249,0.95)';
      c.fillRect(wx, wy, ww, 26);
      c.restore();
      ['#f87171', '#fbbf24', '#34d399'].forEach((col, i) => {
        c.beginPath();
        c.arc(wx + 14 + i * 13, wy + 13, 4, 0, Math.PI * 2);
        c.fillStyle = col;
        c.fill();
      });
      c.font = '500 10px ui-sans-serif, system-ui';
      c.fillStyle = 'rgba(100,116,139,0.9)';
      c.fillText('File Explorer — Documents', wx + 56, wy + 16);
    });

    // scheduled events
    nextEvent.current.click -= dt;
    nextEvent.current.swipe -= dt;

    const bodyX = wx + 12;
    const bodyY = wy + 34;
    const bodyW = ww - 24;
    const rowH = 30;

    if (nextEvent.current.click <= 0) {
      nextEvent.current.click = 2300 + Math.random() * 900;
      const row = Math.floor(Math.random() * 4);
      ripples.current.push({
        x: bodyX + 40 + Math.random() * (bodyW - 80),
        y: bodyY + 18 + row * rowH,
        age: 0,
        kind: 'click',
      });
      setEvent('Pinch Click → Left Click');
      setCounts((c) => ({ ...c, click: c.click + 1 }));
    }
    if (nextEvent.current.swipe <= 0) {
      nextEvent.current.swipe = 3400 + Math.random() * 1200;
      const dir = Math.random() > 0.5 ? 1 : -1;
      scroll.current.target = Math.max(0, scroll.current.target + dir * rowH * 2);
      setEvent('Two-finger Swipe → Scroll Viewport');
      setCounts((c) => ({ ...c, swipe: c.swipe + 1 }));
    }

    // ease the scroll offset
    const s = scroll.current;
    s.offset += (s.target - s.offset) * (1 - Math.exp(-dt / 130));

    // rows
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx + 1, wy + 27, ww - 2, wh - 28);
    ctx.clip();
    const offset = -s.offset;
    for (let i = 0; i < ROWS.length + 2; i++) {
      const y = bodyY + 6 + i * rowH + offset;
      if (y < bodyY - rowH || y > wy + wh) continue;
      const label = ROWS[(i + ROWS.length) % ROWS.length];
      roundRect(ctx, bodyX, y, bodyW, rowH - 6, 7);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(248,250,252,0.9)' : 'rgba(255,255,255,0.7)';
      ctx.fill();
      ctx.beginPath();
      roundRect(ctx, bodyX + 9, y + 8, 11, 9, 2);
      ctx.fillStyle = 'rgba(34,211,238,0.55)';
      ctx.fill();
      ctx.font = '500 10.5px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(51,65,85,0.9)';
      ctx.fillText(label, bodyX + 28, y + 17);
    }
    ctx.restore();

    // ripples
    const list = ripples.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      r.age += dt;
      const p = r.age / 780;
      if (p >= 1) {
        list.splice(i, 1);
        continue;
      }
      const radius = 8 + p * 46;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle =
        r.kind === 'click'
          ? `rgba(139,92,246,${(1 - p) * 0.6})`
          : `rgba(34,211,238,${(1 - p) * 0.6})`;
      ctx.lineWidth = 2 * (1 - p) + 0.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(99,102,241,${(1 - p) * 0.32})`;
      ctx.stroke();
    }

    // travelling fingertip
    const fx = bodyX + bodyW * (0.5 + 0.3 * Math.sin(t * 0.85));
    const fy = bodyY + (wh - 40) * (0.5 + 0.32 * Math.cos(t * 0.62));
    const pinch = (Math.sin(t * 2.2) + 1) / 2;
    ctx.beginPath();
    ctx.arc(fx, fy, 15 - pinch * 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(34,211,238,${0.1 + pinch * 0.14})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx, fy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#0ea5e9';
    ctx.fill();
  };

  const { canvasRef, boxRef, paintStatic } = useCanvasScene(draw, { active, fpsCap: 24 });
  useStaticPaint(active, paintStatic);

  return (
    <SceneFrame boxRef={boxRef} canvasRef={canvasRef} tone="violet">
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <HudBadge label={event} intent="Debounced 180 ms" conf={97.4} tone="violet" />
        <span className="w-fit rounded-lg border border-white/85 bg-white/80 px-2 py-1 font-mono text-[9.5px] text-ink-soft shadow-sm">
          clicks {counts.click} · scrolls {counts.swipe}
        </span>
      </div>
      <SceneLegend text="SendInput injection is debounced so a held pinch cannot burst duplicate clicks" />
    </SceneFrame>
  );
}

/* =====================================================================
 *  3. VOICE COMMANDS
 * ==================================================================== */

const PHRASES = [
  { text: 'Open Notepad', conf: 96.8 },
  { text: 'Take a screenshot', conf: 94.3 },
  { text: 'Volume up', conf: 98.1 },
  { text: 'Close window', conf: 95.6 },
] as const;

export function VoiceScene({ active }: { active: boolean }) {
  const bg = useRef<Backdrop>(new Backdrop());
  const barGrad = useRef<{ grad: CanvasGradient; key: string } | null>(null);
  const levels = useRef<number[]>(new Array(48).fill(0));
  const [idx, setIdx] = useLabelState(0);

  const draw = (ctx: CanvasRenderingContext2D, time: number, dt: number, w: number, h: number) => {
    const t = time / 1000;
    const bucket = Math.floor(t / 3.6) % PHRASES.length;
    setIdx(bucket);

    // Base wash, dot grid and the soft radial glow are static → cached.
    bg.current.blit(ctx, w, h, (c) => {
      const g = c.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w * 0.62);
      g.addColorStop(0, 'rgba(139,92,246,0.10)');
      g.addColorStop(1, 'rgba(139,92,246,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });

    const bars = levels.current;
    const n = bars.length;
    const gap = 3;
    const bw = Math.max(2, (w - 32 - gap * (n - 1)) / n);
    const midY = h * 0.56;

    // One shared gradient for all 48 bars instead of 48 per frame.
    const key = `${w}x${h}`;
    if (!barGrad.current || barGrad.current.key !== key) {
      const grad = ctx.createLinearGradient(0, midY - h * 0.34, 0, midY + h * 0.34);
      grad.addColorStop(0, 'rgba(34,211,238,0.95)');
      grad.addColorStop(0.5, 'rgba(99,102,241,0.9)');
      grad.addColorStop(1, 'rgba(139,92,246,0.95)');
      barGrad.current = { grad, key };
    }
    ctx.fillStyle = barGrad.current.grad;

    for (let i = 0; i < n; i++) {
      const centre = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
      const env = 0.22 + 0.78 * Math.pow(centre, 1.6);
      const wave =
        Math.sin(t * 6.2 + i * 0.42) * 0.5 +
        Math.sin(t * 11.4 + i * 0.91) * 0.28 +
        Math.sin(t * 2.1 + i * 0.13) * 0.22;
      const target = Math.max(0.05, Math.abs(wave) * env);
      // smooth attack / release — looks like a real VU meter
      const rate = target > bars[i] ? 0.32 : 0.12;
      bars[i] += (target - bars[i]) * Math.min(1, rate * (dt / 16.7));

      const bh = Math.max(1, bars[i] * h * 0.34);
      const x = 16 + i * (bw + gap);
      roundRect(ctx, x, midY - bh, bw, bh * 2, bw / 2);
      ctx.fill();
    }

    // baseline
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, midY);
    ctx.lineTo(w - 16, midY);
    ctx.stroke();

    // listening pulse
    const pr = 26 + Math.sin(t * 2.4) * 4;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.19, pr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34,211,238,0.10)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.19, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#22d3ee';
    ctx.stroke();

    ctx.font = '600 9.5px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(100,116,139,0.9)';
    ctx.fillText('16 kHz · 16-bit PCM · Google STT', 16, h - 12);
  };

  const { canvasRef, boxRef, paintStatic } = useCanvasScene(draw, { active, fpsCap: 24 });
  useStaticPaint(active, paintStatic);
  const p = PHRASES[idx];

  return (
    <SceneFrame boxRef={boxRef} canvasRef={canvasRef} tone="violet">
      <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 text-center">
        <span className="rounded-lg border border-cyan-200/80 bg-white/85 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide text-cyan-700 shadow-sm">
          LISTENING
        </span>
      </div>
      <div className="absolute inset-x-3 bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-white/85 bg-white/85 px-3 py-2 shadow-sm">
        <span className="truncate font-mono text-[11.5px] font-medium text-ink">
          “{p.text}”
        </span>
        <span className="shrink-0 font-mono text-[10.5px] font-semibold text-emerald-600">
          {p.conf.toFixed(1)}%
        </span>
      </div>
    </SceneFrame>
  );
}

/* =====================================================================
 *  Shared scene chrome
 * ==================================================================== */

function SceneFrame({
  boxRef,
  canvasRef,
  children,
  tone,
}: {
  boxRef: React.Ref<HTMLDivElement>;
  canvasRef: React.Ref<HTMLCanvasElement>;
  children: React.ReactNode;
  tone: 'cyan' | 'violet';
}) {
  return (
    <div
      ref={boxRef as React.RefObject<HTMLDivElement>}
      className="relative h-[300px] w-full overflow-hidden rounded-xl border border-white/85 bg-white/50 sm:h-[340px]"
    >
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />
      <div
        className={
          tone === 'cyan'
            ? 'pointer-events-none absolute inset-0 rounded-xl ring-1 ring-cyan-300/25 ring-inset'
            : 'pointer-events-none absolute inset-0 rounded-xl ring-1 ring-violet-300/25 ring-inset'
        }
      />
      {children}
    </div>
  );
}

function HudBadge({
  label,
  intent,
  conf,
  tone,
}: {
  label: string;
  intent: string;
  conf: number;
  tone: 'cyan' | 'violet';
}) {
  return (
    <div className="absolute top-3 left-3 z-10 rounded-xl border border-white/85 bg-white/85 px-2.5 py-1.5 shadow-sm">
      <div
        className={
          tone === 'cyan'
            ? 'font-mono text-[10.5px] font-semibold text-cyan-700'
            : 'font-mono text-[10.5px] font-semibold text-violet-700'
        }
      >
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[9.5px] text-ink-mute">
        {intent} · {conf.toFixed(1)}%
      </div>
    </div>
  );
}

function SceneLegend({ text }: { text: string }) {
  return (
    <div className="absolute inset-x-3 bottom-3 z-10 rounded-lg border border-white/85 bg-white/85 px-2.5 py-1.5 text-[10px] leading-snug text-ink-soft shadow-sm">
      {text}
    </div>
  );
}

/** Reduced-motion / inactive: paint exactly one frame and stop. */
function useStaticPaint(active: boolean, paintStatic: () => void) {
  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(paintStatic);
    return () => cancelAnimationFrame(id);
  }, [active, paintStatic]);
}
