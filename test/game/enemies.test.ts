import { describe, expect, it } from 'vitest';
import { MersenneTwister } from '../../src/core/mtrand';
import { s16 } from '../../src/core/int';
import type { Ctx } from '../../src/ctx';
import {
  createNewEventEnemy, drawEnemy, enemySheetSlot, eventJump, makeEnemy, newEnemy, randomEnemySpawn, searchFor,
  setEnemySpriteSheets, updateEnemyShots,
} from '../../src/game/enemies';
import { loadItemDatIntoWorld } from '../../src/game/episodes';
import { playerDamage } from '../../src/game/damage';
import { createGameWorld, EventRec, newEnemyDatType, newWeaponType } from '../../src/game/world';
import { createSurface } from '../../src/video/surface';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';
import { runDemoScenario } from '../golden/demo-harness';

const EMPTY_SHEET = { data: Uint8Array.from([2, 0, 0x0f]) }; // one sprite with no pixels

function mk(seed = 7): Ctx {
  const rng = new MersenneTwister();
  rng.srand(seed);
  const game = createGameWorld();
  game.config.difficultyLevel = 2;
  return {
    rng, game,
    vga: { screen: createSurface(), screen2: createSurface(), gameScreen: createSurface() },
    assets: { shapes: { spriteSheet8: EMPTY_SHEET, spriteSheet12: EMPTY_SHEET, spriteSheet10: EMPTY_SHEET, spriteSheet11: EMPTY_SHEET } },
  } as unknown as Ctx;
}

/** the first values mt_rand() would return for `seed` */
function draws(seed: number, n: number): number[] {
  const r = new MersenneTwister();
  r.srand(seed);
  return Array.from({ length: n }, () => r.rand());
}

function setDat(c: Ctx, i: number, over: Partial<ReturnType<typeof newEnemyDatType>>) {
  c.game.items.enemyDat[i] = Object.assign(newEnemyDatType(), { armor: 10, esize: 0, ani: 1, animate: 0, ...over });
}

