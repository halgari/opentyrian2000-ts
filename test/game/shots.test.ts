import { describe, expect, it } from 'vitest';
import {
  ShotOut, getShipInfo, playerShotCreate, playerShotMoveAndDraw, playerShotSetDirection, portConfigs,
} from '../../src/game/shots';
import { loadItemDatIntoWorld } from '../../src/game/episodes';
import { MAX_PWEAPON, newWeaponPort, newWeaponType, type WeaponType } from '../../src/game/world';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

const ctxOrDie = () => testCtx()!;

/** Installs a synthetic weapon record at id 1 and port 1 so the expectations are hand-computable. */
function withWeapon(over: Partial<WeaponType>, poweruse = 0) {
  const ctx = ctxOrDie();
  const g = ctx.game;
  const w = Object.assign(newWeaponType(), { multi: 1, max: 1, shotrepeat: 7, sound: 0, trail: 255, ...over });
  g.items.weapons[1] = w;
  g.items.weaponPort[1] = Object.assign(newWeaponPort(), { poweruse });
  g.players[0].deltaXShotMove = 0;
  g.players[0].deltaYShotMove = 0;
  return { ctx, g, w };
}

describeData('playerShotCreate (synthetic records)', () => {
  it('sets position, velocity, avail (= del), anim and shotRepeat from the record', () => {
    const { ctx, g } = withWeapon({
      attack: [5, 0, 0, 0, 0, 0, 0, 0], del: [20, 0, 0, 0, 0, 0, 0, 0], sx: [2, 0, 0, 0, 0, 0, 0, 0],
      sy: [10, 0, 0, 0, 0, 0, 0, 0], bx: [3, 0, 0, 0, 0, 0, 0, 0], by: [-4, 0, 0, 0, 0, 0, 0, 0],
      sg: [100, 0, 0, 0, 0, 0, 0, 0], weapani: 3, acceleration: 1, accelerationx: -1, sound: 9,
    });
    const slot = playerShotCreate(ctx, 1, 2, 100, 150, 100, 150, 1, 1);
    expect(slot).toBe(0);
    const s = g.playerShots.playerShotData[0]!;
    expect(g.playerShots.shotAvail[0]).toBe(20);
    expect([s.shotX, s.shotY, s.shotXM, s.shotYM, s.shotXC, s.shotYC]).toEqual([103, 146, 2, -10, -1, -1]);
    expect([s.shotGr, s.shotDmg, s.shotAniMax, s.playerNumber, s.aimAtEnemy]).toEqual([100, 5, 4, 1, 0]);
    expect(g.config.shotRepeat[2]).toBe(7);
    expect(g.config.shotMultiPos[2]).toBe(1);
    expect(g.varz.soundQueue[4]).toBe(9); // soundChannel[2]
  });

  it('shotGr 0 leaves the slot free; avail is a u8 (del 121 becomes 255 and clears the trail)', () => {
    const a = withWeapon({ sg: [0, 0, 0, 0, 0, 0, 0, 0], del: [5, 0, 0, 0, 0, 0, 0, 0] });
    playerShotCreate(a.ctx, 1, 1, 0, 0, 0, 0, 1, 1);
    expect(a.g.playerShots.shotAvail[0]).toBe(0);
    const b = withWeapon({ sg: [9, 0, 0, 0, 0, 0, 0, 0], del: [121, 0, 0, 0, 0, 0, 0, 0], trail: 12 });
    playerShotCreate(b.ctx, 1, 1, 0, 0, 0, 0, 1, 1);
    expect(b.g.playerShots.shotAvail[0]).toBe(255);
    expect(b.g.playerShots.playerShotData[0]!.shotTrail).toBe(0);
  });

  it('attack 100..249 is a chain reaction with damage 1; power is consumed and gates firing', () => {
    const { ctx, g } = withWeapon({ attack: [107, 0, 0, 0, 0, 0, 0, 0], sg: [1, 0, 0, 0, 0, 0, 0, 0], del: [3, 0, 0, 0, 0, 0, 0, 0] }, 10);
    g.config.power = 9;
    expect(playerShotCreate(ctx, 1, 1, 0, 0, 0, 0, 1, 1)).toBe(MAX_PWEAPON);
    expect(g.config.power).toBe(9);
    g.config.power = 25;
    playerShotCreate(ctx, 1, 1, 0, 0, 0, 0, 1, 1);
    expect(g.config.power).toBe(15);
    const s = g.playerShots.playerShotData[0]!;
    expect([s.chainReaction, s.shotDmg]).toEqual([7, 1]);
  });

  it('bounds checks, multi-shot uses successive free slots and advances shotMultiPos', () => {
    const { ctx, g } = withWeapon({
      multi: 2, max: 2, attack: [1, 2, 0, 0, 0, 0, 0, 0], sg: [1, 2, 0, 0, 0, 0, 0, 0],
      del: [3, 3, 0, 0, 0, 0, 0, 0], bx: [-5, 5, 0, 0, 0, 0, 0, 0],
    });
    expect(playerShotCreate(ctx, 61, 1, 0, 0, 0, 0, 1, 1)).toBe(MAX_PWEAPON);
    expect(playerShotCreate(ctx, 1, 1, 0, 0, 0, 0, 0, 1)).toBe(MAX_PWEAPON);
    expect(playerShotCreate(ctx, 1, 1, 0, 0, 0, 0, 1819, 1)).toBe(MAX_PWEAPON);
    expect(playerShotCreate(ctx, 1, 1, 50, 60, 0, 0, 1, 1)).toBe(1);
    expect(g.playerShots.playerShotData[0]!.shotX).toBe(45);
    expect(g.playerShots.playerShotData[1]!.shotX).toBe(55);
    expect(g.playerShots.playerShotData[1]!.shotDmg).toBe(2);
    // all slots busy => MAX_PWEAPON
    g.playerShots.shotAvail.fill(1);
    expect(playerShotCreate(ctx, 1, 1, 0, 0, 0, 0, 1, 1)).toBe(MAX_PWEAPON);
  });

  it('del 99 steers by the mouse delta, clamped to +-5 / +-4', () => {
    const { ctx, g } = withWeapon({
      sg: [1, 0, 0, 0, 0, 0, 0, 0], del: [99, 0, 0, 0, 0, 0, 0, 0], sx: [1, 0, 0, 0, 0, 0, 0, 0],
      sy: [2, 0, 0, 0, 0, 0, 0, 0],
    });
    playerShotCreate(ctx, 1, 1, 100, 100, 10, 200, 1, 1);
    const s = g.playerShots.playerShotData[0]!;
    expect(s.shotXM).toBe(1 + 5);
    expect(s.shotYM).toBe(-4);
  });

  it('circle size > 19 splits into X (mod 20) and Y (div 20) amplitudes', () => {
    const { ctx, g } = withWeapon({ sg: [1, 0, 0, 0, 0, 0, 0, 0], del: [3, 0, 0, 0, 0, 0, 0, 0], circlesize: 47 });
    playerShotCreate(ctx, 1, 1, 0, 0, 0, 0, 1, 1);
    const s = g.playerShots.playerShotData[0]!;
    expect(s.shotComplicated).toBe(true);
    expect([s.shotCirSizeX, s.shotDevX, s.shotCirSizeY, s.shotDevY, s.shotDirX, s.shotDirY]).toEqual([7, 3, 2, 1, 1, -1]);
  });

  it('guided shot (aim > 5) picks the closest non-score-item live enemy', () => {
    const { ctx, g } = withWeapon({ sg: [1, 0, 0, 0, 0, 0, 0, 0], del: [3, 0, 0, 0, 0, 0, 0, 0], aim: 9 });
    g.enemies.enemyAvail.fill(1);
    for (const [i, ex, ey] of [[3, 200, 100], [10, 110, 90], [20, 100, 99]] as const) {
      g.enemies.enemyAvail[i] = 0;
      g.enemies.enemy[i]!.ex = ex; g.enemies.enemy[i]!.ey = ey;
    }
    g.enemies.enemy[20]!.scoreitem = true;
    playerShotCreate(ctx, 1, 1, 100, 100, 100, 100, 1, 1);
    const s = g.playerShots.playerShotData[0]!;
    expect([s.aimAtEnemy, s.aimDelay, s.aimDelayMax]).toEqual([11, 5, 4]);
  });
});

