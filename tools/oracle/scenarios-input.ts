// SPDX-License-Identifier: GPL-2.0-or-later
// Oracle scenarios for keyboard, mouse, pause, menu and game-over input in level 1 of a new episode-1 game.
// Run with `pnpm oracle:run <name>` (tools/oracle/run.ts); outputs go to test-data/oracle/<name>.{hash,state2}.
import type { KeyPress, MouseEvent, Scenario } from './scenarios';

/** Title -> New Game -> episode 1 -> normal -> shop (Down x4) -> Next Level -> planet; level 1 starts about frame 331. */
export const TO_LEVEL1: KeyPress[] = [
  { frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 },
  { frame: 221, scancode: 81 }, { frame: 222, scancode: 81 }, { frame: 223, scancode: 81 }, { frame: 224, scancode: 81 },
  { frame: 225, scancode: 40 }, { frame: 229, scancode: 40 },
];

const SPACE = 44, RETURN = 40, ESC = 41, F1 = 58, F2 = 59, F3 = 60, F4 = 61, F11 = 68, P = 19;
const UP = 82, DOWN = 81, LEFT = 80, RIGHT = 79, LCTRL = 224, LALT = 226, RIGHT_ARROW = RIGHT;

const level = (maxFrames: number, keys: KeyPress[], mouse?: MouseEvent[]): Scenario => ({
  maxFrames, keys: [...TO_LEVEL1, ...keys], ...(mouse ? { mouse } : {}), hash: true, state2: true,
});

export const INPUT_SCENARIOS: Record<string, Scenario> = {
  /** Diagonals, opposing keys cancelling, fire taps and a long hold. */
  'input-move-fire': level(560, [
    { frame: 345, scancode: RIGHT, hold: 30 }, { frame: 345, scancode: DOWN, hold: 15 },
    { frame: 385, scancode: LEFT, hold: 20 }, { frame: 385, scancode: RIGHT, hold: 20 }, // cancel
    { frame: 420, scancode: UP, hold: 25 }, { frame: 420, scancode: LEFT, hold: 25 },
    { frame: 350, scancode: SPACE, hold: 60 }, { frame: 450, scancode: SPACE, hold: 8 }, { frame: 470, scancode: SPACE, hold: 1 },
  ]),
  /** Left sidekick (Ctrl), right sidekick (Alt) and change-fire (Return) with fire held; the starter ship has no sidekicks or rear gun. */
  'input-sidekicks': level(520, [
    { frame: 345, scancode: SPACE, hold: 150 }, { frame: 360, scancode: LCTRL, hold: 20 },
    { frame: 390, scancode: LALT, hold: 20 }, { frame: 420, scancode: RETURN, hold: 2 }, { frame: 430, scancode: RETURN, hold: 10 },
    { frame: 440, scancode: LCTRL, hold: 10 }, { frame: 440, scancode: LALT, hold: 10 },
  ]),
  /** Relative motion in several magnitudes (clamp at 30, negative truncation), then the three buttons. */
  'input-mouse': level(560, [], [
    { frame: 340, type: 'm', a: 3, b: 0 }, { frame: 345, type: 'm', a: -3, b: 0 }, { frame: 350, type: 'm', a: 0, b: 5 },
    { frame: 355, type: 'm', a: 12, b: -12 }, { frame: 360, type: 'm', a: -40, b: 40 }, { frame: 365, type: 'm', a: 1, b: 1 },
    { frame: 366, type: 'm', a: 1, b: 1 }, { frame: 367, type: 'm', a: 1, b: 1 }, { frame: 370, type: 'm', a: 200, b: 0 },
    { frame: 380, type: 'm', a: 0, b: -200 }, { frame: 400, type: 'd', a: 1 }, { frame: 430, type: 'u', a: 1 },
    { frame: 440, type: 'd', a: 3 }, { frame: 450, type: 'u', a: 3 }, { frame: 460, type: 'd', a: 2 }, { frame: 470, type: 'u', a: 2 },
    { frame: 480, type: 'd', a: 1 }, { frame: 485, type: 'm', a: 8, b: 8 }, { frame: 490, type: 'd', a: 3 }, { frame: 495, type: 'u', a: 1 },
    { frame: 500, type: 'u', a: 3 },
  ]),
  /** Mouse motion with keys: they stack. */
  'input-mouse-keys': level(520, [
    { frame: 345, scancode: RIGHT, hold: 40 }, { frame: 420, scancode: SPACE, hold: 40 },
  ], [
    { frame: 350, type: 'm', a: 10, b: 0 }, { frame: 351, type: 'm', a: 10, b: 0 }, { frame: 360, type: 'm', a: -6, b: 9 },
    { frame: 430, type: 'm', a: 0, b: -9 },
  ]),
  /** P pauses (the "Paused" frame), a key resumes; a second pause is resumed by a mouse click. */
  'input-pause': level(560, [
    { frame: 345, scancode: RIGHT, hold: 40 },
    { frame: 380, scancode: P, hold: 3 }, { frame: 381, scancode: 224 /* Ctrl alone must not resume */ }, { frame: 381, scancode: SPACE },
    { frame: 440, scancode: P, hold: 3 },
  ], [{ frame: 441, type: 'd', a: 1 }, { frame: 442, type: 'u', a: 1 }]),
  /** F1 in-level help; Space dismisses; the frame restarts. */
  'input-help-f1': level(520, [
    { frame: 345, scancode: RIGHT, hold: 30 }, { frame: 380, scancode: F1, hold: 3 }, { frame: 384, scancode: SPACE },
    { frame: 430, scancode: F1, hold: 3 }, { frame: 436, scancode: RETURN },
  ]),
  /** Esc menu: raise the music volume, leave with Esc. */
  'input-esc-menu': level(520, [
    { frame: 345, scancode: SPACE, hold: 80 }, { frame: 380, scancode: ESC, hold: 3 }, { frame: 384, scancode: RIGHT_ARROW },
    { frame: 388, scancode: ESC },
  ]),
  /** F11 gamma cycles. */
  'input-gamma': level(460, [{ frame: 350, scancode: F11, hold: 2 }, { frame: 380, scancode: F11, hold: 2 }, { frame: 410, scancode: F11, hold: 2 }, { frame: 430, scancode: F11, hold: 2 }]),
  /** Idle ship until enemies kill it; a key press at the game-over text ends the level. */
  'input-gameover-key': level(1502, [{ frame: 1500, scancode: RETURN, hold: 1 }]),
  /** Same, but fire is held through the death: the stale button[0] ends the level the moment the wait starts. */
  'input-gameover-fire': level(1386, [{ frame: 1300, scancode: SPACE, hold: 400 }]),
  /** F2+F3+F4 cheat (armour 0, cheating on); F2+F3+F6 toggles back; Backspace + 1 fast-play cycle. */
  'input-cheats': level(480, [
    { frame: 350, scancode: F2, hold: 3 }, { frame: 350, scancode: F3, hold: 3 }, { frame: 350, scancode: F4, hold: 3 },
    { frame: 400, scancode: 42, hold: 3 }, { frame: 400, scancode: 30, hold: 3 },
  ]),
};