describe('makeEnemy', () => {
  it('draws nothing when startxc/startyc are 0 and copies the template at NORMAL', () => {
    const c = mk();
    setDat(c, 5, { startx: 100, starty: -20, armor: 10, value: 50, xmove: -2, ymove: 3, explosiontype: 5, elaunchtype: 2007, elaunchfreq: 9, shapebank: 3 });
    const e = c.game.enemies.enemy[0]!;
    const avail = makeEnemy(c, e, 5, 0);
    expect(c.rng.calls).toBe(0);
    expect(avail).toBe(0);
    expect([e.ex, e.ey, e.exc, e.eyc, e.armorleft, e.evalue]).toEqual([101, -19, -2, 3, 10, 50]);
    expect([e.enemyground, e.explonum, e.launchtype, e.launchspecial, e.launchfreq, e.launchwait]).toEqual([false, 2, 7, 2, 9, 9]);
    expect([e.exrev, e.eyrev, e.exca, e.eyca, e.xminbounce, e.ymaxbounce]).toEqual([100, 100, -1, -1, -10000, 10000]);
    expect(c.game.enemies.totalEnemy).toBe(1);
  });

  it('start position: positive startxc takes mt_rand % (2*startxc), negative takes the raw 64-bit value', () => {
    const c = mk(3);
    setDat(c, 6, { startx: 50, starty: 10, startxc: 20, startyc: -7 });
    const e = c.game.enemies.enemy[0]!;
    makeEnemy(c, e, 6, 0);
    const [r1, r2] = draws(3, 2) as [number, number];
    expect(c.rng.calls).toBe(2);
    expect(e.ex).toBe(s16(50 + (r1 % 40) - 20 + 1));
    expect(e.ey).toBe(s16(10 + r2 - -7 + 1 - 0)); // mt_rand() % (-14 as unsigned long) == r2
    expect(e.ey).toBe(s16(10 + r2 + 7 + 1));
  });

  it('scales armor and value by difficulty with float32 arithmetic', () => {
    const cases: [number, number, number][] = [ // difficulty, armor, value
      [0, 6, 75], [1, 8, 100], [2, 10, 100], [3, 12, 112], [4, 15, 150], [5, 18, 200], [6, 20, 250], [7, 30, 400], [8, 40, 400], [9, 80, 800],
    ];
    for (const [d, armor, value] of cases) {
      const c = mk();
      c.game.config.difficultyLevel = d;
      setDat(c, 7, { armor: 10, value: 100 });
      const e = c.game.enemies.enemy[0]!;
      makeEnemy(c, e, 7, 0);
      expect([d, e.armorleft, e.evalue]).toEqual([d, armor, value]);
    }
    const c = mk();
    c.game.config.difficultyLevel = 9;
    setDat(c, 8, { armor: 100, value: 5000 });
    const e = c.game.enemies.enemy[0]!;
    makeEnemy(c, e, 8, 0);
    expect([e.armorleft, e.evalue]).toEqual([254, 10000]); // clamped
  });

  it('armor 255 is the invulnerable sentinel; armor 0 makes a score item (avail 2, not counted)', () => {
    const c = mk();
    setDat(c, 9, { armor: 255 });
    setDat(c, 10, { armor: 0, value: 30 });
    setDat(c, 11, { armor: 0, value: 0 });
    const en = c.game.enemies.enemy;
    expect(makeEnemy(c, en[0]!, 9, 0)).toBe(0);
    expect(en[0]!.armorleft).toBe(255);
    expect(makeEnemy(c, en[1]!, 10, 0)).toBe(2);
    expect([en[1]!.armorleft, en[1]!.scoreitem]).toEqual([255, true]);
    en[2]!.scoreitem = true; // stale, as after slot reuse: not cleared when value == 0
    expect(makeEnemy(c, en[2]!, 11, 0)).toBe(2);
    expect(en[2]!.scoreitem).toBe(true);
    expect(c.game.enemies.totalEnemy).toBe(1);
  });

  it('animate modes and the sprite sheet slot lookup (stale pointer kept for an unloaded bank)', () => {
    const c = mk();
    const g = c.game;
    g.sprites.enemySpriteSheetIds[2] = 9;
    setDat(c, 12, { animate: 1, shapebank: 9 });
    setDat(c, 13, { animate: 2, ani: 4, shapebank: 21 });
    setDat(c, 14, { animate: 0, shapebank: 30 });
    const en = g.enemies.enemy;
    makeEnemy(c, en[0]!, 12, 0);
    expect([en[0]!.enemycycle, en[0]!.aniactive]).toEqual([0, 1]);
    expect(en[0]!.sprite2s).toBe(enemySheetSlot(g, 2));
    makeEnemy(c, en[1]!, 13, 0);
    expect([en[1]!.enemycycle, en[1]!.aniactive, en[1]!.animax, en[1]!.aniwhenfire]).toEqual([1, 2, 4, 2]);
    expect(en[1]!.sprite2s).toBe(EMPTY_SHEET); // 21 = coins & gems (spriteSheet11)
    en[2]!.sprite2s = EMPTY_SHEET;
    makeEnemy(c, en[2]!, 14, 0);
    expect(en[2]!.sprite2s).toBe(EMPTY_SHEET); // bank 30 not loaded
    makeEnemy(c, en[3]!, 12, 9); // uniqueShapeTableI wins over the template bank
    expect(en[3]!.sprite2s).toBe(enemySheetSlot(g, 2));
  });

  it('newEnemy takes the first free slot of the 25-wide window and returns index + 1', () => {
    const c = mk();
    const g = c.game;
    setDat(c, 15, {});
    g.enemies.enemyAvail.fill(1);
    g.enemies.enemyAvail[50] = 0;
    expect(newEnemy(c, 50, 15, 0)).toBe(52);
    expect(g.enemies.enemyAvail[51]).toBe(0);
    g.enemies.enemyAvail.fill(0, 25, 50);
    expect(newEnemy(c, 25, 15, 0)).toBe(0);
  });
});

