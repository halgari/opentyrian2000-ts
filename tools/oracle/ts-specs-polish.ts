// SPDX-License-Identifier: GPL-2.0-or-later
// Session specs and seed saves of the polish/ship modes (ENGAGE, SuperTyrian completion, ...). Merged into SPECS by ts-scenario.ts;
// the generated scenarios (polish-*) live in the `<discovered>` region of scenarios.ts and are run by test/golden/polish.test.ts.
import type { Ctx } from '../../src/ctx';
import { DIFFICULTY_SUICIDE, DIFFICULTY_ZINGLON } from '../../src/game/world';
import { DOWN, ESC, LCTRL, LEFT, RET, RIGHT, SPACE, UP, gameOver, gameOverBoth, idleKey, loadSlot, mouse, mouseIdle, playHolds, skipLevel, typed, type Spec } from './ts-steps';
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
  // empty timed battle tables: a score of 1000 (one life) beats them, which the random default tables (lowest 1000..2300) do not allow
  defineSeed('polish-timed', [
    { slot: 1, name: 'TIMED SEED', episode: 1, level: 1, mutate: (ctx) => {
      for (let t = 0; t < 3; t++) for (const e of ctx.game.config.t2kHighScores[t]!) { e.score = 100 * (1 + t); e.playerName = 'NOBODY'; }
    } },
  ]);
  // slot 12 is the 2P save the Load Game screen's page 2 lists first; player 2 gets a front and a rear gun so both fire (the rear id
  // must have a linkGunWeapons[] entry)
  const twoPlayerGuns = (ctx: Ctx): void => {
    const it = ctx.game.players[1].items;
    it.weapon[0].id = 1; it.weapon[0].power = 2;
    it.weapon[1].id = 9; it.weapon[1].power = 1;
  };
  defineSeed('polish-2p', [
    { slot: 22, name: 'BACKUP 2P', episode: 1, level: 1, mode: 'twoPlayer', cash: 20000, mutate: twoPlayerGuns },
    { slot: 12, name: 'TWO PLAYER EP1', episode: 1, level: 1, mode: 'twoPlayer', cash: 20000, mutate: twoPlayerGuns },
  ]);
  // slot 12 at the `]Q` of episode 1 (section 26) with different scores for the two players and empty two-player tables
  defineSeed('polish-2p-end', [
    { slot: 22, name: 'BACKUP 2P', episode: 1, level: 1, mode: 'twoPlayer', cash: 20000, mutate: twoPlayerGuns },
    { slot: 12, name: 'TWO PLAYER END', episode: 1, level: 26, mode: 'twoPlayer', cash: 20000, levelName: 'ALE', mutate: (ctx) => {
      twoPlayerGuns(ctx);
      ctx.game.players[1].cash = 30000;
      for (const e of ctx.game.config.t2kHighScores[11]!) { e.score = 100; e.playerName = 'NOBODY'; }
    } },
  ]);
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

/** MENU_SUPER_TYRIAN, the first shop of an ENGAGE run: ship specs, options, back, then Next Level (as polish-engage-ep1-end). */
const superTyrianShop = (): ScriptStep[] => [
  { sc: DOWN, after: 60 }, { sc: RET, after: 20 }, { sc: ESC, after: 20 }, { sc: DOWN, after: 12 }, { sc: RET, after: 12 }, { sc: ESC, after: 12 },
  { sc: UP, after: 12 }, { sc: UP, after: 12 }, { sc: RET, after: 12 },
];

/** A title code typed once the title menu is up (frame ~145; before that the intro logos eat the keys), one letter per 6 frames. */
const typedAtTitle = (code: string): ScriptStep[] => typed(code, 6).map((s, i) => (i === 0 ? { ...s, after: 150 } : s));

/** playHolds whose first step (fire held) waits `wait` frames, so the level's fade-in is over. */
const playAfter = (wait: number, frames: number, seed: number): ScriptStep[] => playHolds(frames, seed).map((s, i) => (i === 0 ? { ...s, after: wait } : s));

