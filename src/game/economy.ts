// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (weapon_upgrade_cost, JE_getCost, JE_totalScore, JE_getValue, adjust_difficulty)
import { f32, roundf32 } from '../core/cmath';
import { u16, u32 } from '../core/int';
import type { Ctx } from '../ctx';
import {
  DIFFICULTY_EASY, DIFFICULTY_HARD, DIFFICULTY_IMPOSSIBLE, DIFFICULTY_INSANITY, DIFFICULTY_MANIACAL, DIFFICULTY_NORMAL,
  DIFFICULTY_NORTANEOUS, DIFFICULTY_SUICIDE, DIFFICULTY_ZINGLON, FRONT_WEAPON, REAR_WEAPON, type Player,
} from './world';

// port of weapon_upgrade_cost (mainint.c:581)
export function weaponUpgradeCost(baseCost: number, power: number): number {
  power = u32(power);
  if (power > 11) throw new RangeError(`weaponUpgradeCost: assert(power <= 11) failed (${power})`);
  let temp = 0; // 0 1 3 6 10 15 21 29 ...
  for (; power > 0; power--) temp += power;
  return baseCost * temp;
}

// port of JE_getCost (mainint.c:594). Side effect: sets varz.upgradeCost / downgradeCost for item types 3 and 4.
export function getCost(ctx: Ctx, itemType: number, itemNum: number): number {
  const g = ctx.game;
  let cost = 0;
  switch (itemType) {
    case 2:
      cost = itemNum > 90 ? 100 : g.items.ships[itemNum]!.cost;
      break;
    case 3:
    case 4: {
      cost = g.items.weaponPort[itemNum]!.cost;
      const port = itemType - 3;
      const itemPower = u32(g.players[0].items.weapon[port]!.power - 1);
      g.varz.downgradeCost = u16(weaponUpgradeCost(cost, itemPower));
      g.varz.upgradeCost = u16(weaponUpgradeCost(cost, itemPower + 1));
      break;
    }
    case 5:
      cost = g.items.shields[itemNum]!.cost;
      break;
    case 6:
      cost = g.items.powerSys[itemNum]!.cost;
      break;
    case 7:
    case 8:
      cost = g.items.options[itemNum]!.cost;
      break;
  }
  return cost;
}

// port of JE_getValue (mainint.c:945)
export function getValue(ctx: Ctx, itemType: number, itemNum: number): number {
  const g = ctx.game;
  let value = 0;
  switch (itemType) {
    case 2:
      value = g.items.ships[itemNum]!.cost;
      break;
    case 3:
    case 4: {
      const baseValue = g.items.weaponPort[itemNum]!.cost;
      // if two-player, use first player's front and second player's rear weapon
      const port = itemType - 3;
      const itemPower = u32(g.players[g.config.twoPlayerMode ? port : 0].items.weapon[port]!.power - 1);
      value = baseValue;
      for (let i = 1; i <= itemPower; ++i) value += weaponUpgradeCost(baseValue, i);
      break;
    }
    case 5:
      value = g.items.shields[itemNum]!.cost;
      break;
    case 6:
      value = g.items.powerSys[itemNum]!.cost;
      break;
    case 7:
    case 8:
      value = g.items.options[itemNum]!.cost;
      break;
  }
  return value;
}

// port of JE_totalScore (mainint.c:~930)
export function totalScore(ctx: Ctx, p: Player): number {
  let temp = p.cash;
  temp += getValue(ctx, 2, p.items.ship);
  temp += getValue(ctx, 3, p.items.weapon[FRONT_WEAPON]!.id);
  temp += getValue(ctx, 4, p.items.weapon[REAR_WEAPON]!.id);
  temp += getValue(ctx, 5, p.items.shield);
  temp += getValue(ctx, 6, p.items.generator);
  temp += getValue(ctx, 7, p.items.sidekick[0]);
  temp += getValue(ctx, 8, p.items.sidekick[1]);
  return temp;
}

// float score_multiplier[10]
const SCORE_MULTIPLIER = [0, 0.4, 0.8, 1.3, 1.6, 2, 2, 3, 3, 3].map(f32);

// port of adjust_difficulty (mainint.c:2268). `score * multiplier` is a float32 multiply (ulong -> float first).
export function adjustDifficulty(ctx: Ctx): void {
  const g = ctx.game;
  const c = g.config;
  if (!(c.initialDifficulty > 0 && c.initialDifficulty < 10)) throw new RangeError('adjustDifficulty: assert(initialDifficulty in 1..9) failed');

  const score = c.twoPlayerMode ? g.players[0].cash + g.players[1].cash : totalScore(ctx, g.players[0]);
  const adjusted = roundf32(f32(f32(score) * SCORE_MULTIPLIER[c.initialDifficulty]!));

  let nd: number;
  if (c.twoPlayerMode) {
    if (adjusted < 10000) nd = DIFFICULTY_EASY;
    else if (adjusted < 20000) nd = DIFFICULTY_NORMAL;
    else if (adjusted < 50000) nd = DIFFICULTY_HARD;
    else if (adjusted < 80000) nd = DIFFICULTY_IMPOSSIBLE;
    else if (adjusted < 125000) nd = DIFFICULTY_INSANITY;
    else if (adjusted < 200000) nd = DIFFICULTY_SUICIDE;
    else if (adjusted < 400000) nd = DIFFICULTY_MANIACAL;
    else if (adjusted < 600000) nd = DIFFICULTY_ZINGLON;
    else nd = DIFFICULTY_NORTANEOUS;
  } else {
    if (adjusted < 40000) nd = DIFFICULTY_EASY;
    else if (adjusted < 70000) nd = DIFFICULTY_NORMAL;
    else if (adjusted < 150000) nd = DIFFICULTY_HARD;
    else if (adjusted < 300000) nd = DIFFICULTY_IMPOSSIBLE;
    else if (adjusted < 600000) nd = DIFFICULTY_INSANITY;
    else if (adjusted < 1000000) nd = DIFFICULTY_SUICIDE;
    else if (adjusted < 2000000) nd = DIFFICULTY_MANIACAL;
    else if (adjusted < 3000000) nd = DIFFICULTY_ZINGLON;
    else nd = DIFFICULTY_NORTANEOUS;
  }
  c.difficultyLevel = Math.max(c.difficultyLevel, nd);
}
