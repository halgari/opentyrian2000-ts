import { describe, expect, it } from 'vitest';
import { playerShotsPass } from '../../src/game/collide';
import { newEnemyDatType } from '../../src/game/world';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

/** one player shot at (100,100) in slot 0, damage `dmg`, no motion */
function setup(dmg: number) {
  const ctx = testCtx()!;
  const g = ctx.game;
  g.items.enemyDat[0] = Object.assign(newEnemyDatType(), { armor: 10, esize: 0 });
  g.enemies.enemyAvail.fill(1);
  g.playerShots.shotAvail[0] = 5;
  Object.assign(g.playerShots.playerShotData[0]!, {
    shotX: 100, shotY: 100, shotGr: 1, shotAniMax: 1, shotTrail: 255, shotDmg: dmg, playerNumber: 1,
  });
  return { ctx, g };
}

function addEnemy(g: ReturnType<typeof setup>['g'], i: number, over: Record<string, unknown>) {
  g.enemies.enemyAvail[i] = 0;
  Object.assign(g.enemies.enemy[i]!, { ex: 100, ey: 112, armorleft: 1, enemytype: 0, evalue: 7, ...over });
}

describeData('playerShotsPass', () => {
  it('kills an armor-1 enemy: cash, kill count, explosion, sound; surplus damage keeps the shot', () => {
    const { ctx, g } = setup(5);
    addEnemy(g, 3, {});
    playerShotsPass(ctx);
    expect(g.enemies.enemyAvail[3]).toBe(1);
    expect(g.enemies.enemyKilled).toBe(1);
    expect(g.players[0].cash).toBe(7);
    expect(g.explosions.explosions.some((e) => e.ttl > 0)).toBe(true);
    expect(g.varz.soundQueue[6]).toBe(8);
    expect(g.playerShots.shotAvail[0]).toBe(4); // decremented by move; not cleared
    expect(g.playerShots.playerShotData[0]!.shotDmg).toBe(4); // 5 - armor 1
    expect(g.scratch.b).toBe(100);
  });

  it('a shot with damage <= armor is consumed, enemy only damaged', () => {
    const { ctx, g } = setup(3);
    addEnemy(g, 0, { armorleft: 10 });
    playerShotsPass(ctx);
    expect(g.enemies.enemyAvail[0]).toBe(0);
    expect(g.enemies.enemy[0]!.armorleft).toBe(7);
    expect(g.playerShots.shotAvail[0]).toBe(0);
    expect(g.varz.soundQueue[5]).toBe(3);
  });

  it('linknum chain: killing one enemy kills the linked one but not others', () => {
    const { ctx, g } = setup(20);
    addEnemy(g, 1, { linknum: 5 });
    addEnemy(g, 2, { linknum: 5, ex: 200, ey: 40 });
    addEnemy(g, 4, { linknum: 6, ex: 220, ey: 40 });
    playerShotsPass(ctx);
    expect(g.enemies.enemyAvail[1]).toBe(1);
    expect(g.enemies.enemyAvail[2]).toBe(1);
    expect(g.enemies.enemyAvail[4]).toBe(0);
    expect(g.enemies.enemyKilled).toBe(2);
    expect(g.players[0].cash).toBe(14);
    expect(g.scratch.temp2).toBe(100); // loop counter left behind
    expect(g.scratch.temp).toBe(5);
  });

  it('super arcade mode: each power-up an enemy drops cycles evalue 30001..30005 (tyrian2.c:1654-1665)', () => {
    const { ctx, g } = setup(20);
    g.config.superArcadeMode = 1;
    g.items.enemyDat[5] = Object.assign(newEnemyDatType(), { armor: 1, esize: 0, value: 31000, eenemydie: 0 });
    // three linked enemies die together and each leaves the power-up enemy 5 behind
    addEnemy(g, 30, { linknum: 5, enemydie: 5, evalue: 0 });
    addEnemy(g, 31, { linknum: 5, enemydie: 5, evalue: 0, ex: 200, ey: 40 });
    addEnemy(g, 32, { linknum: 5, enemydie: 5, evalue: 0, ex: 220, ey: 40 });
    playerShotsPass(ctx);
    const drops = g.enemies.enemy.slice(0, 25).filter((_, i) => g.enemies.enemyAvail[i] === 0);
    expect(drops.map((d) => d.evalue)).toEqual([30001, 30002, 30003]);
    expect(drops.map((d) => d.egr[0])).toEqual([7, 9, 11]);
    expect(g.config.superArcadePowerUp).toBe(3);
  });

  it('super arcade power-up counter wraps from 5 to 1; outside super arcade mode the value is left alone', () => {
    for (const [mode, start, want, wantCounter] of [[1, 5, 30001, 1], [0, 5, 31000, 5]] as const) {
      const { ctx, g } = setup(20);
      g.config.superArcadeMode = mode;
      g.config.superArcadePowerUp = start;
      g.items.enemyDat[5] = Object.assign(newEnemyDatType(), { armor: 1, esize: 0, value: 31000, eenemydie: 0 });
      addEnemy(g, 30, { linknum: 5, enemydie: 5, evalue: 0 });
      playerShotsPass(ctx);
      expect(g.enemies.enemy[0]!.evalue).toBe(want);
      expect(g.config.superArcadePowerUp).toBe(wantCounter);
    }
  });

  it('hitting an armor-255 enemy runs doSP, which clobbers scratch temp (loop counter = num)', () => {
    const { ctx, g } = setup(10);
    addEnemy(g, 0, { armorleft: 255, linknum: 9 });
    playerShotsPass(ctx);
    expect(g.scratch.temp).toBe(8); // damage/2 + 3
    expect(g.enemies.enemy[0]!.armorleft).toBe(255);
    expect(g.explosions.superpixels.some((s) => s.z === 15)).toBe(true);
  });

  it('updates last_x/y_shot_move for both players', () => {
    const { ctx, g } = setup(1);
    g.playerShots.shotAvail[0] = 0;
    g.players[0].x = 33; g.players[0].y = 44;
    playerShotsPass(ctx);
    expect([g.players[0].lastXShotMove, g.players[0].lastYShotMove]).toEqual([33, 44]);
  });
});