export const POLISH_SPECS_CODES: Record<string, Spec> = {
  /** Type STEALTH, episode 1, Normal, the ship screen, level 1 (arcade has no shop): fire held and weaving (also drives the super-arcade power-up substitution). */
  'polish-code-stealth': { tail: 40, extra: { saveDump: false }, steps: () => [
    ...typedAtTitle('STEALTH'), idleKey(), idleKey(), idleKey(), ...playAfter(90, 900, 7)] },
  /** The last code (Nort-Ship Z shape): sidekicks and the special weapon from the table. */
  'polish-code-nortshipz': { tail: 40, extra: { saveDump: false }, steps: () => [
    ...typedAtTitle('NORTSHIPZ'), idleKey(), idleKey(), idleKey(), ...playAfter(90, 600, 5)] },
  /** ENGAGE: JE_whoa cut short by a key 60 frames in, the text screen, episode 2, the first shop and level. */
  'polish-code-engage': { tail: 40, extra: { saveDump: false }, steps: () => [
    ...typedAtTitle('ENGAGE'), { sc: RET, after: 60 }, idleKey(), idleKey(), ...superTyrianShop(), ...playHolds(500, 3)] },
  /** ENGAGE with JE_whoa left to run its 300 iterations; Esc at the episode select cancels back to the title (Review Focus 1). */
  'polish-code-engage-cancel': { tail: 40, extra: { saveDump: false }, steps: () => [
    ...typedAtTitle('ENGAGE'), { sc: RET, after: 320 }, idleKey(DOWN), idleKey(ESC), { sc: DOWN, after: 60 }] },
};

export const POLISH_SPECS_TIMED: Record<string, Spec> = {
  /** Title -> New Game -> item 3 (Timed Battle) -> Deliani -> Normal -> level: fire held, then, once the fire key is released (the C blocks in wait_noinput on a held key), the F2+F6+F7 cheat ends it with the ship alive (the timer itself needs ~5200 frames): tally with the lives bonus, name entry, table. */
  'polish-timed-deliani': { seed: 'polish-timed', tail: 60, steps: () => [
    { sc: RET }, { sc: DOWN }, { sc: DOWN }, { sc: RET }, idleKey(), idleKey(), ...playHolds(400, 21), ...skipLevel(30), idleKey(), ...typed('Ace', 20), { sc: RET, after: 20 }, idleKey()] },
  /** Same, idle ship: dies, mainLevel = 0, straight back to the title with no name entry and no backup restore. */
  'polish-timed-die': { tail: 80, extra: { saveDump: false }, steps: () => [
    { sc: RET }, { sc: DOWN }, { sc: DOWN }, { sc: RET }, idleKey(), idleKey(), gameOver(), { sc: DOWN, after: 200 }] },
  /** Space Station: episode 5 data, table 1; the ship dies (timed battle death straight to the title). */
  'polish-timed-station': { tail: 60, extra: { saveDump: false }, steps: () => [
    { sc: RET }, { sc: DOWN }, { sc: DOWN }, { sc: RET }, idleKey(DOWN), { sc: RET }, idleKey(), ...playHolds(450, 33), idleKey(), idleKey()] },
};

/** Title -> Load Game -> page 2 (Right) -> first slot (slot 12, the 2P save). */
const load2p = (): ScriptStep[] => [{ sc: DOWN }, { sc: RET }, { sc: RIGHT }, { sc: RET }];
/** The 2P shop menu (game_menu.c:2925-2958): it opens on row 2 (Play), so Return starts the level. */
const play2p = (): ScriptStep[] => [{ sc: RET, after: 40 }];

export const POLISH_SPECS_2P: Record<string, Spec> = {
  /** Load slot 12: the 2P menu, Play; P1 on the keyboard (inputDevice 1), P2 on the mouse (2). Ships apart: independent movement, firing, both HUDs, map scroll on the average x. */
  'polish-2p-level': { seed: 'polish-2p', tail: 40, steps: () => [
    ...load2p(), ...play2p(), ...playHolds(700, 4),
    mouse('m', 6, 0, 30), mouse('m', 0, -5, 3), mouse('d', 1, undefined, 3), mouse('m', -9, 4, 10), mouse('u', 1, undefined, 20)] },
  /** Same, keys steer P1 into P2: link (within 8 px), fire with the link gun, unlink with a sidekick key. */
  'polish-2p-link': { seed: 'polish-2p', tail: 40, steps: () => [
    ...load2p(), ...play2p(),
    { sc: RIGHT, hold: 140, after: 40 },                      // P1 (starts left of P2) drifts right into P2, who is idle on the mouse
    mouse('d', 1, undefined, 2), mouse('u', 1, undefined, 8), // a mouse event sets mouseXB/YB, which the link test compares with P2's position
    { sc: SPACE, hold: 300, after: 10 }, { sc: LEFT, hold: 20, after: 100 }, { sc: UP, hold: 20, after: 30 }, { sc: LCTRL, hold: 8, after: 40 }] },
  /** Long link-gun run: the direction word is compared bit for bit on every frame (STATE3 linkGunDirecBits). */
  'polish-2p-linkgun': { seed: 'polish-2p', tail: 40, steps: () => [
    ...load2p(), ...play2p(), { sc: RIGHT, hold: 140, after: 40 }, { sc: SPACE, hold: 600, after: 10 }, mouse('d', 1, undefined, 2),
    mouse('m', 3, 0, 20), mouse('m', 0, 3, 20), mouse('m', -3, 0, 20), mouse('m', 0, -3, 20), mouse('m', 5, 5, 20), mouse('m', -5, -5, 20)] },
};

