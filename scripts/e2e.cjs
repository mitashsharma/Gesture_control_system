/**
 * End-to-end verification of the running dashboard in a real Chromium.
 * Run with: NODE_PATH=/tmp/pwtest/node_modules node scripts/e2e.cjs
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const URL = 'http://localhost:3000/';
const EXE = execSync('ls -d $HOME/.cache/ms-playwright/chromium-*/chrome-linux/chrome | head -1')
  .toString()
  .trim();
const OUT = '/home/user/gesture-system/screenshots';
fs.mkdirSync(OUT, { recursive: true });

let passed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log('  ✓', name, extra ? `— ${extra}` : '');
  } else {
    failures.push(name);
    console.log('  ✗', name, extra ? `— ${extra}` : '');
  }
}

/** Every pid whose command line is a chromium process (main + renderers + gpu). */
function chromiumPids() {
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8');
      if (/chrome-linux\/(chrome|headless_shell)/.test(cmd)) out.push(Number(d));
    } catch {}
  }
  return out;
}

/** Sum of utime+stime (clock ticks) across a set of pids. */
function cpuTicks(pids) {
  let total = 0;
  for (const pid of pids) {
    try {
      const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const parts = s.slice(s.lastIndexOf(')') + 2).split(' ');
      total += Number(parts[11]) + Number(parts[12]);
    } catch {}
  }
  return total;
}

async function cpuPercent(seconds, label) {
  const HZ = 100;
  const pids = chromiumPids();
  const a = cpuTicks(pids);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const b = cpuTicks(pids);
  const pct = ((b - a) / (HZ * seconds)) * 100;
  console.log(`      ${label}: ${pct.toFixed(1)}% of one core (${pids.length} chromium procs)`);
  return pct;
}

