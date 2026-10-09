// SPDX-License-Identifier: GPL-2.0-or-later
// Pure (no fs) description + generator of the synthetic level demos (Task 3 of sub-project 4).
// Shared by tools/oracle/gen-demos.ts (writes the files), scenarios.ts (lvl-<ep>-<nn> scenarios) and the golden test.
import { LONG_KEYS } from './long-keys';

/**
 * Every level record of tyrianN.lvl: file numbers 1..count with (n-1)*2 < lvlNum-1 (ep1 37 entries -> 18, ep2/3 25 -> 12,
 * ep4 41 -> 20, ep5 17 -> 8; the last lvlPos entry is the EOF/item-table sentinel). That is 70 levels. levelsN.dat's `]L`
 * entries (76 lines) reference the same records (some twice, ep1 additionally names the nonexistent file 20), so the record
 * list is the complete set; name and song come from the first `]L` line that selects the file (`]L` columns 13..21 / 22..23).
 */
export const DEMO_LEVELS: ReadonlyArray<readonly [ep: number, levels: ReadonlyArray<readonly [file: number, name: string, song: number]>]> = [
  [1, [[1, 'ASTEROID1', 1], [2, 'ASTEROID2', 2], [3, 'ASTEROID?', 2], [4, 'BUBBLES  ', 26], [5, 'DELIANI  ', 14], [6, 'MINEMAZE ', 23], [7, 'MINES    ', 17], [8, 'SAVARA   ', 33], [9, 'TYRIAN   ', 18], [10, 'BONUS    ', 18], [11, 'HOLES    ', 24], [12, 'SAVARA   ', 33], [13, 'SOH JIN  ', 16], [14, 'WINDY    ', 26], [15, 'TYRIAN   ', 18], [16, 'ASSASSIN ', 36], [17, 'SAVARA V ', 33], [18, '** ALE **', 41]]],
  [2, [[1, 'TORM     ', 28], [2, 'GYGES    ', 14], [3, 'BONUS    ', 28], [4, 'ASTCITY  ', 1], [5, 'SOH JIN  ', 4], [6, 'GRYPHON  ', 24], [7, 'GEM WAR  ', 24], [8, 'MARKERS  ', 2], [9, 'MISTAKES ', 17], [10, 'BOTANY A ', 24], [11, 'BOTANY B ', 13], [12, 'BONUS    ', 28]]],
  [3, [[1, 'CAMANIS  ', 4], [2, 'AST. CITY', 2], [3, 'GAUNTLET ', 1], [4, 'IXMUCANE ', 14], [5, 'BONUS    ', 28], [6, 'FLEET    ', 29], [7, 'STARGATE ', 16], [8, 'TYRIAN X ', 18], [9, 'SAWBLADES', 14], [10, 'SAVARA Y ', 21], [11, 'New Deli ', 14], [12, 'MACES    ', 7]]],
  [4, [[1, 'HARVEST  ', 16], [2, 'WINDY    ', 1], [3, 'SAVARA IV', 33], [4, 'SURFACE  ', 38], [5, 'CORE     ', 23], [6, 'SIDE EXIT', 23], [7, 'UNDERDELI', 36], [8, 'ICE EXIT ', 4], [9, 'LAVA EXIT', 29], [10, 'DESERTRUN', 2], [11, '?TUNNEL? ', 6], [12, 'LAVA RUN ', 17], [13, 'EYESPY   ', 13], [14, 'DREAD-NOT', 35], [15, 'BRAINIAC ', 38], [16, 'NOSE DRIP', 18], [17, 'TIME WAR ', 37], [18, 'SQUADRON ', 37], [19, 'APPROACH ', 36], [20, 'ICESECRET', 35]]],
  [5, [[1, 'SAVARA   ', 1], [2, 'AST ROCK ', 2], [3, 'STATION  ', 38], [4, 'SAVARA   ', 33], [5, 'ASTEROIDS', 35], [6, 'MINERS   ', 6], [7, 'CORAL    ', 37], [8, 'FRUIT    ', 14]]],
];

