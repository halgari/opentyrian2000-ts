import { describe, expect, it } from 'vitest';
import { MersenneTwister } from '../../src/core/mtrand';
import type { Ctx } from '../../src/ctx';
import { loadItemDatIntoWorld } from '../../src/game/episodes';
import { doSpecialShot, sfCodes, specialComplete } from '../../src/game/specials';
import { createGameWorld, newSpecialType, SHOT_SPECIAL, SHOT_SPECIAL2 } from '../../src/game/world';
import { createSurface } from '../../src/video/surface';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

function mk(seed = 7): Ctx {
  const rng = new MersenneTwister();
  rng.srand(seed);
  return {
    rng, game: createGameWorld(),
    vga: { screen: createSurface(), screen2: createSurface(), gameScreen: createSurface() },
  } as unknown as Ctx;
}

function setSpecial(c: Ctx, id: number, stype: number, pwr = 0, wpn = 0) {
  c.game.items.special[id] = Object.assign(newSpecialType(), { stype, pwr, wpn });
}

describe('sfCodes (mainint.c:2432)', () => {
  /** drive one key of the combo table: 1 up, 2 down, 3 left, 4 right (+4 with fire), 9 idle */
  function press(c: Ctx, k: number) {
    const v = c.game.varz;
    v.button[0] = k >= 5 && k <= 8;
    const d = k === 9 ? 0 : ((k - 1) % 4) + 1;
    const px = 100, py = 100;
    const mx = d === 3 ? px + 1 : d === 4 ? px - 1 : px;
    const my = d === 1 ? py + 1 : d === 2 ? py - 1 : py;
    sfCodes(c, 1, px, py, mx, my);
  }

  it('a full combo sets SFExecuted and resets the progress', () => {
    const c = mk();
    const t = c.game.tables;
    const ship = 1;
    c.game.players[0].items.ship = ship;
    const combo = t.keyboardCombos[t.shipCombos[ship]![0]! - 1]!;
    const keys = combo.slice(0, combo.findIndex((k) => k > 100));
    const term = combo.find((k) => k > 100)!;
    for (const k of keys) press(c, k);
    expect(c.game.varz.SFExecuted[0]).toBe(term - 100);
    expect(c.game.varz.SFCurrentCode[0]![0]).toBe(0);
  });

  it('a wrong direction mid-combo cancels the progress, idle does not', () => {
    const c = mk();
    const t = c.game.tables;
    c.game.players[0].items.ship = 1;
    const combo = t.keyboardCombos[t.shipCombos[1]![0]! - 1]!;
    press(c, combo[0]!);
    expect(c.game.varz.SFCurrentCode[0]![0]).toBe(1);
    press(c, 9);
    expect(c.game.varz.SFCurrentCode[0]![0]).toBe(1);
    const wrong = [1, 2, 3, 4].find((k) => k !== combo[0] && (k - 1) % 4 !== (combo[1]! - 1) % 4)!;
    press(c, wrong);
    expect(c.game.varz.SFCurrentCode[0]![0]).toBe(0);
  });

  it('ships >= 15 skip the twiddle code', () => {
    const c = mk();
    c.game.players[0].items.ship = 15;
    c.game.varz.SFCurrentCode[0]![0] = 5;
    press(c, 1);
    expect(c.game.varz.SFCurrentCode[0]![0]).toBe(5);
  });
});

