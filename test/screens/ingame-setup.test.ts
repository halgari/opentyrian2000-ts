import { describe, expect, it, vi } from 'vitest';
import { INPUT_SCENARIOS } from '../../tools/oracle/scenarios-input';
import type { Ctx } from '../../src/ctx';
import { doInGameSetup, inGameHelp, inGameSetup } from '../../src/screens/ingame-setup';
import { Scancode } from '../../src/platform/scancodes';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';
import { expectSessionMatches, hasOracle } from '../helpers/session';

const menu = vi.hoisted(() => ({ entered: 0 }));
vi.mock('../../src/screens/shop', async (orig) => (await import('../helpers/shop-registry')).shopMock(orig as never));
vi.mock('../../src/screens/ingame-setup', async (orig) => {
  const m = await orig<typeof import('../../src/screens/ingame-setup')>();
  return { ...m, doInGameSetup: (...a: Parameters<typeof m.doInGameSetup>) => { menu.entered++; return m.doInGameSetup(...a); } };
});

const key = (ctx: Ctx, scancode: number): void => ctx.input.push({ type: 'keydown', scancode, mod: 0 });

/** Feeds one key per presented frame (the menu shows one frame per input). */
function script(ctx: Ctx, keys: number[]): { frames: () => number } {
  let n = 0;
  ctx.frameSink = () => {
    if (n < keys.length) key(ctx, keys[n]!);
    n++;
  };
  return { frames: () => n };
}