export interface DemoLevel { ep: number; file: number; name: string; song: number; index: number }
export const ALL_DEMO_LEVELS: DemoLevel[] = [];
for (const [ep, levels] of DEMO_LEVELS) {
  for (const [file, name, song] of levels) ALL_DEMO_LEVELS.push({ ep, file, name, song, index: ALL_DEMO_LEVELS.length });
}

export const demoScenarioName = (ep: number, file: number): string => `lvl-${ep}-${String(file).padStart(2, '0')}`;

/** Loadout written into the demo header. Item ids are indexes into the item tables (ports/options/ships/specials/shields/powerSys). */
export interface DemoLoadout {
  front: number; rear: number; leftSidekick: number; rightSidekick: number;
  generator: number; shield: number; special: number; ship: number; frontPower: number; rearPower: number;
}

export const FRONT_PORTS = 47; // portIDs 1..47 are real weapon ports in every episode's table (48..60 are "Test"/"None")
export const SIDEKICKS = 32; //   option ids 1..32 (0 = none; 33..37 are "None")
export const SHIPS = 18; //       ship ids 1..18
export const SHIELDS = 11;
export const GENERATORS = 6;
/**
 * Special ids with a HUD icon: JE_inGameDisplays blits sprite `special[id].itemgraphic` of spriteSheet10 for any special > 0,
 * and itemgraphic 0 (ids 20-36, 38, 39, 42, 43, 46) crashes the C (NULL sprite deref, SIGSEGV in blit_sprite2x2). 0 = none.
 */
export const SPECIAL_POOL: readonly number[] = [0, ...Array.from({ length: 19 }, (_, i) => i + 1), 37, 40, 41, 44, 45, 47, 48];

/**
 * Loadout of the k-th level (k = global index over all 70 levels). Every column is a coprime-stride walk over its
 * id range, so across the 70 levels: every front port 1..47, every rear port 1..47 (0 = none for a few k >= 47), every sidekick
 * 0..32 on both sides, every ship 1..18, every shield 1..11 and every generator 1..6 appears at least once.
 */
export function loadoutFor(k: number): DemoLoadout {
  return {
    front: 1 + (k % FRONT_PORTS),
    rear: k >= FRONT_PORTS && k % 9 === 4 ? 0 : 1 + ((k * 11 + 5) % FRONT_PORTS),
    leftSidekick: k % 33,
    rightSidekick: (k * 5 + 3) % 33,
    generator: 1 + (k % GENERATORS),
    shield: 1 + ((k * 3) % SHIELDS),
    special: SPECIAL_POOL[k % SPECIAL_POOL.length]!,
    ship: 1 + (k % SHIPS),
    frontPower: 1 + (k % 11),
    rearPower: 1 + ((k * 3) % 11),
  };
}

/** mulberry32 */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Key bits of replay_demo_keys (mainint.c). */
const UP = 1, DOWN = 2, LEFT = 4, RIGHT = 8, FIRE = 16, CHANGE = 32, SK_L = 64, SK_R = 128;

/**
 * "Plausible" key stream: wander in 4..45-frame legs (diagonals included), fire held in ~85% of legs, occasional
 * change-fire pulses and sidekick-button legs. Returns (keys, wait) legs with equal neighbours merged; total frames = sum.
 */
export function keyLegs(seed: number, frames: number): Array<[keys: number, wait: number]> {
  const rnd = prng(seed);
  const legs: Array<[number, number]> = [];
  let left = frames;
  while (left > 0) {
    const len = Math.min(left, 4 + Math.floor(rnd() * 42));
    let keys = 0;
    const dir = rnd();
    if (dir < 0.18) keys |= 0;
    else {
      const h = rnd(), v = rnd();
      if (h < 0.4) keys |= LEFT; else if (h < 0.8) keys |= RIGHT;
      if (v < 0.4) keys |= UP; else if (v < 0.8) keys |= DOWN;
    }
    if (rnd() < 0.85) keys |= FIRE;
    if (rnd() < 0.12) keys |= CHANGE;
    if (rnd() < 0.1) keys |= SK_L;
    if (rnd() < 0.1) keys |= SK_R;
    const last = legs[legs.length - 1];
    if (last && last[0] === keys) last[1] += len;
    else legs.push([keys, len]);
    left -= len;
  }
  return legs;
}

