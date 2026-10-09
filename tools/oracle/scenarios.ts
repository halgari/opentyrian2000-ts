// SPDX-License-Identifier: GPL-2.0-or-later
import { ALL_DEMO_LEVELS, demoScenarioName, LONG_DEMO_LEVELS, longScenarioName, maxFramesFor, maxFramesForLong } from './demo-levels';
// Shared by the oracle runner and the golden tests. Scancodes are SDL scancodes.
/** hold = frames the key stays down (keyup after frame + hold); 0 or absent = tap (down+up after `frame`). */
export interface KeyPress { frame: number; scancode: number; hold?: number }
/** m: relative motion (a=dx, b=dy, window pixels); d / u: button down / up (a = SDL button, 1 left 2 middle 3 right). */
export interface MouseEvent { frame: number; type: 'm' | 'd' | 'u'; a: number; b?: number }
/** A typed printable character: key down `scancode`, an SDL_TEXTINPUT event with `char`, key up (OT_TEXT). */
export interface TypedChar { frame: number; scancode: number; char: string }
export interface Scenario {
  maxFrames: number;
  keys: KeyPress[];
  /** Typed characters (text input events, JE_operation's name entry). */
  text?: TypedChar[];
  mouse?: MouseEvent[];
  /** Also write <name>.state2 (OT_STATE2, see test/helpers/state-trace.ts). */
  state2?: boolean;
  /** Copy tyrian.sav / tyrian.cfg at exit into test-data/oracle/<name>.save/ (OT_SAVEDUMP). */
  saveDump?: boolean;
  /** Repo-relative path of a tyrian.sav copied into the oracle HOME before the run. */
  homeSeed?: string;
  /** Repo-relative alternate data directory (default data/tyrian2000). */
  dataDir?: string;
  /** OT_IDLE_POLLS override. */
  idlePolls?: number;
  /** Preset OT_DEMO=n: the Demo menu item plays demo.n. */
  demo?: number;
  /** Also write <name>.hash (OT_HASH). */
  hash?: boolean;
  /** Also write <name>.state (OT_STATE). */
  state?: boolean;
}

/** Main-menu keys (from the idle menu at frame 141) that select Demo (item 5): Down x5, Return. */
const DEMO_KEYS: KeyPress[] = [
  ...[141, 142, 143, 144, 145].map((frame) => ({ frame, scancode: 81 })),
  { frame: 146, scancode: 40 },
];

/**
 * maxFrames = index of the first idle-title-menu frame after the demo + 1 (measured: that frame's
 * hash equals boot frame 141's). The frame count includes the 162-frame boot/menu prefix.
 */
const demoScenario = (n: number, maxFrames: number): Scenario => ({
  maxFrames, keys: DEMO_KEYS, demo: n, hash: true, state: true,
});

/** Demo selection at the idle title menu starting at frame `f`. */
const demoKeysAt = (f: number): KeyPress[] => [
  ...[0, 1, 2, 3, 4].map((i) => ({ frame: f + i, scancode: 81 })),
  { frame: f + 5, scancode: 40 },
];

/** Keys of newgame-ep1-shop-upgrades after the difficulty select (oracle frame 220 is the shop's first frame). */
const SHOP_UPGRADE_KEYS: KeyPress[] = [
  { frame: 221, scancode: 81 }, { frame: 223, scancode: 81 }, { frame: 225, scancode: 40 }, // Down x2 (Upgrade Ship), Return
  { frame: 228, scancode: 81 }, { frame: 231, scancode: 40 },                               // Down (Front Weapon), Return -> sim
  { frame: 280, scancode: 79 }, { frame: 290, scancode: 79 }, { frame: 300, scancode: 80 }, // Right, Right, Left (power)
  { frame: 310, scancode: 81 }, { frame: 330, scancode: 81 }, { frame: 350, scancode: 40 }, // Down, Down, Return (-> Done)
  { frame: 360, scancode: 40 },                                                             // Return on Done (buy)
  { frame: 370, scancode: 81 }, { frame: 373, scancode: 40 },                               // Down (Rear Weapon), Return -> sim
  { frame: 420, scancode: 56 }, { frame: 440, scancode: 56 }, { frame: 460, scancode: 79 }, // `/` x2, Right
  { frame: 480, scancode: 41 },                                                             // Esc (leave without buying)
  { frame: 490, scancode: 41 },                                                             // Esc (-> main shop menu)
  { frame: 495, scancode: 82 }, { frame: 498, scancode: 40 },                               // Up (Ship Specs), Return
  { frame: 515, scancode: 44, hold: 4 },                                                    // held key aborts the scale-in and leaves the specs
];

