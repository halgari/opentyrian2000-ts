// SPDX-License-Identifier: GPL-2.0-or-later
// Key constants and step helpers shared by the oracle session specs (ts-scenario.ts, ts-specs-polish.ts).
import type { Ctx } from '../../src/ctx';
import type { ScriptStep } from '../../test/helpers/script-input';
import type { Scenario } from './scenarios';

export const RET = 40, RIGHT = 79, LEFT = 80, LCTRL = 224, LALT = 226, BKSP = 42, ESC = 41, SPACE = 44, DOWN = 81, UP = 82, F2 = 59, F6 = 63, F7 = 64;

export const dead = (): ((c: Ctx) => boolean) => {
  let wasAlive = false; // isAlive is also false before the level starts
  return (c) => {
    wasAlive = wasAlive || c.game.players[0].isAlive;
    return wasAlive && !c.game.players[0].isAlive && !c.game.varz.firstGameOver;
  };
};

/** title -> Full Game -> episode 1 -> difficulty (after `difficultyKeys`) -> shop 1 (Next Level) -> first planet. */
export const toLevel = (difficultyKeys: number[] = []): ScriptStep[] => [
  { sc: RET }, { sc: RET }, { sc: RET }, ...difficultyKeys.map((sc) => ({ sc })), { sc: RET },
  { sc: DOWN, after: 12 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: RET, after: 1 }, { sc: RET, after: 4 },
];
export const shopNextLevel = (first: number): ScriptStep[] => [
  { sc: DOWN, after: first }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: RET, after: 1 }, { sc: RET, after: 4 },
];
/** The F2+F6+F7 cheat: ends the level; a key cuts the tally's glow animation short, another leaves its final "Press a key". */
export const skipLevel = (wait: number): ScriptStep[] => [
  { sc: F2, hold: 4, after: wait }, { sc: F6, hold: 4, after: 0 }, { sc: F7, hold: 4, after: 0 }, { sc: RET, after: 120 }, { sc: RET, after: 8 },
];
export const gameOver = (): ScriptStep => ({ sc: RET, when: dead(), hold: 1 });


/**
 * Real held input for one level: fire held for `frames`, a sweep of arrow holds (deterministic LCG pattern, overlapping holds are
 * allowed), the change-fire key tapped now and then, and the left / right sidekick keys held in bursts.
 */
export const playHolds = (frames: number, seed: number): ScriptStep[] => {
  let r = seed >>> 0;
  const rnd = (n: number): number => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return (r >>> 8) % n; };
  const out: ScriptStep[] = [{ sc: SPACE, hold: frames, after: 0 }];
  const dirs = [LEFT, RIGHT, UP, DOWN];
  for (let used = 0; used < frames - 120;) {
    const gap = 1 + rnd(25), hold = 5 + rnd(50);
    const sc = rnd(9) === 0 ? (rnd(2) ? LCTRL : LALT) : rnd(14) === 0 ? RET : dirs[rnd(4)]!;
    out.push(sc === RET ? { sc, after: gap } : { sc, hold, after: gap });
    used += gap;
  }
  return out;
};
export const readCube = (): ScriptStep[] => [{ sc: RET, after: 60 }, { sc: ESC, after: 100 }, { sc: ESC, after: 30 }];
/** The weapon sim: power +2 on the current weapon, Done buys. */
export const buyWeapon = (): ScriptStep[] => [
  { sc: RIGHT, after: 40 }, { sc: RIGHT, after: 12 }, { sc: DOWN, after: 12 }, { sc: DOWN, after: 12 }, { sc: RET, after: 12 }, { sc: RET, after: 12 },
];
/** A list screen (shield, generator, sidekick): the entry below the current one is bought. */
export const buyListItem = (): ScriptStep[] => [{ sc: DOWN, after: 20 }, { sc: RET, after: 12 }, { sc: ESC, after: 12 }];
/** The sidekick screen (list plus sim): the entry below the current one, Return buys and leaves for the Upgrade Ship menu. */
export const buySidekick = (): ScriptStep[] => [{ sc: UP, after: 20 }, { sc: RET, after: 20 }];
/**
 * Shop: Upgrade Ship (the menu starts on Ship Type each visit), the sub-screen of `row` (1 front gun, 2 rear gun, 3 shield, 4 generator,
 * 5 left sidekick, 6 right sidekick) with a purchase, Esc to the main menu, then Next Level (the main menu cursor stays on Upgrade Ship).
 */
export const shopBuyNextLevel = (first: number, row = 1): ScriptStep[] => [
  { sc: DOWN, after: first }, { sc: DOWN, after: 8 }, { sc: RET, after: 8 },
  ...Array.from({ length: row }, () => ({ sc: DOWN, after: 12 })), { sc: RET, after: 12 },
  ...(row <= 2 ? buyWeapon() : row <= 4 ? buyListItem() : buySidekick()),
  { sc: ESC, after: 20 },
  { sc: DOWN, after: 12 }, { sc: DOWN, after: 8 }, { sc: RET, after: 8 }, { sc: RET, after: 8 },
];

/** Typed characters of a name, one per `gap` frames (the entry loop presents frames continuously). */
export const typed = (text: string, gap = 20): ScriptStep[] => [...text].map((ch) => ({
  sc: ch === ' ' ? SPACE : ch >= '0' && ch <= '9' ? (ch === '0' ? 39 : 30 + Number(ch) - 1) : 4 + (ch.toLowerCase().charCodeAt(0) - 97), ch, after: gap,
}));
export const idleKey = (sc = RET): ScriptStep => ({ sc, idle: true });
export const loadSlot = (n: number): ScriptStep[] => [{ sc: DOWN }, { sc: RET }, ...Array.from({ length: n - 1 }, () => ({ sc: DOWN })), { sc: RET }];


export interface Spec {
  steps: () => ScriptStep[]; tail: number; extra?: Partial<Scenario>; setup?: (ctx: Ctx) => void;
  /** Name of a seed in SEEDS (ts-save.ts): the C gets it as its HOME tyrian.sav and the TS loads the same bytes into storage. */
  seed?: string;
}