/**
 * Survival key stream for the long demos: stays low on the screen (mostly horizontal legs, rare short vertical nudges),
 * fire held, so the player lives through the late events. Legs of 8..80 frames.
 */
export function keyLegsSafe(seed: number, frames: number): Array<[keys: number, wait: number]> {
  const rnd = prng(seed);
  const legs: Array<[number, number]> = [];
  let left = frames;
  while (left > 0) {
    const len = Math.min(left, 8 + Math.floor(rnd() * 73));
    let keys = FIRE;
    const h = rnd();
    if (h < 0.4) keys |= LEFT; else if (h < 0.8) keys |= RIGHT;
    const v = rnd();
    if (v < 0.04) keys |= UP; else if (v < 0.14) keys |= DOWN;
    if (rnd() < 0.08) keys |= CHANGE;
    if (rnd() < 0.15) keys |= SK_L;
    if (rnd() < 0.15) keys |= SK_R;
    const last = legs[legs.length - 1];
    if (last && last[0] === keys) last[1] += len;
    else legs.push([keys, len]);
    left -= len;
  }
  return legs;
}

/** Frames of key stream for level index k (1500..2499, seeded). */
export const demoFramesFor = (lv: DemoLevel): number => 1500 + Math.floor(prng(lv.ep * 1000 + lv.file + 77)() * 1000);

/**
 * Bytes of demo.N for a level: 32-byte header (load_next_demo layout) then `(keys u8, wait u16 BE)*`. The first wait is the
 * header's. Every 7th level ends with one stray byte, every 11th with two, so the short-read EOF paths are covered too
 * (replay_demo_keys: feof after a partial record -> false). `long` selects the long-run variant (see LONG_LEVELS).
 */
export function buildDemo(lv: DemoLevel, long = false): Uint8Array {
  if (long) return demoBytes(lv, longLoadoutFor(lv), 0, longLegs(lv));
  const lo = loadoutFor(lv.index);
  const rnd = prng(lv.ep * 31 + lv.file * 7919);
  const initialWait = Math.floor(rnd() * 31);
  const legs = keyLegs(lv.ep * 100000 + lv.file * 13 + 5, demoFramesFor(lv));
  const bytes = Array.from(demoBytes(lv, lo, initialWait, legs));
  if (lv.index % 7 === 3) bytes.push(FIRE);
  else if (lv.index % 11 === 5) bytes.push(FIRE | LEFT, 0);
  return Uint8Array.from(bytes);
}

/** Header + key legs of a demo file (load_next_demo layout). */
export function demoBytes(lv: DemoLevel, lo: DemoLoadout, initialWait: number, legs: ReadonlyArray<readonly [keys: number, wait: number]>): Uint8Array {
  const out: number[] = [];
  out.push(lv.ep);
  for (let i = 0; i < 10; i++) out.push(i < lv.name.length ? lv.name.charCodeAt(i) : 0);
  out.push(lv.file, lo.front, lo.rear, 0 /* super_arcade_mode */, lo.leftSidekick, lo.rightSidekick, lo.generator);
  out.push(2, 1 /* sidekick_level/series: only read for player 2 */, lv.ep /* initial_episode_num */);
  out.push(lo.shield, lo.special, lo.ship, lo.frontPower, lo.rearPower, 0, 0, 0, lv.song);
  out.push(initialWait >> 8, initialWait & 255);
  for (const [keys, wait] of legs) out.push(keys, wait >> 8, wait & 255);
  return Uint8Array.from(out);
}

