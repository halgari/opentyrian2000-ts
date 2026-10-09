// SPDX-License-Identifier: GPL-2.0-or-later
import { ALL_DEMO_LEVELS, demoScenarioName, maxFramesFor } from './demo-levels';
// Shared by the oracle runner and the golden tests. Scancodes are SDL scancodes.
/** hold = frames the key stays down (keyup after frame + hold); 0 or absent = tap (down+up after `frame`). */
export interface KeyPress { frame: number; scancode: number; hold?: number }
/** m: relative motion (a=dx, b=dy, window pixels); d / u: button down / up (a = SDL button, 1 left 2 middle 3 right). */
export interface MouseEvent { frame: number; type: 'm' | 'd' | 'u'; a: number; b?: number }
export interface Scenario {
  maxFrames: number;
  keys: KeyPress[];
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
  // </discovered>
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