export const POLISH_SPECS_2P_SCREENS: Record<string, Spec> = {
  /** Through the real menus: title -> New Game -> 2 Player Arcade -> episode 1 -> Normal -> the 2P shop; cycle the devices from the keyboard (Right/Left on row 4) and from the mouse (rows remap), Play; P1 keys, P2 mouse. */
  'polish-2p-newgame': { tail: 40, extra: { saveDump: false }, steps: () => [
    { sc: RET }, { sc: DOWN }, { sc: DOWN }, { sc: DOWN }, { sc: RET }, idleKey(), idleKey(),
    { sc: DOWN, after: 40 }, { sc: DOWN, after: 4 }, { sc: RIGHT, after: 4 }, { sc: LEFT, after: 4 }, { sc: UP, after: 4 }, { sc: UP, after: 4 },
    // the mouse on the 2P menu: (200, 102) is row 4 after the remap of game_menu.c:1154 (the raw row is 6); the first click selects, the second and third cycle (swap) the devices
    mouse('m', 400, 204, 6), mouse('d', 1, undefined, 3), mouseIdle('u', 1), mouse('d', 1, undefined, 6), mouseIdle('u', 1), mouse('d', 1, undefined, 6), mouseIdle('u', 1),
    { sc: UP, after: 6 }, { sc: UP, after: 4 }, { sc: RET, after: 4 },
    ...playHolds(500, 9), mouse('m', 8, 0, 20), mouse('d', 1, undefined, 3), mouse('u', 1, undefined, 30)] },
  /** Both ships idle: they die, "game over", the backup (slot 22) is reloaded and the 2P shop returns; Quit (row 6) leaves for the title. */
  'polish-2p-gameover': { seed: 'polish-2p', tail: 80, steps: () => [
    ...load2p(), ...play2p(), gameOverBoth(),
    { sc: DOWN, after: 60 }, { sc: DOWN, after: 4 }, { sc: DOWN, after: 4 }, { sc: DOWN, after: 4 }, { sc: RET, after: 4 }, { sc: RET, after: 20 }, { sc: DOWN, after: 60 }] },
  /** P1 weaves and fires; P2 idles and dies (armor 0, no respawn), P1 plays on. */
  'polish-2p-p2dies': { seed: 'polish-2p', tail: 40, extra: { saveDump: false }, steps: () => [...load2p(), ...play2p(), ...playHolds(2200, 4)] },
  /** The end of episode 1 in a two-player game (]Q): high score entry for both players, the higher scorer first, into the two-player table. */
  'polish-2p-highscore': { seed: 'polish-2p-end', tail: 60, steps: () => [
    ...load2p(), { sc: RET }, ...typed('Pat'), { sc: RET, after: 10 }, { sc: RET }, ...typed('Lee'), { sc: RET, after: 10 }, { sc: RET }, { sc: RET, idle: true }] },
  /** Load Game page 2 lists slots 12-22; page back and forth, load slot 12 into the 2P shop, open and leave the options. */
  'polish-2p-load': { seed: 'polish-2p', tail: 60, steps: () => [
    { sc: DOWN }, { sc: RET }, { sc: RIGHT }, { sc: DOWN, after: 8 }, { sc: UP, after: 8 }, { sc: LEFT, after: 8 }, { sc: RIGHT, after: 8 }, { sc: RET, after: 8 },
    { sc: DOWN, after: 60 }, { sc: DOWN, after: 4 }, { sc: DOWN, after: 4 }, { sc: RET, after: 4 }, { sc: ESC, after: 20 }, { sc: UP, after: 20 }] },
};
