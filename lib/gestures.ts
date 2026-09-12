/**
 * The decision layer of the live model.
 *
 * Two backends produce the same `HandFeatures` record:
 *
 *   • `landmark`  — 21-point graph from MediaPipe Hand Landmarker (a real
 *                   BlazePalm + Hand-Landmark neural network running in WASM),
 *   • `contour`   — YCrCb skin segmentation + convex-hull/defect analysis
 *                   (lib/skinCV.ts) for machines that cannot load the network.
 *
 * Everything below that line is pure maths over those features, so the exact
 * code that classifies a webcam frame in the browser is the code asserted by
 * `scripts/verify-logic.cjs` under Node.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** MediaPipe hand-landmark topology (21 points). */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

/** Skeleton edges of the 21-point graph (wrist → digits). */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export type Handedness = 'Left' | 'Right';

/** Scale-invariant description of one hand, produced by either backend. */
export interface HandFeatures {
  /** wrist → middle-MCP distance in normalised frame units (the hand scale). */
  scale: number;
  /**
   * tip→wrist ÷ mcp→wrist for [thumb, index, middle, ring, pinky].
   * ~1.1 when fully curled, ~2.0 (fingers) / ~2.9 (thumb) when extended.
   */
  ratios: readonly [number, number, number, number, number];
  /** thumb-tip ↔ index-tip ÷ scale. < 0.35 is a pinch. */
  pinch: number;
  /** thumb-tip ↔ pinky-MCP ÷ scale — how wide the hand is opened. */
  thumbSpan: number;
  /** (wrist.y − thumb-tip.y) ÷ scale. > 0.5 means the thumb points up. */
  thumbLift: number;
  /** 1 = palm to camera, 0 = back of hand, 0.5 = backend could not tell. */
  facing: number;
  /** Wrist position in the (mirrored) frame, 0..1. */
  wristX: number;
  wristY: number;
  /** 0..1 — how much of the feature vector the backend could actually measure. */
  quality: number;
}

/* ------------------------------------------------------------------ *
 *  Labels & the OS action each one maps to
 * ------------------------------------------------------------------ */

export const GESTURES = [
  'Palm Stop',
  'Fist Drag',
  'Pinch Click',
  'Peace Sign',
  'Thumb Up',
  'Point',
  'Swipe Left',
  'Swipe Right',
  'Scroll Up',
  'Scroll Down',
  'None',
] as const;

export type GestureLabel = (typeof GESTURES)[number];

export type MotionDir = 'none' | 'left' | 'right' | 'up' | 'down';

export interface GestureAction {
  command: string;
  action: string;
}

/** Gesture → OS intent. Mirrors the command table in lib/simulation.ts. */
export const GESTURE_ACTIONS: Record<GestureLabel, GestureAction | null> = {
  'Palm Stop': { command: 'Palm Stop', action: 'Halt Action Queue' },
  'Fist Drag': { command: 'Fist Drag', action: 'Move Window' },
  'Pinch Click': { command: 'Pinch Click', action: 'Left Click' },
  'Peace Sign': { command: 'Peace Sign', action: 'Capture Screenshot' },
  'Thumb Up': { command: 'Thumb Up', action: 'Confirm Intent' },
  Point: { command: 'Point', action: 'Cursor Move' },
  'Swipe Left': { command: 'Swipe Left', action: 'Switch Tab' },
  'Swipe Right': { command: 'Swipe Right', action: 'Switch Tab (Next)' },
  'Scroll Up': { command: 'Scroll Up', action: 'Scroll Viewport' },
  'Scroll Down': { command: 'Scroll Down', action: 'Scroll Viewport (Down)' },
  None: null,
};

/* ------------------------------------------------------------------ *
 *  Geometry helpers
 * ------------------------------------------------------------------ */

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Per-finger calibration of the extension ratio.
 * Fingers and the thumb live on very different scales (the thumb MCP sits
 * close to the wrist), so each gets its own [curled, extended] window.
 * Calibrated against the articulated model in lib/handModel.ts — the measured
 * ratios per pose are asserted by scripts/verify-logic.cjs.
 */
export const RATIO_WINDOW: ReadonlyArray<readonly [number, number]> = [
  [1.62, 1.8], // thumb    — curled 1.49 … 1.65, extended 1.79 … 1.81
  [1.18, 1.82], // index   — curled 0.71, extended 1.96
  [1.22, 1.92], // middle  — curled 0.76, extended 2.11
  [1.2, 1.88], // ring     — curled 0.82, extended 2.04
  [1.15, 1.76], // pinky   — curled 0.87, extended 1.86
];

