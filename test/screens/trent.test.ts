// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it, vi } from 'vitest';
import { gameLoop } from '../../src/game';
import { loadConfigurationDefaults } from '../../src/game/config';
import { trentWinScreen, TRENT_LINES } from '../../src/screens/trent';
import { testCtx } from '../helpers/ctx';
import { describeData } from '../helpers/data';

/** A key tap every 40 sleeps (the screens block in sleeps, not in frames). */
function tapOften(ctx: ReturnType<typeof testCtx> & object): void {
  const sleep = ctx.clock.sleep.bind(ctx.clock);
  let sleeps = 0;
  ctx.clock.sleep = (ms: number) => {
    sleeps++;
    if (sleeps % 40 === 0) ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 });
    if (sleeps % 40 === 5) ctx.input.push({ type: 'keyup', scancode: 44 });
    return sleep(ms);
  };
}

const h = vi.hoisted(() => ({ titles: 0, trent: 0, stop: new Error('stop') }));
vi.mock('../../src/screens/title', () => ({
  titleScreen: async (): Promise<boolean> => { if (++h.titles > 2) throw h.stop; return true; },
}));
vi.mock('../../src/game/flow', () => ({
  jeMain: async (ctx: { game: { config: { trentWin: boolean } } }): Promise<void> => { if (h.titles === 1) ctx.game.config.trentWin = true; },
}));
vi.mock('../../src/screens/trent', async (orig) => {
  const m = await orig<typeof import('../../src/screens/trent')>();
  return { ...m, trentWinScreen: async (ctx: never): Promise<void> => { h.trent++; await m.trentWinScreen(ctx); } };
});

describeData('trentWinScreen', () => {
  it('has the text of varz.c:487-500', () => {
    expect(TRENT_LINES[0]).toBe('Sleep well, Trent, you deserve the rest.');
  });

  it('draws, waits for one key and returns', async () => {
    const ctx = testCtx()!;
    let frames = 0, ink = 0;
    ctx.frameSink = () => {
      if (++frames === 1) for (const px of ctx.vga.screen.pixels) if (px !== 0) ink++;
    };
    tapOften(ctx);
    await trentWinScreen(ctx);
    expect(ink).toBeGreaterThan(100);
  });

  it('gameLoop shows it once after jeMain, clears the flag and runs the title again', async () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx);
    h.trent = 0;
    tapOften(ctx);
    await expect(gameLoop(ctx)).rejects.toBe(h.stop);
    expect(h.trent).toBe(1);
    expect(ctx.game.config.trentWin).toBe(false);
    expect(h.titles).toBe(3);
  });
});