describeData('playerShotMoveAndDraw', () => {
  it('moves N frames per the record: ym=-10 per frame, accel, and u8 shotAvail countdown', () => {
    const { ctx, g } = withWeapon({
      sg: [100, 0, 0, 0, 0, 0, 0, 0], del: [20, 0, 0, 0, 0, 0, 0, 0], sx: [2, 0, 0, 0, 0, 0, 0, 0],
      sy: [10, 0, 0, 0, 0, 0, 0, 0], attack: [4, 0, 0, 0, 0, 0, 0, 0], weapani: 1,
    });
    playerShotCreate(ctx, 1, 1, 100, 150, 0, 0, 1, 1);
    const out = new ShotOut();
    for (let f = 1; f <= 3; f++) {
      expect(playerShotMoveAndDraw(ctx, 0, out)).toBe(true);
      expect([out.shotX, out.shotY]).toEqual([100 + 2 * f, 150 - 10 * f]);
      expect(g.playerShots.shotAvail[0]).toBe(20 - f);
    }
    expect([out.shotDamage, out.playerNum, out.isSpecial]).toEqual([4, 1, false]);
    // animation: shotGr + shotAni, wrapping at weapani + 1 = 2
    expect(g.playerShots.playerShotData[0]!.shotAni).toBe(1);
  });

  it('leaves the screen: returns false and frees the slot', () => {
    const { ctx, g } = withWeapon({ sg: [100, 0, 0, 0, 0, 0, 0, 0], del: [50, 0, 0, 0, 0, 0, 0, 0], sy: [10, 0, 0, 0, 0, 0, 0, 0] });
    playerShotCreate(ctx, 1, 1, 100, 20, 0, 0, 1, 1);
    const out = new ShotOut();
    expect(playerShotMoveAndDraw(ctx, 0, out)).toBe(true); // y 10
    expect(playerShotMoveAndDraw(ctx, 0, out)).toBe(true); // y 0
    expect(playerShotMoveAndDraw(ctx, 0, out)).toBe(true); // y -10
    expect(playerShotMoveAndDraw(ctx, 0, out)).toBe(false); // y -20 < -15
    expect(g.playerShots.shotAvail[0]).toBe(0);
  });

  it('shotXM 101 / shotYM > 100 follow the player delta; the last slot (Zinglon) only counts down', () => {
    const { ctx, g } = withWeapon({
      sg: [100, 0, 0, 0, 0, 0, 0, 0], del: [20, 0, 0, 0, 0, 0, 0, 0], sx: [101, 0, 0, 0, 0, 0, 0, 0],
      sy: [0, 0, 0, 0, 0, 0, 0, 0],
    });
    g.players[0].deltaXShotMove = 4; g.players[0].deltaYShotMove = -3;
    playerShotCreate(ctx, 1, 1, 100, 100, 0, 0, 1, 1);
    const s = g.playerShots.playerShotData[0]!;
    expect([s.shotX, s.shotY]).toEqual([96, 103]); // create subtracts the deltas
    const out = new ShotOut();
    playerShotMoveAndDraw(ctx, 0, out);
    expect([out.shotX, out.shotY]).toEqual([96 + 101 - 101 + 4, 103 + 0 - 3]);

    g.playerShots.shotAvail[MAX_PWEAPON - 1] = 5;
    const before = out.shotX;
    expect(playerShotMoveAndDraw(ctx, MAX_PWEAPON - 1, out)).toBe(true);
    expect(g.playerShots.shotAvail[MAX_PWEAPON - 1]).toBe(4);
    expect(out.shotX).toBe(before);
  });

  it('shadow test is an unsigned compare (shadowYDist is a C uint): none when shotY < -10', () => {
    // darken of 0x1f is 0x17; the sprite itself never writes 0x17 over rows the shadow cannot reach
    const run = (startY: number): number => {
      const { ctx, g } = withWeapon({ sg: [100, 0, 0, 0, 0, 0, 0, 0], del: [20, 0, 0, 0, 0, 0, 0, 0], sy: [1, 0, 0, 0, 0, 0, 0, 0] });
      g.config.background2 = true;
      playerShotCreate(ctx, 1, 1, 100, startY + 1, 0, 0, 1, 1);
      ctx.vga.gameScreen.pixels.fill(0x1f);
      playerShotMoveAndDraw(ctx, 0, new ShotOut());
      return ctx.vga.gameScreen.pixels.reduce((n, v) => n + (v === 0x17 ? 1 : 0), 0);
    };
    expect(run(-8)).toBeGreaterThan(0); // shotY -8: -8 + 10 < 190 -> shadow row 2.. on screen
    expect(run(-12)).toBe(0); // shotY -12: (uint)(-2) is huge -> no shadow (a signed compare would draw it)
  });

  it('sprites above 60000 are specials with radius = half the option sprite size', () => {
    const { ctx, g } = withWeapon({ sg: [60001 + 36, 0, 0, 0, 0, 0, 0, 0], del: [20, 0, 0, 0, 0, 0, 0, 0], sy: [1, 0, 0, 0, 0, 0, 0, 0] });
    playerShotCreate(ctx, 1, 1, 100, 100, 0, 0, 1, 1);
    const out = new ShotOut();
    playerShotMoveAndDraw(ctx, 0, out);
    expect(out.isSpecial).toBe(true);
    expect(g.playerShots.playerShotData[0]!.shotAni).toBe(0);
    expect(out.specialRadiusW).toBeGreaterThan(0);
  });
});

