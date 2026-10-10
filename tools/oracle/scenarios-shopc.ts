// SPDX-License-Identifier: GPL-2.0-or-later
// Oracle scenarios for shop C: options, key/mouse config, help, save/load, data cubes.
// Run with `pnpm oracle:run <name>` (tools/oracle/run.ts); outputs go to test-data/oracle/<name>.{hash,state2,save/}.
// Oracle frame 220 is the first frame of the first shop of a new episode-1 / Normal game; the keys before it
// (title -> New Game -> episode 1 -> normal) are PRELUDE.
import type { KeyPress, MouseEvent, Scenario, TypedChar } from './scenarios';

export const PRELUDE: KeyPress[] = [
  { frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 },
];
/** The oracle frame of the shop's first presented frame; TS frame i == oracle frame SHOP_FRAME0 + i. */
export const SHOP_FRAME0 = 220;

export const SC = {
  A: 4, Z: 29, N1: 30, Return: 40, Escape: 41, Backspace: 42, Space: 44, F1: 58, Right: 79, Left: 80, Down: 81, Up: 82,
  PageDown: 78, PageUp: 75, Home: 74, End: 77, S: 22, L: 15, W: 26, P: 19, F11: 68, LAlt: 226, LCtrl: 224, X: 27,
} as const;

/** Builds key/text/mouse lists on a moving frame cursor. */
export class Timeline {
  keys: KeyPress[] = [];
  text: TypedChar[] = [];
  mouse: MouseEvent[] = [];
  private wx = 0; private wy = 0;
  constructor(public f: number, private readonly gap = 4) {}
  /** Skips `n` frames. */
  wait(n: number): this { this.f += n; return this; }
  /** Taps each key, `gap` frames apart. */
  tap(...scs: number[]): this { for (const sc of scs) { this.keys.push({ frame: this.f, scancode: sc }); this.f += this.gap; } return this; }
  /** Holds a key for `frames` frames, then advances past it. */
  hold(sc: number, frames: number): this { this.keys.push({ frame: this.f, scancode: sc, hold: frames }); this.f += frames + this.gap; return this; }
  /** Holds `mod` while `sc` is held (Alt+S). */
  chord(mod: number, sc: number, frames: number): this {
    this.keys.push({ frame: this.f, scancode: mod, hold: frames + 6 }, { frame: this.f + 3, scancode: sc, hold: frames });
    this.f += frames + 6 + this.gap; return this;
  }
  /** Types characters: key down, text input, key up (scancode only matters for the key handler's default branch). */
  type(s: string): this {
    for (const ch of s) { this.text.push({ frame: this.f, scancode: ch === ' ' ? SC.Space : SC.A, char: ch }); this.f += this.gap; }
    return this;
  }
  /** Moves the pointer to game pixel (x, y) (2 window pixels per game pixel). */
  moveTo(x: number, y: number): this {
    this.mouse.push({ frame: this.f, type: 'm', a: 2 * x - this.wx, b: 2 * y - this.wy });
    this.wx = 2 * x; this.wy = 2 * y; this.f += this.gap; return this;
  }
  click(x: number, y: number): this {
    this.moveTo(x, y);
    this.mouse.push({ frame: this.f, type: 'd', a: 1 }); this.f += 2;
    this.mouse.push({ frame: this.f, type: 'u', a: 1 }); this.f += this.gap + 2; return this;
  }
  scenario(tail: number, extra: Partial<Scenario> = {}): Scenario {
    return {
      maxFrames: this.f + tail, keys: [...PRELUDE, ...this.keys], ...(this.text.length ? { text: this.text } : {}),
      ...(this.mouse.length ? { mouse: this.mouse } : {}), hash: true, state2: true, saveDump: true, ...extra,
    };
  }
}

const D = SC.Down;

const U = SC.Up, R = SC.Return;

/**
 * Options: volume keys and sliders, the joystick screen, key configuration (capture, swap, reserved keys, reset, capture again),
 * mouse configuration, F1 help, and finally a save that writes the configuration (opentyrian.cfg) for the key names.
 */
