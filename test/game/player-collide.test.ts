import { describe, expect, it } from 'vitest';
import { loadItemDatIntoWorld } from '../../src/game/episodes';
import { playerCollide } from '../../src/game/player';
import { newEnemyDatType } from '../../src/game/world';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

function setup() {
  const ctx = testCtx()!;
  const g = ctx.game;
  loadItemDatIntoWorld(ctx);
  g.enemies.enemyAvail.fill(1);
  const p = g.players[0];
  p.isAlive = true; p.x = 100; p.y = 100; p.shield = 0; p.armor = 10;
  g.varz.damageRate = 5;
  g.items.enemyDat[1] = Object.assign(newEnemyDatType(), { explosiontype: 2, esize: 0 });
  g.items.enemyDat[2] = Object.assign(newEnemyDatType(), { explosiontype: 3, esize: 0 });
  const put = (z: number, over: Record<string, unknown>) => {
    g.enemies.enemyAvail[z] = 0;
    Object.assign(g.enemies.enemy[z]!, { ex: 100, ey: 100, mapoffset: 0, enemytype: 1, armorleft: 3, ...over });
    return g.enemies.enemy[z]!;
  };
  return { ctx, g, p, put };
}

describeData('playerCollide (mainint.c:4732)', () => {
  it('ignores enemies outside |dx| < 12 and |dy| < 14 (mapoffset included)', () => {
    const { ctx, g, p, put } = setup();
    put(0, { ex: 100 + 12 }); put(1, { ey: 100 - 14 }); put(2, { ex: 60, mapoffset: 40 + 11 });
    playerCollide(ctx, p, 1);
    // only enemy 2 (60 + 51 = 111, 11 away) collides: it deals its armorleft (3) and dies
    expect(p.armor).toBe(7);
    expect([g.enemies.enemyAvail[0], g.enemies.enemyAvail[1], g.enemies.enemyAvail[2]]).toEqual([0, 0, 1]);
    expect([g.enemies.enemy[0]!.armorleft, g.enemies.enemy[1]!.armorleft]).toEqual([3, 3]);
  });

  it('a damaging enemy hurts the ship, shoves it and takes damage itself', () => {
    const { ctx, g, p, put } = setup();
    const e = put(0, { armorleft: 20, exc: 2, eyc: -3 });
    playerCollide(ctx, p, 1);
    // damage = min(armorleft, damageRate) = 5 -> armor 10 - 5
    expect(p.armor).toBe(5);
    expect([p.xVelocity, p.yVelocity]).toEqual([20, -30]); // (exc * armorleft) / 2, C truncation, armorleft read before damage
    expect(e.armorleft).toBe(15);
    expect(g.enemies.enemyAvail[0]).toBe(0);
    expect(g.varz.soundQueue[5]).toBe(3);
  });

  it('a weak enemy dies in the collision (explosion + link chain) and the ship still takes its armor as damage', () => {
    const { ctx, g, p, put } = setup();
    put(0, { armorleft: 3, linknum: 7 });
    put(1, { armorleft: 9, linknum: 7, ex: 10 });
    put(2, { armorleft: 9, linknum: 8, ex: 10 });
    playerCollide(ctx, p, 1);
    expect(p.armor).toBe(7);
    expect([g.enemies.enemyAvail[0], g.enemies.enemyAvail[1], g.enemies.enemyAvail[2]]).toEqual([1, 1, 0]);
    expect(g.enemies.enemy[1]!.linknum).toBe(0);
    expect(g.varz.soundQueue[5]).toBe(4);
    expect(g.explosions.explosions.filter((x) => x.ttl > 0).length).toBe(2);
    expect([g.scratch.temp, g.scratch.temp2, g.scratch.b]).toEqual([7, 100, 0]); // C globals stay clobbered
  });

  it('a 255-armor enemy is invulnerable and keeps its armor', () => {
    const { ctx, g, p, put } = setup();
    const e = put(0, { armorleft: 255 });
    playerCollide(ctx, p, 1);
    expect([p.armor, e.armorleft, g.enemies.enemyAvail[0]]).toEqual([5, 255, 0]);
  });

  it('no damage while invulnerable or against ground enemies (explosiontype & 1)', () => {
    const { ctx, p, put } = setup();
    p.invulnerableTicks = 5;
    put(0, {});
    put(1, { enemytype: 2 });
    playerCollide(ctx, p, 1);
    expect(p.armor).toBe(10);
    p.invulnerableTicks = 0;
    playerCollide(ctx, p, 1);
    expect(p.armor).toBe(10 - 3); // enemy 0 hurts, enemy 1 (type 2, ground) does not
  });

  it('shield absorbs first (playerDamage), then armor', () => {
    const { ctx, p, put } = setup();
    p.shield = 3;
    put(0, { armorleft: 20 });
    playerCollide(ctx, p, 1);
    expect([p.shield, p.armor]).toEqual([0, 8]);
  });

  it('cash pick-up (scoreitem): adds value, frees the slot, plays S_ITEM and a pick-up explosion', () => {
    const { ctx, g, p, put } = setup();
    put(0, { scoreitem: true, evalue: 75 });
    playerCollide(ctx, p, 1);
    expect([p.cash, g.enemies.enemyAvail[0], g.varz.soundQueue[7]]).toEqual([75, 1, 18]);
    expect(g.explosions.explosions.some((x) => x.ttl > 0 && x.fixedPosition)).toBe(true);
  });

  it('data cube, superbomb and weapon power-up pick-ups', () => {
    const { ctx, g, p, put } = setup();
    g.config.cubeMax = 1;
    put(0, { scoreitem: true, evalue: 1 });
    put(1, { scoreitem: true, evalue: -4 });
    p.superbombs = 9;
    p.items.weapon[0].id = 1; p.items.weapon[0].power = 2;
    put(2, { scoreitem: true, evalue: -1 });
    g.items.enemyDat[1]!.explosiontype = 2;
    playerCollide(ctx, p, 1);
    expect([g.config.cubeMax, p.superbombs, p.items.weapon[0].power]).toEqual([2, 10, 3]);
    expect(g.varz.soundQueue[3]).toBe(39);
  });

  it('armor pick-up (20000+n) caps at 28; evalue 30000 is a purple ball', () => {
    const { ctx, g, p, put } = setup();
    p.armor = 25;
    put(0, { evalue: 20005 });
    p.items.weapon[0].id = 1; p.items.weapon[0].power = 1; p.purpleBallsNeeded = 1;
    put(1, { evalue: 30000 });
    playerCollide(ctx, p, 1);
    expect(p.armor).toBe(28);
    expect(p.cash).toBe(100);
    expect(p.items.weapon[0].power).toBe(2);
    expect([g.enemies.enemyAvail[0], g.enemies.enemyAvail[1], g.varz.soundQueue[7]]).toEqual([1, 1, 29]);
  });

  it('special pick-up (>32100) equips it for player 1 only', () => {
    const { ctx, g, p, put } = setup();
    put(0, { evalue: 32100 + 4 });
    playerCollide(ctx, p, 2);
    expect([p.items.special, g.enemies.enemyAvail[0]]).toEqual([0, 0]);
    playerCollide(ctx, p, 1);
    expect([p.items.special, g.enemies.enemyAvail[0], p.cash, g.config.shotRepeat[8]]).toEqual([4, 1, 250, 10]);
  });

  it('weapon pick-ups are ignored outside onePlayerAction (demo/normal play)', () => {
    const { ctx, g, p, put } = setup();
    put(0, { evalue: 30000 + 5 });
    put(1, { evalue: 31000 + 5 });
    playerCollide(ctx, p, 1);
    expect([g.enemies.enemyAvail[0], g.enemies.enemyAvail[1], p.items.weapon[0].id]).toEqual([0, 0, 0]);
  });

  it('bonus-level portal (avail == 2) sets nextLevel and bonusLevel once', () => {
    const { ctx, g, p, put } = setup();
    put(0, { evalue: 10007 });
    g.enemies.enemyAvail[0] = 2;
    playerCollide(ctx, p, 1);
    expect([g.items.bonusLevel, g.config.nextLevel, g.enemies.enemyAvail[0], g.varz.displayTime]).toEqual([true, 7, 1, 150]);
  });
});