describe('specialComplete (varz.c:507)', () => {
  it('repulsor nudges every live enemy shot toward the ship and clobbers temp', () => {
    const c = mk();
    const g = c.game;
    setSpecial(c, 1, 2);
    g.players[0].x = 100; g.players[0].y = 50;
    g.enemyShots.enemyShotAvail[0] = false; g.enemyShots.enemyShot[0]!.sx = 50; g.enemyShots.enemyShot[0]!.sy = 60;
    g.enemyShots.enemyShotAvail[1] = true; g.enemyShots.enemyShot[1]!.sx = 50;
    g.enemyShots.enemyShotAvail[2] = false; g.enemyShots.enemyShot[2]!.sx = 100; g.enemyShots.enemyShot[2]!.sy = 50;
    specialComplete(c, 1, 1);
    expect([g.enemyShots.enemyShot[0]!.sxm, g.enemyShots.enemyShot[0]!.sym]).toEqual([-1, 1]);
    expect(g.enemyShots.enemyShot[1]!.sxm).toBe(0);
    expect([g.enemyShots.enemyShot[2]!.sxm, g.enemyShots.enemyShot[2]!.sym]).toEqual([0, 0]);
    expect(g.scratch.temp).toBe(60);
    expect(g.playerShots.nextSpecialWait).toBe(0);
  });

  it('zinglon sets duration, repeat and sound', () => {
    const c = mk();
    setSpecial(c, 3, 3);
    specialComplete(c, 1, 3);
    expect(c.game.playerShots.zinglonDuration).toBe(50);
    expect(c.game.config.shotRepeat[SHOT_SPECIAL]).toBe(100);
    expect(c.game.varz.soundQueue[7]).toBe(21);
  });

  it('attractor pulls only live pick-ups with a value', () => {
    const c = mk();
    const g = c.game;
    setSpecial(c, 4, 4);
    g.players[0].x = 100; g.players[0].y = 100;
    const e = g.enemies.enemy;
    for (let i = 0; i < 4; i++) { g.enemies.enemyAvail[i] = 0; e[i]!.scoreitem = true; e[i]!.evalue = 5; e[i]!.ex = 90; e[i]!.ey = 110; }
    g.enemies.enemyAvail[1] = 1; e[2]!.scoreitem = false; e[3]!.evalue = 0;
    g.enemies.enemyAvail.fill(1, 4);
    specialComplete(c, 1, 4);
    expect([e[0]!.exc, e[0]!.eyc]).toEqual([1, -1]);
    expect([e[1]!.exc, e[2]!.exc, e[3]!.exc]).toEqual([0, 0, 0]);
  });

  it('flare types set the filter/frequency/duration from the front weapon power', () => {
    const c = mk();
    const g = c.game;
    g.players[0].items.weapon[0].power = 3;
    setSpecial(c, 6, 6, 0, 77);
    specialComplete(c, 1, 6);
    expect(g.playerShots.flareStart).toBe(true);
    expect([g.varz.specialWeaponWpn, g.varz.specialWeaponFilter, g.varz.specialWeaponFreq, g.playerShots.flareDuration])
      .toEqual([77, 1, 7, 275]);
    setSpecial(c, 9, 9, 12);
    specialComplete(c, 1, 9);
    expect([g.playerShots.flareDuration, g.varz.linkToPlayer, g.playerShots.nextSpecialWait]).toEqual([14, true, 12]);
  });

  it('armor specials use the stale global temp2 (temp2 / 4 + 1)', () => {
    const c = mk();
    const g = c.game;
    setSpecial(c, 13, 13);
    g.scratch.temp2 = 10;
    g.players[0].armor = 5;
    specialComplete(c, 1, 13);
    expect(g.players[0].armor).toBe(8);
    expect(g.varz.soundQueue[3]).toBe(29);
  });
});