describeData('playerShotSetDirection', () => {
  it('rotates the velocity with float32 sin/cos and picks the 16-direction sprite', () => {
    const { ctx, g } = withWeapon({ sg: [1, 0, 0, 0, 0, 0, 0, 0], del: [20, 0, 0, 0, 0, 0, 0, 0], sy: [-8, 0, 0, 0, 0, 0, 0, 0] });
    playerShotCreate(ctx, 1, 1, 0, 0, 0, 0, 1, 1);
    const s = g.playerShots.playerShotData[0]!;
    expect(s.shotYM).toBe(8);
    playerShotSetDirection(ctx, 0, 27, Math.PI / 2);
    expect(s.shotXM).toBe(-8);          // -round(sin(pi/2)*8)
    expect(s.shotYM).toBe(0);           // -round(cos(pi/2)*8) = -0
    expect(s.shotGr).toBe(1);           // linkMultiGr[4]
  });
});

describeData('real weapon records (ids 7, 5, 19, 29)', () => {
  it.each([7, 5, 19, 29])('weapon %i creates shots matching its record', (wp) => {
    const ctx = ctxOrDie();
    const g = ctx.game;
    g.items.episodeNum = 1;
    loadItemDatIntoWorld(ctx);
    const w = g.items.weapons[wp]!;
    g.items.weaponPort[1]!.poweruse = 0;
    g.players[0].deltaXShotMove = 0; g.players[0].deltaYShotMove = 0;
    const slot = playerShotCreate(ctx, 1, 1, 100, 150, 100, 150, wp, 1);
    const first = (w.multi - 1);
    expect(slot).toBe(first);
    const pos = g.config.shotMultiPos[1]! - 1;
    const s = g.playerShots.playerShotData[slot]!;
    expect(s.shotGr).toBe(w.sg[pos]);
    expect(s.shotX).toBe(100 + w.bx[pos]!);
    expect(s.shotY).toBe(150 + w.by[pos]!);
    expect(g.config.shotRepeat[1]).toBe(w.shotrepeat);
    expect(g.playerShots.shotAvail[slot]).toBe(w.sg[pos] === 0 ? 0 : w.del[pos] === 121 ? 255 : w.del[pos]);
  });
});