/**
 * Mouse script: [frame, gameX, gameY] moves the pointer (relative window motion at 2 window pixels per game pixel, so
 * mapWindowPointToScreen gives exactly gameX/gameY), [frame, 'd'|'u'] presses / releases button 1.
 */
function shopMouse(steps: Array<[number, number, number] | [number, 'd' | 'u']>): MouseEvent[] {
  const out: MouseEvent[] = [];
  let wx = 0, wy = 0;
  for (const s of steps) {
    if (s.length === 3) {
      out.push({ frame: s[0], type: 'm', a: 2 * s[1] - wx, b: 2 * s[2] - wy });
      wx = 2 * s[1]; wy = 2 * s[2];
    } else {
      out.push({ frame: s[0], type: s[1], a: 1 });
    }
  }
  return out;
}

export const SCENARIOS = {
  /** Intro logos, title logo slide, menu fade-in, idle menu (frames 0–141). */
  boot: { maxFrames: 142, keys: [] },
  /** Down, Down, Down, Up on the main menu. */
  'menu-nav': {
    maxFrames: 146,
    keys: [
      { frame: 141, scancode: 81 },
      { frame: 142, scancode: 81 },
      { frame: 143, scancode: 81 },
      { frame: 144, scancode: 82 },
    ],
  },
  'demo-1': demoScenario(1, 6917),
  'demo-2': demoScenario(2, 5267),
  'demo-3': demoScenario(3, 2476),
  'demo-4': demoScenario(4, 2016),
  'demo-5': demoScenario(5, 3265),
  /** Demo 1, any key at first loop frame (213) + 300 aborts it; back at the title, Demo again plays demo.2. */
  'demo-abort': {
    maxFrames: 1200, demo: 1, hash: true, state: true,
    // Frame 584 is the first idle title-menu frame after the abort (measured, hash equals boot frame 141's).
    keys: [...DEMO_KEYS, { frame: 513, scancode: 44 }, ...demoKeysAt(584)],
  },
  // <discovered> -- entries between these markers are written by tools/oracle/discover.ts
  "newgame-ep1-first-shop-to-level": { maxFrames: 660, keys: [{ frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 }, { frame: 221, scancode: 81 }, { frame: 222, scancode: 81 }, { frame: 223, scancode: 81 }, { frame: 224, scancode: 81 }, { frame: 225, scancode: 40 }, { frame: 229, scancode: 40 }, { frame: 349, scancode: 44, hold: 300 }, { frame: 355, scancode: 80, hold: 40 }, { frame: 405, scancode: 82, hold: 30 }, { frame: 455, scancode: 79, hold: 60 }, { frame: 525, scancode: 81, hold: 40 }], hash: true, state2: true, saveDump: true },
  "session-arcade-ep1": { maxFrames: 3013, keys: [{ frame: 141, scancode: 40 }, { frame: 167, scancode: 81 }, { frame: 168, scancode: 40 }, { frame: 189, scancode: 40 }, { frame: 210, scancode: 40 }, { frame: 222, scancode: 40 }, { frame: 372, scancode: 44, hold: 2600 }], hash: true, state2: true, saveDump: true },
  "session-dead-keys": { maxFrames: 1421, keys: [{ frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 }, { frame: 221, scancode: 81 }, { frame: 222, scancode: 81 }, { frame: 223, scancode: 81 }, { frame: 224, scancode: 81 }, { frame: 225, scancode: 40 }, { frame: 229, scancode: 40 }, { frame: 1334, scancode: 59, hold: 4 }, { frame: 1335, scancode: 63, hold: 4 }, { frame: 1336, scancode: 64, hold: 4 }], hash: true, state2: true, saveDump: true },
  "session-ep1-easy": { maxFrames: 561, keys: [{ frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 82 }, { frame: 210, scancode: 40 }, { frame: 222, scancode: 81 }, { frame: 223, scancode: 81 }, { frame: 224, scancode: 81 }, { frame: 225, scancode: 81 }, { frame: 226, scancode: 40 }, { frame: 230, scancode: 40 }, { frame: 350, scancode: 44, hold: 200 }], hash: true, state2: true, saveDump: true },
  "session-ep1-end": { maxFrames: 1050, keys: [{ frame: 141, scancode: 81 }, { frame: 142, scancode: 40 }, { frame: 168, scancode: 40 }, { frame: 583, scancode: 40 }, { frame: 713, scancode: 42 }, { frame: 723, scancode: 40 }, { frame: 800, scancode: 40 }, { frame: 832, scancode: 40 }, { frame: 891, scancode: 81 }, { frame: 892, scancode: 81 }, { frame: 893, scancode: 81 }, { frame: 894, scancode: 81 }, { frame: 895, scancode: 40 }, { frame: 899, scancode: 40 }, { frame: 959, scancode: 44, hold: 30 }], text: [{ frame: 603, scancode: 4, char: "A" }, { frame: 623, scancode: 6, char: "c" }, { frame: 643, scancode: 8, char: "e" }, { frame: 663, scancode: 44, char: " " }, { frame: 683, scancode: 36, char: "7" }, { frame: 703, scancode: 27, char: "x" }], hash: true, state2: true, saveDump: true, homeSeed: "test-data/ts-save/episode-end.sav" },
  "session-ep1-hard": { maxFrames: 561, keys: [{ frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 81 }, { frame: 210, scancode: 40 }, { frame: 222, scancode: 81 }, { frame: 223, scancode: 81 }, { frame: 224, scancode: 81 }, { frame: 225, scancode: 81 }, { frame: 226, scancode: 40 }, { frame: 230, scancode: 40 }, { frame: 350, scancode: 44, hold: 200 }], hash: true, state2: true, saveDump: true },
  "session-ep5-credits": { maxFrames: 3373, keys: [{ frame: 141, scancode: 81 }, { frame: 142, scancode: 40 }, { frame: 168, scancode: 81 }, { frame: 169, scancode: 40 }, { frame: 914, scancode: 40 }, { frame: 1139, scancode: 40 }, { frame: 1563, scancode: 40 }, { frame: 3062, scancode: 40 }, { frame: 3089, scancode: 40 }, { frame: 3155, scancode: 40 }, { frame: 3214, scancode: 81 }, { frame: 3215, scancode: 81 }, { frame: 3216, scancode: 81 }, { frame: 3217, scancode: 81 }, { frame: 3218, scancode: 40 }, { frame: 3222, scancode: 40 }, { frame: 3282, scancode: 44, hold: 30 }], hash: true, state2: true, saveDump: true, homeSeed: "test-data/ts-save/episode-end.sav" },
  "session-ep5-credits-full": { maxFrames: 9653, keys: [{ frame: 141, scancode: 81 }, { frame: 142, scancode: 40 }, { frame: 168, scancode: 81 }, { frame: 169, scancode: 40 }, { frame: 914, scancode: 40 }, { frame: 1139, scancode: 40 }, { frame: 1563, scancode: 40 }, { frame: 9362, scancode: 40 }, { frame: 9389, scancode: 40 }, { frame: 9455, scancode: 40 }, { frame: 9514, scancode: 81 }, { frame: 9515, scancode: 81 }, { frame: 9516, scancode: 81 }, { frame: 9517, scancode: 81 }, { frame: 9518, scancode: 40 }, { frame: 9522, scancode: 40 }, { frame: 9582, scancode: 44, hold: 30 }], hash: true, state2: true, saveDump: true, homeSeed: "test-data/ts-save/episode-end.sav" },
  "session-full-ep1": { maxFrames: 1662, keys: [{ frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 }, { frame: 221, scancode: 81 }, { frame: 222, scancode: 81 }, { frame: 223, scancode: 81 }, { frame: 224, scancode: 81 }, { frame: 225, scancode: 40 }, { frame: 229, scancode: 40 }, { frame: 1383, scancode: 40, hold: 1 }, { frame: 1443, scancode: 81 }, { frame: 1444, scancode: 81 }, { frame: 1445, scancode: 81 }, { frame: 1446, scancode: 81 }, { frame: 1447, scancode: 40 }, { frame: 1451, scancode: 40 }, { frame: 1581, scancode: 44, hold: 60 }], hash: true, state2: true, saveDump: true },
  "session-skip-levels": { maxFrames: 911, keys: [{ frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 }, { frame: 221, scancode: 81 }, { frame: 222, scancode: 81 }, { frame: 223, scancode: 81 }, { frame: 224, scancode: 81 }, { frame: 225, scancode: 40 }, { frame: 229, scancode: 40 }, { frame: 379, scancode: 59, hold: 4 }, { frame: 380, scancode: 63, hold: 4 }, { frame: 381, scancode: 64, hold: 4 }, { frame: 501, scancode: 40 }, { frame: 509, scancode: 40 }, { frame: 569, scancode: 81 }, { frame: 570, scancode: 81 }, { frame: 571, scancode: 81 }, { frame: 572, scancode: 81 }, { frame: 573, scancode: 40 }, { frame: 577, scancode: 40 }, { frame: 637, scancode: 44, hold: 30 }, { frame: 677, scancode: 59, hold: 4 }, { frame: 678, scancode: 63, hold: 4 }, { frame: 679, scancode: 64, hold: 4 }, { frame: 799, scancode: 40 }, { frame: 807, scancode: 40 }, { frame: 867, scancode: 81 }, { frame: 868, scancode: 81 }, { frame: 869, scancode: 81 }, { frame: 870, scancode: 81 }], hash: true, state2: true, saveDump: true },
  "session-twice-ep1": { maxFrames: 2839, keys: [{ frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 }, { frame: 221, scancode: 81 }, { frame: 222, scancode: 81 }, { frame: 223, scancode: 81 }, { frame: 224, scancode: 81 }, { frame: 225, scancode: 40 }, { frame: 229, scancode: 40 }, { frame: 1383, scancode: 40, hold: 1 }, { frame: 1443, scancode: 41 }, { frame: 1451, scancode: 40 }, { frame: 1492, scancode: 40 }, { frame: 1518, scancode: 40 }, { frame: 1539, scancode: 40 }, { frame: 1560, scancode: 40 }, { frame: 1572, scancode: 81 }, { frame: 1573, scancode: 81 }, { frame: 1574, scancode: 81 }, { frame: 1575, scancode: 81 }, { frame: 1576, scancode: 40 }, { frame: 1580, scancode: 40 }, { frame: 2750, scancode: 40, hold: 1 }, { frame: 2810, scancode: 41 }, { frame: 2818, scancode: 40 }], hash: true, state2: true, saveDump: true },
  "ts-save-load": { maxFrames: 271, keys: [{ frame: 141, scancode: 81 }, { frame: 142, scancode: 40 }, { frame: 168, scancode: 81 }, { frame: 169, scancode: 40 }, { frame: 229, scancode: 81 }, { frame: 230, scancode: 81 }], hash: true, state2: true, saveDump: true, homeSeed: "test-data/ts-save/tyrian.sav" },
  // </discovered>
  /**
   * Shop B with the mouse: clicks through Upgrade Ship -> Rear Weapon, selects an item, the power -/+ buttons, `/` mode keys,
   * Done; then Left Sidekick (unaffordable rows), Esc out, Generator by key (Down, Right, Esc). The button-up events are injected by the oracle's
   * idle rule (wait_noinput blocks after a click), so a test harness has to emulate it.
   */
  'newgame-ep1-shop-upgrades-mouse': {
    maxFrames: 800, hash: true, state2: true,
    keys: [
      { frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 },
      { frame: 380, scancode: 56 }, { frame: 410, scancode: 56 },                               // `/` (rear weapon mode) twice
      { frame: 520, scancode: 41 },                                                             // Esc (leaves the sidekick screen)
      { frame: 565, scancode: 82 }, { frame: 577, scancode: 40 },                               // Up (Generator), Return -> sim
      { frame: 640, scancode: 81 }, { frame: 680, scancode: 79 }, { frame: 700, scancode: 41 }, // Down, Right (no-op), Esc
    ],
    mouse: shopMouse([
      [221, 200, 74], [223, 'd'], [224, 'u'], [227, 'd'], [228, 'u'],           // Upgrade Ship (select, activate)
      [231, 'd'], [232, 'u'], [235, 'd'], [236, 'u'],                           // Rear Weapon (select, activate)
      [239, 200, 70], [241, 'd'], [242, 'u'],                                   // item on row 3
      [300, 125, 158], [303, 'd'], [304, 'u'], [320, 'd'], [321, 'u'],          // power + twice
      [340, 30, 158], [343, 'd'], [344, 'u'],                                   // power -
      [440, 200, 150], [443, 'd'], [444, 'u'],                                  // Done (buys)
      [460, 200, 122], [462, 'd'], [463, 'u'], [466, 'd'], [467, 'u'],          // Left Sidekick (select, activate)
      [470, 200, 70], [472, 'd'], [473, 'u'],                                   // row 3
      [480, 200, 122], [482, 'd'], [483, 'u'],                                  // row 5 (probably unaffordable: S_CLINK)
    ]),
  },
  /**
   * Shop B: first shop (frame 220) -> Upgrade Ship -> Front Weapon sim (power +/-, other items, Done) -> Rear Weapon sim (`/` mode
   * key, power) -> Esc out -> Ship Specs -> leave. The sim animates at 3 ticks per frame, the other menus at 2.
   */
  'newgame-ep1-shop-upgrades': {
    maxFrames: 700, hash: true, state2: true,
    keys: [
      { frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 },
      ...SHOP_UPGRADE_KEYS,
    ],
  },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;

/**
 * lvl-<ep>-<nn>: one synthetic demo per level record (tools/oracle/demo-levels.ts). The oracle runs with an alternate data
 * dir whose demo.1 is the generated demo (tools/oracle/gen-demos.ts creates the dirs); OT_DEMO=1 -> Demo menu plays it.
 */
export const LEVEL_SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  ALL_DEMO_LEVELS.map((lv) => [
    demoScenarioName(lv.ep, lv.file),
    { maxFrames: maxFramesFor(lv), keys: DEMO_KEYS, demo: 1, hash: true, state: true, dataDir: `test-data/oracle/data-${demoScenarioName(lv.ep, lv.file)}` } satisfies Scenario,
  ]),
);

