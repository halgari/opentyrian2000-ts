import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { testCtx } from '../helpers/ctx';
import { loadMapThroughShop, newGameWorld } from '../helpers/shop';
import { ORACLE_DIR } from '../helpers/frames';
import { readStates2 } from '../helpers/state-trace';

const SCENARIO = 'newgame-ep1-first-shop-to-level';
const states = readStates2(resolve(ORACLE_DIR, `${SCENARIO}.state2`));
const ctxFor = testCtx();
const d = ctxFor && states ? describe : describe.skip;

d(`golden: episode 1 script, ${SCENARIO}`, () => {
  // The scenario: title -> new game -> Normal -> shop (section 2) -> Next Level -> first planet -> level 1 at frame ~331.
  it('loadMap from section 1 through the real shop (Next Level, first planet) ends where the oracle is at level start', async () => {
    const ctx = newGameWorld();
    await loadMapThroughShop(ctx);
    const g = ctx.game;
    const oracle = states![340]!; // in the level, before any in-level input
    expect(g.config.mainLevel).toBe(oracle.mainLevel);   // 3: section 1 `]J 002`, shop, first planet -> section 3
    expect(g.config.nextLevel).toBe(oracle.nextLevel);   // 4
    expect(g.config.saveLevel).toBe(oracle.saveLevel);   // 1: no `]s` before the first level
    expect(g.items.episodeNum).toBe(oracle.episodeNum);
    expect(g.varz.lvlFileNum).toBe(oracle.lvlFileNum);   // 9 (TYRIAN)
    expect(g.varz.gameLoaded ? 1 : 0).toBe(oracle.gameLoaded);
    expect(g.config.difficultyLevel).toBe(oracle.difficultyLevel);
    expect(ctx.rng.calls).toBe(oracle.mtCalls - 400);    // the script draws no random numbers (the oracle's 400 are the starfield)
  });

  it('the values only the script knows: map origin, planets, cubes, items for sale, song', async () => {
    const ctx = newGameWorld();
    await loadMapThroughShop(ctx);
    const g = ctx.game;
    expect(g.config.levelName.trim()).toBe('TYRIAN');
    expect([g.varz.mapOrigin, g.varz.mapPNum, g.varz.mapPlanet[0], g.varz.mapSection[0]]).toEqual([1, 1, 1, 3]);
    expect(Array.from(g.config.cubeList)).toEqual([1, 2, 23, 5]);
    expect(g.config.cubeMax).toBe(4);
    expect(g.config.lastCubeMax).toBe(0);
    expect(Array.from(g.items.itemAvail[1]!.subarray(0, 3))).toEqual([1, 2, 7]); // WeapF [13, 2, 7] plus the last_items front weapon (1), sorted by the shop's prologue: [1, 2, 7, 13]
    expect(g.varz.levelSong).toBe(18);
    expect(g.varz.songBuy).toBe(2); // DEFAULT_SONG_BUY
    expect(g.events.maxEvent).toBeGreaterThan(0);       // the level record of lvlFileNum 9 was read
  });

  it('Hard and above skip the first `]L` of section 3 (`]h`) and take the second level', async () => {
    const ctx = newGameWorld();
    ctx.game.config.initialDifficulty = 3;
    await loadMapThroughShop(ctx);
    expect(ctx.game.varz.lvlFileNum).toBe(15);
  });

  it.todo(`HASH of the briefing screens (${SCENARIO} + planet/cube screens): needs the Task 9/12 menus and shop`);
  it.todo('STATE2 at every level start of a multi-level traversal: needs Task 12 (JE_main state machine)');
});
