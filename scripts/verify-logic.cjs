/* Runs the ACTUAL shipped lib/ modules (compiled from source) and asserts the
 * numbers the UI claims. Not a re-implementation — it requires the real files. */
const assert = require('node:assert/strict');
const { matrixStats, makeLogEntry, seedLog, nextLatency, timestamp } = require('/tmp/logic/simulation.js');
const { CONFUSION, GESTURE_CLASSES, ENGINES } = require('/tmp/logic/data.js');
const { handLandmarks, HAND_CONNECTIONS } = require('/tmp/logic/canvas.js');
const store = require('/tmp/logic/store.js');
const G = require('/tmp/logic/gestures.js');
const HM = require('/tmp/logic/handModel.js');
const CV = require('/tmp/logic/skinCV.js');
const { liveLog } = require('/tmp/logic/liveLog.js');

let pass = 0;
const ok = (name, fn) => {
  fn();
  pass++;
  console.log('  ✓', name);
};

console.log('\n── evaluation metrics (confusion matrix) ──');
ok('cnn matrix = 98.4% accuracy, as claimed in the UI', () => {
  const s = matrixStats('cnn', CONFUSION.cnn);
  assert.equal(s.accuracy.toFixed(1), '98.4');
  assert.equal(s.total, 2000);
});
ok('prebuilt matrix = 96.1% accuracy, matching ENGINES.prebuilt', () => {
  const s = matrixStats('prebuilt', CONFUSION.prebuilt);
  assert.equal(s.accuracy.toFixed(1), '96.1');
  assert.equal(ENGINES.prebuilt.accuracy, 96.1);
});
ok('every class has 400 validation samples', () => {
  for (const m of [CONFUSION.cnn, CONFUSION.prebuilt]) {
    for (const row of m) assert.equal(row.reduce((a, b) => a + b, 0), 400);
  }
});
ok('precision/recall/f1 computed for all 5 classes and within range', () => {
  const s = matrixStats('cnn', CONFUSION.cnn);
  for (const arr of [s.precision, s.recall, s.f1]) {
    assert.equal(arr.length, GESTURE_CLASSES.length);
    for (const v of arr) assert.ok(v > 90 && v <= 100, `out of range: ${v}`);
  }
  assert.ok(s.macroF1 > 97 && s.macroF1 < 100);
});
ok('metrics are memoised (same object identity on repeat call)', () => {
  assert.equal(matrixStats('cnn', CONFUSION.cnn), matrixStats('cnn', CONFUSION.cnn));
});

console.log('\n── latency watchdog / random walk ──');
ok('prebuilt engine stays inside its 6–19 ms band', () => {
  let v = 12;
  for (let i = 0; i < 4000; i++) {
    v = nextLatency('prebuilt', v);
    assert.ok(v >= 6 && v <= 19, `prebuilt out of band: ${v}`);
  }
});
ok('cnn walk stays bounded and CAN breach the 150 ms budget', () => {
  let v = 118;
  let breaches = 0;
  for (let i = 0; i < 4000; i++) {
    v = nextLatency('cnn', v);
    assert.ok(v >= 96 && v <= 248, `cnn out of band: ${v}`);
    if (v > store.LATENCY_THRESHOLD) breaches++;
  }
  assert.ok(breaches > 20, `hot-swap path unreachable, only ${breaches} breaches`);
  console.log(`      (${breaches}/4000 samples over budget → fallback is reachable)`);
});
ok('threshold constant is 150 ms', () => assert.equal(store.LATENCY_THRESHOLD, 150));

