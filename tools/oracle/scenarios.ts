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
  "session-long-ep1": { maxFrames: 5100, keys: [{ frame: 141, scancode: 40 }, { frame: 167, scancode: 40 }, { frame: 188, scancode: 40 }, { frame: 209, scancode: 40 }, { frame: 221, scancode: 81 }, { frame: 229, scancode: 81 }, { frame: 237, scancode: 40 }, { frame: 249, scancode: 81 }, { frame: 261, scancode: 40 }, { frame: 301, scancode: 79 }, { frame: 313, scancode: 79 }, { frame: 325, scancode: 81 }, { frame: 337, scancode: 81 }, { frame: 349, scancode: 40 }, { frame: 361, scancode: 40 }, { frame: 381, scancode: 41 }, { frame: 393, scancode: 81 }, { frame: 401, scancode: 81 }, { frame: 409, scancode: 40 }, { frame: 417, scancode: 40 }, { frame: 418, scancode: 44, hold: 2600 }, { frame: 434, scancode: 79, hold: 38 }, { frame: 449, scancode: 40 }, { frame: 468, scancode: 80, hold: 27 }, { frame: 488, scancode: 79, hold: 19 }, { frame: 493, scancode: 82, hold: 10 }, { frame: 504, scancode: 81, hold: 30 }, { frame: 520, scancode: 81, hold: 25 }, { frame: 544, scancode: 81, hold: 10 }, { frame: 568, scancode: 82, hold: 50 }, { frame: 573, scancode: 81, hold: 29 }, { frame: 577, scancode: 226, hold: 5 }, { frame: 587, scancode: 80, hold: 17 }, { frame: 589, scancode: 81, hold: 16 }, { frame: 594, scancode: 79, hold: 29 }, { frame: 602, scancode: 81, hold: 12 }, { frame: 608, scancode: 79, hold: 53 }, { frame: 619, scancode: 224, hold: 53 }, { frame: 626, scancode: 79, hold: 51 }, { frame: 651, scancode: 80, hold: 44 }, { frame: 665, scancode: 79, hold: 8 }, { frame: 671, scancode: 79, hold: 5 }, { frame: 684, scancode: 81, hold: 12 }, { frame: 708, scancode: 81, hold: 53 }, { frame: 727, scancode: 81, hold: 24 }, { frame: 746, scancode: 80, hold: 36 }, { frame: 761, scancode: 81, hold: 42 }, { frame: 777, scancode: 81, hold: 52 }, { frame: 795, scancode: 226, hold: 8 }, { frame: 811, scancode: 81, hold: 24 }, { frame: 821, scancode: 79, hold: 38 }, { frame: 824, scancode: 80, hold: 43 }, { frame: 846, scancode: 81, hold: 51 }, { frame: 865, scancode: 82, hold: 38 }, { frame: 871, scancode: 40 }, { frame: 887, scancode: 81, hold: 8 }, { frame: 899, scancode: 81, hold: 49 }, { frame: 916, scancode: 224, hold: 40 }, { frame: 936, scancode: 40 }, { frame: 949, scancode: 82, hold: 18 }, { frame: 964, scancode: 79, hold: 14 }, { frame: 984, scancode: 79, hold: 54 }, { frame: 997, scancode: 82, hold: 39 }, { frame: 999, scancode: 81, hold: 43 }, { frame: 1014, scancode: 224, hold: 54 }, { frame: 1026, scancode: 81, hold: 33 }, { frame: 1043, scancode: 81, hold: 37 }, { frame: 1063, scancode: 82, hold: 12 }, { frame: 1076, scancode: 81, hold: 24 }, { frame: 1098, scancode: 40 }, { frame: 1123, scancode: 81, hold: 14 }, { frame: 1137, scancode: 82, hold: 19 }, { frame: 1148, scancode: 80, hold: 29 }, { frame: 1153, scancode: 79, hold: 10 }, { frame: 1159, scancode: 82, hold: 33 }, { frame: 1175, scancode: 79, hold: 35 }, { frame: 1180, scancode: 80, hold: 51 }, { frame: 1202, scancode: 79, hold: 12 }, { frame: 1227, scancode: 80, hold: 25 }, { frame: 1236, scancode: 226, hold: 32 }, { frame: 1243, scancode: 80, hold: 52 }, { frame: 1246, scancode: 80, hold: 25 }, { frame: 1252, scancode: 81, hold: 35 }, { frame: 1270, scancode: 226, hold: 6 }, { frame: 1292, scancode: 81, hold: 35 }, { frame: 1299, scancode: 79, hold: 6 }, { frame: 1310, scancode: 80, hold: 25 }, { frame: 1316, scancode: 82, hold: 52 }, { frame: 1338, scancode: 80, hold: 17 }, { frame: 1341, scancode: 82, hold: 30 }, { frame: 1353, scancode: 79, hold: 24 }, { frame: 1370, scancode: 79, hold: 34 }, { frame: 1393, scancode: 79, hold: 18 }, { frame: 1397, scancode: 79, hold: 17 }, { frame: 1399, scancode: 81, hold: 10 }, { frame: 1411, scancode: 40 }, { frame: 1432, scancode: 80, hold: 34 }, { frame: 1437, scancode: 80, hold: 51 }, { frame: 1451, scancode: 79, hold: 51 }, { frame: 1466, scancode: 80, hold: 53 }, { frame: 1474, scancode: 40 }, { frame: 1497, scancode: 79, hold: 33 }, { frame: 1505, scancode: 80, hold: 43 }, { frame: 1530, scancode: 82, hold: 21 }, { frame: 1554, scancode: 79, hold: 16 }, { frame: 1561, scancode: 80, hold: 20 }, { frame: 1575, scancode: 81, hold: 51 }, { frame: 1576, scancode: 82, hold: 19 }, { frame: 1589, scancode: 80, hold: 33 }, { frame: 1608, scancode: 81, hold: 24 }, { frame: 1617, scancode: 226, hold: 15 }, { frame: 1627, scancode: 40 }, { frame: 1628, scancode: 81, hold: 36 }, { frame: 1638, scancode: 226, hold: 44 }, { frame: 1649, scancode: 82, hold: 45 }, { frame: 1664, scancode: 81, hold: 48 }, { frame: 1666, scancode: 80, hold: 12 }, { frame: 1670, scancode: 82, hold: 37 }, { frame: 1678, scancode: 81, hold: 42 }, { frame: 1682, scancode: 40 }, { frame: 1700, scancode: 81, hold: 49 }, { frame: 1721, scancode: 80, hold: 23 }, { frame: 1736, scancode: 82, hold: 11 }, { frame: 1759, scancode: 80, hold: 48 }, { frame: 1765, scancode: 82, hold: 16 }, { frame: 1775, scancode: 79, hold: 48 }, { frame: 1796, scancode: 81, hold: 47 }, { frame: 1804, scancode: 81, hold: 16 }, { frame: 1819, scancode: 82, hold: 16 }, { frame: 1830, scancode: 82, hold: 38 }, { frame: 1847, scancode: 40 }, { frame: 1857, scancode: 79, hold: 26 }, { frame: 1871, scancode: 80, hold: 33 }, { frame: 1876, scancode: 81, hold: 44 }, { frame: 1900, scancode: 82, hold: 35 }, { frame: 1914, scancode: 81, hold: 36 }, { frame: 1931, scancode: 79, hold: 32 }, { frame: 1947, scancode: 224, hold: 14 }, { frame: 1959, scancode: 80, hold: 28 }, { frame: 1984, scancode: 80, hold: 50 }, { frame: 1992, scancode: 80, hold: 23 }, { frame: 2012, scancode: 224, hold: 35 }, { frame: 2030, scancode: 81, hold: 41 }, { frame: 2051, scancode: 224, hold: 9 }, { frame: 2060, scancode: 81, hold: 53 }, { frame: 2085, scancode: 82, hold: 8 }, { frame: 2088, scancode: 81, hold: 24 }, { frame: 2107, scancode: 81, hold: 31 }, { frame: 2122, scancode: 79, hold: 12 }, { frame: 2136, scancode: 79, hold: 9 }, { frame: 2149, scancode: 224, hold: 30 }, { frame: 2167, scancode: 79, hold: 20 }, { frame: 2178, scancode: 79, hold: 54 }, { frame: 2198, scancode: 79, hold: 25 }, { frame: 2200, scancode: 40 }, { frame: 2213, scancode: 79, hold: 6 }, { frame: 2220, scancode: 79, hold: 44 }, { frame: 2232, scancode: 81, hold: 18 }, { frame: 2248, scancode: 81, hold: 47 }, { frame: 2261, scancode: 40 }, { frame: 2284, scancode: 80, hold: 37 }, { frame: 2292, scancode: 79, hold: 14 }, { frame: 2316, scancode: 81, hold: 48 }, { frame: 2339, scancode: 79, hold: 33 }, { frame: 2358, scancode: 79, hold: 45 }, { frame: 2381, scancode: 40 }, { frame: 2404, scancode: 226, hold: 18 }, { frame: 2407, scancode: 81, hold: 51 }, { frame: 2410, scancode: 81, hold: 40 }, { frame: 2417, scancode: 81, hold: 32 }, { frame: 2428, scancode: 79, hold: 51 }, { frame: 2434, scancode: 79, hold: 31 }, { frame: 2439, scancode: 79, hold: 21 }, { frame: 2443, scancode: 80, hold: 10 }, { frame: 2453, scancode: 40 }, { frame: 2459, scancode: 82, hold: 9 }, { frame: 2471, scancode: 79, hold: 18 }, { frame: 2490, scancode: 80, hold: 13 }, { frame: 2514, scancode: 82, hold: 7 }, { frame: 2516, scancode: 81, hold: 8 }, { frame: 2538, scancode: 224, hold: 51 }, { frame: 2540, scancode: 79, hold: 45 }, { frame: 2561, scancode: 81, hold: 46 }, { frame: 2573, scancode: 80, hold: 44 }, { frame: 2591, scancode: 79, hold: 29 }, { frame: 2603, scancode: 82, hold: 21 }, { frame: 2610, scancode: 82, hold: 34 }, { frame: 2620, scancode: 40 }, { frame: 2625, scancode: 81, hold: 54 }, { frame: 2627, scancode: 80, hold: 33 }, { frame: 2637, scancode: 79, hold: 49 }, { frame: 2639, scancode: 81, hold: 10 }, { frame: 2651, scancode: 82, hold: 5 }, { frame: 2661, scancode: 224, hold: 48 }, { frame: 2668, scancode: 224, hold: 12 }, { frame: 2689, scancode: 80, hold: 15 }, { frame: 2701, scancode: 80, hold: 41 }, { frame: 2706, scancode: 80, hold: 50 }, { frame: 2708, scancode: 224, hold: 38 }, { frame: 2713, scancode: 80, hold: 46 }, { frame: 2716, scancode: 81, hold: 51 }, { frame: 2737, scancode: 40 }, { frame: 2748, scancode: 79, hold: 39 }, { frame: 2759, scancode: 82, hold: 36 }, { frame: 2768, scancode: 82, hold: 27 }, { frame: 2776, scancode: 82, hold: 45 }, { frame: 2795, scancode: 82, hold: 39 }, { frame: 2801, scancode: 80, hold: 11 }, { frame: 2806, scancode: 82, hold: 54 }, { frame: 2830, scancode: 80, hold: 41 }, { frame: 2848, scancode: 224, hold: 21 }, { frame: 2862, scancode: 79, hold: 37 }, { frame: 2872, scancode: 82, hold: 45 }, { frame: 2892, scancode: 82, hold: 47 }, { frame: 2908, scancode: 40 }, { frame: 2968, scancode: 59, hold: 4 }, { frame: 2969, scancode: 63, hold: 4 }, { frame: 2970, scancode: 64, hold: 4 }, { frame: 3090, scancode: 40 }, { frame: 3098, scancode: 40 }, { frame: 3111, scancode: 40 }, { frame: 3211, scancode: 41 }, { frame: 3241, scancode: 41 }, { frame: 3281, scancode: 81 }, { frame: 3289, scancode: 81 }, { frame: 3297, scancode: 40 }, { frame: 3309, scancode: 81 }, { frame: 3321, scancode: 81 }, { frame: 3333, scancode: 81 }, { frame: 3345, scancode: 40 }, { frame: 3365, scancode: 81 }, { frame: 3377, scancode: 40 }, { frame: 3389, scancode: 41 }, { frame: 3409, scancode: 41 }, { frame: 3421, scancode: 81 }, { frame: 3429, scancode: 81 }, { frame: 3437, scancode: 40 }, { frame: 3445, scancode: 40 }, { frame: 3446, scancode: 44, hold: 300 }, { frame: 3464, scancode: 79, hold: 45 }, { frame: 3469, scancode: 82, hold: 5 }, { frame: 3471, scancode: 79, hold: 53 }, { frame: 3475, scancode: 80, hold: 29 }, { frame: 3497, scancode: 82, hold: 49 }, { frame: 3517, scancode: 82, hold: 50 }, { frame: 3527, scancode: 224, hold: 40 }, { frame: 3530, scancode: 81, hold: 54 }, { frame: 3532, scancode: 40 }, { frame: 3549, scancode: 82, hold: 17 }, { frame: 3557, scancode: 80, hold: 41 }, { frame: 3573, scancode: 80, hold: 10 }, { frame: 3578, scancode: 79, hold: 51 }, { frame: 3601, scancode: 40 }, { frame: 3623, scancode: 81, hold: 10 }, { frame: 3635, scancode: 81, hold: 26 }, { frame: 3695, scancode: 59, hold: 4 }, { frame: 3696, scancode: 63, hold: 4 }, { frame: 3697, scancode: 64, hold: 4 }, { frame: 3817, scancode: 40 }, { frame: 3825, scancode: 40 }, { frame: 3885, scancode: 81 }, { frame: 3893, scancode: 81 }, { frame: 3901, scancode: 40 }, { frame: 3913, scancode: 81 }, { frame: 3925, scancode: 81 }, { frame: 3937, scancode: 81 }, { frame: 3949, scancode: 81 }, { frame: 3961, scancode: 40 }, { frame: 3981, scancode: 81 }, { frame: 3993, scancode: 40 }, { frame: 4005, scancode: 41 }, { frame: 4025, scancode: 41 }, { frame: 4037, scancode: 81 }, { frame: 4045, scancode: 81 }, { frame: 4053, scancode: 40 }, { frame: 4061, scancode: 40 }, { frame: 4062, scancode: 44, hold: 300 }, { frame: 4082, scancode: 82, hold: 52 }, { frame: 4094, scancode: 80, hold: 7 }, { frame: 4108, scancode: 81, hold: 45 }, { frame: 4118, scancode: 40 }, { frame: 4139, scancode: 81, hold: 25 }, { frame: 4164, scancode: 79, hold: 35 }, { frame: 4175, scancode: 82, hold: 53 }, { frame: 4191, scancode: 82, hold: 49 }, { frame: 4205, scancode: 82, hold: 36 }, { frame: 4216, scancode: 82, hold: 22 }, { frame: 4227, scancode: 226, hold: 52 }, { frame: 4241, scancode: 79, hold: 53 }, { frame: 4249, scancode: 81, hold: 19 }, { frame: 4309, scancode: 59, hold: 4 }, { frame: 4310, scancode: 63, hold: 4 }, { frame: 4311, scancode: 64, hold: 4 }, { frame: 4431, scancode: 40 }, { frame: 4438, scancode: 40 }, { frame: 4498, scancode: 81 }, { frame: 4506, scancode: 81 }, { frame: 4514, scancode: 40 }, { frame: 4526, scancode: 81 }, { frame: 4538, scancode: 81 }, { frame: 4550, scancode: 81 }, { frame: 4562, scancode: 81 }, { frame: 4574, scancode: 81 }, { frame: 4586, scancode: 40 }, { frame: 4606, scancode: 82 }, { frame: 4626, scancode: 40 }, { frame: 4646, scancode: 41 }, { frame: 4658, scancode: 81 }, { frame: 4666, scancode: 81 }, { frame: 4674, scancode: 40 }, { frame: 4682, scancode: 40 }, { frame: 4683, scancode: 44, hold: 300 }, { frame: 4705, scancode: 82, hold: 8 }, { frame: 4708, scancode: 224, hold: 42 }, { frame: 4730, scancode: 82, hold: 21 }, { frame: 4733, scancode: 80, hold: 28 }, { frame: 4750, scancode: 81, hold: 25 }, { frame: 4757, scancode: 40 }, { frame: 4774, scancode: 79, hold: 54 }, { frame: 4780, scancode: 81, hold: 49 }, { frame: 4791, scancode: 81, hold: 45 }, { frame: 4799, scancode: 81, hold: 48 }, { frame: 4809, scancode: 80, hold: 40 }, { frame: 4829, scancode: 40 }, { frame: 4841, scancode: 224, hold: 24 }, { frame: 4855, scancode: 81, hold: 50 }, { frame: 4869, scancode: 226, hold: 27 }, { frame: 4929, scancode: 59, hold: 4 }, { frame: 4930, scancode: 63, hold: 4 }, { frame: 4931, scancode: 64, hold: 4 }, { frame: 5051, scancode: 40 }, { frame: 5059, scancode: 40 }], hash: true, state2: true, saveDump: true },
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