describe('createNewEventEnemy', () => {
  it('places the enemy from the event record (-200 draws a random X)', () => {
    const c = mk(11);
    const g = c.game;
    setDat(c, 20, { startx: 0, starty: 0, esize: 1 });
    g.enemies.enemyAvail.fill(1);
    g.backgrounds.mapX = 3;
    g.backgrounds.backMove = 2;
    const rec = Object.assign(new EventRec(), { eventdat: 19, eventdat2: -200, eventdat3: 2, eventdat4: 77, eventdat5: 6, eventdat6: -1 });
    g.events.eventRec[4] = rec;
    g.events.eventLoc = 5;
    createNewEventEnemy(c, 1, 25, 0); // type 19 + 1 = 20, sky/ground window starting at 25
    const x = (draws(11, 1)[0]! % 208) + 24;
    expect(rec.eventdat2).toBe(x);
    const e = g.enemies.enemy[25]!;
    expect(g.enemies.enemyAvail[25]).toBe(0);
    expect(e.enemytype).toBe(20);
    expect(e.ex).toBe(x - (3 - 1) * 24 - 12);
    expect([e.ey, e.eyc, e.linknum, e.fixedmovey]).toEqual([-28 + 6, 2, 77, -1]);
  });

  it('eventdat2 == -99 keeps the template position; a full window does nothing', () => {
    const c = mk();
    const g = c.game;
    setDat(c, 21, { startx: 40, starty: 30 });
    g.enemies.enemyAvail.fill(1);
    g.events.eventRec[0] = Object.assign(new EventRec(), { eventdat: 21, eventdat2: -99 });
    g.events.eventLoc = 1;
    createNewEventEnemy(c, 0, 0, 0);
    expect([g.enemies.enemy[0]!.ex, g.enemies.enemy[0]!.ey]).toEqual([41, 31]);
    g.enemies.enemyAvail.fill(0);
    g.scratch.b = 5;
    createNewEventEnemy(c, 0, 0, 0);
    expect(g.scratch.b).toBe(0);
  });
});

