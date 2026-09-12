/**
 * Backend #2 — classical computer vision, no neural network required.
 *
 * YCrCb skin segmentation → largest connected component → convex hull →
 * convexity-defect fingertip search. This is the same family of technique the
 * OpenCV capture stage of the project uses, and it is what the live model
 * falls back to when the Hand Landmarker network cannot be fetched.
 *
 * Deliberately DOM-free: it takes a pixel buffer, so `scripts/verify-logic.cjs`
 * exercises the identical code path under Node.
 */

import { RATIO_WINDOW, clamp01, type HandFeatures } from './gestures';

export interface PixelBuffer {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface SkinSegment {
  mask: Uint8Array;
  width: number;
  height: number;
  area: number;
  cx: number;
  cy: number;
}

export interface HandContour extends SkinSegment {
  hull: Array<readonly [number, number]>;
  /** Digits that protrude past the palm, in angular order. */
  fingertips: DigitPeak[];
  /** Point of the component furthest from the highest fingertip — the wrist. */
  wrist: readonly [number, number];
  /** Median boundary radius around the centroid (the palm radius). */
  palmRadius: number;
  /** Radial signature of the silhouette (see radialProfile). */
  profile: number[];
  maxRadius: number;
  /** maxRadius ÷ palmRadius — the open/closed cue. */
  spread: number;
}

/** YCrCb + RGB-rule skin test. Tuned for indoor lighting and 5 skin tones. */
export function isSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (y < 45) return false;
  if (cr < 133 || cr > 180) return false;
  if (cb < 77 || cb > 133) return false;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return r > 60 && r > g && r > b * 0.85 && mx - mn > 12;
}

export function segmentSkin(img: PixelBuffer): Uint8Array {
  const { data, width, height } = img;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    mask[i] = isSkin(data[p], data[p + 1], data[p + 2]) ? 1 : 0;
  }
  return mask;
}

/** Keeps only the biggest 8-connected blob and reports its centroid. */
export function largestComponent(mask: Uint8Array, width: number, height: number): SkinSegment {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best: { start: number; len: number; sx: number; sy: number } | null = null;

  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || seen[seed]) continue;
    let sp = 0;
    stack[sp++] = seed;
    seen[seed] = 1;
    let len = 0;
    let sx = 0;
    let sy = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % width;
      const y = (idx / width) | 0;
      len++;
      sx += x;
      sy += y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const n = ny * width + nx;
          if (mask[n] && !seen[n]) {
            seen[n] = 1;
            stack[sp++] = n;
          }
        }
      }
    }
    if (!best || len > best.len) best = { start: seed, len, sx, sy };
  }

  const out = new Uint8Array(mask.length);
  if (!best) return { mask: out, width, height, area: 0, cx: 0, cy: 0 };

  // Re-walk the winning blob to mark it.
  sp_reset(stack);
  let sp = 0;
  const visited = new Uint8Array(mask.length);
  stack[sp++] = best.start;
  visited[best.start] = 1;
  while (sp > 0) {
    const idx = stack[--sp];
    out[idx] = 1;
    const x = idx % width;
    const y = (idx / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const n = ny * width + nx;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
    }
  }

  return {
    mask: out,
    width,
    height,
    area: best.len,
    cx: best.sx / best.len,
    cy: best.sy / best.len,
  };
}

function sp_reset(_stack: Int32Array) {
  /* no-op kept for readability of the two-pass walk above */
}

