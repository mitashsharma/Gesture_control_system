/* Runs the ACTUAL shipped lib/ modules (compiled from source) and asserts the
 * numbers the UI claims. Not a re-implementation — it requires the real files. */
const assert = require('node:assert/strict');
const { matrixStats, makeLogEntry, seedLog, nextLatency, timestamp } = require('/tmp/logic/simulation.js');
const { CONFUSION, GESTURE_CLASSES, ENGINES } = require('/tmp/logic/data.js');
const { handLandmarks, HAND_CONNECTIONS } = require('/tmp/logic/canvas.js');
const store = require('/tmp/logic/store.js');

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

console.log(`\n${pass} assertions groups passed.\n`);