describeData('portConfigs', () => {
  it('returns the rear weapon port opnum and writes tempW', () => {
    const ctx = ctxOrDie();
    const g = ctx.game;
    g.items.weaponPort[5] = Object.assign(newWeaponPort(), { opnum: 2 });
    g.players[0].items.weapon[1].id = 5;
    expect(portConfigs(ctx)).toBe(2);
    expect(g.scratch.tempW).toBe(2);
  });
});

describeData('getShipInfo', () => {
  it('sets armor/powerAdd/hit area from ship and generator records', () => {
    const ctx = ctxOrDie();
    const g = ctx.game;
    g.items.episodeNum = 1;
    loadItemDatIntoWorld(ctx);
    g.players[0].items.ship = 1;
    g.players[0].items.generator = 1;
    getShipInfo(ctx);
    const ship = g.items.ships[1]!;
    expect(g.players[0].armor).toBe(ship.dmg);
    expect(g.players[0].initialArmor).toBe(ship.dmg);
    expect(g.config.powerAdd).toBe(g.items.powerSys[1]!.power);
    expect(g.players[1].armor).toBe(10);
    expect(g.varz.shipGr2).toBe(0);
    expect(g.varz.shipGr).toBe(ship.shipgraphic > 500 ? ship.shipgraphic - 500 : ship.shipgraphic);
    expect(g.players[0].shotHitAreaX).toBe(ship.ani === 0 ? 12 : 11);
    expect(g.players[0].shotHitAreaY).toBe(ship.ani === 0 ? 10 : 14);
  });
  it('throws for extra ships (unported)', () => {
    const ctx = ctxOrDie();
    ctx.game.items.ships[91] = Object.assign({}, ctx.game.items.ships[0]!);
    ctx.game.players[0].items.ship = 91;
    expect(() => getShipInfo(ctx)).toThrow(/unported/);
  });
});
