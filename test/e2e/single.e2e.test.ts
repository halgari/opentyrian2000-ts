// Smoke test for the single-file build opened from file:// (Chromium). Skipped without Chromium or dist-single/tyrian.html.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const ROOT = join(import.meta.dirname, '..', '..');
const FILE = join(ROOT, 'dist-single', 'tyrian.html');
const chromiumPath = process.env.PW_CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath());
const skipReason = !existsSync(chromiumPath) ? `no Chromium at ${chromiumPath}` : !existsSync(FILE) ? 'dist-single/tyrian.html missing (pnpm build:single)' : '';
const available = skipReason === '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hashCanvas = async (page: Page): Promise<string> =>
  createHash('sha1').update(await page.evaluate(() => (document.getElementById('screen') as HTMLCanvasElement).toDataURL())).digest('hex');

let browser: Browser | null = null;
beforeAll(async () => {
  if (available) browser = await chromium.launch({ executablePath: chromiumPath, args: ['--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
});
afterAll(async () => { await browser?.close(); });

describe.skipIf(!available)('single-file smoke test (file://)', () => {
  it('boots, plays, saves, reloads and loads', async () => {
    // one context so localStorage survives the reload
    const context = await browser!.newContext({ viewport: { width: 640, height: 480 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const url = `file://${FILE}?debug`;
    const key = async (code: string, ms = 150) => { await page.keyboard.press(code); await sleep(ms); };
    const start = async () => {
      await page.goto(url);
      await page.waitForFunction(() => document.getElementById('overlay')!.textContent!.includes('Click or press'), null, { timeout: 60_000 });
      await page.keyboard.press('Space');
      await page.waitForFunction(() => (document.getElementById('overlay') as HTMLElement).hidden, null, { timeout: 60_000 });
      await page.waitForFunction(() => (window as any).__ot?.game, null, { timeout: 60_000 });
      for (let i = 0; i < 8; i++) await key('Enter', 150); // intro logos
      await sleep(1500);
    };

    await start();
    const title = await hashCanvas(page);
    await key('Enter', 1000); // New Game
    for (let i = 0; i < 3; i++) { await key('Enter', 1000); } // episode, difficulty, game menu
    await sleep(1500);
    expect(await hashCanvas(page), 'left the title').not.toBe(title);
    for (let i = 0; i < 4; i++) await key('ArrowDown', 250); // Start Level
    await key('Enter', 250);
    for (let i = 0; i < 4; i++) { await sleep(1500); await key('Enter', 150); } // story text, if any
    await sleep(3000);
    const shipX = () => page.evaluate(() => (window as any).__ot.game.players[0].x as number);
    const x0 = await shipX();
    await page.keyboard.down('Space');
    await page.keyboard.down('ArrowRight');
    await sleep(10_000);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Space');
    expect(await shipX(), 'the ship flew in the level').toBeGreaterThan(x0);

    // The level start wrote the backup save (slot 11); wait for the debounce flush and read it.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await sleep(500);
    const sav = await page.evaluate(() => localStorage.getItem('opentyrian.tyrian.sav'));
    expect(sav, 'save written').not.toBeNull();

    await start(); // reload: same context, same localStorage
    await key('ArrowDown', 250); // Load Game
    await key('Enter', 1000);
    for (let i = 0; i < 10; i++) await key('ArrowDown', 200); // slot 11, "LAST LEVEL" (the level-start backup)
    await key('Enter', 1500);
    await sleep(3000);
    expect(await hashCanvas(page), 'the loaded game is not the title').not.toBe(title);
    expect(await page.evaluate(() => (window as any).__ot.game.items.episodeNum), 'episode loaded from the save').toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await context.close();
  });
});

if (!available) console.warn(`single-file e2e skipped: ${skipReason}`);
