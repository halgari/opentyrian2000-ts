// SPDX-License-Identifier: GPL-2.0-or-later
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { loadMap } from '../../src/game/level';
import { DIFFICULTY_NORMAL, FIRST_LEVEL } from '../../src/game/world';
import type { Ctx } from '../../src/ctx';
import type { KeyPress } from '../../tools/oracle/scenarios';
import { frameCrc } from './hash-frames';
import { testCtx } from './ctx';

/** A world in the state newGame leaves it in for episode 1, Normal. */
export function newGameWorld(): Ctx {
  const ctx = testCtx()!;
  loadConfigurationDefaults(ctx);
  initPlayerData(ctx);
  initEpisode(ctx, 1);
  ctx.game.config.difficultyLevel = DIFFICULTY_NORMAL;
  ctx.game.config.initialDifficulty = DIFFICULTY_NORMAL;
  ctx.game.config.mainLevel = FIRST_LEVEL;
  ctx.game.players[0].cash = 10000; // tyrian2.c newGame: initial_cash[episodeNum - 1]
  return ctx;
}

/**
 * The oracle frame index of the first frame the first shop presents in `newgame-ep1-first-shop-to-level` (title -> New Game ->
 * episode 1 -> Normal takes 220 frames; the TS run starts at the shop, so TS frame i == oracle frame SHOP_FRAME0 + i).
 */
export const SHOP_FRAME0 = 220;

/**
 * Schedules `keys` (oracle frame numbers, `hold` as in the oracle) on the TS frames of `ctx` (TS frame i is oracle frame
 * `frame0 + i`): after frame f is presented the key goes down (and up again after `hold` frames; a tap = immediately).
 * `onFrame(i)` runs first for each presented frame. Returns the frame CRCs (palette || pixels) as they are presented.
 */
export function injectOracleKeys(ctx: Ctx, keys: readonly KeyPress[], frame0: number, onFrame?: (i: number) => void): number[] {
  const crcs: number[] = [];
  ctx.frameSink = (screen, pal) => {
    const i = crcs.length;
    crcs.push(frameCrc(pal, screen.pixels));
    onFrame?.(i);
    const idx = frame0 + i;
    for (const k of keys) {
      if (k.frame === idx) {
        ctx.input.push({ type: 'keydown', scancode: k.scancode, mod: 0 });
        if (!k.hold) ctx.input.push({ type: 'keyup', scancode: k.scancode });
      }
      if (k.hold && k.frame + k.hold === idx) ctx.input.push({ type: 'keyup', scancode: k.scancode });
    }
  };
  return crcs;
}

/** loadMap through the first shop with the Next Level -> first planet keys (Down x4, Return, Return) of the oracle scenario. */
export async function loadMapThroughShop(ctx: Ctx): Promise<number[]> {
  const sc = (await import('../../tools/oracle/scenarios')).SCENARIOS['newgame-ep1-first-shop-to-level'];
  const crcs = injectOracleKeys(ctx, sc.keys.filter((k) => k.frame >= SHOP_FRAME0 && k.frame < 240), SHOP_FRAME0);
  await loadMap(ctx);
  return crcs;
}