const options = (): Timeline => {
  const t = new Timeline(SHOP_FRAME0 + 1);
  t.tap(D, D, D, R);                                   // Options (row 5)
  t.tap(D, D, SC.Right, SC.Right, SC.Right, SC.Left);  // Music Volume row: right x3, left
  t.tap(D, SC.Left, SC.Left, SC.Right);                // Effects Volume row
  t.click(240, 76).click(300, 92);                     // volume sliders (music bar at y 70..82, effects 86..98)
  t.tap(D, R, U, R);                                   // Joystick screen, Up wraps to Done, Return
  t.tap(D, R);                                         // Keyboard screen
  t.tap(R).wait(6).tap(SC.W);                          // capture Up := W
  t.tap(D, R).wait(6).tap(SC.Left);                    // Down := Left (swaps with row 4: Left := Down)
  t.tap(D, R).wait(6).tap(SC.Escape);                  // Esc is reserved: nothing assigned
  t.tap(R).wait(6).tap(SC.P);                          // P is reserved too
  t.tap(R).wait(6).tap(SC.F11);
  t.tap(D, D, D, D, D, D, R);                          // row 10: reset to defaults
  t.tap(U, U, U, U, U, U, U, U, R).wait(6).tap(SC.W);  // Up := W again (row 2)
  t.tap(D, D, D, D, R).wait(6).tap(SC.X);              // Fire := X (row 6), left in place for the saved file
  t.tap(D, D, D, D, D, R);                             // row 11 Done -> options
  t.tap(D, R);                                         // Mouse config
  t.tap(R, R, D, R, D, R, D, R);                       // left x2, right x1, middle x1, reset to defaults (row 5)
  t.tap(U, U, U, R, R);                                // left x2 again (the saved state)
  t.tap(D, D, D, D, R);                                // row 6 Done -> options
  t.tap(SC.Escape);                                    // -> main shop menu
  t.tap(SC.F1).wait(40).tap(SC.Right, SC.Right, SC.Left, SC.Escape).wait(60); // help system pages
  t.tap(R);                                            // Options again (the cursor is still on Options)
  t.tap(U, U, U, U, U, R, R, R, R).wait(10);           // Save Game, slot 1, Return (empty name), yes: writes the configuration
  return t;
};

/** Save: typed names with a backspace, overwrite of an existing slot, Esc and "No"; Alt+S then Esc; Alt+L; load. */
const saveLoad = (): Timeline => {
  const t = new Timeline(SHOP_FRAME0 + 1);
  t.tap(D, D, D, R);                                   // Options
  t.tap(D, R);                                         // Save Game (performSave)
  t.tap(D, R);                                         // slot 2: name entry
  t.type('abc 1');
  t.tap(SC.Backspace);
  t.type('Z');
  t.tap(R).wait(6).tap(R);                             // save request -> yes
  t.wait(10);
  t.tap(R).wait(4).type('q').tap(SC.Backspace, SC.Backspace, SC.Backspace, SC.Backspace, SC.Backspace, SC.Backspace, SC.Backspace);
  t.type('over');
  t.tap(R).wait(6).tap(R);                             // overwrite slot 2 ("Original save: ABC Z")
  t.wait(10);
  t.tap(D, R).wait(4).type('x').tap(SC.Escape);        // slot 3: cancel the name entry
  t.wait(10);
  t.tap(R).wait(4).type('n').tap(R).wait(6).tap(SC.Left, R); // slot 3 again: the save request answered No
  t.wait(10);
  t.tap(SC.Escape);                                    // list -> options (menuEsc)
  t.chord(SC.LAlt, SC.S, 8).wait(10);                  // quick save screen
  t.tap(D, D, SC.Escape);                              // cursor, then back out
  t.wait(10).tap(SC.Escape).wait(4);                   // options -> main
  t.chord(SC.LAlt, SC.L, 8).wait(10);                  // quick load screen
  t.tap(U, U, U, R);                                   // load slot 2
  t.wait(120);                                         // shop restarts at the saved section
  t.tap(D, D, D, R).wait(10);
  return t;
};