/** Continuous 0 (curled) … 1 (extended) score for one finger. */
export function extensionScore(finger: number, ratio: number): number {
  const [lo, hi] = RATIO_WINDOW[finger] ?? RATIO_WINDOW[1];
  return clamp01((ratio - lo) / (hi - lo));
}

/** Rising ramp: 0 at `x <= at`, 1 at `x >= at + span`. */
const rampUp = (x: number, at: number, span: number) => clamp01((x - at) / span);
/** Falling ramp: 1 at `x <= at - span`, 0 at `x >= at`. */
const rampDown = (x: number, at: number, span: number) => clamp01((at - x) / span);

/**
 * Raw, un-normalised evidence for each static pose. Every term is a product of
 * 0…1 factors, so a pose can only score high when *all* of its cues hold —
 * which keeps the softmax below honest instead of hiding a hand-tuned table.
 */
export function poseScores(f: HandFeatures): Record<string, number> {
  const e = f.ratios.map((r, i) => extensionScore(i, r));
  const [thumb, index, middle, ring, pinky] = e;
  const four = (index + middle + ring + pinky) / 4; // 0…1 mean finger extension
  const faceGain = 0.55 + 0.45 * f.facing; // unknown facing costs ~45 %

  // All five digits open, thumb away from the fingers, palm to the camera.
  const palm =
    four ** 3 *
    (0.4 + 0.6 * thumb) *
    faceGain *
    rampUp(f.pinch, 0.6, 0.4) *
    rampUp(f.thumbSpan, 0.9, 0.4);

  // Everything folded, thumb wrapped across the knuckles, hand compact.
  const fist =
    (1 - four) ** 3 *
    (1 - thumb) ** 0.6 *
    rampDown(f.thumbSpan, 0.75, 0.2) *
    rampDown(f.thumbLift, 0.7, 0.2);

  // Thumb tip meets the index tip; the remaining fingers stay free.
  const pinch =
    rampDown(f.pinch, 0.35, 0.25) * (0.35 + 0.65 * four) * (0.4 + 0.6 * thumb);

  const peace = index * middle * (1 - ring) * (1 - pinky) * (0.5 + 0.5 * (1 - thumb));

  // Thumb alone, pointing well above the wrist.
  const thumbUp =
    rampUp(f.thumbLift, 1.0, 0.25) * (1 - four) ** 2.5 * (0.4 + 0.6 * thumb);

  const point = index * (1 - middle) * (1 - ring) * (1 - pinky) * (0.5 + 0.5 * (1 - thumb));

  // Only reachable when the backend reports a degraded feature vector.
  const none = 0.15 * (1 - f.quality);

  return {
    'Palm Stop': palm,
    'Fist Drag': fist,
    'Pinch Click': pinch,
    'Peace Sign': peace,
    'Thumb Up': thumbUp,
    Point: point,
    None: none,
  };
}

export function featuresFromLandmarks(
  lm: readonly Landmark[],
  handedness?: Handedness,
): HandFeatures {
  const w = lm[LM.WRIST];
  const scale = Math.max(1e-4, dist(w, lm[LM.MIDDLE_MCP]));
  const tips = [LM.THUMB_TIP, LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP];
  const mcps = [LM.THUMB_MCP, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP];

  const ratios = tips.map((t, i) => {
    const base = Math.max(1e-4, dist(w, lm[mcps[i]]));
    return dist(w, lm[t]) / base;
  }) as [number, number, number, number, number];

  // Palm normal via the wrist → index-MCP → pinky-MCP winding.
  const ax = lm[LM.INDEX_MCP].x - w.x;
  const ay = lm[LM.INDEX_MCP].y - w.y;
  const bx = lm[LM.PINKY_MCP].x - w.x;
  const by = lm[LM.PINKY_MCP].y - w.y;
  const cross = ax * by - ay * bx;
  const area = Math.max(1e-4, Math.hypot(ax, ay) * Math.hypot(bx, by));
  const winding = clamp01((cross / area + 1) / 2);
  const facing = handedness ? (handedness === 'Left' ? 1 - winding : winding) : 0.5;

  return {
    scale,
    ratios,
    pinch: dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / scale,
    thumbSpan: dist(lm[LM.THUMB_TIP], lm[LM.PINKY_MCP]) / scale,
    thumbLift: (w.y - lm[LM.THUMB_TIP].y) / scale,
    facing,
    wristX: w.x,
    wristY: w.y,
    quality: 1,
  };
}