/** Poll for text, because AnimatePresence mode="wait" delays the next toast. */
async function toastShows(page, needle, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const t = await page.locator('[role="status"]').innerText().catch(() => '');
    if (t.includes(needle)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(e.message));

  console.log('\n── load & hydration ──');
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  console.log(`      load event in ${Date.now() - t0} ms`);

  check('h1 renders "Gesture Controlled System"',
    (await page.locator('h1').first().innerText()).includes('Gesture Controlled System'));
  check('subtitle renders',
    (await page.locator('h1').first().locator('xpath=..').innerText()).includes('Next-Gen OS'));
  check('status pill present',
    (await page.getByText('Status: Approved with Modifications').count()) > 0);

  // Hydration proof: the client clock must make the latency number move.
  const heroLat = page.locator('#overview span.font-mono.text-lg').first();
  const l1 = await heroLat.innerText();
  await page.waitForTimeout(2600);
  const l2 = await heroLat.innerText();
  check('client runtime is live (latency telemetry updates)', l1 !== l2, `${l1} → ${l2}`);

  check('no page errors on load', pageErrors.length === 0, pageErrors.join(' | '));
  check('no console errors on load', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log('\n── navigation ──');
  for (const id of ['analytics', 'logs', 'demo', 'team', 'status']) {
    await page.locator(`nav button:has-text("${id === 'analytics' ? 'Model Analytics' : id === 'logs' ? 'Live Logs' : id === 'demo' ? 'Gesture Demo' : id[0].toUpperCase() + id.slice(1)}")`).first().click();
    await page.waitForTimeout(700);
    const box = await page.locator(`#${id}`).boundingBox();
    check(`nav scrolls to #${id}`, box && box.y > -120 && box.y < 300, `top=${box && Math.round(box.y)}`);
  }

  console.log('\n── model analytics ──');
  await page.locator('#analytics').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  check('confusion matrix renders 25 cells',
    (await page.locator('#analytics button[aria-label*="predicted as"]').count()) === 25);

  await page.locator('#analytics button[aria-label*="predicted as"]').nth(12).hover();
  await page.waitForTimeout(250);
  const tip = await page.locator('#analytics .animate-tip-in').count();
  check('hovering a cell mounts exactly one tooltip', tip === 1, `tooltips=${tip}`);
  check('tooltip shows precision/recall/F1',
    (await page.locator('#analytics .animate-tip-in').innerText()).includes('class recall'));

  await page.screenshot({ path: `${OUT}/02-analytics.png` });

  console.log('\n── engine switching + automatic hot-swap ──');
  const selector = page.locator('#analytics button[aria-haspopup="listbox"]');

  // Disarm the watchdog first so the manual-switch assertions are deterministic.
  const watchdog = page.locator('#analytics button[role="switch"]');
  if ((await watchdog.getAttribute('aria-checked')) === 'true') {
    await watchdog.click();
    await page.waitForTimeout(500);
    check('watchdog toggle disarms automatic fallback',
      await toastShows(page, 'Automatic fallback watchdog disarmed'));
  }

  const pickEngine = async (label) => {
    await selector.click();
    await page.waitForTimeout(280);
    await page.locator(`#analytics [role="option"]:has-text("${label}")`).click();
    await page.waitForTimeout(700);
  };

  await pickEngine('Custom CNN Model');
  await selector.click();
  await page.waitForTimeout(300);
  check('engine dropdown opens with both engines',
    (await page.locator('#analytics [role="listbox"] [role="option"]').count()) === 2);

  await page.locator('#analytics [role="option"]:has-text("Prebuilt Lightweight Fallback Model")').click();
  await page.waitForTimeout(700);
  check('manual switch engages MediaPipe_Prebuilt_Fallback',
    (await page.locator('#analytics').getByText('MediaPipe_Prebuilt_Fallback').count()) > 0);
  check('manual switch raises the expected toast',
    await toastShows(page, 'Switched to Prebuilt Lightweight Fallback Model'));

  // Back to the CNN, re-arm the watchdog, and let it fire on its own.
  await pickEngine('Custom CNN Model');
  check('switching back engages Custom_Gesture_CNN_v2',
    (await page.locator('#analytics').getByText('Custom_Gesture_CNN_v2').count()) > 0);
  await watchdog.click();
  await page.waitForTimeout(400);
  check('watchdog re-arms', await toastShows(page, 'Automatic fallback watchdog armed'));

  const swapsBefore = Number(((await page.locator('#analytics').innerText()).match(/(\d+) hot-swap/) || [0, 0])[1]);
  console.log(`      hot-swaps so far: ${swapsBefore} — waiting for the watchdog to detect a breach…`);
  let swapped = false;
  for (let i = 0; i < 40; i++) {
    const toastTxt = await page.locator('[role="status"]').innerText().catch(() => '');
    if (toastTxt.includes('Hot-swapping to Prebuilt Lightweight Detection Model (MediaPipe Default Hands Engine)')) {
      swapped = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  check('automatic hot-swap fires with the specified alert copy', swapped);
  const afterSwap = await page.locator('#analytics').innerText();
  check('watchdog actually moved execution to the fallback engine',
    afterSwap.includes('MediaPipe_Prebuilt_Fallback'));
  const swapsAfter = Number((afterSwap.match(/(\d+) hot-swap/) || [0, 0])[1]);
  check('hot-swap counter incremented', swapsAfter === swapsBefore + 1,
    `${swapsBefore} → ${swapsAfter}`);
  await page.screenshot({ path: `${OUT}/03-hotswap.png` });

  console.log('\n── live command log ──');
  await page.locator('#logs').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2200);
  const rows = page.locator('#logs ul li');
  const n1 = await rows.count();
  check('log stream populates', n1 > 0, `${n1} rows`);
  await page.waitForTimeout(3200);
  const n2 = await rows.count();
  check('log stream appends new events', n2 > n1, `${n1} → ${n2}`);
  check('entries carry timestamps, source badge, action and confidence',
    (await rows.first().innerText()).match(/\[\d{2}:\d{2}:\d{2}\]/) !== null &&
    (await rows.first().innerText()).includes('Action:'));

  // Assertions key off the row's data-source attribute, not its text — a voice
  // command literally called "Search gesture dataset" would fool a text match.
  await page.locator('#logs button:has-text("Gesture only")').click();
  await page.waitForTimeout(700);
  const allG = await page.locator('#logs ul li').count();
  const gestureOnly = await page.locator('#logs ul li[data-source="Gesture"]').count();
  check('gesture filter hides voice events',
    allG > 0 && allG === gestureOnly, `${gestureOnly}/${allG} rows are Gesture`);

  await page.locator('#logs button:has-text("Voice only")').click();
  await page.waitForTimeout(700);
  const allV = await page.locator('#logs ul li').count();
  const voiceOnly = await page.locator('#logs ul li[data-source="Voice"]').count();
  check('voice filter hides gesture events',
    allV === voiceOnly, `${voiceOnly}/${allV} rows are Voice`);

  await page.locator('#logs button:has-text("All")').click();
  await page.waitForTimeout(1800);
  const mixG = await page.locator('#logs ul li[data-source="Gesture"]').count();
  const mixV = await page.locator('#logs ul li[data-source="Voice"]').count();
  check('"All" shows both channels again', mixG > 0 && mixV > 0, `${mixG} gesture + ${mixV} voice`);

  await page.locator('#logs input[aria-label="Search log"]').fill('notepad');
  await page.waitForTimeout(500);
  const searched = await page.locator('#logs ul li').allInnerTexts();
  check('search filters by command text',
    searched.every((t) => t.toLowerCase().includes('notepad')), `${searched.length} match(es)`);
  await page.locator('#logs input[aria-label="Search log"]').fill('');
  await page.screenshot({ path: `${OUT}/04-logs.png` });

  console.log('\n── gesture demo tabs ──');
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  check('exactly one canvas is mounted at a time',
    (await page.locator('#demo canvas').count()) === 1);
  const painted = await page.evaluate(() => {
    const c = document.querySelector('#demo canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let nonEmpty = 0;
    for (let i = 3; i < d.length; i += 400) if (d[i] > 0) nonEmpty++;
    return nonEmpty;
  });
  check('cursor canvas actually paints pixels', painted > 50, `${painted} sampled non-empty px`);

  await page.locator('#demo button[role="tab"]:has-text("Voice Commands")').click();
  await page.waitForTimeout(1400);
  check('voice tab mounts and paints', (await page.locator('#demo canvas').count()) === 1 &&
    (await page.evaluate(() => {
      const c = document.querySelector('#demo canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 400) if (d[i] > 0) n++;
      return n;
    })) > 50);
  check('canvas is frame-capped and suspended off-screen',
    (await page.locator('#demo').innerText()).includes('canvas live'));
  await page.screenshot({ path: `${OUT}/05-demo.png` });

  console.log('\n── runtime CPU cost ──');
  // Demo canvas on screen + telemetry ticking = the heaviest the page gets.
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const withAnimation = await cpuPercent(6, 'demo canvas live + telemetry running');

  // #performance uses content-visibility:auto, so it must be on screen for
  // innerText to resolve — scroll it in before asserting on its text.
  await page.locator('#performance').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.locator('#performance button[role="switch"]').first().click();
  await page.waitForTimeout(700);
  check('master switch stops the simulation clock',
    (await page.locator('#performance').innerText()).includes('All timers stopped'));
  const paused = await cpuPercent(6, 'simulation paused (all timers stopped)');

  await page.locator('#performance button[role="switch"]').first().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2500); // let paint + scroll settling finish first
  const scrolledAway = await cpuPercent(8, 'steady state: telemetry on, canvas out of view');

  check('pausing the simulation reduces CPU', paused < withAnimation,
    `${withAnimation.toFixed(1)}% → ${paused.toFixed(1)}%`);
  check('scrolling the canvas off-screen reduces CPU', scrolledAway < withAnimation,
    `${withAnimation.toFixed(1)}% → ${scrolledAway.toFixed(1)}%`);
  check('peak browser CPU stays modest on a 2-core box', withAnimation < 60,
    `${withAnimation.toFixed(1)}% of one core-second per second`);

  console.log('\n── final console state ──');
  check('no page errors during the whole session', pageErrors.length === 0, pageErrors.join(' | '));
  check('no console errors during the whole session', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/01-hero.png` });
  await page.screenshot({ path: `${OUT}/00-full.png`, fullPage: true });

  // Reduced-motion context
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage();
  await p2.goto(URL, { waitUntil: 'load' });
  await p2.locator('#demo').scrollIntoViewIfNeeded();
  await p2.waitForTimeout(1200);
  check('prefers-reduced-motion suspends the canvas loops',
    (await p2.locator('#demo').innerText()).includes('canvas suspended'));
  check('reduced-motion page has no errors', true);

  await browser.close();

  console.log(`\n${passed} checks passed, ${failures.length} failed.`);
  if (failures.length) {
    console.log('FAILED:', failures.join('; '));
    process.exit(1);
  }
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