describeData('doSpecialShot (varz.c:682) with real assets', () => {
  function setup() {
    const ctx = testCtx()!;
    const g = ctx.game;
    setSpecial(ctx, 2, 2, 3);
    g.players[0].items.special = 2;
    g.players[0].shield = 10;
    g.players[0].x = 100; g.players[0].y = 50;
    g.enemyShots.enemyShotAvail[0] = false; g.enemyShots.enemyShot[0]!.sx = 10;
    g.config.shotRepeat[SHOT_SPECIAL] = 0;
    return { ctx, g, p: g.players[0] };
  }

  it('fire button fires the equipped special once (fireButtonHeld latch)', () => {
    const { ctx, g, p } = setup();
    g.varz.button[0] = true;
    doSpecialShot(ctx, 1, p);
    expect(g.enemyShots.enemyShot[0]!.sxm).toBe(-1);
    expect(g.varz.fireButtonHeld).toBe(true);
    doSpecialShot(ctx, 1, p);
    expect(g.enemyShots.enemyShot[0]!.sxm).toBe(-1);
    g.varz.button[0] = false;
    doSpecialShot(ctx, 1, p);
    expect(g.varz.fireButtonHeld).toBe(false);
  });

  it('a twiddled special costs shield (pwr 3) and runs the effect; too little shield cancels it', () => {
    const { ctx, g, p } = setup();
    g.varz.SFExecuted[0] = 2;
    doSpecialShot(ctx, 1, p);
    expect([p.shield, g.varz.SFExecuted[0], g.enemyShots.enemyShot[0]!.sxm, g.scratch.temp2]).toEqual([7, 0, -1, 3]);
    g.enemyShots.enemyShot[0]!.sxm = 0;
    p.shield = 2;
    g.varz.SFExecuted[0] = 2;
    doSpecialShot(ctx, 1, p);
    expect([p.shield, g.varz.SFExecuted[0], g.enemyShots.enemyShot[0]!.sxm]).toEqual([2, 0, 0]);
  });

  it('cost 98 takes all shield (needs >= 4), 99 half, >100 armor', () => {
    const { ctx, g, p } = setup();
    setSpecial(ctx, 2, 2, 98);
    p.shield = 9; g.varz.SFExecuted[0] = 2;
    doSpecialShot(ctx, 1, p);
    expect([p.shield, g.enemyShots.enemyShot[0]!.sxm, g.scratch.temp2]).toEqual([0, -1, 9]);
    setSpecial(ctx, 2, 2, 99);
    p.shield = 9; g.varz.SFExecuted[0] = 2;
    doSpecialShot(ctx, 1, p);
    expect([p.shield, g.scratch.temp2]).toEqual([4, 4]);
    setSpecial(ctx, 2, 2, 105);
    p.armor = 5; p.shield = 9; g.varz.SFExecuted[0] = 2;
    doSpecialShot(ctx, 1, p);
    expect(p.armor).toBe(5); // armor must be strictly greater than the cost
    p.armor = 6; g.varz.SFExecuted[0] = 2; g.config.shotRepeat[SHOT_SPECIAL] = 0;
    doSpecialShot(ctx, 1, p);
    expect(p.armor).toBe(1);
  });

  it('weapon-type flare: duration counts down and shotRepeat re-arms at the end', () => {
    const { ctx, g, p } = setup();
    setSpecial(ctx, 2, 5, 0, 1); // stype 5 flare, filter 7
    g.varz.SFExecuted[0] = 2;
    doSpecialShot(ctx, 1, p);
    // flareDuration was set to 50 then immediately decremented once in the same call
    expect(g.playerShots.flareDuration).toBe(49);
    expect(g.config.levelFilter).toBe(7);
    expect(g.config.filterActive).toBe(true);
    for (let i = 0; i < 48; i++) doSpecialShot(ctx, 1, p);
    expect(g.playerShots.flareDuration).toBe(1);
    doSpecialShot(ctx, 1, p);
    expect([g.playerShots.flareDuration, g.config.shotRepeat[SHOT_SPECIAL], g.config.levelFilter, g.config.filterActive])
      .toEqual([0, 200, -99, false]);
    expect(g.config.shotRepeat[SHOT_SPECIAL2]).toBe(0);
  });
});

describeData('random flare shot position (varz.c, doSpecialShot)', () => {
  it('draws y (% 180) before x (% 280), as gcc evaluates the call arguments', () => {
    const ctx = testCtx()!;
    const g = ctx.game;
    loadItemDatIntoWorld(ctx);
    const ref = new MersenneTwister();
    ref.srand(99);
    ctx.rng.srand(99);
    const gate = ref.rand(); // `mt_rand() % 6 < specialWeaponFreq`
    const ry = ref.rand() % 180;
    const rx = ref.rand() % 280;
    expect(gate).toBeDefined();
    expect(ry).not.toBe(rx);
    g.playerShots.flareDuration = 5;
    g.varz.specialWeaponFilter = -99;
    g.varz.specialWeaponFreq = 6;
    g.varz.linkToPlayer = false;
    g.varz.specialWeaponWpn = 1;
    g.config.power = 1000;
    g.config.shotRepeat[SHOT_SPECIAL] = 0;
    doSpecialShot(ctx, 1, g.players[0]);
    const w = g.items.weapons[1]!;
    const idx = g.scratch.b; // slot of the shot just created
    expect(idx).toBeLessThan(g.playerShots.playerShotData.length);
    const shot = g.playerShots.playerShotData[idx]!;
    expect([shot.shotX - w.bx[0]!, shot.shotY - w.by[0]!]).toEqual([rx, ry]);
  });
});