/* ------------------------------------------------------------------ *
 *  Pose scoring → confidence
 * ------------------------------------------------------------------ */

const POSE_KEYS = ['Palm Stop', 'Fist Drag', 'Pinch Click', 'Peace Sign', 'Thumb Up', 'Point'] as const;

/** Softmax temperature — lower is sharper. 0.22 keeps ties visible in the UI. */
export const SCORE_TEMPERATURE = 0.22;

/** Minimum top-1 probability before the frame is reported as `None`. */
export const MIN_CONFIDENCE = 62;

export interface PoseVerdict {
  pose: GestureLabel;
  confidence: number;
  scores: Record<string, number>;
}

export function classifyPose(f: HandFeatures): PoseVerdict {
  const scores = poseScores(f);
  const keys = [...POSE_KEYS, 'None'] as const;
  const ex = keys.map((k) => Math.exp((scores[k] ?? 0) / SCORE_TEMPERATURE));
  const sum = ex.reduce((a, b) => a + b, 0) || 1;

  let best = 0;
  for (let i = 1; i < keys.length; i++) if (ex[i] > ex[best]) best = i;
  const prob = (ex[best] / sum) * 100;
  const pose = (prob < MIN_CONFIDENCE ? 'None' : keys[best]) as GestureLabel;

  return { pose, confidence: Math.round(prob * 10) / 10, scores };
}

/* ------------------------------------------------------------------ *
 *  Temporal layer — smoothing, hysteresis, motion, intent debounce
 * ------------------------------------------------------------------ */

export interface Recognition {
  label: GestureLabel;
  pose: GestureLabel;
  motion: MotionDir;
  confidence: number;
  scores: Record<string, number>;
  features: HandFeatures;
}

export interface Intent {
  label: GestureLabel;
  command: string;
  action: string;
  confidence: number;
  repeat: boolean;
}

export interface ClassifierOptions {
  /** Exponential smoothing factor for the wrist velocity (0…1). */
  velocityAlpha?: number;
  /** Normalised-units/ms needed to call a horizontal swipe. */
  swipeVelocity?: number;
  /** Normalised-units/ms needed to call a vertical scroll. */
  scrollVelocity?: number;
  /** Axis dominance required so a diagonal drift is not a swipe. */
  axisDominance?: number;
  /**
   * Largest plausible wrist movement per frame, in normalised units. A bigger
   * step is a detector glitch (the classical CV backend's wrist estimate can
   * hop between boundary pixels) and must not be read as a swipe.
   */
  maxWristStep?: number;
  /** A pose must hold this long before it becomes the reported label. */
  holdMs?: number;
  /** Minimum gap between two injected OS intents. */
  cooldownMs?: number;
  /** A held pose re-fires (as a drag/hold) at this cadence. */
  repeatMs?: number;
  /** How long a motion gesture stays latched after the hand stops. */
  motionLatchMs?: number;
}

const DEFAULTS: Required<ClassifierOptions> = {
  velocityAlpha: 0.45,
  swipeVelocity: 0.0011,
  scrollVelocity: 0.0009,
  axisDominance: 1.9,
  maxWristStep: 0.12,
  holdMs: 180,
  cooldownMs: 180,
  repeatMs: 1200,
  motionLatchMs: 420,
};

/**
 * Stateful recogniser: feed it one `HandFeatures` per frame (with a monotonic
 * clock) and it hands back a debounced label plus, at most, one intent.
 */
export class GestureClassifier {
  private opts: Required<ClassifierOptions>;
  private last: { x: number; y: number; t: number } | null = null;
  private vx = 0;
  private vy = 0;
  private stablePose: GestureLabel = 'None';
  private candidate: { pose: GestureLabel; since: number } | null = null;
  private motion: MotionDir = 'none';
  private motionUntil = 0;
  private lastIntentAt = -1e9;
  private lastIntentLabel: GestureLabel | null = null;