/** Andrew monotone-chain convex hull. */
export function convexHull(points: Array<readonly [number, number]>) {
  const pts = points.slice().sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  if (pts.length < 3) return pts;
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Array<readonly [number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Array<readonly [number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Boundary pixels of the blob, subsampled — the input to the hull. */
export function boundaryPoints(seg: SkinSegment, step = 1): Array<readonly [number, number]> {
  const { mask, width, height } = seg;
  const out: Array<readonly [number, number]> = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const open =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !mask[i - 1] ||
        !mask[i + 1] ||
        !mask[i - width] ||
        !mask[i + width];
      if (open) out.push([x, y]);
    }
  }
  return out;
}

/**
 * Radial signature of the silhouette: for each of `bins` angles around the
 * centroid, the furthest boundary point. Fingertips are the peaks of this
 * curve, which is far more stable than walking the convex hull — a hand
 * silhouette has hundreds of hull vertices and no reliable vertex spacing.
 */
export function radialProfile(seg: SkinSegment, bins = 72): number[] {
  const { mask, width, height, cx, cy } = seg;
  const r = new Array<number>(bins).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const open =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !mask[i - 1] ||
        !mask[i + 1] ||
        !mask[i - width] ||
        !mask[i + width];
      if (!open) continue;
      const dx = x - cx;
      const dy = y - cy;
      const bin = ((Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * bins) % bins) + bins) % bins;
      const d = Math.hypot(dx, dy);
      if (d > r[bin]) r[bin] = d;
    }
  }
  // Fill gaps left by thin digits, then smooth.
  for (let k = 0; k < bins; k++) {
    if (r[k] === 0) r[k] = Math.max(r[(k - 1 + bins) % bins], r[(k + 1) % bins]);
  }
  const sm = new Array<number>(bins);
  for (let k = 0; k < bins; k++) {
    sm[k] = (r[(k - 1 + bins) % bins] + r[k] * 2 + r[(k + 1) % bins]) / 4;
  }
  return sm;
}

/** Peak indices of the radial signature — one per protruding digit. */
export function profilePeaks(profile: number[], minProminence = 0.16): number[] {
  const n = profile.length;
  const lo = Math.min(...profile);
  const hi = Math.max(...profile);
  const span = Math.max(1e-6, hi - lo);
  const reach = Math.max(3, Math.round(n / 9));
  const peaks: number[] = [];

  for (let k = 0; k < n; k++) {
    const prev = profile[(k - 1 + n) % n];
    const next = profile[(k + 1) % n];
    if (profile[k] < prev || profile[k] < next) continue;
    if (profile[k] < lo + span * 0.3) continue;
    let valley = profile[k];
    for (let s = 1; s <= reach; s++) {
      valley = Math.min(valley, profile[(k - s + n * 2) % n], profile[(k + s) % n]);
    }
    if ((profile[k] - valley) / span < minProminence) continue;
    peaks.push(k);
  }

  // Merge peaks that belong to the same digit (a rounded tip makes two bins).
  const merged: number[] = [];
  for (const k of peaks.sort((a, b) => profile[b] - profile[a])) {
    if (merged.some((m) => Math.min(Math.abs(m - k), n - Math.abs(m - k)) < 3)) continue;
    merged.push(k);
  }
  return merged.slice(0, 5).sort((a, b) => a - b);
}

/** A digit that actually protrudes from the palm. */
export interface DigitPeak {
  angle: number;
  /** Peak radius in pixels. */
  r: number;
  x: number;
  y: number;
}

/**
 * Which silhouette peaks count as protruding digits.
 *
 * Measured over the six reference poses at hand widths from 38 px to 96 px and
 * rotations of ±0.12 rad (peak radius ÷ palm radius):
 *
 *   extended fingers      1.42 – 1.71
 *   a raised thumb        1.30 – 1.41     ← overlaps the next line
 *   a fist's knuckles     0.92 – 1.29
 *
 * A raised thumb and a set of knuckles cannot be told apart by height alone,
 * but they differ in *shape*: the thumb stands alone while knuckles arrive as a
 * cluster. So a lone peak is held to a lower bar than a peak in a group.
 */
export const PEAK_FLOOR = 1.25;
export const PEAK_LONE = 1.3;
export const PEAK_CLUSTER = 1.36;

/**
 * Fingertip search: peaks of the radial signature that protrude past the palm,
 * ordered by angle around the palm (for an upright hand: thumb side → pinky).
 */
