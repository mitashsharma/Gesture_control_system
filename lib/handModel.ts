'use client';

/**
 * An articulated 21-point hand model.
 *
 * Three consumers, one source of truth:
 *   1. the *synthetic* input source of the live model — `drawHand()` paints a
 *      skin-toned hand into a canvas so the recognition pipeline has real
 *      pixels to chew on when no camera is available,
 *   2. the *procedural* source — `poseLandmarks()` feeds the classifier
 *      directly, so the panel still demonstrates recognition with zero assets,
 *   3. `scripts/verify-logic.cjs`, which asserts the classifier against these
 *      poses and calibrates the extension-ratio windows in lib/gestures.ts.
 *
 * Local space: wrist at the origin, fingers pointing up (−y), and one unit =
 * the wrist → middle-MCP distance.
 */

import { LM, type Landmark } from './gestures';

export const POSES = ['palm', 'fist', 'pinch', 'peace', 'thumbUp', 'point'] as const;
export type PoseId = (typeof POSES)[number];

const D2R = Math.PI / 180;

/** [proximal, middle, distal] segment lengths, in hand-scale units. */
const FINGER_LENGTHS: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.3, 0.22], // index
  [0.55, 0.34, 0.24], // middle
  [0.5, 0.31, 0.22], // ring
  [0.4, 0.24, 0.18], // pinky
];

/** Rest splay of each finger, radians from straight-up. */
const FINGER_SPREAD = [-7.5 * D2R, -1 * D2R, 8 * D2R, 20 * D2R];

const MCP: ReadonlyArray<readonly [number, number]> = [
  [-0.4, -0.95], // index
  [-0.13, -1.0], // middle
  [0.14, -0.98], // ring
  [0.4, -0.86], // pinky
];

/** Max bend at the MCP, PIP and DIP joints, radians, at curl = 1.
 *  The MCP flex is what actually pulls a folded finger down into the palm —
 *  without it a "fist" keeps its proximal phalanx pointing up and stands taller
 *  than an extended thumb. */
const BEND_MCP = 78 * D2R;
const BEND_PIP = 82 * D2R;
const BEND_DIP = 86 * D2R;

interface PoseDef {
  /** Curl per finger, 0 = straight, 1 = fully folded. */
  curl: [number, number, number, number];
  /** Thumb base angle (radians from up) and curl. */
  thumbAngle: number;
  thumbCurl: number;
  /** When set, the thumb is aimed at this landmark instead (pinch). */
  thumbAim?: number;
}

const POSE_DEFS: Record<PoseId, PoseDef> = {
  // Thumb swings out to the side of the palm.
  palm: { curl: [0.02, 0.02, 0.02, 0.02], thumbAngle: -58 * D2R, thumbCurl: 0.05 },
  // Fingers folded, thumb wrapped across the knuckles.
  fist: { curl: [1, 1, 1, 1], thumbAngle: 58 * D2R, thumbCurl: 0.6 },
  // Index folds down to meet an almost-straight thumb.
  pinch: { curl: [1, 0.12, 0.1, 0.1], thumbAngle: 8 * D2R, thumbCurl: 0.3, thumbAim: LM.INDEX_TIP },
  peace: { curl: [0.02, 0.02, 1, 1], thumbAngle: 50 * D2R, thumbCurl: 0.7 },
  thumbUp: { curl: [1, 1, 1, 1], thumbAngle: -6 * D2R, thumbCurl: 0.02 },
  point: { curl: [0.02, 1, 1, 1], thumbAngle: 45 * D2R, thumbCurl: 0.75 },
};

/** Thumb CMC anchor and segment lengths (≈ index-finger length, as in real hands). */
const THUMB_CMC: readonly [number, number] = [-0.22, -0.28];
const THUMB_LENGTHS: readonly [number, number, number] = [0.42, 0.34, 0.28];

export interface HandPlacement {
  pose: PoseId;
  /** Frame centre of the wrist, normalised 0..1. */
  x: number;
  y: number;
  /** Hand scale as a fraction of the frame width. */
  scale: number;
  /** Wrist roll, radians. */
  rot?: number;
  /** Mirror the hand (right hand by default). */
  mirror?: boolean;
}

const dir = (a: number): [number, number] => [Math.sin(a), -Math.cos(a)];

/**
 * Close the thumb onto another landmark: the three thumb joints are laid along
 * the CMC → target line with a small sinusoidal bow, so the tip lands exactly
 * on the target while the chain still reads as articulated.
 */