describe('drawEnemy RNG and movement', () => {
  function setup(over: Partial<import('../../src/game/world').Enemy>, seed = 5) {
    const c = mk(seed);
    const g = c.game;
    g.enemies.enemyAvail.fill(1);
    g.enemies.enemyAvail[0] = 0;
    const e = g.enemies.enemy[0]!;
    Object.assign(e, { ex: 100, ey: 50, enemycycle: 1, ani: 1, size: 0, edamaged: false, xminbounce: -10000, xmaxbounce: 10000, yminbounce: -10000, ymaxbounce: 10000 }, over);
    g.players[0].x = 200;
    g.players[0].y = 100;
    return { c, g, e };
  }

  it('draws only when xaccel / yaccel is non-zero (short-circuit) and applies the movement', () => {
    const none = setup({ exc: 2, eyc: -1 });
    drawEnemy(none.c, 25);
    expect(none.c.rng.calls).toBe(0);
    expect([none.e.ex, none.e.ey]).toEqual([102, 49]);
    expect(none.g.players[0].x).toBe(200); // the -25 / +25 shift is undone

    const both = setup({ xaccel: 200, yaccel: 95 });
    drawEnemy(both.c, 25);
    expect(both.c.rng.calls).toBe(2);
  });

  it('accelerates toward the player when xaccel-89 > mt_rand()%11 (unsigned compare, u8 xaccel)', () => {
    // xaccel 250 -> limit 161: always passes, so exc moves toward the player (player.x - 25 = 175 > 100)
    const a = setup({ xaccel: 250 });
    drawEnemy(a.c, 25);
    expect(a.e.exc).toBe(1);
    // xaccel 90 -> limit 1: passes only when the draw % 11 == 0
    for (let seed = 1; seed < 40; seed++) {
      const t = setup({ xaccel: 90 }, seed);
      drawEnemy(t.c, 25);
      expect(t.e.exc, `seed ${seed}`).toBe(draws(seed, 1)[0]! % 11 === 0 ? 1 : 0);
    }
    // xaccel 20 (< 89): xaccel - 89u wraps to a huge unsigned value, so it always passes and the cap is negative
    const w = setup({ xaccel: 20 });
    drawEnemy(w.c, 25);
    expect(w.e.exc).toBe(0); // 0 < 20-89 is false: no step
    // enemy to the right of the player steps left
    const l = setup({ xaccel: 250, ex: 250 });
    drawEnemy(l.c, 25);
    expect(l.e.exc).toBe(-1);
  });

  it('removes the enemy at the horizontal and vertical limits, and keeps it inside them', () => {
    const cases: [number, number, number, number, boolean][] = [ // ex, ey, exc, eyc, stays
      [338, 50, 1, 0, true], [339, 50, 1, 0, true], [340, 50, 1, 0, false],
      [-80, 50, -1, 0, false], [-79, 50, -1, 0, true],
      [100, 189, 0, 1, true], [100, 190, 0, 1, false], [100, -111, 0, -1, true], [100, -112, 0, -1, false],
    ];
    for (const [ex, ey, exc, eyc, stays] of cases) {
      const { c, g } = setup({ ex, ey, exc, eyc });
      drawEnemy(c, 25);
      expect(g.enemies.enemyAvail[0], `${ex},${ey}`).toBe(stays ? 0 : 1);
    }
  });

  it('adds tempBackMove, counts onscreen enemies and skips ones off to the side', () => {
    const a = setup({});
    a.g.varz.tempBackMove = 3;
    drawEnemy(a.c, 25);
    expect([a.e.ey, a.g.enemies.enemyOnScreen]).toEqual([53, 1]);
    const b = setup({ ex: 296 });
    drawEnemy(b.c, 25);
    expect(b.g.enemies.enemyOnScreen).toBe(0);
    expect(b.g.enemies.enemyAvail[0]).toBe(0);
  });

  it('bounces at the bounce limits, nudges score items back on screen, and the 999 graphic frees the enemy', () => {
    const a = setup({ exc: 3, xmaxbounce: 103 });
    drawEnemy(a.c, 25);
    expect([a.e.ex, a.e.exc]).toEqual([103, -3]);
    const b = setup({ ex: -10, scoreitem: true, exc: 0 });
    drawEnemy(b.c, 25);
    expect(b.e.ex).toBe(-9);
    const c = setup({});
    c.e.egr[0] = 999;
    drawEnemy(c.c, 25);
    expect(c.g.enemies.enemyAvail[0]).toBe(1);
  });

  it('the constant-acceleration reversal (excc) ticks exccw and reverses at exrev', () => {
    const a = setup({ excc: 2, exccw: 1, exccwmax: 2, exccadd: 1, exrev: 2, exc: 0 });
    drawEnemy(a.c, 25);
    expect([a.e.exc, a.e.exccw, a.e.ex]).toEqual([1, 2, 101]);
    drawEnemy(a.c, 25);
    expect([a.e.exc, a.e.exccw]).toEqual([1, 1]);
    drawEnemy(a.c, 25);
    expect([a.e.exc, a.e.exccw, a.e.excc, a.e.exccadd, a.e.exrev]).toEqual([2, 2, -2, -1, -2]); // reached exrev: flips
  });

  it('iced and damaged enemies do not shoot; the iced counter runs down', () => {
    const a = setup({ iced: 2, enemyground: true, tur: Uint8Array.from([5, 0, 0]), freq: Uint8Array.from([1, 0, 0]), eshotwait: Uint8Array.from([1, 1, 1]) });
    a.g.enemyShots.enemyShotAvail.fill(true);
    drawEnemy(a.c, 25);
    expect([a.e.iced, a.e.filter, a.g.enemyShots.enemyShotAvail.some((x) => !x)]).toEqual([1, 9, false]);
  });

  it('fires a shot from the weapon record (no RNG when the weapon has no sound)', () => {
    const a = setup({ tur: Uint8Array.from([5, 0, 0]), freq: Uint8Array.from([6, 0, 0]), eshotwait: Uint8Array.from([1, 1, 1]) });
    a.g.enemyShots.enemyShotAvail.fill(true);
    a.g.items.weapons[5] = Object.assign(newWeaponType(), {
      multi: 1, max: 2, tx: 1, ty: 2, weapani: 3, acceleration: 1, accelerationx: -1,
      attack: [7, 8, 0, 0, 0, 0, 0, 0], del: [30, 31, 0, 0, 0, 0, 0, 0], sx: [2, -3, 0, 0, 0, 0, 0, 0],
      sy: [4, 5, 0, 0, 0, 0, 0, 0], bx: [1, 2, 0, 0, 0, 0, 0, 0], by: [3, 4, 0, 0, 0, 0, 0, 0], sg: [60, 61, 0, 0, 0, 0, 0, 0],
    });
    a.g.backgrounds.tempMapXOfs = 4;
    drawEnemy(a.c, 25);
    const s = a.g.enemyShots.enemyShot[0]!;
    expect(a.g.enemyShots.enemyShotAvail[0]).toBe(false);
    expect([s.sx, s.sy, s.sdmg, s.duration, s.sgr, s.tx, s.ty, s.animax, s.sxm, s.sym, s.sxc, s.syc])
      .toEqual([100 + 1 + 4, 50 + 3, 7, 30, 60, 1, 2, 3, 2, 4, -1, 1]);
    expect(a.e.eshotwait[0]).toBe(6);
    expect(a.e.eshotmultipos[0]).toBe(1);
    expect(a.g.scratch.temp2).toBe(4);
    expect(a.c.rng.calls).toBe(0);
  });

  it('launches an enemy: places it at the launcher and draws the sound RNG', () => {
    const a = setup({ launchfreq: 3, launchwait: 1, launchtype: 30 });
    a.g.enemies.enemyAvail.fill(1, 1);
    setDat(a.c, 30, { startx: 0, starty: 0, startyc: 0, esize: 0, xmove: 0, shapebank: 21 });
    a.g.items.enemyDat[30]!.elaunchtype = 0;
    // launchtype 30 is an enemy type here (tempW = launchtype); window for enemyOffset 25 is 0..24
    drawEnemy(a.c, 25);
    expect(a.g.scratch.b).toBe(2);
    const n = a.g.enemies.enemy[1]!;
    expect([n.ex, n.ey]).toEqual([100, 50 + 0 - 7]); // tempX, tempY + startyc, small enemy -7
    expect(a.e.launchwait).toBe(3);
    expect(a.g.varz.soundQueue.some((x) => x !== 0)).toBe(true);
    expect(a.c.rng.calls).toBeGreaterThanOrEqual(2);
  });
});

