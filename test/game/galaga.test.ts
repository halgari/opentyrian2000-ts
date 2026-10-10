// SPDX-License-Identifier: GPL-2.0-or-later
// Galaga (]g): tyrian2.c:2510-2517 setup, 376 shot gate, 645 start_level, 1147-1175 HUD block; mainint.c:4749-4762 dragonwing.
import { describe, expect, it } from 'vitest';
import { MersenneTwister } from '../../src/core/mtrand';
import type { Ctx } from '../../src/ctx';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { drawEnemy } from '../../src/game/enemies';
import { initEpisode, loadItemDatIntoWorld } from '../../src/game/episodes';
import { drawLevelTopBars } from '../../src/game/hud';
import { getShipInfo } from '../../src/game/shots';
import { playerCollide, playerMovement } from '../../src/game/player';
import { loadGame } from '../../src/game/save';
import { runEpisodeScript } from '../../src/game/script';
import { createGameWorld, newWeaponType } from '../../src/game/world';
import { createSurface } from '../../src/video/surface';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';
import { useScript } from '../helpers/script';

function galagaCtx(): Ctx {
  const ctx = testCtx()!;
  loadConfigurationDefaults(ctx); initPlayerData(ctx); initEpisode(ctx, 1);
  loadItemDatIntoWorld(ctx);
  ctx.game.players[0].items.ship = 1;
  getShipInfo(ctx);
  ctx.game.config.galagaMode = true;
  ctx.game.enemies.enemyAvail.fill(1);
  ctx.game.players[0].isAlive = true;
  return ctx;
}

/** A bare ctx (as test/game/enemies.test.ts) with one enemy that has a shot ready this frame. */
function shooterCtx(eyc: number, freq: number): Ctx {
  const EMPTY_SHEET = { data: Uint8Array.from([2, 0, 0x0f]) };
  const rng = new MersenneTwister();
  rng.srand(5);
  const game = createGameWorld();
  game.config.difficultyLevel = 2;
  const vga = { screen: createSurface(), screen2: createSurface(), gameScreen: createSurface(), cur: null as unknown };
  vga.cur = vga.gameScreen;
  const c = {
    rng, game, vga,
    assets: { shapes: { spriteSheet8: EMPTY_SHEET, spriteSheet12: EMPTY_SHEET, spriteSheet10: EMPTY_SHEET, spriteSheet11: EMPTY_SHEET } },
  } as unknown as Ctx;
  game.config.galagaMode = true;
  game.varz.galagaShotFreq = freq;
  game.enemies.enemyAvail.fill(1);
  game.enemies.enemyAvail[0] = 0;
  Object.assign(game.enemies.enemy[0]!, {
    ex: 100, ey: 50, eyc, enemycycle: 1, ani: 1, size: 0, edamaged: false, xminbounce: -10000, xmaxbounce: 10000,
    yminbounce: -10000, ymaxbounce: 10000, tur: Uint8Array.from([5, 0, 0]), freq: Uint8Array.from([6, 0, 0]),
    eshotwait: Uint8Array.from([1, 1, 1]),
  });
  game.players[0].x = 200; game.players[0].y = 100;
  game.enemyShots.enemyShotAvail.fill(true);
  game.items.weapons[5] = Object.assign(newWeaponType(), {
    multi: 1, max: 2, attack: [7, 8, 0, 0, 0, 0, 0, 0], del: [30, 31, 0, 0, 0, 0, 0, 0], sx: [2, -3, 0, 0, 0, 0, 0, 0],
    sy: [4, 5, 0, 0, 0, 0, 0, 0], bx: [1, 2, 0, 0, 0, 0, 0, 0], by: [3, 4, 0, 0, 0, 0, 0, 0], sg: [60, 61, 0, 0, 0, 0, 0, 0],
  });
  return c;
}

