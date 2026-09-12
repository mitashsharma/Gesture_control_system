'use client';

/**
 * The live model.
 *
 *   source (webcam | synthetic pixels)
 *        ↓
 *   backend  landmark  — MediaPipe Hand Landmarker (BlazePalm + 21-point
 *                        regression, WASM/WebGL), or
 *            contour   — classical skin segmentation + convex-hull fingertips
 *                        (lib/skinCV.ts), used when the network cannot load, or
 *            procedural— the articulated hand model feeds the classifier
 *                        directly (no camera, no assets)
 *        ↓
 *   HandFeatures → GestureClassifier (lib/gestures.ts)
 *        ↓
 *   debounced intent → liveLog + the OS action layer
 *
 * Everything measured here is real: the latency is the wall-clock cost of one
 * backend pass, the FPS is the achieved loop rate, and the accuracy readout is
 * the mean top-1 probability of the frames the classifier actually accepted.
 */

import { useSyncExternalStore } from 'react';
import {
  GestureClassifier,
  HAND_CONNECTIONS,
  LM,
  featuresFromLandmarks,
  type GestureLabel,
  type HandFeatures,
  type Handedness,
  type Landmark,
  type MotionDir,
} from './gestures';
import { cyclePose, drawHand, poseLandmarks } from './handModel';
import { analyseHand, featuresFromContour, type HandContour } from './skinCV';
import { latencyHistory } from './history';
import { liveLog } from './liveLog';
import { timestamp } from './simulation';
import { LATENCY_THRESHOLD, pushAlert, systemStore } from './store';

/** Kept in sync with the `@mediapipe/tasks-vision` devDependency by
 *  scripts/vendor-mediapipe.mjs, which parses this constant. */
export const MEDIAPIPE_VERSION = '0.10.35';
export const MODEL_FILE = 'hand_landmarker.task';

const LOCAL_BUNDLE = '/vendor/vision/vision_bundle.mjs';
const LOCAL_WASM = '/vendor/wasm';
const LOCAL_MODEL = `/vendor/models/${MODEL_FILE}`;

const cdnBundle = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const cdnWasm = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const cdnModel = `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/${MODEL_FILE}`;

export type LiveSourceId = 'webcam' | 'synthetic';
export type LiveBackendId = 'landmark' | 'contour' | 'procedural';
export type LiveStatus = 'idle' | 'loading' | 'running' | 'error';

export const BACKEND_LABEL: Record<LiveBackendId, string> = {
  landmark: 'MediaPipe Hand Landmarker',
  contour: 'Classical CV (skin + hull)',
  procedural: 'Articulated hand model',
};

export const SOURCE_LABEL: Record<LiveSourceId, string> = {
  webcam: 'Webcam',
  synthetic: 'Synthetic hand',
};

export interface LiveSnapshot {
  status: LiveStatus;
  source: LiveSourceId;
  backend: LiveBackendId;
  error: string | null;
  /** Where the network weights came from. */
  modelOrigin: 'local' | 'cdn' | 'none';
  delegate: 'GPU' | 'CPU' | 'none';
  latency: number;
  fps: number;
  frames: number;
  intents: number;
  confidence: number;
  label: GestureLabel;
  pose: GestureLabel;
  motion: MotionDir;
  features: HandFeatures | null;
  landmarks: readonly Landmark[] | null;
  contour: HandContour | null;
  handedness: Handedness | null;
  hotSwaps: number;
}

const WORK_W = 320;
const WORK_H = 240;
/** Inference is capped so the recognition loop never outruns the camera. */
const INFER_MS = 33;
const SYNTH_W = 640;
const SYNTH_H = 480;