describe('randomEnemySpawn', () => {
  it('draws nothing when enemies are inactive; one draw when the frequency roll fails; two when it succeeds', () => {
    const a = mk(9);
    randomEnemySpawn(a);
    expect(a.rng.calls).toBe(0);

    const first = draws(9, 1)[0]!;
    a.game.varz.enemiesActive = true;
    a.game.events.levelEnemyMax = 3;
    a.game.events.levelEnemy.set([5, 6, 7]);
    a.game.enemies.enemyAvail.fill(1);
    setDat(a, 5, {}); setDat(a, 6, {}); setDat(a, 7, {});
    a.game.events.levelEnemyFrequency = first % 100; // roll > freq is false
    randomEnemySpawn(a);
    expect(a.rng.calls).toBe(1);

    const b = mk(9);
    b.game.varz.enemiesActive = true;
    b.game.events.levelEnemyMax = 3;
    b.game.events.levelEnemy.set([5, 6, 7]);
    b.game.enemies.enemyAvail.fill(1);
    setDat(b, 5, {}); setDat(b, 6, {}); setDat(b, 7, {});
    b.game.events.levelEnemyFrequency = (first % 100) - 1 < 0 ? 0 : (first % 100) - 1;
    if (first % 100 > 0) {
      randomEnemySpawn(b);
      expect(b.rng.calls).toBe(2);
      const pick = [5, 6, 7][draws(9, 2)[1]! % 3]!;
      expect(b.game.enemies.enemy[0]!.enemytype).toBe(pick);
      expect(b.game.scratch.b).toBe(1);
    }
  });

  it('type 2 queues the sound', () => {
    const c = mk(2);
    c.game.varz.enemiesActive = true;
    c.game.events.levelEnemyMax = 1;
    c.game.events.levelEnemy.set([2]);
    c.game.events.levelEnemyFrequency = 0;
    c.game.enemies.enemyAvail.fill(1);
    setDat(c, 2, {});
    for (let i = 0; i < 40 && c.game.varz.soundQueue[3] === 0; i++) randomEnemySpawn(c);
    expect(c.game.varz.soundQueue[3]).toBe(7);
  });
});

describe('eventJump / searchFor', () => {
  it('jumps to the first event at or after the target and remembers the return location', () => {
    const c = mk();
    const ev = c.game.events;
    [10, 20, 30, 65500].forEach((t, i) => { ev.eventRec[i]!.eventtime = t; });
    ev.curLoc = 15;
    eventJump(c, 25);
    expect([ev.curLoc, ev.returnLoc, ev.eventLoc]).toEqual([25, 16, 2]);
    eventJump(c, 65535);
    expect([ev.curLoc, ev.eventLoc]).toEqual([16, 1]);
  });

  it('searchFor returns the last matching live enemy', () => {
    const c = mk();
    const en = c.game.enemies;
    en.enemyAvail.fill(1);
    en.enemyAvail[3] = 0; en.enemyAvail[9] = 0; en.enemyAvail[12] = 2;
    en.enemy[3]!.linknum = 4; en.enemy[9]!.linknum = 4; en.enemy[12]!.linknum = 4;
    expect(searchFor(c, 4)).toBe(9);
    expect(searchFor(c, 5)).toBe(-1);
  });
});