/**
 * Data cubes (the first shop of a new game already has four): the list, the reader with PageDown / Down / Up / End / Home
 * scrolling, mouse scrolling (upper and lower half of the text area), the Done button, and mouse selection in the list.
 */
const cubes = (): Timeline => {
  const t = new Timeline(SHOP_FRAME0 + 1);
  t.tap(R);                                            // Data Cubes (row 2): list, first cube selected
  t.tap(D, U, D, D);                                   // cursor around the list (flashing cube)
  t.tap(R).wait(20);                                   // read cube 3
  t.hold(SC.PageDown, 30).wait(10);
  t.hold(D, 25).wait(10);
  t.hold(SC.PageUp, 10).wait(6);
  t.hold(U, 6).wait(6);
  t.tap(SC.End).wait(8);
  t.hold(U, 12).wait(6);
  t.tap(SC.Home).wait(8);
  t.moveTo(230, 130).wait(2);                          // lower half: the pointer turns into a down arrow
  t.mouse.push({ frame: t.f, type: 'd', a: 1 }); t.wait(30);
  t.mouse.push({ frame: t.f, type: 'u', a: 1 }); t.wait(6);
  t.moveTo(230, 70).wait(2);                           // upper half: up arrow
  t.mouse.push({ frame: t.f, type: 'd', a: 1 }); t.wait(10);
  t.mouse.push({ frame: t.f, type: 'u', a: 1 }); t.wait(6);
  t.click(274, 165).wait(8);                           // Done -> list (the same click then also selects the Done row)
  t.tap(U, R).wait(10).tap(SC.Escape).wait(6);         // cube 4, Esc back to the list
  t.click(220, 66).wait(6);                            // select the second cube with the mouse
  t.click(220, 66).wait(6);                            // second click opens it
  t.tap(SC.Escape).wait(4);
  t.tap(SC.F1).wait(40).tap(SC.Escape).wait(60);       // F1 help from the cube list (the cube palette is rebuilt afterwards)
  t.tap(SC.Escape).wait(10);                           // list -> main
  return t;
};

/**
 * The same screens with the mouse. JE_operation reads the stale `mouseButton` of the shop loop: entered by a click it is > 0 for
 * the whole dialog (keys and typed text are ignored, clicks on OK / Cancel work through lastmouse_x/y); entered by the keyboard it
 * is 0 (clicks are ignored). Here: save by clicking OK twice, cancel by clicking Cancel, load by clicking.
 */
const saveMouse = (): Timeline => {
  const t = new Timeline(SHOP_FRAME0 + 1);
  t.click(230, 90).click(230, 90).wait(6);             // Options (selection, then activation)
  t.click(230, 60).click(230, 60).wait(6);             // Save Game
  t.click(230, 64).click(230, 64).wait(6);             // slot 3: name entry, entered by the mouse
  t.type('ab').wait(4).tap(R, SC.Backspace).wait(4);   // ignored while the stale mouseButton is > 0
  t.click(100, 135).wait(6);                           // OK -> save request
  t.click(100, 135).wait(10);                          // OK -> saved (blank name)
  t.click(230, 75).click(230, 75).wait(6);             // slot 4
  t.click(190, 135).wait(10);                          // Cancel
  t.tap(D, D, D, D, D, D, D, D, D, SC.Escape).wait(4); // cursor to the bottom row, Esc -> options
  t.click(230, 44).click(230, 44).wait(6);             // Load Game
  t.click(230, 64).click(230, 64).wait(120);           // load slot 3
  t.tap(R).wait(10).tap(SC.Escape).wait(6);            // second shop: the cube list and back
  return t;
};

export const SHOPC_SCENARIOS: Record<string, Scenario> = {
  'shopc-options': options().scenario(10),
  'shopc-save-load': saveLoad().scenario(10),
  'shopc-cubes': cubes().scenario(10),
  'shopc-save-mouse': saveMouse().scenario(10),
};