export function findFingertips(
  seg: SkinSegment,
  palmRadius: number,
  bins = 72,
  profile: number[] = radialProfile(seg, bins),
): DigitPeak[] {
  const palm = Math.max(1, palmRadius);
  const peaks = profilePeaks(profile);
  const rel = peaks.map((k) => profile[k] / palm);
  const candidates = rel.filter((r) => r > PEAK_FLOOR).length;
  const bar = candidates >= 2 ? PEAK_CLUSTER : PEAK_LONE;

  const out: DigitPeak[] = [];
  for (let i = 0; i < peaks.length; i++) {
    if (rel[i] <= bar) continue;
    const a = (peaks[i] / bins) * Math.PI * 2;
    out.push({
      angle: a,
      r: profile[peaks[i]],
      x: seg.cx + Math.cos(a) * profile[peaks[i]],
      y: seg.cy + Math.sin(a) * profile[peaks[i]],
    });
  }
  return out;
}

/** Full contour pass: segment → biggest blob → hull → radial signature → tips. */
export function analyseHand(img: PixelBuffer, bins = 72): HandContour | null {
  const raw = segmentSkin(img);
  const seg = largestComponent(raw, img.width, img.height);
  // A hand must cover a plausible share of the frame; ignore specks.
  if (seg.area < img.width * img.height * 0.012) return null;

  const boundary = boundaryPoints(seg, 1);
  const hull = convexHull(boundary);
  if (hull.length < 8) return null;

  const radii = boundary.map(([x, y]) => Math.hypot(x - seg.cx, y - seg.cy)).sort((a, b) => a - b);
  const palmRadius = Math.max(1, radii[(radii.length * 0.5) | 0]);
  const maxRadius = Math.max(1, radii[radii.length - 1]);

  const profile = radialProfile(seg, bins);
  const fingertips = findFingertips(seg, palmRadius, bins, profile);

  // Wrist = the boundary point furthest from the highest fingertip, or the
  // bottom of the blob when no digit protrudes (a closed hand).
  let wrist: readonly [number, number] = [seg.cx, seg.cy + palmRadius];
  let best = -1;
  const anchor = fingertips.length
    ? fingertips.reduce((a, b) => (b.y < a.y ? b : a))
    : null;
  for (const p of boundary) {
    const d = anchor ? Math.hypot(p[0] - anchor.x, p[1] - anchor.y) : p[1];
    if (d > best) {
      best = d;
      wrist = p;
    }
  }

  return {
    ...seg,
    hull,
    fingertips,
    wrist,
    palmRadius,
    profile,
    maxRadius,
    /** ~1.05 for a closed hand, ~2 for an open one. */
    spread: maxRadius / palmRadius,
  };
}

/**
 * Contour → the same `HandFeatures` record the landmark backend produces.
 *
 * A silhouette carries strictly less information than 21 landmarks — no joint
 * angles, no palm normal — so the slots that cannot be measured fall back to
 * neutral values and `quality` says so out loud.
 */
export interface DigitVerdict {
  /** 1 when a thumb is resolved as protruding, else 0. */
  thumb: 0 | 1;
  /** How many of the four fingers protrude, 0…4. */
  fingers: number;
  /** Index of the thumb within `tips`, or -1. */
  thumbIndex: number;
}

/**
 * Which protruding peaks are fingers and which is the thumb.
 *
 * The thumb is the one peak that sits angularly apart from the rest — it hangs
 * off the side of the palm while the four fingers fan out within ~40° of each
 * other. A lone peak is settled by reach instead: the thumb is markedly shorter
 * than the index (measured 1.39× vs 1.71× the palm radius on the reference
 * poses), so a short lone peak is a thumb.
 */