  constructor(options: ClassifierOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  reset() {
    this.last = null;
    this.vx = this.vy = 0;
    this.stablePose = 'None';
    this.candidate = null;
    this.motion = 'none';
    this.motionUntil = 0;
    this.lastIntentAt = -1e9;
    this.lastIntentLabel = null;
  }

  push(f: HandFeatures, tMs: number): Recognition {
    const o = this.opts;

    /* ---- wrist velocity (EMA-smoothed, in normalised units / ms) ---- */
    if (this.last) {
      const dx = f.wristX - this.last.x;
      const dy = f.wristY - this.last.y;
      if (Math.abs(dx) > o.maxWristStep || Math.abs(dy) > o.maxWristStep) {
        // Teleport: the tracker lost and re-found the hand. Decay instead of
        // reporting a physically impossible velocity.
        this.vx *= 0.4;
        this.vy *= 0.4;
      } else {
        const dt = Math.max(1, tMs - this.last.t);
        this.vx += (dx / dt - this.vx) * o.velocityAlpha;
        this.vy += (dy / dt - this.vy) * o.velocityAlpha;
      }
    }
    this.last = { x: f.wristX, y: f.wristY, t: tMs };

    /* ---- static pose with hysteresis ---- */
    const verdict = classifyPose(f);
    if (!this.candidate || this.candidate.pose !== verdict.pose) {
      this.candidate = { pose: verdict.pose, since: tMs };
    } else if (tMs - this.candidate.since >= o.holdMs) {
      this.stablePose = verdict.pose;
    }
    if (verdict.pose === this.stablePose) this.candidate = null;

    /* ---- motion detection ---- */
    const ax = Math.abs(this.vx);
    const ay = Math.abs(this.vy);
    let motion: MotionDir = 'none';
    if (ax > o.swipeVelocity && ax > ay * o.axisDominance) {
      motion = this.vx > 0 ? 'right' : 'left';
    } else if (ay > o.scrollVelocity && ay > ax * o.axisDominance) {
      motion = this.vy > 0 ? 'down' : 'up';
    }
    if (motion !== 'none') this.motionUntil = tMs + o.motionLatchMs;
    else if (tMs > this.motionUntil) this.motion = 'none';
    if (motion !== 'none') this.motion = motion;

    const motionLabel: GestureLabel | null =
      this.motion === 'left'
        ? 'Swipe Left'
        : this.motion === 'right'
          ? 'Swipe Right'
          : this.motion === 'up'
            ? 'Scroll Up'
            : this.motion === 'down'
              ? 'Scroll Down'
              : null;

    const motionStrength = Math.max(ax / o.swipeVelocity, ay / o.scrollVelocity);
    const confidence = motionLabel
      ? Math.round(Math.min(99.4, 72 + motionStrength * 6) * 10) / 10
      : verdict.confidence;

    return {
      label: motionLabel ?? this.stablePose,
      pose: this.stablePose,
      motion: this.motion,
      confidence,
      scores: verdict.scores,
      features: f,
    };
  }

  /**
   * Edge-triggered intent queue. A pose fires once when it becomes stable, then
   * repeats at `repeatMs` while held (that is what drives drag/hold actions);
   * a motion gesture fires on onset. Everything obeys the 180 ms cooldown that
   * modification M-03 requires before SendInput injection.
   */
  takeIntent(rec: Recognition, tMs: number): Intent | null {
    const o = this.opts;
    if (rec.label === 'None') {
      this.lastIntentLabel = null;
      return null;
    }
    if (tMs - this.lastIntentAt < o.cooldownMs) return null;

    const isMotionLabel =
      rec.label === 'Swipe Left' ||
      rec.label === 'Swipe Right' ||
      rec.label === 'Scroll Up' ||
      rec.label === 'Scroll Down';

    // Motion gestures fire on onset only; a held pose re-fires at repeatMs.
    const motionEdge = isMotionLabel && rec.label !== this.lastIntentLabel;
    const poseEdge = !isMotionLabel && rec.label !== this.lastIntentLabel;
    const poseRepeat =
      !isMotionLabel &&
      rec.label === this.lastIntentLabel &&
      tMs - this.lastIntentAt >= o.repeatMs;

    if (!motionEdge && !poseEdge && !poseRepeat) return null;

    const action = GESTURE_ACTIONS[rec.label];
    if (!action) return null;

    this.lastIntentAt = tMs;
    this.lastIntentLabel = rec.label;
    return {
      label: rec.label,
      command: action.command,
      action: action.action,
      confidence: rec.confidence,
      repeat: poseRepeat,
    };
  }
}
