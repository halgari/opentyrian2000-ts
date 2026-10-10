// Smoke tests for the single-file build opened from file:// (Chromium). Skipped without Chromium or dist-single/tyrian.html.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const ROOT = join(import.meta.dirname, '..', '..');
const FILE = join(ROOT, 'dist-single', 'tyrian.html');
const chromiumPath = process.env.PW_CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath());
const skipReason = !existsSync(chromiumPath) ? `no Chromium at ${chromiumPath}` : !existsSync(FILE) ? 'dist-single/tyrian.html missing (pnpm build:single)' : '';
const available = skipReason === '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hashCanvas = async (page: Page): Promise<string> =>
  createHash('sha1').update(await page.evaluate(() => (document.getElementById('screen') as HTMLCanvasElement).toDataURL())).digest('hex');
const overlayText = (page: Page) => page.evaluate(() => document.getElementById('overlay')!.textContent ?? '');

let browser: Browser | null = null;
beforeAll(async () => {
  if (available) browser = await chromium.launch({ executablePath: chromiumPath, args: ['--autoplay-policy=no-user-gesture-required'] });
});
afterAll(async () => { await browser?.close(); });

const URL_ = `file://${FILE}?debug`;
const key = async (page: Page, code: string, ms = 150) => { await page.keyboard.press(code); await sleep(ms); };

/** Opens the page, passes the start gesture and the intro logos; resolves on the title menu. */
async function start(page: Page): Promise<void> {
  await page.goto(URL_);
  await page.waitForFunction(() => document.getElementById('overlay')!.textContent!.includes('Click or press'), null, { timeout: 60_000 });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (document.getElementById('overlay') as HTMLElement).hidden, null, { timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__ot?.game, null, { timeout: 60_000 });
  for (let i = 0; i < 8; i++) await key(page, 'Enter', 150); // intro logos
  await sleep(1500);
}

/** New Game through the menus and into the first level; leaves the level running. */
async function startLevel(page: Page): Promise<void> {
  await key(page, 'Enter', 1000); // New Game
  for (let i = 0; i < 3; i++) await key(page, 'Enter', 1000); // episode, difficulty, game menu
  await sleep(1500);
  for (let i = 0; i < 4; i++) await key(page, 'ArrowDown', 250); // Start Level
  await key(page, 'Enter', 250);
  for (let i = 0; i < 4; i++) { await sleep(1500); await key(page, 'Enter', 150); } // story text, if any
  await sleep(3000);
}

const shipX = (page: Page) => page.evaluate(() => (window as any).__ot.game.players[0].x as number);
async function fly(page: Page, ms: number): Promise<void> {
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowRight');
  await sleep(ms);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Space');
}

