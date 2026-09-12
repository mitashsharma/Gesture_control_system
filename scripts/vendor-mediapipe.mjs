/**
 * Vendors the MediaPipe assets the live model needs, so it can run with no
 * network access at all.
 *
 *   npm run vendor:model
 *
 * Copies from node_modules:
 *   @mediapipe/tasks-vision/wasm/*        → public/vendor/wasm/
 *   @mediapipe/tasks-vision/vision_bundle → public/vendor/vision/
 * Downloads:
 *   hand_landmarker.task (7.5 MB)         → public/vendor/models/
 *
 * Everything it writes is git-ignored: it is a build artefact, regenerated on
 * demand, exactly like node_modules. Without it the live model falls back to
 * the jsDelivr CDN, and if that fails too it drops to the classical CV backend.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'vendor');

const MODEL_FILE = 'hand_landmarker.task';
const MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
];

const force = process.argv.includes('--force');
const skipModel = process.argv.includes('--no-model');

/* ---- the pinned version lives in lib/liveEngine.ts, next to the CDN URLs ---- */
const engine = readFileSync(join(ROOT, 'lib', 'liveEngine.ts'), 'utf8');
const pinned = /MEDIAPIPE_VERSION\s*=\s*'([^']+)'/.exec(engine)?.[1];
if (!pinned) {
  console.error('✗ could not read MEDIAPIPE_VERSION from lib/liveEngine.ts');
  process.exit(1);
}

// The package's `exports` map hides ./package.json from require.resolve, so it
// is read straight off disk. The dependency is optional — the CDN path works
// without it.
const pkgJsonPath = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'package.json');
const installed = existsSync(pkgJsonPath)
  ? JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version
  : null;
if (installed && installed !== pinned) {
  console.warn(
    `! lib/liveEngine.ts pins @mediapipe/tasks-vision@${pinned} but node_modules has ${installed}.\n` +
      '  They must match, or the CDN and the vendored copy will disagree.',
  );
}

const pkgDir = installed ? dirname(pkgJsonPath) : null;

function copy(from, to) {
  if (existsSync(to) && !force) {
    console.log('  · already there:', to.replace(ROOT + '/', ''));
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log('  ✓', to.replace(ROOT + '/', ''));
}

console.log(`\nvendoring MediaPipe tasks-vision ${pinned}\n`);

if (!pkgDir) {
  console.log('  ! @mediapipe/tasks-vision is not installed — skipping the local copy.');
  console.log('    Run `npm install` first, or let the live model use the CDN.\n');
} else {
  const wasmDir = join(pkgDir, 'wasm');
  const { readdirSync } = require('node:fs');
  for (const file of readdirSync(wasmDir)) {
    copy(join(wasmDir, file), join(OUT, 'wasm', file));
  }
  for (const file of ['vision_bundle.mjs', 'vision_bundle.cjs']) {
    if (existsSync(join(pkgDir, file))) copy(join(pkgDir, file), join(OUT, 'vision', file));
  }
}

if (!skipModel) {
  const dest = join(OUT, 'models', MODEL_FILE);
  if (existsSync(dest) && !force) {
    console.log('  · already there:', dest.replace(ROOT + '/', ''));
  } else {
    let done = false;
    for (const url of MODEL_URLS) {
      try {
        process.stdout.write(`  ↓ ${url}\n`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1_000_000) throw new Error(`only ${buf.length} bytes — not a model`);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, buf);
        console.log(`  ✓ ${dest.replace(ROOT + '/')} (${(buf.length / 1e6).toFixed(2)} MB)`);
        done = true;
        break;
      } catch (err) {
        console.log(`    failed: ${err.message}`);
      }
    }
    if (!done) {
      console.log(
        '\n  ! The landmark model could not be downloaded (offline?).\n' +
          '    The live model will use the classical CV backend instead, or you can\n' +
          `    drop a copy of ${MODEL_FILE} into public/vendor/models/ yourself.\n`,
      );
    }
  }
}

console.log('');
