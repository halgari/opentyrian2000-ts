import { describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/ctx';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { runEpisodeScript } from '../../src/game/script';
import { testCtx } from '../helpers/ctx';
import { describeData } from '../helpers/data';
import { useScript } from '../helpers/script';

// JE_nextEpisode is Task 13: here it only reports "the last episode was finished" the way it does for ep5 -> ep1.
const ep = vi.hoisted(() => ({ jumpBack: true }));
vi.mock('../../src/screens/episode-end', () => ({
  nextEpisode: async (ctx: { game: { items: { jumpBackToEpisode1: boolean }; varz: { gameLoaded: boolean }; config: { mainLevel: number } } }): Promise<void> => {
    ctx.game.items.jumpBackToEpisode1 = ep.jumpBack;
    ctx.game.varz.gameLoaded = true;
    ctx.game.config.mainLevel = 1;
  },
}));

function makeCtx(): Ctx {
  const ctx = testCtx()!;
  loadConfigurationDefaults(ctx);
  initPlayerData(ctx);
  initEpisode(ctx, 1);
  useScript(ctx, ['*1', ']Q[', 'text', '#', 'x', '#', 'y', '#', 'z', '#', 'w', '#', 'v', '#', 'u', '#', 't', '#', 's', '#', 'r', '#', ']L[ 9999 004 TYRIAN   18 09']);
  ctx.game.config.mainLevel = 1;
  ctx.frameSink = () => ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 });
  return ctx;
}

// y = 160..171 is where "Type ... at Title" goes
function ink(ctx: Ctx): number {
  let n = 0;
  for (let y = 160; y < 172; y++) for (let x = 0; x < 320; x++) if (ctx.vga.screen.pixels[y * 320 + x] !== 0) n++;
  return n;
}

describeData('episode script parser: ]Q after the last episode', () => {
  it('shows the "type X at title" unlock screen and asks the script to restart', async () => {
    ep.jumpBack = true;
    const ctx = makeCtx();
    ctx.game.config.superArcadeMode = 0;
    expect(await runEpisodeScript(ctx, new Uint8Array(256))).toBe('restart');
    expect(ctx.game.config.trentWin).toBe(false);
    expect(ink(ctx)).toBeGreaterThan(50);
  });

  it('NortShip-Z unlock sets trentWin', async () => {
    ep.jumpBack = true;
    const ctx = makeCtx();
    ctx.game.config.superArcadeMode = 9; // SANextShip[9] = 7 = SA_NORTSHIPZ
    await runEpisodeScript(ctx, new Uint8Array(256));
    expect(ctx.game.config.trentWin).toBe(true);
  });

  it('is skipped when the episode simply advances, and in two-player mode', async () => {
    ep.jumpBack = false;
    const a = makeCtx();
    await runEpisodeScript(a, new Uint8Array(256));
    expect(ink(a)).toBe(0);
    ep.jumpBack = true;
    const b = makeCtx();
    b.game.config.twoPlayerMode = true;
    await runEpisodeScript(b, new Uint8Array(256));
    expect(ink(b)).toBe(0);
  });

  it('SuperTyrian completion is unported', async () => {
    ep.jumpBack = true;
    const ctx = makeCtx();
    ctx.game.config.superTyrian = true;
    await expect(runEpisodeScript(ctx, new Uint8Array(256))).rejects.toThrow(/unported/);
  });
});