function aimThumb(out: Landmark[], target: number) {
  const total = THUMB_LENGTHS[0] + THUMB_LENGTHS[1] + THUMB_LENGTHS[2];
  const tx = out[target].x - THUMB_CMC[0];
  const ty = out[target].y - THUMB_CMC[1];
  const d = Math.max(1e-4, Math.hypot(tx, ty));
  const ux = tx / d;
  const uy = ty / d;
  const bow = Math.min(0.12, Math.max(0, total - d) * 0.35);
  const cum = [THUMB_LENGTHS[0], THUMB_LENGTHS[0] + THUMB_LENGTHS[1], total];
  for (let i = 0; i < 3; i++) {
    const t = cum[i] / total;
    const b = Math.sin(Math.PI * t) * bow;
    out[LM.THUMB_MCP + i] = {
      x: THUMB_CMC[0] + ux * d * t - uy * b,
      y: THUMB_CMC[1] + uy * d * t + ux * b,
      z: 0,
    };
  }
}

function chain(
  out: Landmark[],
  at: number,
  origin: readonly [number, number],
  angle: number,
  lens: readonly [number, number, number],
  curl: number,
) {
  let [x, y] = origin;
  let a = angle + curl * BEND_MCP;
  out[at] = { x, y, z: 0 };
  const bends = [curl * BEND_PIP, curl * BEND_DIP];
  for (let i = 0; i < 3; i++) {
    if (i > 0) a += bends[i - 1];
    const [dx, dy] = dir(a);
    x += dx * lens[i];
    y += dy * lens[i];
    out[at + 1 + i] = { x, y, z: 0 };
  }
}

/** 21 landmarks in *local* hand space (wrist at origin, scale 1). */
export function localLandmarks(pose: PoseId, out: Landmark[] = new Array(21)): Landmark[] {
  const def = POSE_DEFS[pose];
  if (!def) throw new Error(`handModel: unknown pose "${String(pose)}"`);

  out[LM.WRIST] = { x: 0, y: 0, z: 0 };
  for (let f = 0; f < 4; f++) {
    const base = 5 + f * 4;
    chain(out, base, MCP[f], FINGER_SPREAD[f], FINGER_LENGTHS[f], def.curl[f]);
  }

  // Thumb: CMC at the side of the palm, then its own 3-segment chain. When the
  // pose declares `thumbAim` the chain is solved onto that landmark instead,
  // which is what actually makes a pinch close.
  out[LM.THUMB_CMC] = { x: THUMB_CMC[0], y: THUMB_CMC[1], z: 0 };
  if (def.thumbAim !== undefined) {
    aimThumb(out, def.thumbAim);
  } else {
    let a = def.thumbAngle;
    let x = THUMB_CMC[0];
    let y = THUMB_CMC[1];
    const bends = [def.thumbCurl * 46 * D2R, def.thumbCurl * 40 * D2R];
    for (let i = 0; i < 3; i++) {
      if (i > 0) a += bends[i - 1];
      const [dx, dy] = dir(a);
      x += dx * THUMB_LENGTHS[i];
      y += dy * THUMB_LENGTHS[i];
      out[LM.THUMB_MCP + i] = { x, y, z: 0 };
    }
  }

  // Give the palm a slight depth gradient so `facing` has a signal to read.
  for (const i of [LM.WRIST, LM.THUMB_CMC]) out[i].z = 0.02;
  for (const i of [LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP]) out[i].z = -0.01;

  return out;
}