describe('updateEnemyShots', () => {
  function shotCtx() {
    const c = mk();
    const g = c.game;
    g.enemyShots.enemyShotAvail.fill(true);
    g.players[0].x = 150; g.players[0].y = 150; g.players[0].isAlive = true;
    g.players[0].shotHitAreaX = 12; g.players[0].shotHitAreaY = 10;
    return { c, g };
  }
  const put = (g: import('../../src/game/world').GameWorld, z: number, over: Partial<import('../../src/game/world').EnemyShot>) => {
    g.enemyShots.enemyShotAvail[z] = false;
    Object.assign(g.enemyShots.enemyShot[z]!, { duration: 50, sgr: 5, ...over });
  };

  it('integrates velocity and acceleration, then position', () => {
    const { c, g } = shotCtx();
    put(g, 0, { sx: 50, sy: 20, sxm: 1, sym: 2, sxc: 1, syc: -1 });
    updateEnemyShots(c);
    const s = g.enemyShots.enemyShot[0]!;
    expect([s.sxm, s.sym, s.sx, s.sy, s.duration]).toEqual([2, 1, 52, 21, 49]);
    expect(g.enemyShots.enemyShotAvail[0]).toBe(false);
  });

  it('homes toward the player with tx / ty', () => {
    const { c, g } = shotCtx();
    put(g, 0, { sx: 50, sy: 20, tx: 2, ty: 1 });
    updateEnemyShots(c);
    const s = g.enemyShots.enemyShot[0]!;
    expect([s.sxm, s.sym]).toEqual([1, 1]); // player is right of and below the shot: +1 after the move
    expect([s.sx, s.sy]).toEqual([50, 20]);
  });

  it('frees on duration 0 (post-decrement), and at every screen limit', () => {
    const { c, g } = shotCtx();
    put(g, 0, { sx: 50, sy: 20, duration: 0 });
    put(g, 1, { sx: 50, sy: 20, duration: 1 });
    put(g, 2, { sx: 275, sy: 20, sxm: 1 });
    put(g, 3, { sx: 275, sy: 20 });
    put(g, 4, { sx: 1, sy: 20, sxm: -1 });
    put(g, 5, { sx: 50, sy: 190, sym: 1 });
    put(g, 6, { sx: 50, sy: 190 });
    put(g, 7, { sx: 50, sy: -13, sym: -1 });
    put(g, 8, { sx: 50, sy: -12, sym: -1 });
    updateEnemyShots(c);
    const freed = g.enemyShots.enemyShotAvail.slice(0, 9);
    expect(freed).toEqual([true, false, true, false, true, true, false, true, false]);
    expect(g.enemyShots.enemyShot[1]!.duration).toBe(0);
    updateEnemyShots(c);
    expect(g.enemyShots.enemyShotAvail[1]).toBe(true); // duration 0 on the next pass
  });

  it('animates by animax and wraps', () => {
    const { c, g } = shotCtx();
    put(g, 0, { sx: 50, sy: 20, animax: 2, animate: 0 });
    updateEnemyShots(c);
    expect(g.enemyShots.enemyShot[0]!.animate).toBe(1);
    updateEnemyShots(c);
    expect(g.enemyShots.enemyShot[0]!.animate).toBe(0);
  });

  it('hits the player: the shot is consumed, the shield absorbs it and the player is pushed', () => {
    const { c, g } = shotCtx();
    g.players[0].shield = 20;
    g.players[0].shieldMax = 20;
    g.players[0].armor = 10;
    put(g, 0, { sx: 148, sy: 148, sdmg: 5, sxm: 2, sym: -4 });
    updateEnemyShots(c);
    expect(g.enemyShots.enemyShotAvail[0]).toBe(true);
    expect(g.players[0].shield).toBe(15);
    expect(g.scratch.temp).toBe(0); // playerDamage returns 0 when the shield absorbs everything
    expect([g.players[0].xVelocity, g.players[0].yVelocity]).toEqual([0, 0]);
    expect(g.varz.soundQueue[7]).toBe(27);
    expect(g.explosions.explosions.filter((e) => e.ttl).length).toBe(10);
  });

  it('damage through the shield pushes the player by (speed * damage) / 2 and clobbers temp', () => {
    const { c, g } = shotCtx();
    g.players[0].shield = 2;
    g.players[0].armor = 10;
    put(g, 0, { sx: 148, sy: 148, sdmg: 5, sxm: 3, sym: -3 });
    updateEnemyShots(c);
    expect(g.players[0].shield).toBe(0);
    expect(g.players[0].armor).toBe(7);
    expect(g.scratch.temp).toBe(5);
    expect([g.players[0].xVelocity, g.players[0].yVelocity]).toEqual([7, -7]); // 15/2 and -15/2 truncate toward 0
    expect(g.varz.soundQueue[7]).toBe(19);
  });

  it('an invulnerable player takes no damage but still consumes the shot', () => {
    const { c, g } = shotCtx();
    g.players[0].shield = 2;
    g.players[0].invulnerableTicks = 5;
    put(g, 0, { sx: 148, sy: 148, sdmg: 5 });
    updateEnemyShots(c);
    expect(g.enemyShots.enemyShotAvail[0]).toBe(true);
    expect(g.players[0].shield).toBe(2);
  });

  it('fatal damage kills the player once', () => {
    const { c, g } = shotCtx();
    g.players[0].shield = 0;
    g.players[0].armor = 2;
    g.config.tyrMusicVolume = 99;
    playerDamage(c, 9, g.players[0]);
    expect([g.players[0].isAlive, g.players[0].armor, g.players[0].explodingTicks, g.varz.levelEnd, g.config.tempVolume])
      .toEqual([false, 0, 60, 40, 99]);
    expect(g.varz.soundQueue[1]).toBe(22);
  });
});