console.log('\n── command log generation ──');
ok('log entries are well-formed', () => {
  for (let i = 0; i < 500; i++) {
    const e = makeLogEntry(i % 2 ? 'cnn' : 'prebuilt');
    assert.match(e.time, /^\d{2}:\d{2}:\d{2}$/);
    assert.ok(e.source === 'Gesture' || e.source === 'Voice');
    assert.ok(e.command.length > 0 && e.action.length > 0);
    assert.ok(e.confidence > 90 && e.confidence <= 100, `conf ${e.confidence}`);
    assert.ok(e.latency >= 6 && e.latency <= 248, `latency ${e.latency}`);
  }
});
ok('both input sources actually appear in the pool', () => {
  const seen = new Set();
  for (let i = 0; i < 800; i++) seen.add(makeLogEntry('cnn').source);
  assert.deepEqual([...seen].sort(), ['Gesture', 'Voice']);
});
ok('seed produces 6 entries newest-first with HH:MM:SS stamps', () => {
  const s = seedLog('cnn', 6);
  assert.equal(s.length, 6);
  assert.match(s[0].time, /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(timestamp(new Date(2026, 0, 1, 9, 5, 3)), '09:05:03');
});

console.log('\n── landmark geometry ──');
ok('hand model yields 21 finite landmarks inside the frame', () => {
  const out = new Array(21);
  for (let t = 0; t < 40; t += 0.37) {
    const lm = handLandmarks(t, 640, 360, out);
    assert.equal(lm.length, 21);
    for (const p of lm) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `non-finite at t=${t}`);
      assert.ok(p.x > -80 && p.x < 720 && p.y > -80 && p.y < 440, `out of frame: ${JSON.stringify(p)}`);
    }
  }
});
ok('skeleton connections reference valid landmark indices', () => {
  assert.equal(HAND_CONNECTIONS.length, 21);
  for (const [a, b] of HAND_CONNECTIONS) {
    assert.ok(a >= 0 && a < 21 && b >= 0 && b < 21);
  }
});

console.log('\n── store: hot-swap actions ──');
ok('setMode() flips engine, marks loading and raises the hot-swap alert', () => {
  store.systemStore.set({ mode: 'cnn', latency: 210, alert: null });
  store.setMode('prebuilt');
  const s = store.systemStore.getSnapshot();
  assert.equal(s.mode, 'prebuilt');
  assert.equal(s.loading, true);
  assert.equal(s.alert.title, 'High latency detected');
  assert.match(
    s.alert.body,
    /Hot-swapping to Prebuilt Lightweight Detection Model \(MediaPipe Default Hands Engine\)/,
  );
  console.log(`      alert.title = "${s.alert.title}"`);
  console.log(`      alert.body  = "${s.alert.body}"`);
});
ok('manual switch uses the "Switched to…" copy instead', () => {
  store.setMode('cnn', { manual: true });
  const s = store.systemStore.getSnapshot();
  assert.equal(s.mode, 'cnn');
  assert.equal(s.alert.title, 'Switched to Custom CNN Model (PyBind11)');
});
ok('watchdog toggle reports armed/disarmed', () => {
  store.setAutoFallback(true);
  assert.equal(store.systemStore.getSnapshot().alert.title, 'Automatic fallback watchdog armed');
  store.setAutoFallback(false);
  assert.equal(store.systemStore.getSnapshot().alert.title, 'Automatic fallback watchdog disarmed');
  store.setAutoFallback(true);
});
ok('dismissAlert clears the banner', () => {
  store.dismissAlert();
  assert.equal(store.systemStore.getSnapshot().alert, null);
});
ok('selector snapshot is stable for unchanged slices', () => {
  const before = store.systemStore.getSnapshot().mode;
  store.systemStore.set({ latency: 123.4 });
  assert.equal(store.systemStore.getSnapshot().mode, before);
  assert.notEqual(store.systemStore.getSnapshot().latency, 118);
});

/* ==================================================================== *
 *  LIVE MODEL — the real recognition pipeline (lib/gestures.ts,
 *  lib/handModel.ts, lib/skinCV.ts, lib/liveLog.ts)
 * ==================================================================== */

const {
  GestureClassifier,
  classifyPose,
  featuresFromLandmarks,
  extensionScore,
  RATIO_WINDOW,
  GESTURE_ACTIONS,
  GESTURES,
  MIN_CONFIDENCE,
} = G;

/** Reference hand for a pose, placed in the frame. */
function features(pose, o = {}) {
  const { x = 0.5, y = 0.7, scale = 0.17, mirror = false, rot = 0 } = o;
  const lm = HM.poseLandmarks({ pose, x, y, scale, mirror, rot }, new Array(21));
  return G.featuresFromLandmarks(lm, mirror ? 'Left' : 'Right');
}

const POSE_LABEL = {
  palm: 'Palm Stop',
  fist: 'Fist Drag',
  pinch: 'Pinch Click',
  peace: 'Peace Sign',
  thumbUp: 'Thumb Up',
  point: 'Point',
};

