import { describe, expect, it } from 'vitest';
import { DemoReader, parseDemo } from '../../src/data/demo-file';
import { loadItemDatIntoWorld } from '../../src/game/episodes';
import { calcPurpleBallsNeeded, handleGotPurpleBall, mainGamePlayerFunctions, nortSparkPos, powerUpWeapon } from '../../src/game/player';
import { getShipInfo } from '../../src/game/shots';
import { newWeaponPort, newWeaponType } from '../../src/game/world';
import { MersenneTwister } from '../../src/core/mtrand';
import type { Ctx } from '../../src/ctx';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

/** 32-byte header followed by 3-byte records {keys, wait hi, wait lo} and one trailing byte. */
function demoBytes(records: [number, number][]): Uint8Array {
  const out = new Uint8Array(32 + records.length * 3 + 1);
  records.forEach(([keys, wait], i) => { out[32 + i * 3] = keys; out[33 + i * 3] = wait >> 8; out[34 + i * 3] = wait & 0xff; });
  return out;
}

function setup(records: [number, number][]) {
  const ctx = testCtx()!;
  const g = ctx.game;
  ctx.state.playDemo = true;
  loadItemDatIntoWorld(ctx);
  g.players[0].items.ship = 1;
  g.players[0].items.weapon[0].id = 0;
  g.players[0].items.weapon[1].id = 0;
  getShipInfo(ctx);
  g.players[0].isAlive = true;
  g.players[0].x = 100; g.players[0].y = 100;
  g.demo.demoFile = new DemoReader(parseDemo(demoBytes(records)));
  g.config.shotRepeat.fill(0);
  return { ctx, g, p: g.players[0] };
}

describeData('mainGamePlayerFunctions: movement (mainint.c:4113-4135)', () => {
  it('right x10 then idle: velocity, friction, clamp and position follow the hand-computed sequence', () => {
    const { ctx, p } = setup([[0b1000, 10], [0, 30]]);
    const vel = [1, 2, 2, 3, 3, 4, 4, 4, 4, 4, 3, 3, 2, 2, 1, 1, 0];
    const xs = [102, 105, 108, 112, 116, 121, 126, 131, 136, 141, 144, 147, 149, 151, 152, 153, 153];
    for (let i = 0; i < vel.length; i++) {
      mainGamePlayerFunctions(ctx);
      expect([p.xVelocity, p.x, p.y], `frame ${i + 1}`).toEqual([vel[i], xs[i], 100]);
    }
  });

  it('clamps x to [40, 256] and y to [10, 160]', () => {
    const { ctx, p } = setup([[0b1000, 12], [0b0010, 60]]);
    p.x = 250; p.y = 155;
    for (let i = 0; i < 12; i++) mainGamePlayerFunctions(ctx);
    expect(p.x).toBe(256);
    for (let i = 0; i < 30; i++) mainGamePlayerFunctions(ctx);
    expect(p.y).toBe(160);
  });

  it('records the position history only when the ship moved', () => {
    const { ctx, p } = setup([[0b1000, 1], [0, 5]]);
    mainGamePlayerFunctions(ctx);
    expect([p.oldX[19], p.oldY[19]]).toEqual([102, 100]);
    mainGamePlayerFunctions(ctx); // velocity 1 -> still moving
    expect(p.oldX[19]).toBe(103);
  });
});

describeData('mainGamePlayerFunctions: firing cadence', () => {
  it('with fire held, shots appear every shotrepeat+1 frames', () => {
    const { ctx, g, p } = setup([[0b10000, 40]]);
    g.items.weapons[1] = Object.assign(newWeaponType(), {
      multi: 1, max: 1, shotrepeat: 3, trail: 255, attack: [5, 0, 0, 0, 0, 0, 0, 0],
      del: [20, 0, 0, 0, 0, 0, 0, 0], sg: [100, 0, 0, 0, 0, 0, 0, 0],
    });
    g.items.weaponPort[1] = Object.assign(newWeaponPort(), { opnum: 1, poweruse: 0 });
    g.items.weaponPort[1]!.op[0][0] = 1;
    p.items.weapon[0].id = 1;
    p.items.weapon[0].power = 1;
    g.config.power = 1000;
    const live: number[] = [];
    for (let i = 0; i < 9; i++) {
      mainGamePlayerFunctions(ctx);
      live.push(g.playerShots.shotAvail.reduce((n, a) => n + (a !== 0 ? 1 : 0), 0));
    }
    expect(live).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3]);
  });
});

describeData('player.c', () => {
  it('calcPurpleBallsNeeded indexes by lives (front power)', () => {
    const { p } = setup([[0, 1]]);
    p.items.weapon[0].power = 5;
    calcPurpleBallsNeeded(p);
    expect(p.purpleBallsNeeded).toBe(12);
  });

  it('powerUpWeapon raises power and resets shotMultiPos; at max it pays 1000 cash', () => {
    const { ctx, g, p } = setup([[0, 1]]);
    p.items.weapon[0].id = 3; p.items.weapon[0].power = 4;
    g.config.shotMultiPos[0] = 5;
    expect(powerUpWeapon(ctx, p, 0)).toBe(true);
    expect([p.items.weapon[0].power, g.config.shotMultiPos[0], p.purpleBallsNeeded]).toEqual([5, 0, 12]);
    p.items.weapon[0].power = 11; p.cash = 7;
    expect(powerUpWeapon(ctx, p, 0)).toBe(false);
    expect(p.cash).toBe(1007);
    p.items.weapon[1].id = 0; p.cash = 0;
    expect(powerUpWeapon(ctx, p, 1)).toBe(false);
    expect(p.cash).toBe(1000);
  });

  it('handleGotPurpleBall counts down, then powers up the front weapon', () => {
    const { ctx, p } = setup([[0, 1]]);
    p.items.weapon[0].id = 3; p.items.weapon[0].power = 1;
    p.purpleBallsNeeded = 2;
    handleGotPurpleBall(ctx, p);
    expect([p.purpleBallsNeeded, p.items.weapon[0].power]).toEqual([1, 1]);
    handleGotPurpleBall(ctx, p);
    expect(p.items.weapon[0].power).toBe(2);
    expect(p.purpleBallsNeeded).toBe(2); // lives alias = power 2 -> purple_balls_required[2]
  });
});

describe('NortSparks RNG order (mainint.c:4250)', () => {
  it('draws y first, then x, as gcc evaluates the call arguments', () => {
    const rng = new MersenneTwister();
    rng.srand(12345);
    const ref = new MersenneTwister();
    ref.srand(12345);
    const first = ref.rand() % 8;
    const second = ref.rand() % 8;
    // pick a seed whose two draws differ so the test can tell the orders apart
    expect(first).not.toBe(second);
    const [x, y] = nortSparkPos({ rng } as unknown as Ctx, 100, 200);
    expect(y).toBe(200 + first - 4);
    expect(x).toBe(100 + second - 4);
  });
});