describeData('inGameSetup (mainint.c:1518)', () => {
  const init = (ctx: Ctx): void => {
    const c = ctx.game.config;
    c.tyrMusicVolume = 191; c.fxVolume = 191; c.processorType = 2; c.gameSpeed = 4;
  };

  it('Esc leaves with false after one frame', async () => {
    const ctx = testCtx()!;
    init(ctx);
    const s = script(ctx, [Scancode.Escape]);
    expect(await inGameSetup(ctx)).toBe(false);
    expect(s.frames()).toBe(1);
  });

  it('Right on Music Volume adds 12 and Left subtracts 12, clamped to 0..255', async () => {
    const ctx = testCtx()!;
    init(ctx);
    const vols: number[] = [];
    ctx.audio.setVolume = (m: number) => { vols.push(m); };
    script(ctx, [Scancode.Right, Scancode.Right, Scancode.Right, Scancode.Right, Scancode.Right, Scancode.Escape]);
    await inGameSetup(ctx);
    expect(ctx.game.config.tyrMusicVolume).toBe(251);
    expect(vols.at(-1)).toBe(251);
    // 251 + 12 would exceed 255: clamp
    script(ctx, [Scancode.Right, Scancode.Escape]);
    await inGameSetup(ctx);
    expect(ctx.game.config.tyrMusicVolume).toBe(255);
    script(ctx, [Scancode.Right, Scancode.Escape]);
    await inGameSetup(ctx);
    expect(ctx.game.config.tyrMusicVolume).toBe(255);
  });

  it('Detail Level cycles 1..4 and re-inits; W selects SuperWild; Game Speed cycles 1..5', async () => {
    const ctx = testCtx()!;
    init(ctx);
    script(ctx, [Scancode.Down, Scancode.Down, Scancode.Right, Scancode.Right, Scancode.Right, Scancode.Escape]);
    await inGameSetup(ctx);
    expect(ctx.game.config.processorType).toBe(1); // 2 -> 3 -> 4 -> 1
    expect(ctx.game.config.background2).toBe(false); // initProcessorType(1)

    const ctx2 = testCtx()!;
    init(ctx2);
    script(ctx2, [Scancode.Down, Scancode.Down, 26 /* W */, Scancode.Down, Scancode.Right, Scancode.Escape]);
    await inGameSetup(ctx2);
    expect(ctx2.game.config.processorType).toBe(6);
    expect(ctx2.game.config.superWild).toBe(true);
    expect(ctx2.game.config.gameSpeed).toBe(5);
    expect(ctx2.game.config.fastPlay).toBe(1);

    const ctx3 = testCtx()!;
    init(ctx3);
    script(ctx3, [Scancode.Down, Scancode.Down, Scancode.Down, Scancode.Right, Scancode.Right, Scancode.Escape]);
    await inGameSetup(ctx3);
    expect(ctx3.game.config.gameSpeed).toBe(1); // 4 -> 5 -> 1
  });

  it('Up wraps to Quit; Enter on Quit returns true', async () => {
    const ctx = testCtx()!;
    init(ctx);
    script(ctx, [Scancode.Up, Scancode.Return]);
    expect(await inGameSetup(ctx)).toBe(true);
  });

  it('Enter on Return to Game returns false; Enter on Music toggles musicDisabled', async () => {
    const ctx = testCtx()!;
    init(ctx);
    script(ctx, [Scancode.Return, Scancode.Up, Scancode.Up, Scancode.Return]);
    expect(await inGameSetup(ctx)).toBe(false);
    expect(ctx.audio.musicDisabled).toBe(true);
  });

  it('right mouse button leaves; clicking a value on Music Volume sets (x - 120) * 255 / 82', async () => {
    const ctx = testCtx()!;
    init(ctx);
    let n = 0;
    ctx.frameSink = () => {
      if (n++ === 0) {
        ctx.input.push({ type: 'mousemove', x: 120 + 41, y: 22, moved: true });
        ctx.input.push({ type: 'mousedown', button: 1, x: 120 + 41, y: 22 });
      } else {
        ctx.input.push({ type: 'mousemove', x: 5, y: 5, moved: true });
        ctx.input.push({ type: 'mousedown', button: 3, x: 5, y: 5 });
      }
    };
    expect(await inGameSetup(ctx)).toBe(false);
    expect(ctx.game.config.tyrMusicVolume).toBe(Math.trunc((41 * 255) / 82));
  });

  it('mouse hover selects the item and a click on the name activates it', async () => {
    const ctx = testCtx()!;
    init(ctx);
    let n = 0;
    ctx.frameSink = () => {
      if (n++ === 0) {
        ctx.input.push({ type: 'mousemove', x: 30, y: 20 + 20 * 5 + 3, moved: true }); // Quit
        ctx.input.push({ type: 'mousedown', button: 1, x: 30, y: 20 + 20 * 5 + 3 });
      }
    };
    expect(await inGameSetup(ctx)).toBe(true);
  });

  it('draws the menu boxes over the frozen frame', async () => {
    const ctx = testCtx()!;
    init(ctx);
    ctx.vga.screen.pixels.fill(0x0f);
    let boxPixel = -1;
    ctx.frameSink = (screen) => {
      boxPixel = screen.pixels[16 * 320 + 6]!; // inside both boxes: shaded twice
      key(ctx, Scancode.Escape);
    };
    await inGameSetup(ctx);
    expect(boxPixel).toBe(0x0f >> 2 & 0x0f); // 0x0f -> 0x07 -> 0x03
  });

  it('doInGameSetup: quit sets reallyEndLevel/playerEndLevel, clears Esc and the request flag', async () => {
    const ctx = testCtx()!;
    init(ctx);
    const rel: boolean[] = [];
    ctx.input.mouseSetRelative = (b: boolean) => { rel.push(b); };
    ctx.game.varz.yourInGameMenuRequest = true;
    ctx.input.keysactive[Scancode.Escape] = 1;
    script(ctx, [Scancode.Up, Scancode.Return]);
    await doInGameSetup(ctx);
    expect(ctx.game.varz.reallyEndLevel).toBe(true);
    expect(ctx.game.varz.playerEndLevel).toBe(true);
    expect(ctx.game.varz.yourInGameMenuRequest).toBe(false);
    expect(ctx.input.keysactive[Scancode.Escape]).toBe(0);
    expect(rel).toEqual([false, true]);
  });

  it('doInGameSetup without a request does not open the menu', async () => {
    const ctx = testCtx()!;
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    await doInGameSetup(ctx);
    expect(frames).toBe(0);
    expect(ctx.game.varz.reallyEndLevel).toBe(false);
  });

  // input-esc-menu (Task 6 scenario): Esc in level 1 opens the menu, Right raises the music volume, Esc leaves; every frame (the
  // frozen level, the menu and the return) must hash like the C's
  it.skipIf(!hasOracle('input-esc-menu'))('HASH golden: the Esc menu frames of input-esc-menu match the C (frame by frame, with STATE2)', async () => {
    menu.entered = 0;
    await expectSessionMatches('input-esc-menu', INPUT_SCENARIOS['input-esc-menu']!);
    expect(menu.entered).toBeGreaterThan(0);
  }, 120000);
});

describeData('inGameHelp (mainint.c:1920)', () => {
  it('draws the help page, waits for a key, sets textErase', async () => {
    const ctx = testCtx()!;
    let frames = 0;
    let lit = 0;
    ctx.frameSink = (screen) => {
      frames++;
      if (frames === 1) lit = screen.pixels.reduce((a, v) => a + (v !== 0 ? 1 : 0), 0);
      if (frames === 3) key(ctx, Scancode.Space);
    };
    await inGameHelp(ctx);
    expect(frames).toBe(3);
    expect(lit).toBeGreaterThan(500); // icons + help text
    expect(ctx.game.varz.textErase).toBe(1);
    // the dark inner panel: (9..254, 9..174) is cleared to 0 before the text is drawn
    expect(ctx.vga.screen.pixels[100 * 320 + 250]).toBe(0);
  });
  it('two-player help is unported', async () => {
    const ctx = testCtx()!;
    ctx.game.config.twoPlayerMode = true;
    await expect(inGameHelp(ctx)).rejects.toThrow(/unported/);
  });
});