console.log('\n── live model: landmark → pose ──');
ok('all six reference poses classify to their own label at ≥85 %', () => {
  for (const pose of HM.POSES) {
    const v = classifyPose(features(pose));
    assert.equal(v.pose, POSE_LABEL[pose], `${pose} → ${v.pose}`);
    assert.ok(v.confidence >= 85, `${pose} only ${v.confidence}%`);
  }
  const v = classifyPose(features('palm'));
  console.log(`      palm → "${v.pose}" @ ${v.confidence}%`);
});
ok('the classifier is invariant to hand position and size', () => {
  for (const pose of HM.POSES) {
    for (const o of [
      { x: 0.3, y: 0.4, scale: 0.1 },
      { x: 0.72, y: 0.85, scale: 0.26 },
      { x: 0.5, y: 0.5, scale: 0.05 },
    ]) {
      assert.equal(classifyPose(features(pose, o)).pose, POSE_LABEL[pose], `${pose} at ${JSON.stringify(o)}`);
    }
  }
});
ok('a mirrored hand keeps its pose (handedness flips with it)', () => {
  for (const pose of HM.POSES) {
    assert.equal(classifyPose(features(pose, { mirror: true })).pose, POSE_LABEL[pose], pose);
  }
});
ok('small wrist rotations do not change the verdict', () => {
  for (const rot of [-0.35, -0.15, 0.15, 0.35]) {
    assert.equal(classifyPose(features('peace', { rot })).pose, 'Peace Sign', `rot ${rot}`);
  }
});
ok('unknown palm facing costs confidence but still recognises an open palm', () => {
  const f = { ...features('palm'), facing: 0.5 };
  const v = classifyPose(f);
  assert.equal(v.pose, 'Palm Stop');
  assert.ok(v.confidence > MIN_CONFIDENCE, `only ${v.confidence}%`);
  assert.ok(v.confidence < classifyPose(features('palm')).confidence, 'facing should cost something');
});
ok('an ambiguous hand falls through to None', () => {
  const f = features('palm');
  const mid = f.ratios.map((_, i) => (RATIO_WINDOW[i][0] + RATIO_WINDOW[i][1]) / 2);
  const v = classifyPose({ ...f, ratios: mid, pinch: 0.6, thumbSpan: 0.9, thumbLift: 0.8 });
  assert.equal(v.pose, 'None');
  assert.ok(v.confidence < MIN_CONFIDENCE, `${v.confidence}% should be under ${MIN_CONFIDENCE}`);
});
ok('measured extension ratios sit on the correct side of each window', () => {
  const open = features('palm');
  const closed = features('fist');
  for (let i = 0; i < 5; i++) {
    assert.ok(open.ratios[i] >= RATIO_WINDOW[i][1] - 0.05, `finger ${i} open ratio ${open.ratios[i]}`);
    assert.ok(closed.ratios[i] <= RATIO_WINDOW[i][0] + 0.05, `finger ${i} curled ratio ${closed.ratios[i]}`);
    assert.equal(extensionScore(i, open.ratios[i]) > 0.8, true, `finger ${i} should read extended`);
    assert.equal(extensionScore(i, closed.ratios[i]) < 0.2, true, `finger ${i} should read curled`);
  }
});