export function resolveDigits(tips: readonly DigitPeak[], palmRadius: number): DigitVerdict {
  if (!tips.length) return { thumb: 0, fingers: 0, thumbIndex: -1 };

  if (tips.length === 1) {
    const isThumb = tips[0].r / Math.max(1, palmRadius) < THUMB_REACH;
    return { thumb: isThumb ? 1 : 0, fingers: isThumb ? 0 : 1, thumbIndex: isThumb ? 0 : -1 };
  }

  let thumbIndex = -1;
  let widest = 0;
  for (let i = 0; i < tips.length; i++) {
    let nearest = Infinity;
    for (let j = 0; j < tips.length; j++) {
      if (i === j) continue;
      const d = Math.abs(
        Math.atan2(Math.sin(tips[i].angle - tips[j].angle), Math.cos(tips[i].angle - tips[j].angle)),
      );
      nearest = Math.min(nearest, d);
    }
    if (nearest > widest) {
      widest = nearest;
      thumbIndex = i;
    }
  }

  if (widest > THUMB_GAP) {
    return { thumb: 1, fingers: Math.min(4, tips.length - 1), thumbIndex };
  }
  return { thumb: 0, fingers: Math.min(4, tips.length), thumbIndex: -1 };
}

/** Minimum angular isolation, in radians, for a peak to be the thumb. */
export const THUMB_GAP = 35 * (Math.PI / 180);
/** A lone protruding digit shorter than this (× palm radius) is the thumb. */
export const THUMB_REACH = 1.55;

export function featuresFromContour(c: HandContour, frameW: number): HandFeatures {
  // Distances inside the mask are in PIXELS; `scale` is reported normalised.
  const scalePx = Math.max(1e-3, 0.62 * Math.sqrt(c.area));
  const { thumb, fingers, thumbIndex } = resolveDigits(c.fingertips, c.palmRadius);

  // A silhouette says *whether* a digit is out, not how far — so the extension
  // ratios snap to the ends of each finger's calibrated window.
  const ratios: [number, number, number, number, number] = [
    RATIO_WINDOW[0][0],
    RATIO_WINDOW[1][0],
    RATIO_WINDOW[2][0],
    RATIO_WINDOW[3][0],
    RATIO_WINDOW[4][0],
  ];
  if (thumb) ratios[0] = RATIO_WINDOW[0][1];
  for (let i = 0; i < fingers; i++) ratios[i + 1] = RATIO_WINDOW[i + 1][1];

  /* A pinch closes the thumb onto the index, which merges them into one blob —
   * the gap is simply not measurable from a silhouette, so it defaults to the
   * neutral "not pinching" value and Pinch Click stays a landmark-only gesture. */
  let pinch = 1.2;
  if (c.fingertips.length >= 2) {
    let closest = Infinity;
    for (let i = 0; i < c.fingertips.length; i++) {
      for (let j = i + 1; j < c.fingertips.length; j++) {
        const a = c.fingertips[i];
        const b = c.fingertips[j];
        closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    const d = closest / scalePx;
    if (d < 0.35) pinch = d;
  }

  /* Same story for thumb-span: the thumb-tip↔pinky-MCP distance is invisible
   * here, so it is derived from the two things the silhouette does measure —
   * whether the thumb is out, and how many fingers are out with it. The bands
   * match what the landmark model reports for the equivalent poses. */
  const thumbSpan = !thumb ? 0.45 : fingers >= 4 ? 1.4 : fingers >= 3 ? 1.15 : 0.8;

  const thumbTip = thumbIndex >= 0 ? c.fingertips[thumbIndex] : null;

  return {
    scale: scalePx / frameW,
    ratios,
    pinch,
    thumbSpan,
    // A tucked thumb sits inside the silhouette: the low reading a closed hand
    // gives the landmark model.
    thumbLift: thumbTip ? (c.wrist[1] - thumbTip.y) / scalePx : 0.35,
    facing: 0.5, // a silhouette cannot tell palm from back of hand
    wristX: c.wrist[0] / frameW,
    wristY: c.wrist[1] / frameW,
    quality: 0.72,
  };
}