/** Key legs of a long demo: the searched stream from long-keys.ts (tools/oracle/survive.ts), else the plain survival stream. */
export function longLegs(lv: DemoLevel): Array<[number, number]> {
  const enc = LONG_KEYS[longScenarioName(lv.ep, lv.file)];
  if (enc === undefined) return keyLegsSafe(lv.ep * 100000 + lv.file * 13 + 5 + 977, LONG_FRAMES);
  return decodeLegs(enc);
}
export function encodeLegs(legs: ReadonlyArray<readonly [number, number]>): string {
  return btoa(String.fromCharCode(...legs.flatMap(([k, w]) => [k, w >> 8, w & 255])));
}
export function decodeLegs(enc: string): Array<[number, number]> {
  const b = Uint8Array.from(atob(enc), (c) => c.charCodeAt(0));
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 2 < b.length; i += 3) out.push([b[i]!, (b[i + 1]! << 8) | b[i + 2]!]);
  return out;
}

/**
 * Long-run demos (scenarios `lvlx-<ep>-<nn>`): the shipped levels whose smoothie / flip / lighting / random-explosion events lie
 * beyond the ~2000 frames the standard demos play. The key stream is found by `tsx tools/oracle/survive.ts <ep>-<file> <goal>`
 * (a greedy two-level search that replays candidates through the TS port, which is bit-exact with the C on these demos) and
 * stored in long-keys.ts; the loadout is fixed strong gear (see longLoadoutFor). Late events covered:
 *   ep1 16: blur @3015, lava off/on @9465     ep4 3: water @3660         ep4 10: blur @2590
 *   ep4 12: flip @2976                        ep4 13: flip @5136         ep4 15: lava @3440, water @3490, iced @5000, random explosions @10000
 *   ep4 20: blur on/off @2922 / @9125
 * Difficulty: the C demo loader forces NORMAL and never sets `initialDifficulty` (event 66 compares that global, so it keeps its
 * zero-initialised value and every `66` skips): ep4 4 and 15 skip their early `64@2` lighting event in the C as well, and no
 * demo can raise the difficulty without patching the oracle. Lighting (kind 6, `starShowVGA` code 2) is covered by ep1 15 and
 * ep4 20 (64@0 / 64@140) in the standard set, the lighting event of ep4 4/15 only differs by the `66` gate.
 */
export const LONG_LEVELS: ReadonlyArray<readonly [ep: number, file: number]> = [
  [1, 16], [4, 3], [4, 10], [4, 12], [4, 13], [4, 15], [4, 20],
];
export const LONG_FRAMES = 12000;
export const longScenarioName = (ep: number, file: number): string => `lvlx-${ep}-${String(file).padStart(2, '0')}`;
export const LONG_DEMO_LEVELS: DemoLevel[] = LONG_LEVELS.map(([ep, file]) => ALL_DEMO_LEVELS.find((l) => l.ep === ep && l.file === file)!);

export function longLoadoutFor(lv: DemoLevel): DemoLoadout {
  const base = loadoutFor(lv.index);
  // strong gear so the search can both survive and clear waves: Mega Pulse / Rear Mega Pulse at power 11, ship 12/13, shield 11, generator 6
  return { ...base, front: 19, rear: 22, frontPower: 11, rearPower: 11, ship: lv.index % 2 === 0 ? 12 : 13, shield: 11, generator: 6, special: 0 };
}

/** Frames the oracle/TS run per level: 162-frame boot+menu prefix, level load, key stream, then 150 frames for the level end/fade/title. */
export const maxFramesFor = (lv: DemoLevel): number => 260 + demoFramesFor(lv) + 150;
export const maxFramesForLong = (lv: DemoLevel): number => 260 + longLegs(lv).reduce((n, [, w]) => n + w, 0) + 150;

/** Levels expected to fail: none (the smoothie, flip/lighting and random-explosion paths landed with Task 4 of sub-project 4). */
export const EXPECTED_FAIL: ReadonlySet<string> = new Set<string>();