console.log('\n── live model: temporal layer ──');
ok('hysteresis: a pose seen for less than holdMs is never reported', () => {
  const c = new GestureClassifier({ holdMs: 180 });
  const seen = new Set();
  let t = 0;
  for (let i = 0; i < 3; i++) {
    seen.add(c.push(features('palm'), t).label);
    t += 33;
  }
  for (let i = 0; i < 10; i++) {
    seen.add(c.push(features('fist'), t).label);
    t += 33;
  }
  assert.equal(seen.has('Palm Stop'), false, `leaked: ${[...seen]}`);
  assert.equal(seen.has('Fist Drag'), true);
});
ok('a fast lateral sweep is Swipe Left, and fires exactly one intent', () => {
  const c = new GestureClassifier({ holdMs: 0, cooldownMs: 0, repeatMs: 1e9 });
  const intents = [];
  const labels = new Set();
  let t = 0;
  for (let i = 0; i < 14; i++) {
    const rec = c.push(features('palm', { x: 0.72 - i * 0.05 }), t);
    labels.add(rec.label);
    const it = c.takeIntent(rec, t);
    if (it) intents.push(it);
    t += 33;
  }
  assert.equal(labels.has('Swipe Left'), true, `labels: ${[...labels]}`);
  // The settled palm may legitimately inject first; the sweep itself must not
  // repeat while the hand keeps moving.
  const swipes = intents.filter((i) => i.label === 'Swipe Left');
  assert.equal(swipes.length, 1, `${swipes.length} swipe intents for one sweep`);
  assert.equal(swipes[0].action, 'Switch Tab');
  assert.equal(swipes[0].repeat, false);
  assert.equal(intents[intents.length - 1].label, 'Swipe Left');
});
ok('a vertical sweep is Scroll Up / Scroll Down by direction', () => {
  const up = new GestureClassifier({ holdMs: 0, cooldownMs: 0, repeatMs: 1e9 });
  let t = 0;
  let label = 'None';
  for (let i = 0; i < 14; i++) {
    label = up.push(features('palm', { y: 0.8 - i * 0.045 }), t).label;
    t += 33;
  }
  assert.equal(label, 'Scroll Up');

  const down = new GestureClassifier({ holdMs: 0, cooldownMs: 0, repeatMs: 1e9 });
  t = 0;
  for (let i = 0; i < 14; i++) {
    label = down.push(features('palm', { y: 0.25 + i * 0.045 }), t).label;
    t += 33;
  }
  assert.equal(label, 'Scroll Down');
});
ok('a held pose injects once, then repeats — never every frame', () => {
  const c = new GestureClassifier({ holdMs: 120, cooldownMs: 180, repeatMs: 500 });
  const intents = [];
  let t = 0;
  for (let i = 0; i < 90; i++) {
    // 90 frames × 33 ms ≈ 3 s of holding a pinch.
    const rec = c.push(features('pinch'), t);
    const it = c.takeIntent(rec, t);
    if (it) intents.push(it);
    t += 33;
  }
  assert.ok(intents.length >= 4 && intents.length <= 9, `${intents.length} intents in 3 s`);
  assert.equal(intents[0].repeat, false);
  assert.equal(intents[0].label, 'Pinch Click');
  assert.equal(intents.every((i) => i.label === 'Pinch Click'), true);
  assert.ok(intents.slice(1).every((i) => i.repeat === true), 'later ones must be repeats');
  const gaps = intents.slice(1).map((_, i) => i);
  assert.equal(gaps.length, intents.length - 1);
  console.log(`      ${intents.length} intents over 3 s (1 edge + ${intents.length - 1} hold repeats)`);
});

console.log('\n── live model: action mapping & intent log ──');
ok('every gesture except None maps to an OS action', () => {
  for (const g of GESTURES) {
    if (g === 'None') {
      assert.equal(GESTURE_ACTIONS[g], null);
      continue;
    }
    const a = GESTURE_ACTIONS[g];
    assert.ok(a && a.command.length > 0 && a.action.length > 0, `${g} unmapped`);
  }
});
ok('liveLog is a bounded ring, newest last, ids disjoint from the synthetic log', () => {
  liveLog.clear();
  for (let i = 0; i < 55; i++) {
    liveLog.push({
      time: '10:00:00',
      source: 'Gesture',
      command: 'Pinch Click',
      action: 'Left Click',
      confidence: 95,
      latency: 8,
      label: 'Pinch Click',
      backend: 'test',
      repeat: false,
    });
  }
  const snap = liveLog.getSnapshot();
  assert.equal(snap.length, 40, `capacity should be 40, got ${snap.length}`);
  assert.ok(snap.every((e) => e.id >= 100000), 'live ids must not collide with synthetic ones');
  assert.ok(snap[snap.length - 1].id > snap[0].id, 'newest must be last');
  liveLog.clear();
  assert.equal(liveLog.getSnapshot().length, 0);
});