/** 21 landmarks placed into the normalised frame described by `placement`. */
export function poseLandmarks(p: HandPlacement, out: Landmark[] = new Array(21)): Landmark[] {
  localLandmarks(p.pose, out);
  const rot = p.rot ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const mirror = p.mirror ? -1 : 1;
  for (const q of out) {
    const lx = q.x * mirror;
    const ly = q.y;
    q.x = p.x + (lx * cos - ly * sin) * p.scale;
    q.y = p.y + (lx * sin + ly * cos) * p.scale;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  Canvas renderer — real pixels for the contour backend
 * ------------------------------------------------------------------ */

export const SKIN_TONES = ['#e8b48c', '#d99b6c', '#c68863', '#a5673f', '#7d4a2a'] as const;

export interface DrawHandOptions {
  width: number;
  height: number;
  tone?: string;
  /** Paint the backdrop (dark, high contrast against skin). */
  backdrop?: boolean;
}

/** Paints the hand as a palm polygon + tapered finger capsules. */
export function drawHand(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  lm: readonly Landmark[],
  p: HandPlacement,
  opts: DrawHandOptions,
) {
  const { width: w, height: h } = opts;
  const tone = opts.tone ?? SKIN_TONES[0];
  const X = (q: Landmark) => q.x * w;
  const Y = (q: Landmark) => q.y * h;

  if (opts.backdrop !== false) {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
  }

  const unit = p.scale * w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = tone;
  ctx.fillStyle = tone;

  // Palm
  const wrist = lm[LM.WRIST];
  const px = unit * 0.3;
  ctx.beginPath();
  ctx.moveTo(X(wrist) - px, Y(wrist) + unit * 0.12);
  ctx.lineTo(X(lm[LM.INDEX_MCP]) - px * 0.7, Y(lm[LM.INDEX_MCP]));
  ctx.lineTo(X(lm[LM.MIDDLE_MCP]), Y(lm[LM.MIDDLE_MCP]) - unit * 0.05);
  ctx.lineTo(X(lm[LM.RING_MCP]), Y(lm[LM.RING_MCP]));
  ctx.lineTo(X(lm[LM.PINKY_MCP]) + px * 0.6, Y(lm[LM.PINKY_MCP]));
  ctx.lineTo(X(wrist) + px, Y(wrist) + unit * 0.12);
  ctx.closePath();
  ctx.fill();

  const finger = (base: number, widthUnit: number) => {
    ctx.lineWidth = unit * widthUnit;
    ctx.beginPath();
    ctx.moveTo(X(lm[base]), Y(lm[base]));
    ctx.lineTo(X(lm[base + 1]), Y(lm[base + 1]));
    ctx.lineTo(X(lm[base + 2]), Y(lm[base + 2]));
    ctx.lineTo(X(lm[base + 3]), Y(lm[base + 3]));
    ctx.stroke();
  };

  ctx.lineWidth = unit * 0.2;
  ctx.beginPath();
  ctx.moveTo(X(lm[LM.THUMB_CMC]), Y(lm[LM.THUMB_CMC]));
  ctx.lineTo(X(lm[LM.THUMB_MCP]), Y(lm[LM.THUMB_MCP]));
  ctx.lineTo(X(lm[LM.THUMB_IP]), Y(lm[LM.THUMB_IP]));
  ctx.lineTo(X(lm[LM.THUMB_TIP]), Y(lm[LM.THUMB_TIP]));
  ctx.stroke();

  finger(LM.INDEX_MCP, 0.17);
  finger(LM.MIDDLE_MCP, 0.175);
  finger(LM.RING_MCP, 0.165);
  finger(LM.PINKY_MCP, 0.14);
}

/**
 * One step of the synthetic pose cycle: palm → pinch → fist → point → peace →
 * thumb-up, with a lateral sweep across the middle so the motion gestures
 * (swipe / scroll) are exercised too.
 */
export function cyclePose(tSeconds: number): HandPlacement {
  // The clock is external input: a negative or non-finite t (a frame stamped
  // before the loop's epoch, a throttled tab, a stale rAF) must degrade to
  // t = 0, never index the pose table out of bounds.
  const t = Number.isFinite(tSeconds) ? Math.max(0, tSeconds) : 0;
  const CYCLE = 2.6;
  const slot = Math.floor(t / CYCLE) % POSES.length;
  const frac = (t % CYCLE) / CYCLE;
  // Ease between poses in the last 18 % of each slot.
  const next = POSES[(slot + 1) % POSES.length];
  const blend = frac > 0.82 ? (frac - 0.82) / 0.18 : 0;

  // Slot 0 sweeps sideways and slot 3 sweeps vertically, each as a round trip
  // that returns to the centre — a discontinuous jump would fabricate a swipe.
  // The sweep occupies the first 45 % of the slot so the hand actually moves
  // fast enough to cross the detector's velocity thresholds.
  const sweep = frac < 0.45 ? frac / 0.45 : 1;
  let x = 0.5;
  let y = 0.62;
  if (slot === 0) x = 0.5 + 0.24 * Math.sin(sweep * Math.PI * 2);
  else if (slot === 3) y = 0.62 - 0.2 * Math.sin(sweep * Math.PI * 2);
  else x = 0.5 + Math.sin(t * 0.7) * 0.012;

  return {
    pose: blend > 0.5 ? next : POSES[slot],
    x,
    y,
    scale: 0.17 + Math.sin(t * 0.5) * 0.012,
    rot: Math.sin(t * 0.4) * 0.12,
  };
}