const INITIAL: LiveSnapshot = {
  status: 'idle',
  source: 'webcam',
  backend: 'procedural',
  error: null,
  modelOrigin: 'none',
  delegate: 'none',
  latency: 0,
  fps: 0,
  frames: 0,
  intents: 0,
  confidence: 0,
  label: 'None',
  pose: 'None',
  motion: 'none',
  features: null,
  landmarks: null,
  contour: null,
  handedness: null,
  hotSwaps: 0,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyLandmarker = {
  detectForVideo: (frame: any, ts: number) => any;
  close?: () => void;
};

const probe = async (url: string) => {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
};

export class LiveEngine {
  private state: LiveSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private classifier = new GestureClassifier();

  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private synth: HTMLCanvasElement | null = null;
  private work: HTMLCanvasElement | null = null;
  private workCtx: CanvasRenderingContext2D | null = null;
  private display: HTMLCanvasElement | null = null;
  private landmarker: AnyLandmarker | null = null;

  private raf = 0;
  private pending: Partial<LiveSnapshot> = {};
  private nextUi = 0;
  private lastInfer = 0;
  private lastFrameAt = 0;
  private frames = 0;
  private fpsAcc = 0;
  private fpsCount = 0;
  private confAcc = 0;
  private confCount = 0;
  private latencyAcc = 0;
  private latencyCount = 0;
  private nextTelemetry = 0;
  private breachStreak = 0;
  private intentCount = 0;
  private synthT0 = 0;
  private mirrored = false;
  private latestRec: { label: GestureLabel; confidence: number } = { label: 'None', confidence: 0 };

  /* --------------------------- store plumbing --------------------------- */

  getSnapshot = (): LiveSnapshot => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<LiveSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  attachCanvas(canvas: HTMLCanvasElement | null) {
    this.display = canvas;
  }

  /* ------------------------------- start ------------------------------- */

  async start(source: LiveSourceId) {
    await this.stop(true);
    this.classifier.reset();
    liveLog.clear();
    this.frames = 0;
    this.intentCount = 0;
    this.confAcc = 0;
    this.confCount = 0;
    this.latencyAcc = 0;
    this.latencyCount = 0;
    this.breachStreak = 0;
    this.set({
      status: 'loading',
      source,
      error: null,
      landmarks: null,
      contour: null,
      features: null,
      label: 'None',
      pose: 'None',
      motion: 'none',
      confidence: 0,
      frames: 0,
      intents: 0,
      latency: 0,
      fps: 0,
    });
    this.mirrored = source === 'webcam';

    try {
      await this.openSource(source);
      await this.loadBackend(source);
      systemStore.set({ live: true, loading: false });
      this.set({ status: 'running' });
      this.lastFrameAt = performance.now();
      this.nextTelemetry = this.lastFrameAt + 500;
      this.synthT0 = this.lastFrameAt;
      this.raf = requestAnimationFrame(this.tick);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.set({ status: 'error', error: message });
      systemStore.set({ live: false });
      await this.teardownSource();
    }
  }

  async stop(keepStore = false) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    await this.teardownSource();
    this.landmarker?.close?.();
    this.landmarker = null;
    this.set({ status: 'idle', landmarks: null, contour: null, features: null, motion: 'none' });
    if (!keepStore) systemStore.set({ live: false });
  }

  /** Swap the active backend at runtime (also what the watchdog calls). */
  async useBackend(backend: LiveBackendId) {
    if (backend === this.state.backend && this.state.status === 'running') return;
    if (backend === 'procedural' && this.state.source !== 'synthetic') return;
    this.landmarker?.close?.();
    this.landmarker = null;
    try {
      if (backend === 'landmark') await this.loadLandmarker();
      else if (backend === 'procedural') this.set({ backend: 'procedural' });
      else this.set({ backend: 'contour' });
    } catch (err) {
      this.set({
        backend: 'contour',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async openSource(source: LiveSourceId) {
    this.work = document.createElement('canvas');
    this.work.width = WORK_W;
    this.work.height = WORK_H;
    this.workCtx = this.work.getContext('2d', { willReadFrequently: true });

    if (source === 'webcam') {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not expose getUserMedia (needs HTTPS).');
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = this.stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      this.video = video;
    } else {
      const synth = document.createElement('canvas');
      synth.width = SYNTH_W;
      synth.height = SYNTH_H;
      this.synth = synth;
    }
  }

  private async teardownSource() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.video = null;
    this.synth = null;
  }

  /* ------------------------------ backends ------------------------------ */

  private async loadBackend(source: LiveSourceId) {
    try {
      await this.loadLandmarker();
    } catch (err) {
      // The classical CV backend needs pixels only — it works with an open
      // camera and with the synthetic source alike.
      this.pendingWarning = err instanceof Error ? err.message : String(err);
      this.set({ backend: 'contour', modelOrigin: 'none', delegate: 'none' });
    }
    void source;
  }

  private pendingWarning: string | null = null;

  private async loadLandmarker() {
    /* Prefer a vendored copy (works offline) and fall back to the CDN. An
     * origin is only trusted if the bundle AND the weights are both there, so
     * a half-finished `npm run vendor:model` cannot strand us. */
    const origins = [
      { id: 'local' as const, bundle: LOCAL_BUNDLE, wasm: LOCAL_WASM, model: LOCAL_MODEL },
      { id: 'cdn' as const, bundle: cdnBundle, wasm: cdnWasm, model: cdnModel },
    ];

    let lastError = 'no asset origin reachable';
    for (const o of origins) {
      if (!(await probe(o.bundle))) {
        lastError = `${o.id}: vision bundle not reachable`;
        continue;
      }
      try {
        // `webpackIgnore` keeps the bundler from resolving a runtime URL.
        const mod: any = await import(/* webpackIgnore: true */ o.bundle);
        const resolver = await mod.FilesetResolver.forVisionTasks(o.wasm);

        let landmarker: AnyLandmarker | null = null;
        let delegate: 'GPU' | 'CPU' = 'CPU';
        for (const d of ['GPU', 'CPU'] as const) {
          try {
            landmarker = await mod.HandLandmarker.createFromOptions(resolver, {
              baseOptions: { modelAssetPath: o.model, delegate: d },
              runningMode: 'VIDEO',
              numHands: 1,
              minHandDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
            delegate = d;
            break;
          } catch {
            landmarker = null;
          }
        }
        if (!landmarker) throw new Error(`${o.id}: HandLandmarker.createFromOptions failed`);

        this.landmarker = landmarker;
        this.set({ backend: 'landmark', modelOrigin: o.id, delegate, error: null });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(lastError);
  }

  /* -------------------------------- loop -------------------------------- */

  private tick = (now: number) => {
    if (document.hidden) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    this.raf = requestAnimationFrame(this.tick);

    const source = this.prepareFrame(now);
    if (!source) return;

    if (now - this.lastInfer >= INFER_MS) {
      this.lastInfer = now;
      this.infer(now);
    }
    this.render(now);

    // React-visible state is published at 10 Hz; the canvas overlay (label,
    // confidence, skeleton) is painted every frame, so nothing looks choppy.
    if (now >= this.nextUi) {
      this.nextUi = now + 100;
      this.flushUi();
    }

    // Real FPS over a sliding window.
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (dt > 0 && dt < 500) {
      this.fpsAcc += 1000 / dt;
      this.fpsCount++;
    }

    if (now >= this.nextTelemetry) {
      this.publishTelemetry(now);
      this.nextTelemetry = now + 500;
    }
  };

  /** Paints the synthetic source if needed and returns the frame to analyse. */
  private prepareFrame(now: number): CanvasImageSource | null {
    if (this.state.source === 'webcam') {
      const v = this.video;
      if (!v || v.readyState < 2 || !v.videoWidth) return null;
      return v;
    }
    const synth = this.synth;
    const ctx = synth?.getContext('2d');
    if (!synth || !ctx) return null;
    const t = (now - this.synthT0) / 1000;
    const placement = cyclePose(t);
    poseLandmarks(placement, this.synthLandmarks);
    drawHand(ctx, this.synthLandmarks, placement, {
      width: SYNTH_W,
      height: SYNTH_H,
      backdrop: true,
    });
    return synth;
  }

  private synthLandmarks: Landmark[] = new Array(21);

  private infer(now: number) {
    const t0 = performance.now();
    const backend = this.state.backend;
    let features: HandFeatures | null = null;
    let landmarks: readonly Landmark[] | null = null;
    let contour: HandContour | null = null;
    let handedness: Handedness | null = null;

    try {
      if (backend === 'landmark' && this.landmarker) {
        const frame = this.state.source === 'webcam' ? this.video : this.synth;
        if (!frame) return;
        const res = this.landmarker.detectForVideo(frame, now);
        const lm = res?.landmarks?.[0] as Landmark[] | undefined;
        if (lm && lm.length === 21) {
          handedness = (res.handedness?.[0]?.[0]?.categoryName ?? null) as Handedness | null;
          landmarks = this.mirrorLandmarks(lm);
          features = featuresFromLandmarks(landmarks, handedness ?? undefined);
        }
      } else if (backend === 'contour') {
        const img = this.grabWorkCanvas();
        if (img) {
          const found = analyseHand(img);
          if (found) {
            contour = found;
            // The work canvas is already mirrored for a front camera, so the
            // contour coordinates arrive in the same space as the landmarks.
            features = featuresFromContour(found, WORK_W);
          }
        }
      } else {
        // procedural — the classifier sees the model directly.
        const lm = this.mirrorLandmarks(this.synthLandmarks);
        landmarks = lm;
        features = featuresFromLandmarks(lm, 'Right');
      }
    } catch {
      // A single failed pass must not kill the loop; the next frame retries.
      return;
    }

    const cost = performance.now() - t0;
    this.latencyAcc += cost;
    this.latencyCount++;
    this.frames++;

    if (!features) {
      this.pending = { frames: this.frames, landmarks: null, contour: null, features: null };
      return;
    }

    const rec = this.classifier.push(features, now);
    this.latestRec = { label: rec.label, confidence: rec.confidence };
    if (rec.label !== 'None') {
      this.confAcc += rec.confidence;
      this.confCount++;
    }

    const intent = this.classifier.takeIntent(rec, now);
    if (intent) {
      this.intentCount++;
      liveLog.push({
        time: timestamp(),
        source: 'Gesture',
        command: intent.command,
        action: intent.action,
        confidence: intent.confidence,
        latency: Math.round(cost * 10) / 10,
        label: intent.label,
        backend: BACKEND_LABEL[this.state.backend],
        repeat: intent.repeat,
      });
    }

    // Staged, not published: the loop runs at ~30 Hz but React only needs 10.
    this.pending = {
      frames: this.frames,
      intents: this.intentCount,
      landmarks,
      contour,
      features,
      handedness,
      label: rec.label,
      pose: rec.pose,
      motion: rec.motion,
      confidence: rec.confidence,
    };
  }

  /** Downscale the current source into the analysis canvas and read it back. */
  private grabWorkCanvas() {
    const ctx = this.workCtx;
    const src = this.state.source === 'webcam' ? this.video : this.synth;
    if (!ctx || !src) return null;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, WORK_W, WORK_H);
    if (this.mirrored) {
      ctx.translate(WORK_W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(src as CanvasImageSource, 0, 0, WORK_W, WORK_H);
    ctx.restore();
    return ctx.getImageData(0, 0, WORK_W, WORK_H);
  }

  private mirrorBuf: Landmark[] = new Array(21);

  private mirrorLandmarks(lm: readonly Landmark[]): readonly Landmark[] {
    if (!this.mirrored) return lm;
    for (let i = 0; i < 21; i++) {
      const p = lm[i];
      this.mirrorBuf[i] = { x: 1 - p.x, y: p.y, z: p.z };
    }
    return this.mirrorBuf;
  }

  /* ------------------------------ telemetry ----------------------------- */

  private flushUi() {
    if (!Object.keys(this.pending).length) return;
    this.set(this.pending);
    this.pending = {};
  }

  private publishTelemetry(now: number) {
    const latency = this.latencyCount
      ? Math.round((this.latencyAcc / this.latencyCount) * 10) / 10
      : 0;
    const fps = this.fpsCount ? Math.round((this.fpsAcc / this.fpsCount) * 10) / 10 : 0;
    const confidence = this.confCount ? Math.round((this.confAcc / this.confCount) * 10) / 10 : 0;

    this.latencyAcc = 0;
    this.latencyCount = 0;
    this.fpsAcc = 0;
    this.fpsCount = 0;
    this.confAcc = 0;
    this.confCount = 0;

    this.set({ latency, fps, confidence });
    if (latency > 0) latencyHistory.push(latency);

    // The real watchdog: two consecutive samples over budget hot-swap the live
    // model onto the classical CV backend, exactly like the 150 ms arbitration
    // the Python runtime performs between the CNN and the prebuilt engine.
    const s = systemStore.getSnapshot();
    if (this.state.backend === 'landmark' && latency > LATENCY_THRESHOLD) this.breachStreak++;
    else this.breachStreak = 0;

    if (this.breachStreak >= 2 && s.autoFallback) {
      this.breachStreak = 0;
      const swaps = this.state.hotSwaps + 1;
      this.set({ backend: 'contour', hotSwaps: swaps });
      pushAlert(
        'warn',
        'High latency detected in the live model',
        `Landmark inference held at ${latency} ms — above the ${LATENCY_THRESHOLD} ms budget. ` +
          'Hot-swapping the live backend to the classical CV pipeline (skin segmentation + convex hull).',
      );
      systemStore.set({ hotSwaps: s.hotSwaps + 1 });
    }

    // Feed the dashboard's global vitals with the measured numbers.
    systemStore.set({ latency, fps, accuracy: confidence });
    void now;
  }

  /* ------------------------------- render ------------------------------- */

  private render(now: number) {
    const canvas = this.display;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 480;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);

    const src = this.state.source === 'webcam' ? this.video : this.synth;
    if (src) {
      const sw = this.state.source === 'webcam' ? this.video?.videoWidth || 1 : SYNTH_W;
      const sh = this.state.source === 'webcam' ? this.video?.videoHeight || 1 : SYNTH_H;
      const fit = Math.min(w / sw, h / sh);
      const dw = sw * fit;
      const dh = sh * fit;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      ctx.save();
      if (this.mirrored) {
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(dx, dy);
      }
      ctx.drawImage(src as CanvasImageSource, 0, 0, dw, dh);
      ctx.restore();
      this.drawOverlay(ctx, dx, dy, dw, dh);
    }

    if (this.pendingWarning) {
      const msg = this.pendingWarning;
      this.pendingWarning = null;
      ctx.fillStyle = 'rgba(245,158,11,0.92)';
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillText(`landmark model unavailable → ${msg.slice(0, 62)}`, 12, h - 12);
    }
    void now;
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) {
    const { landmarks, contour, label, confidence } = this.state;

    if (contour) {
      const sx = dw / WORK_W;
      const sy = dh / WORK_H;
      ctx.save();
      ctx.strokeStyle = 'rgba(245,158,11,0.85)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      contour.hull.forEach(([x, y], i) => {
        const px = dx + x * sx;
        const py = dy + y * sy;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(167,139,250,0.95)';
      for (const t of contour.fingertips) {
        ctx.beginPath();
        ctx.arc(dx + t.x * sx, dy + t.y * sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (landmarks) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(34,211,238,0.9)';
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(dx + landmarks[a].x * dw, dy + landmarks[a].y * dh);
        ctx.lineTo(dx + landmarks[b].x * dw, dy + landmarks[b].y * dh);
      }
      ctx.stroke();
      for (let i = 0; i < landmarks.length; i++) {
        const tip = i === LM.THUMB_TIP || i === LM.INDEX_TIP || i === LM.MIDDLE_TIP ||
          i === LM.RING_TIP || i === LM.PINKY_TIP;
        ctx.fillStyle = tip ? '#a78bfa' : 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.arc(dx + landmarks[i].x * dw, dy + landmarks[i].y * dh, tip ? 4 : 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Recognition banner
    const text = label === 'None' ? 'searching…' : `${label}  ${confidence.toFixed(1)}%`;
    ctx.font = '600 13px ui-monospace, monospace';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = label === 'None' ? 'rgba(15,23,42,0.6)' : 'rgba(6,182,212,0.85)';
    ctx.fillRect(dx + 10, dy + 10, tw + 18, 24);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(text, dx + 19, dy + 26);
  }
}

export const liveEngine = new LiveEngine();

export function useLiveEngine(): LiveSnapshot {
  return useSyncExternalStore(liveEngine.subscribe, liveEngine.getSnapshot, liveEngine.getSnapshot);
}