describeData('galaga', () => {
  it(']g copies player 1 items to player 2 and arms the mode (tyrian2.c:2510-2517)', async () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx); initPlayerData(ctx); initEpisode(ctx, 1);
    ctx.game.players[0].items.sidekick[0] = 5;
    useScript(ctx, ['*1', ']g', ']L[ 9999 001 ALE 18 09']);
    ctx.game.config.mainLevel = 1;
    await runEpisodeScript(ctx, new Uint8Array(256));
    const [p0, p1] = ctx.game.players;
    expect(ctx.game.config.galagaMode).toBe(true);
    expect([p1!.items.weapon[0].id, p1!.items.weapon[1].id, p1!.items.sidekick[0], p1!.items.sidekick[1]])
      .toEqual([p0!.items.weapon[0].id, 15, 0, 0]);
    expect(p0!.items.sidekick[0]).toBe(5);
  });

  it('the purple ball (evalue 30000) spawns the dragonwing: two-player mode, linked, armor 10', () => {
    const ctx = galagaCtx();
    const en = ctx.game.enemies;
    en.enemyAvail[0] = 0;
    Object.assign(en.enemy[0]!, { ex: 100, ey: 160, mapoffset: 0, evalue: 30000 });
    ctx.game.players[0].x = 100; ctx.game.players[0].y = 160;
    ctx.game.players[0].cash = 0;
    ctx.game.players[1].isAlive = false;
    playerCollide(ctx, ctx.game.players[0], 1);
    const c = ctx.game.config, p1 = ctx.game.players[1]!;
    expect([c.twoPlayerMode, c.twoPlayerLinked, p1.armor, p1.isAlive]).toEqual([true, true, 10, true]);
    expect(en.enemyAvail[0]).toBe(1);
    expect(ctx.game.players[0].cash).toBe(100);
  });

  it('a second purple ball while the dragonwing is out pays 2400 extra', () => {
    const ctx = galagaCtx();
    const en = ctx.game.enemies;
    en.enemyAvail[0] = 0;
    Object.assign(en.enemy[0]!, { ex: 100, ey: 160, mapoffset: 0, evalue: 30000 });
    ctx.game.players[0].x = 100; ctx.game.players[0].y = 160;
    ctx.game.players[0].cash = 0;
    ctx.game.config.twoPlayerMode = true;
    playerCollide(ctx, ctx.game.players[0], 1);
    expect(ctx.game.players[0].cash).toBe(2500);
  });

  it('the enemy shot gate: galagaShotFreq 0 nothing fires, 400 the gate always opens (tyrian2.c:376)', () => {
    for (const [freq, fires] of [[0, false], [400, true]] as const) {
      const c = shooterCtx(3, freq);
      drawEnemy(c, 25);
      expect(c.game.enemyShots.enemyShotAvail.some((x) => !x)).toBe(fires);
      expect(c.rng.calls).toBe(1);
    }
  });

  it('an enemy that does not move vertically (eyc 0) never fires and draws no random number', () => {
    const c = shooterCtx(0, 400);
    drawEnemy(c, 25);
    expect(c.game.enemyShots.enemyShotAvail.some((x) => !x)).toBe(false);
    expect(c.rng.calls).toBe(0);
  });

  it('HUD block: shield zeroed, dragonwing death leaves two-player mode, 10000 cash is an extra life', () => {
    const ctx = galagaCtx();
    const g = ctx.game, [p0, p1] = g.players;
    const loc = { oldWeaponBar: [0, 0] } as never;
    g.config.twoPlayerMode = true;
    p0.shield = 5; p1.shield = 4; p1.armor = 0;
    p0.lives = 3; p0.cash = 10000;
    g.varz.galagaLife = 10000;
    drawLevelTopBars(ctx, loc);
    expect([p0.shield, p1.shield, g.config.twoPlayerMode, p0.lives, g.varz.galagaLife]).toEqual([0, 0, false, 4, 20000]);
    p0.cash = 20000; drawLevelTopBars(ctx, loc);
    expect([p0.lives, g.varz.galagaLife]).toEqual([5, 45000]);
    p0.lives = 11; p0.cash = 45000; drawLevelTopBars(ctx, loc);
    expect([p0.lives, p0.cash, g.varz.galagaLife]).toEqual([11, 46000, 70000]);
  });

  it('a galaga death returns to one player, and loadGame clears the galaga flag (Review Focus 4)', () => {
    const ctx = galagaCtx();
    const g = ctx.game, c = g.config, p = g.players[0];
    c.twoPlayerMode = true;
    p.isAlive = false; p.explodingTicks = 0; p.lives = 1;
    playerMovement(ctx, p, 0, 1, g.varz.shipGr, g.varz.shipGrPtr, [0, 0] as never);
    expect(c.twoPlayerMode).toBe(false);
    expect(p.isAlive).toBe(false);
    // the next session: loading a save clears every mode flag
    c.twoPlayerLinked = false;
    c.saveFiles[0]!.episode = 1;
    loadGame(ctx, 1);
    expect([c.galagaMode, c.twoPlayerMode, c.twoPlayerLinked, c.superTyrian, c.timedBattleMode]).toEqual([false, false, false, false, false]);
  });

  it('a respawn in galaga also leaves two-player mode and restores full armor', () => {
    const ctx = galagaCtx();
    const g = ctx.game, c = g.config, p = g.players[0];
    c.twoPlayerMode = true; c.twoPlayerLinked = true;
    p.isAlive = false; p.explodingTicks = 0; p.lives = 3; p.initialArmor = 10; p.armor = 0;
    playerMovement(ctx, p, 0, 1, g.varz.shipGr, g.varz.shipGrPtr, [0, 0] as never);
    expect([c.twoPlayerMode, c.twoPlayerLinked, p.isAlive, p.lives, p.armor, p.shield]).toEqual([false, false, true, 2, 10, 0]);
  });
});
