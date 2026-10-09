import { describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/ctx';
import { adjustDifficulty, getCost, getValue, totalScore, weaponUpgradeCost } from '../../src/game/economy';
import { createGameWorld } from '../../src/game/world';

function fakeCtx(): Ctx {
  const game = createGameWorld();
  game.items.ships[3]!.cost = 1000;
  game.items.weaponPort[5]!.cost = 100;
  game.items.weaponPort[6]!.cost = 200;
  game.items.shields[2]!.cost = 300;
  game.items.powerSys[4]!.cost = 400;
  game.items.options[7]!.cost = 50;
  game.items.options[8]!.cost = 60;
  for (const p of game.players) for (const w of p.items.weapon) w.power = 1; // power 0 would trip the C assert
  return { game } as unknown as Ctx;
}

describe('weaponUpgradeCost (mainint.c:581)', () => {
  it('is base * triangular(power)', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 11].map((p) => weaponUpgradeCost(10, p))).toEqual([0, 10, 30, 60, 100, 150, 210, 280, 660]);
  });
  it('asserts power <= 11', () => {
    expect(() => weaponUpgradeCost(10, 12)).toThrow(/power <= 11/);
  });
});

describe('getCost / getValue / totalScore', () => {
  it('getCost per item type; ship ids > 90 cost 100', () => {
    const ctx = fakeCtx();
    expect(getCost(ctx, 2, 3)).toBe(1000);
    expect(getCost(ctx, 2, 91)).toBe(100);
    expect(getCost(ctx, 5, 2)).toBe(300);
    expect(getCost(ctx, 6, 4)).toBe(400);
    expect(getCost(ctx, 7, 7)).toBe(50);
    expect(getCost(ctx, 8, 8)).toBe(60);
    expect(getCost(ctx, 9, 0)).toBe(0);
  });
  it('getCost for weapons sets downgradeCost/upgradeCost from player[0]\'s power', () => {
    const ctx = fakeCtx();
    ctx.game.players[0].items.weapon[0]!.power = 3; // item_power = 2
    expect(getCost(ctx, 3, 5)).toBe(100);
    expect(ctx.game.varz.downgradeCost).toBe(100 * 3); // triangular(2)
    expect(ctx.game.varz.upgradeCost).toBe(100 * 6); // triangular(3)
    ctx.game.players[0].items.weapon[1]!.power = 1;
    getCost(ctx, 4, 6);
    expect(ctx.game.varz.downgradeCost).toBe(0);
    expect(ctx.game.varz.upgradeCost).toBe(200);
  });
  it('getValue sums the upgrade costs already paid', () => {
    const ctx = fakeCtx();
    ctx.game.players[0].items.weapon[0]!.power = 3;
    expect(getValue(ctx, 3, 5)).toBe(100 + 100 * 1 + 100 * 3);
    ctx.game.players[0].items.weapon[0]!.power = 1;
    expect(getValue(ctx, 3, 5)).toBe(100);
  });
  it('getValue uses player[port] power only in two-player mode', () => {
    const ctx = fakeCtx();
    ctx.game.players[0].items.weapon[1]!.power = 1;
    ctx.game.players[1].items.weapon[1]!.power = 3;
    expect(getValue(ctx, 4, 6)).toBe(200);
    ctx.game.config.twoPlayerMode = true;
    expect(getValue(ctx, 4, 6)).toBe(200 + 200 + 600);
  });
  it('totalScore = cash + values of all seven slots', () => {
    const ctx = fakeCtx();
    const p = ctx.game.players[0];
    p.cash = 12345;
    p.items.ship = 3; p.items.weapon[0]!.id = 5; p.items.weapon[0]!.power = 2;
    p.items.weapon[1]!.id = 6; p.items.weapon[1]!.power = 1;
    p.items.shield = 2; p.items.generator = 4; p.items.sidekick = [7, 8];
    expect(totalScore(ctx, p)).toBe(12345 + 1000 + (100 + 100) + 200 + 300 + 400 + 50 + 60);
  });
});

describe('adjustDifficulty (mainint.c:2268)', () => {
  const run = (initial: number, cash: number, two = false, level = 0): number => {
    const ctx = fakeCtx();
    const g = ctx.game;
    g.config.initialDifficulty = initial;
    g.config.difficultyLevel = level;
    g.config.twoPlayerMode = two;
    g.players[0].cash = cash;
    if (two) g.players[1].cash = 0;
    adjustDifficulty(ctx);
    return g.config.difficultyLevel;
  };
  it('single-player thresholds (multiplier 2 for initial difficulty 5)', () => {
    expect(run(5, 19999)).toBe(1); // 39998 < 40000
    expect(run(5, 20000)).toBe(2); // 40000
    expect(run(5, 35000)).toBe(3); // 70000
    expect(run(5, 75000)).toBe(4); // 150000
    expect(run(5, 150000)).toBe(5); // 300000
    expect(run(5, 300000)).toBe(6); // 600000
    expect(run(5, 500000)).toBe(7); // 1000000
    expect(run(5, 1000000)).toBe(8); // 2000000
    expect(run(5, 1500000)).toBe(9); // 3000000
    expect(run(5, 2000000)).toBe(9);
  });
  it('two-player thresholds use summed cash only', () => {
    expect(run(5, 4999, true)).toBe(1); // 9998
    expect(run(5, 5000, true)).toBe(2); // 10000
    expect(run(5, 300000, true)).toBe(9); // 600000
  });
  it('multiplies in float32: 1.3f * 115385 rounds down to 150000 before the compare, 115384 stays below', () => {
    expect(run(3, 115384)).toBe(3);
    expect(run(3, 115385)).toBe(4);
    // 0.4f = 0.4000000059604645: 100000 * 0.4f = 40000.00059 -> float32 40000.0 (not below 40000)
    expect(run(1, 100000)).toBe(2);
    expect(run(1, 99998)).toBe(1); // 39999.2 -> roundf 39999
    expect(run(1, 99999)).toBe(2); // 39999.6 -> roundf 40000
  });
  it('never lowers difficultyLevel', () => {
    expect(run(2, 0, false, 6)).toBe(6);
  });
  it('asserts initialDifficulty in 1..9', () => {
    expect(() => run(0, 1)).toThrow();
    expect(() => run(10, 1)).toThrow();
  });
});