/**
 * lvlx-<ep>-<nn>: long-run demos (tools/oracle/demo-levels.ts LONG_LEVELS) that survive to the late smoothie / flip / lighting /
 * random-explosion events the standard demos never reach. Same harness as lvl-*; keys come from tools/oracle/long-keys.ts.
 */
export const LONG_LEVEL_SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  LONG_DEMO_LEVELS.map((lv) => [
    longScenarioName(lv.ep, lv.file),
    { maxFrames: maxFramesForLong(lv), keys: DEMO_KEYS, demo: 1, hash: true, state: true, dataDir: `test-data/oracle/data-${longScenarioName(lv.ep, lv.file)}` } satisfies Scenario,
  ]),
);

export interface AudioScenario {
  song: number; samples: number; mode: 'raw' | 'mixed' | 'voltable'; musicVolume: number; fadeAt: number;
}

/**
 * Audio oracle scenarios (tools/oracle/audio-render.c). Song indexes are 0-based in music.mus.
 * fadeAt must be a multiple of 1024 (lds_fade is applied at a callback-chunk boundary), so the
 * "2 s" title fade uses 88064 (= 86 * 1024) rather than 88200.
 */
export const AUDIO_SCENARIOS = {
  'title-raw': { song: 29, samples: 441000, mode: 'raw', musicVolume: 255, fadeAt: -1 },
  // Song 5 is the first song with a non-zero regbd (0x01). No song in this music.mus has regbd & 0x20
  // (rhythm mode) set, and regbd is only written at lds_rewind, so none ever enters rhythm mode.
  'perc-raw': { song: 5, samples: 441000, mode: 'raw', musicVolume: 255, fadeAt: -1 },
  // Song 39 (931 bytes) is the smallest song that loops. The three smaller songs 30, 10, 33 (and 9, 18)
  // end with playing=false without ever looping. loopedAtSample = 2434700, + 44100 = 2478800.
  'loop-raw': { song: 39, samples: 2478800, mode: 'raw', musicVolume: 255, fadeAt: -1 },
  // Song 30 (smallest) ends with playing=false at sample 98987 without looping; covers stoppedAtSample.
  'stop-raw': { song: 30, samples: 143360, mode: 'raw', musicVolume: 255, fadeAt: -1 },
  'title-mixed': { song: 29, samples: 441000, mode: 'mixed', musicVolume: 191, fadeAt: -1 },
  'title-fade': { song: 29, samples: 441000, mode: 'mixed', musicVolume: 255, fadeAt: 88064 },
  voltable: { song: 0, samples: 256, mode: 'voltable', musicVolume: 255, fadeAt: -1 },
} satisfies Record<string, AudioScenario>;

export type AudioScenarioName = keyof typeof AUDIO_SCENARIOS;
