// Smoke test, not a golden: drives the built game in Chromium with a synthetic gamepad (navigator.getGamepads override).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const ROOT = join(import.meta.dirname, '..', '..');
const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}/`;

function newestMtime(dir: string): number {
  let m = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    m = Math.max(m, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return m;
}

let browser: Browser | null = null;
let server: ChildProcess | null = null;
let skipReason = '';

try {
  browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
} catch (e) {
  skipReason = String(e);
}
const available = browser !== null && existsSync(join(ROOT, 'public', 'data'));

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('vite preview did not start');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hashCanvas = async (page: Page): Promise<string> =>
  createHash('sha1').update(await page.evaluate(() => (document.getElementById('screen') as HTMLCanvasElement).toDataURL())).digest('hex');
const setPad = (page: Page, buttons: number[], axes: number[] = [0, 0, 0, 0]) =>
  page.evaluate(([b, a]) => {
    const pad = (window as any).__pad;
    for (let i = 0; i < pad.buttons.length; i++) pad.buttons[i] = { pressed: b!.includes(i), value: b!.includes(i) ? 1 : 0 };
    pad.axes = a;
  }, [buttons, axes] as const);
const tap = async (page: Page, button: number, ms = 120) => { await setPad(page, [button]); await sleep(ms); await setPad(page, []); await sleep(ms); };

describe.skipIf(!available)('gamepad smoke test (Chromium, synthetic pad)', () => {
  beforeAll(async () => {
    const dist = join(ROOT, 'dist', 'index.html');
    if (!existsSync(dist) || statSync(dist).mtimeMs < newestMtime(join(ROOT, 'src'))) {
      const r = spawnSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' });
      if (r.status !== 0) throw new Error('pnpm build failed');
    }
    server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
    await waitForServer();
  });
  afterAll(async () => {
    await browser?.close();
    server?.kill('SIGTERM');
  });

  it('the pad confirms menus and flies the ship', async () => {
    const page = await browser!.newPage({ viewport: { width: 640, height: 480 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      const pad = { index: 0, id: 'synthetic', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
      (window as any).__pad = pad;
      navigator.getGamepads = () => [pad as unknown as Gamepad, null, null, null];
    });
    await page.goto(`${URL}?debug`);
    await page.waitForFunction(() => document.getElementById('overlay')!.textContent!.includes('Click or press'), null, { timeout: 60_000 });
    await page.keyboard.press('Space'); // the start gesture (audio context); everything after is the pad
    await page.waitForFunction(() => (document.getElementById('overlay') as HTMLElement).hidden, null, { timeout: 60_000 });

    // The intro logos end on any pad button (wait_delayorinput's joydown); then the title menu is up.
    for (let i = 0; i < 8; i++) await tap(page, 0, 150);
    await sleep(1500);
    const title = await hashCanvas(page);

    // Pad down moves the title cursor (push_joysticks_as_keyboard), A confirms: the screen changes.
    await tap(page, 13); // d-pad down
    await sleep(300);
    const moved = await hashCanvas(page);
    expect(moved, 'd-pad down moved the menu cursor').not.toBe(title);
    await tap(page, 12); // d-pad up: back on New Game
    await tap(page, 0);
    await sleep(1000);
    const afterConfirm = await hashCanvas(page);
    expect(afterConfirm, 'A confirmed New Game').not.toBe(title);

    // Episode, difficulty, then the game menu: down to "Start Level" and confirm, all with the pad.
    for (let i = 0; i < 3; i++) await tap(page, 0, 250);
    await sleep(1500);
    for (let i = 0; i < 4; i++) await tap(page, 13, 250);
    await tap(page, 0, 250);
    for (let i = 0; i < 4; i++) { await sleep(1500); await tap(page, 0, 150); } // story text, if any
    await sleep(3000);
    if (process.env.E2E_SHOTS) await page.screenshot({ path: process.env.E2E_SHOTS + '/level.png' });

    // In the level: the ship holds still with a neutral stick and moves right / left with the left stick.
    const shipX = () => page.evaluate(() => (window as any).__ot.game.players[0].x as number);
    await setPad(page, []);
    await sleep(600);
    const still = [await shipX()];
    await sleep(600);
    still.push(await shipX());
    expect(still[1], 'neutral stick: the ship holds still').toBe(still[0]);
    const levelHash = await hashCanvas(page);
    await setPad(page, [], [0.9, 0, 0, 0]);
    await sleep(1200);
    const right = await shipX();
    expect(right, 'stick right moved the ship right').toBeGreaterThan(still[1]!);
    await setPad(page, [], [-0.9, 0, 0, 0]);
    await sleep(1800);
    const left = await shipX();
    expect(left, 'stick left moved it back').toBeLessThan(right);
    // Hot-unplug with the stick held: the ship holds still and nothing throws.
    await setPad(page, [0], [0.9, 0, 0, 0]);
    await page.evaluate(() => { navigator.getGamepads = () => []; });
    await sleep(300);
    const afterUnplug = await shipX();
    await sleep(700);
    expect(await shipX(), 'unplugged: the ship holds still').toBe(afterUnplug);
    expect(await hashCanvas(page), 'the level is running').not.toBe(levelHash);
    expect(errors).toEqual([]);
    await page.close();
  });
});

if (!available) console.warn(`gamepad e2e skipped: ${skipReason || 'public/data missing'}`);
