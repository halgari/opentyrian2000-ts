// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { SCENARIOS } from '../../tools/oracle/scenarios';
import { loadMap } from '../../src/game/level';
import type { ShopState } from '../../src/screens/shop';
import { testCtx } from '../helpers/ctx';
import { ORACLE_DIR } from '../helpers/frames';
import { readHashes } from '../helpers/hash-frames';
import { SHOP_FRAME0, injectOracleKeys, newGameWorld } from '../helpers/shop';
import { readStates2 } from '../helpers/state-trace';

// loadMap calls itemScreen(ctx); the mock hands it a ShopState the test can read (the C's static curMenu)
const captured = vi.hoisted(() => ({ state: null as ShopState | null }));
vi.mock('../../src/screens/shop', async (orig) => {
  const m = await orig<typeof import('../../src/screens/shop')>();
  return { ...m, itemScreen: (ctx: Parameters<typeof m.itemScreen>[0]) => m.itemScreen(ctx, (captured.state = new m.ShopState())) };
});

const SCENARIO = 'newgame-ep1-first-shop-to-level';
const hashes = readHashes(resolve(ORACLE_DIR, `${SCENARIO}.hash`));
const states = readStates2(resolve(ORACLE_DIR, `${SCENARIO}.state2`));
const d = testCtx() && hashes && states ? describe : describe.skip;

// The first shop of a new episode 1 / Normal game: oracle frames 220.. are TS frames 0.. (keys Down x4 at 221-224, Return
// at 225 = Next Level, Return at 229 = first planet). Frame 220 is the shop's first presented frame (JE_showVGA before
// set_palette). The shop ends with the Return at 229; the next 50 frames (to 279) are loadMap's fade-out / level-load tail.
d(`golden: first shop, ${SCENARIO}`, () => {
  it('every presented frame of the shop session matches the C hash, and STATE2 (mainLevel, curMenu, gameLoaded, scratch) too', async () => {
    const ctx = newGameWorld();
    const g = ctx.game;
    let shopFrames = 0;
    const mismatches: string[] = [];
    const crcs = injectOracleKeys(ctx, SCENARIOS[SCENARIO].keys.filter((k) => k.frame >= SHOP_FRAME0 && k.frame < 240), SHOP_FRAME0, (i) => {
      const o = states![SHOP_FRAME0 + i]!;
      if (captured.state && i < 10) {
        shopFrames = i + 1;
        const ts = {
          cash: g.players[0].cash, mainLevel: g.config.mainLevel, nextLevel: g.config.nextLevel, gameLoaded: g.varz.gameLoaded ? 1 : 0,
          curMenu: captured.state.curMenu, scratchTemp: g.scratch.temp, scratchTemp2: g.scratch.temp2, scratchTemp3: g.scratch.temp3,
          scratchTempW: g.scratch.tempW,
        };
        for (const [k, v] of Object.entries(ts)) if ((o as unknown as Record<string, number>)[k] !== v) mismatches.push(`frame ${SHOP_FRAME0 + i} ${k}: ts ${v} oracle ${(o as unknown as Record<string, number>)[k]}`);
      }
    });
    await loadMap(ctx);
    expect(shopFrames).toBe(10);
    // 10 shop frames, then the 50 frames of loadMap's tail (the fade out of the shop and the level load) up to oracle frame 279
    expect(crcs).toHaveLength(60);
    for (let i = 0; i < crcs.length; i++) expect(crcs[i]!.toString(16), `frame ${SHOP_FRAME0 + i}`).toBe(hashes![SHOP_FRAME0 + i]!.toString(16));
    expect(mismatches).toEqual([]);
    expect(g.config.mainLevel).toBe(states![230]!.mainLevel);
    expect(captured.state!.curMenu).toBe(3); // MENU_PLAY_NEXT_LEVEL (STATE2 curMenu stays 3 after the shop)
  });
});
