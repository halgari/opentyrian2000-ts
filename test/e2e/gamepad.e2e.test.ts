// Smoke test, not a golden: drives the built game in Chromium with a synthetic gamepad (navigator.getGamepads override).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
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

// Decide the skip without launching anything: a launched Chromium would outlive a skipped suite.
const chromiumPath = process.env.PW_CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath());
const skipReason = !existsSync(chromiumPath) ? `no Chromium at ${chromiumPath}` : !existsSync(join(ROOT, 'public', 'data')) ? 'public/data missing' : '';
const available = skipReason === '';

function portInUse(): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ port: PORT, host: '127.0.0.1' });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (server?.exitCode != null) throw new Error(`vite preview exited with code ${server.exitCode}`);
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
    if (await portInUse()) throw new Error(`port ${PORT} is already in use; stop whatever is listening there (a stale vite preview?) and rerun`);
    // node + vite's own entry point, so the ChildProcess is the server itself (no pnpm/sh wrapper to leave a child behind)
    server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
      { cwd: ROOT, stdio: 'ignore' });
    await waitForServer();
    browser = await chromium.launch({ executablePath: chromiumPath, args: ['--autoplay-policy=no-user-gesture-required'] });
  });
  afterAll(async () => {
    await browser?.close();
    if (server && server.exitCode === null) {
      const gone = new Promise<void>((r) => server!.once('exit', () => r()));
      server.kill('SIGTERM');
      await Promise.race([gone, sleep(3000)]);
      if (server.exitCode === null) server.kill('SIGKILL');
    }
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

  it('shared keyboard 2P: KeyJ moves ship 2, ArrowRight moves ship 1', async () => {
    const page = await browser!.newPage({ viewport: { width: 640, height: 480 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // opentyrian.cfg with the extension on (the Setup toggle writes the same field)
    await page.addInitScript(() => {
      if (!localStorage.getItem('opentyrian.opentyrian.cfg.json')) localStorage.setItem('opentyrian.opentyrian.cfg.json', JSON.stringify({ version: 1, sharedKeyboard: true }));
    });
    await page.goto(`${URL}?debug`);
    await page.waitForFunction(() => document.getElementById('overlay')!.textContent!.includes('Click or press'), null, { timeout: 60_000 });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => (document.getElementById('overlay') as HTMLElement).hidden, null, { timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__ot?.game, null, { timeout: 60_000 });
    const key = async (code: string, ms = 150) => { await page.keyboard.press(code); await sleep(ms); };
    const shot = async (name: string) => { if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png` }); };
    expect(await page.evaluate(() => (window as any).__ot.game.config.sharedKeyboard), 'extension loaded from opentyrian.cfg').toBe(true);

    for (let i = 0; i < 8; i++) await key('Enter', 150); // intro logos
    await sleep(1500);
    await key('Enter', 1000); // New Game
    for (let i = 0; i < 3; i++) await key('ArrowDown', 250); // 2 Player Arcade
    await key('Enter', 1000);
    await shot('p1-after-gameplay');
    await key('Enter', 1000); // episode
    await key('Enter', 1000); // difficulty
    await sleep(1500);
    await shot('p2-shop');
    // Shop 2P menu: row 3 / row 4 are the two input devices. Cycle player 2 onto Keyboard 2 (the cycle swaps without pads).
    await key('ArrowDown', 250); await key('ArrowDown', 250);
    await key('ArrowRight', 250);
    await key('ArrowUp', 250);
    await key('ArrowRight', 250); await key('ArrowRight', 250);
    await shot('p3-devices');
    expect(await page.evaluate(() => Array.from((window as any).__ot.game.config.inputDevice)), 'player 1 keyboard 1, player 2 keyboard 2').toEqual([1, 0x80]);
    await key('ArrowUp', 250); // row 2: Start Level
    await key('Enter', 1500);
    await shot('p3b-start');
    await sleep(2500);
    await shot('p3c-start');
    await sleep(3000);
    await shot('p4-level');

    const ships = () => page.evaluate(() => (window as any).__ot.game.players.map((p: any) => [p.x, p.y]) as number[][]);
    const hold = async (codes: string[], ms: number) => {
      for (const c of codes) await page.keyboard.down(c);
      await sleep(ms);
      for (const c of codes) await page.keyboard.up(c);
      await sleep(200);
    };
    // wait for the level to settle (ships stop at their start positions)
    for (let i = 0; i < 20; i++) {
      const a = JSON.stringify(await ships()); await sleep(500);
      if (a === JSON.stringify(await ships())) break;
    }
    const before = await ships();
    // The ships start linked (two-player.c): player 1's sidekick key (map A, left Ctrl) unlinks them for as long as it is held.
    await hold(['ControlLeft', 'KeyJ'], 600);
    const afterD = await ships();
    expect(afterD[1]![0], 'KeyJ moved ship 2 right').toBeGreaterThan(before[1]![0]!);
    expect(afterD[0]![0], 'KeyJ left ship 1 alone').toBe(before[0]![0]);
    const h1 = await hashCanvas(page);
    await hold(['ArrowRight'], 600);
    const afterR = await ships();
    expect(afterR[0]![0], 'ArrowRight moved ship 1 right').toBeGreaterThan(afterD[0]![0]!);
    expect(afterR[1]![0], 'ArrowRight left ship 2 alone').toBe(afterD[1]![0]);
    expect(await hashCanvas(page), 'the canvas changed').not.toBe(h1);
    expect(errors).toEqual([]);
    await page.close();
  });
});

if (!available) console.warn(`gamepad e2e skipped: ${skipReason}`);