describeData('data-driven: demo-1 event enemies at NORMAL', () => {
  it('builds the first spawn events with armor/value/bank/position from enemyDat and the C draw count', () => {
    const c = testCtx()!;
    const g = c.game;
    loadItemDatIntoWorld(c);
    g.config.difficultyLevel = 2;
    const sample = [5, 6, 7, 15, 17, 18, 21, 22, 23, 24];
    let n = 0;
    for (const t of sample) {
      const dat = g.items.enemyDat[t]!;
      const e = g.enemies.enemy[n]!;
      const before = c.rng.calls;
      const avail = makeEnemy(c, e, t, 0);
      const expectedDraws = (dat.startxc !== 0 ? 1 : 0) + (dat.startyc !== 0 ? 1 : 0);
      expect(c.rng.calls - before, `enemy ${t}`).toBe(expectedDraws);
      expect(e.armorleft).toBe(dat.armor > 0 ? dat.armor : 255);
      expect(avail).toBe(dat.armor > 0 ? 0 : 2);
      expect(e.evalue).toBe(dat.value);
      expect(e.enemytype).toBe(t);
      if (dat.startxc === 0) expect(e.ex).toBe(dat.startx + 1);
      if (dat.startyc === 0) expect(e.ey).toBe(dat.starty + 1);
      n++;
    }
  });

  it('event 5 loads the enemy banks into stable slots that enemies reference', () => {
    const c = testCtx()!;
    const g = c.game;
    loadItemDatIntoWorld(c);
    setEnemySpriteSheets(c, [3, 0, 0, 0]);
    const slot = enemySheetSlot(g, 0);
    expect(slot.data.length).toBeGreaterThan(0);
    g.items.enemyDat[5]!.shapebank = 3;
    const e = g.enemies.enemy[0]!;
    makeEnemy(c, e, 5, 0);
    expect(e.sprite2s).toBe(slot);
    setEnemySpriteSheets(c, [4, 0, 0, 0]); // reload: the same slot object now holds the new bank
    expect(enemySheetSlot(g, 0)).toBe(slot);
    expect(e.sprite2s).toBe(slot);
    setEnemySpriteSheets(c, [0, 0, 0, 0]);
    expect(slot.data.length).toBe(0);
  });
});