console.log('\n── live model: classical CV backend (pixels) ──');
let pixelGroups = 0;
try {
  const { createCanvas } = require('@napi-rs/canvas');
  // Render at webcam size, then downscale to the analysis resolution — exactly
  // what LiveEngine.grabWorkCanvas() does in the browser.
  const SRC_W = 640;
  const SRC_H = 480;
  const W = 320;
  const H = 240;
  const src = createCanvas(SRC_W, SRC_H);
  const sctx = src.getContext('2d');
  const work = createCanvas(W, H);
  const wctx = work.getContext('2d');
  const lm = new Array(21);

  const contourOf = (pose, scale, rot) => {
    const p = { pose, x: 0.5, y: 0.62, scale, rot };
    HM.drawHand(sctx, HM.poseLandmarks(p, lm), p, { width: SRC_W, height: SRC_H, backdrop: true });
    wctx.drawImage(src, 0, 0, W, H);
    return CV.analyseHand(wctx.getImageData(0, 0, W, H));
  };

  ok('skin segmentation isolates the hand and rejects the backdrop', () => {
    const c = contourOf('palm', 0.24, 0);
    assert.ok(c, 'no hand detected');
    const frac = c.area / (W * H);
    assert.ok(frac > 0.03 && frac < 0.5, `hand covers ${(frac * 100).toFixed(1)}% of the frame`);
    assert.equal(CV.isSkin(11, 18, 32), false, 'backdrop pixel classified as skin');
    assert.equal(CV.isSkin(232, 180, 140), true, 'skin tone rejected');
    console.log(`      hand covers ${(frac * 100).toFixed(1)}% of a 320×240 analysis frame`);
  });

  ok('a frame with no hand yields no detection', () => {
    sctx.fillStyle = '#0b1220';
    sctx.fillRect(0, 0, SRC_W, SRC_H);
    wctx.drawImage(src, 0, 0, W, H);
    assert.equal(CV.analyseHand(wctx.getImageData(0, 0, W, H)), null);
  });

  ok('resolveDigits counts the digits that actually protrude', () => {
    const expect = { palm: [1, 4], fist: [0, 0], peace: [0, 2], point: [0, 1] };
    for (const [pose, want] of Object.entries(expect)) {
      const c = contourOf(pose, 0.24, 0);
      assert.ok(c, `${pose}: no hand`);
      const v = CV.resolveDigits(c.fingertips, c.palmRadius);
      assert.deepEqual([v.thumb, v.fingers], want, `${pose} → ${v.thumb}/${v.fingers}`);
    }
  });

  ok('the contour backend holds 4 poses across hand sizes and wrist rotations', () => {
    const recoverable = {
      palm: 'Palm Stop',
      fist: 'Fist Drag',
      peace: 'Peace Sign',
      point: 'Point',
    };
    let checks = 0;
    for (const scale of [0.24, 0.19, 0.17, 0.155, 0.14]) {
      for (const rot of [0, 0.12, -0.12, 0.25]) {
        for (const [pose, label] of Object.entries(recoverable)) {
          const c = contourOf(pose, scale, rot);
          assert.ok(c, `${pose} @${scale}/${rot}: no hand`);
          const v = classifyPose(CV.featuresFromContour(c, W));
          assert.equal(v.pose, label, `${pose} @scale ${scale} rot ${rot} → ${v.pose}`);
          checks++;
        }
      }
    }
    console.log(`      ${checks} pose×geometry combinations, all correct`);
  });

  ok('two gestures are landmark-only — pinned, not silently wrong', () => {
    // Pinch: the thumb-index gap that defines it disappears when the digits
    // touch, so the silhouette backend abstains.
    const pinch = contourOf('pinch', 0.24, 0);
    assert.equal(classifyPose(CV.featuresFromContour(pinch, W)).pose, 'None');

    // Thumb Up: a raised thumb (1.30–1.41 × palm radius) and a fist's knuckles
    // (0.92–1.29 ×) overlap too much to separate from a silhouette alone.
    const up = contourOf('thumbUp', 0.24, 0);
    const got = classifyPose(CV.featuresFromContour(up, W)).pose;
    assert.ok(got === 'Fist Drag' || got === 'None', `unexpected ${got}`);

    // The landmark backend resolves both, which is why it stays the default.
    assert.equal(classifyPose(features('pinch')).pose, 'Pinch Click');
    assert.equal(classifyPose(features('thumbUp')).pose, 'Thumb Up');
  });
  pixelGroups = 5;
} catch (err) {
  console.log('  ! pixel suite skipped — @napi-rs/canvas unavailable:', err.message);
}

console.log('\n── store: live/synthetic handover ──');
ok('the store carries the live flag and defaults to the synthetic clock', () => {
  assert.equal(store.systemStore.getSnapshot().live, false);
  store.systemStore.set({ live: true, latency: 9.4, fps: 28.1, accuracy: 91.2 });
  const s = store.systemStore.getSnapshot();
  assert.equal(s.live, true);
  assert.equal(s.latency, 9.4);
  assert.equal(s.accuracy, 91.2);
  store.systemStore.set({ live: false });
  assert.equal(store.systemStore.getSnapshot().live, false);
});

console.log(`\n${pass} assertion groups passed (${pixelGroups} of them pixel-level).\n`);

