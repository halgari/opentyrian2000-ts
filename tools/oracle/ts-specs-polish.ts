// SPDX-License-Identifier: GPL-2.0-or-later
// Session specs and seed saves of the polish/ship modes (ENGAGE, SuperTyrian completion, ...). Merged into SPECS by ts-scenario.ts;
// the generated scenarios (polish-*) live in the `<discovered>` region of scenarios.ts and are run by test/golden/polish.test.ts.
import type { Ctx } from '../../src/ctx';
import { DIFFICULTY_SUICIDE, DIFFICULTY_ZINGLON } from '../../src/game/world';
import { DOWN, ESC, RET, SPACE, UP, gameOver, idleKey, loadSlot, playHolds, typed, type Spec } from './ts-steps';
import type { ScriptStep } from '../../test/helpers/script-input';
import { defineSeed } from './ts-save';

/** The values of the `]e` command (tyrian2.c:2523-2542): what a save made inside an ENGAGE section holds. */
export function engageItems(ctx: Ctx): void {
  const it = ctx.game.players[0].items;
  it.ship = 13;
  it.weapon[0].id = 39; it.weapon[0].power = 3;
  it.weapon[1].id = 0; it.weapon[1].power = 1;
  it.sidekick[0] = 0; it.sidekick[1] = 0;
  it.generator = 2;
  it.shield = 4;
  it.special = 0;
}

let registered = false;
/** Registers the seeds in SEEDS (ts-save.ts). Called by run.ts, ts-scenario.ts and the golden test; not at import time, to avoid import cycles. */
export function registerPolishSeeds(): void {
  if (registered) return;
  registered = true;
  defineSeed('polish-engage', [
    // the backup the shop's `]b` would have written (slot 11) and the ENGAGE sections themselves
    { slot: 11, name: 'BACKUP EP4', episode: 4, level: 40, cash: 50000, levelName: 'TIME WAR' },
    { slot: 1, name: 'EP4 TIME WAR', episode: 4, level: 40, cash: 50000, levelName: 'TIME WAR' }, // ep4 section 40: ]e then ]L
    { slot: 2, name: 'EP1 ENGAGE END', episode: 1, level: 26, mode: 'superTyrian', levelName: 'ALE', mutate: engageItems }, // ]Q after a win
    { slot: 3, name: 'EP5 SUPER END A', episode: 5, initialEpisode: 5, level: 19, mode: 'superTyrian', difficulty: DIFFICULTY_ZINGLON, mutate: engageItems },
    { slot: 4, name: 'EP5 SUPER END B', episode: 5, initialEpisode: 5, level: 19, mode: 'superTyrian', difficulty: DIFFICULTY_SUICIDE, mutate: engageItems },
  ]);
}

/** Level 19 of episode 5 is the `]Q` section: its text, the high score entry (episode 5 is the initial episode), the table, then the credits. */
const endOfEpisode5 = (): ScriptStep[] => [idleKey(), idleKey(), idleKey(), ...typed('Ace'), { sc: RET, after: 10 }, idleKey(), { sc: RET, after: 1500 }, idleKey(), idleKey()];

export const POLISH_SPECS_ENGAGE: Record<string, Spec> = {
  /** Load slot 1 (episode 4 section 40): `]e`, TIME WAR with the ENGAGE ship, fire held and weaving. */
  'polish-engage-play': { seed: 'polish-engage', tail: 40,
    steps: () => [...loadSlot(1), { sc: SPACE, hold: 700, after: 90 }, ...playHolds(600, 11)] },
  /** Same section, idle ship: death restores slot 11 (the doNotSaveBackup branch) and the ENGAGE section runs again. */
  'polish-engage-die': { seed: 'polish-engage', tail: 80,
    steps: () => [...loadSlot(1), gameOver(), { sc: RET, after: 200 }] },
  /** `]Q` of episode 1 reached with ENGAGE still active (tyrian2.c:683 does not undo it): episode 2 starts with the ENGAGE ship and MENU_SUPER_TYRIAN. */
  'polish-engage-ep1-end': { seed: 'polish-engage', tail: 60,
    steps: () => [
      ...loadSlot(2), { sc: RET }, ...typed('Ace'), { sc: RET, after: 10 }, idleKey(), idleKey(),
      // episode 2's first shop is MENU_SUPER_TYRIAN: ship specs, options, back, then Next Level
      { sc: DOWN, after: 60 }, { sc: RET, after: 20 }, { sc: ESC, after: 20 }, { sc: DOWN, after: 12 }, { sc: RET, after: 12 }, { sc: ESC, after: 12 },
      { sc: UP, after: 12 }, { sc: UP, after: 12 }, { sc: RET, after: 12 }, { sc: SPACE, hold: 60, after: 60 },
    ] },
  /** Slot 3 (ZINGLON) and slot 4 (SUICIDE) at the end of episode 5: the SuperTyrian completion branch, mainLevel 0. */
  'polish-supertyrian-end-zinglon': { seed: 'polish-engage', tail: 60, steps: () => [...loadSlot(3), ...endOfEpisode5()] },
  'polish-supertyrian-end-suicide': { seed: 'polish-engage', tail: 60, steps: () => [...loadSlot(4), ...endOfEpisode5()] },
};
