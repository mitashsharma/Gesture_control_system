# Gesture Controlled System — Interactive Project Dashboard

A highly-optimised, light-mode / futuristic showcase dashboard for the computer-vision
undergraduate project **"Gesture Controlled System"** — real-time OS & I/O control via
computer vision + voice assistant integration.

Since **v2.5.0** the recogniser is not a simulation: the *Live Model* section runs real
inference in the browser and drives the dashboard with measured numbers.

Built with **Next.js (App Router, static prerender) · React 19 · Tailwind CSS v4 ·
Framer Motion 13 · Lucide React**.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run typecheck
```

## What's inside

| Section | What it does |
| --- | --- |
| **Floating glass nav** | Sticky `backdrop-blur-md` bar, shared-element active pill, smooth-scroll links, glowing amber/cyan `Status: Approved with Modifications` badge. |
| **Hero** | Cyan→violet gradient title, subtitle, metadata chips, and a **live inference vitals card** (engine, latency-vs-budget bar, sparkline, fps/accuracy/hot-swap counters). |
| **Model Analytics** | Real-time status banner, engine dropdown (`Custom CNN (PyBind11)` ⇄ `Prebuilt Fallback`), auto-fallback watchdog toggle, forced hot-swap button, model detail card, animated accuracy ring, and an interactive **5×5 glowing confusion-matrix heatmap** with hover tooltips (precision / recall / F1). |
| **Live Logs** | Real-time scrolling command stream with timestamps, `Gesture`/`Voice` badges, confidence & latency; search, `All / Gesture / Voice` filters, pause, and clear; 60-entry ring buffer. |
| **Live Model** | **Real** in-browser recognition — MediaPipe Hand Landmarker (WASM/WebGL) or a classical skin-segmentation fallback, over your webcam or a rendered synthetic hand. Landmark overlay, live confidence, per-finger extension, feature readouts and the debounced intents it injects. |
| **Architecture** | 5-stage data-flow pipeline (OpenCV → MediaPipe/pybind11 → Recognition/Fallback → win32/PyAutoGUI → SpeechRecognition) + tech-stack tags. |
| **Gesture Demo** | Tabbed, canvas-based previews: cursor tracking, clicks & scrolling (ripple effects), and voice-command waveform. Only the visible tab renders. |
| **Team / Status / Runtime** | Team & mentors, evaluation outcome + modification tracker + timeline, and a performance control panel with a master switch. |

## Live model (real inference, in the browser)

```
source ── webcam  ─────────────┐
       └─ synthetic hand ──────┤   (an articulated hand rendered to a canvas —
                               │    no camera, no permissions, no assets)
                               ▼
backend  landmark   MediaPipe Hand Landmarker — BlazePalm + 21-point regression,
                    WASM + WebGL, weights from public/vendor or the jsDelivr CDN
         contour    YCrCb skin segmentation → largest blob → radial signature →
                    convexity peaks (lib/skinCV.ts). No network, no model file.
                               ▼
         HandFeatures ── 7 scale-invariant measurements (lib/gestures.ts)
                               ▼
         GestureClassifier ── pose scoring → softmax → hysteresis → motion →
                              180 ms debounce → OS intent
```

Everything in that chain is measured, not invented:

| Readout | What it actually is |
| --- | --- |
| inference | wall-clock ms of one backend pass |
| throughput | achieved loop rate |
| mean top-1 | mean softmax probability of the frames the classifier accepted |
| intents | gestures that cleared hysteresis + the 180 ms debounce |

While the live model runs it **owns the dashboard telemetry** (`store.live`): the synthetic
clock stands down, so the hero vitals, the sparkline and the log stream all show real
measurements. Real intents appear in the Live Logs terminal tagged with their backend.

### Backend capabilities

| Gesture | Landmark (MediaPipe) | Contour (classical CV) |
| --- | :-: | :-: |
| Palm Stop / Fist Drag / Peace Sign / Point | ✓ | ✓ |
| Swipe Left / Right, Scroll Up / Down | ✓ | ✓ |
| Pinch Click | ✓ | — a pinch closes the gap it would measure |
| Thumb Up | ✓ | — a raised thumb and knuckles overlap in a silhouette |

The last two are pinned by `scripts/verify-logic.cjs` so they cannot silently regress into a
guess. The panel says which backend is live and states the limitation when the fallback is on.

### Weights

The landmark model is **not** committed. Fetch it once with:

```bash
npm run vendor:model   # → public/vendor/{wasm,vision,models}
```

Without it the model loads from the jsDelivr CDN; without either, the engine drops to the
classical CV backend and tells you so. `public/vendor/` is git-ignored — it is a build
artefact, like `node_modules`.

## Model latency detection & automatic prebuilt fallback

The watchdog runs on the single simulation clock. If the **Custom CNN** latency stays above
the **150 ms** budget for two consecutive samples (with the watchdog armed), it:

1. raises the alert — *"High latency detected. Hot-swapping to Prebuilt Lightweight Detection
   Model (MediaPipe Default Hands Engine)"* —
2. switches the active engine, and
3. increments the hot-swap counter.

Latency / FPS / accuracy then re-derive from the active engine (`Custom_Gesture_CNN_v2` ~108–246 ms
@ 98.4 %; `MediaPipe_Prebuilt_Fallback` ~6–19 ms @ 96.1 %).

## Performance engineering (the whole point)

The dashboard is deliberately cheap so it never steals frames from your other processes:

- **One clock for the whole page** — a single 800 ms interval drives all telemetry; no per-widget timers.
- **Selector-scoped subscriptions** — widgets read the store through `useSyncExternalStore`
  selectors, so a latency tick re-renders four tiny readouts instead of the tree.
- **Frame-capped canvases** — demo scenes run at 24 fps with DPR clamped to 2, and stop when
  scrolled out of view, when the tab is hidden, or when paused.
- **Visibility-aware timers** — the log stream and every `rAF` loop tear themselves down when the
  document is hidden.
- **Compositor-only animation** — transitions animate transform/opacity; `backdrop-filter` is
  limited to the nav + transient overlays (the 29 content cards use a plain translucent fill).
- **Bounded work** — log ring buffer (60), sparkline history (48), single mounted tooltip, and
  `content-visibility: auto` on off-screen sections.
- **Cached scene backdrops** — dot-grid/chrome/gradient layers are painted once per resize and
  blitted, instead of rebuilt every frame.

Measured in headless Chromium (software rasterisation — real hardware with GPU compositing is
lower): ~50 % of one core at full animation, ~18 % paused, ~37 % steady-state with the canvas
off-screen.

## Verification

Two suites run against the real source:

```bash
npm run verify        # compiles lib/ → /tmp/logic, then 37 assertion groups against the real modules
NODE_PATH=<playwright-core> node scripts/e2e.cjs   # 42 end-to-end checks in real Chromium + CPU profiling
```

`npm run verify` covers the evaluation metrics, the latency watchdog, log generation, the
store — and the live model: pose classification (including scale, mirror and rotation
invariance), the temporal layer (hysteresis, swipe/scroll detection, the 180 ms debounce and
hold-repeat), the intent ring buffer, and **five pixel-level groups** that render the
articulated hand through a real 2D canvas and push the pixels through segmentation, hull
analysis and the classifier — 80 pose × geometry combinations in total.

Screenshots from the E2E run are saved to `screenshots/`.