async function withPage(init: ((page: Page) => Promise<void>) | null, body: (page: Page, ctx: BrowserContext, errors: string[]) => Promise<void>): Promise<void> {
  // one context so localStorage survives a reload
  const context = await browser!.newContext({ viewport: { width: 640, height: 480 } });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    if (init) await init(page);
    await body(page, context, errors);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

describe.skipIf(!available)('single-file smoke test (file://)', () => {
  it('boots, loads the Blob worklet, plays, saves, reloads and loads', () => withPage(null, async (page) => {
    await start(page);
    expect(await page.evaluate(() => (document.getElementById('overlay') as HTMLElement).hidden), 'overlay (with the licence) hidden once play starts').toBe(true);
    // __audio is only exposed when the audio is a real WebAudio, i.e. the worklet module (Blob URL, or the data: URL fallback Chromium needs on file://) loaded
    expect(await page.evaluate(() => typeof (window as any).__audio), 'worklet loaded (audio not the silent fallback)').toBe('object');
    const title = await hashCanvas(page);
    await startLevel(page);
    expect(await hashCanvas(page), 'left the title').not.toBe(title);
    const x0 = await shipX(page);
    await fly(page, 10_000);
    expect(await shipX(page), 'the ship flew in the level').toBeGreaterThan(x0);

    // The level start wrote the backup save (slot 11); flush and read it.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await sleep(500);
    expect(await page.evaluate(() => localStorage.getItem('opentyrian.tyrian.sav')), 'save written').not.toBeNull();

    await start(page); // reload: same context, same localStorage
    await key(page, 'ArrowDown', 250); // Load Game
    await key(page, 'Enter', 1000);
    for (let i = 0; i < 10; i++) await key(page, 'ArrowDown', 200); // slot 11, "LAST LEVEL" (the level-start backup)
    await key(page, 'Enter', 1500);
    await sleep(3000);
    expect(await hashCanvas(page), 'the loaded game is not the title').not.toBe(title);
    expect(await page.evaluate(() => (window as any).__ot.game.items.episodeNum), 'episode loaded from the save').toBeGreaterThan(0);
  }));

  it('the start overlay carries the licence notice with the source link', () => withPage(null, async (page) => {
    await page.goto(URL_);
    await page.waitForFunction(() => document.getElementById('overlay')!.textContent!.includes('Click or press'), null, { timeout: 60_000 });
    const text = await overlayText(page);
    expect(text).toContain('GPL-2.0-or-later');
    expect(text).toContain('https://github.com/KScl/opentyrian2000');
    expect(await page.evaluate(() => (document.getElementById('licence') as HTMLElement).hidden), 'no fixed licence element over the canvas').toBe(true);
  }));

  it('with localStorage blocked the game plays and the save stays in memory', () => withPage(
    async (page) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
      });
    },
    async (page) => {
      await start(page);
      expect(await page.evaluate(() => (window as any).__ot.storage.persistent), 'storage is the in-memory fallback').toBe(false);
      expect(await page.locator('[role=status]').first().textContent(), 'the user is told saving is unavailable').toMatch(/Saving is unavailable/);
      await startLevel(page);
      const x0 = await shipX(page);
      await fly(page, 2000);
      expect(await shipX(page), 'the ship flew').toBeGreaterThan(x0);
      expect(await page.evaluate(() => (window as any).__ot.storage.get('opentyrian.tyrian.sav')), 'the level-start save is readable within the session').not.toBeNull();
      // Load it back within the session (no reload): Esc, Quit Level, Quit Game, OK, then Load Game slot 11.
      await key(page, 'Escape', 800);
      for (let i = 0; i < 5; i++) await key(page, 'ArrowDown', 200);
      await key(page, 'Enter', 1500); // Quit Level -> game menu
      await key(page, 'ArrowUp', 400); // wraps to Quit Game
      await key(page, 'Enter', 1000); // "Are you sure": OK
      await key(page, 'Enter', 1500); // back on the title
      const title = await hashCanvas(page);
      await key(page, 'ArrowDown', 250); // Load Game
      await key(page, 'Enter', 1000);
      for (let i = 0; i < 10; i++) await key(page, 'ArrowDown', 200);
      await key(page, 'Enter', 1500);
      await sleep(3000);
      expect(await hashCanvas(page), 'the in-memory save loaded: not the title').not.toBe(title);
      expect(await page.evaluate(() => (window as any).__ot.game.items.episodeNum), 'episode loaded from the in-memory save').toBeGreaterThan(0);
    },
  ));

  it('without DecompressionStream the overlay explains why', () => withPage(
    async (page) => { await page.addInitScript(() => { delete (window as any).DecompressionStream; }); },
    async (page) => {
      await page.goto(URL_);
      await page.waitForFunction(() => document.getElementById('overlay')!.textContent!.includes('supported browser'), null, { timeout: 60_000 });
      const text = await overlayText(page);
      expect(text).toContain('DecompressionStream');
      expect(await page.evaluate(() => (document.getElementById('overlay') as HTMLElement).hidden)).toBe(false);
    },
  ));
});

if (!available) console.warn(`single-file e2e skipped: ${skipReason}`);
