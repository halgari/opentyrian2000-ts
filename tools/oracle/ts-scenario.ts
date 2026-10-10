// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/ts-scenario.ts <name|all> [--no-write]
//
// Authors session scenarios from the TS port's own timeline instead of probing the C (tools/oracle/discover.ts needs a few oracle
// runs per input and the later steps of a long session cost hours). Each session is a key script (test/helpers/script-input.ts:
// steps fire on idle screens, a number of frames after the previous step, or when a predicate holds); running it through runGame
// yields the absolute frame of every key, which is written into the `<discovered>` region of scenarios.ts. The scenario is only a
// proposal: the C oracle run (pnpm oracle:run <name>) and test/golden/session.test.ts decide whether the TS timeline was right (a key
// that arrives while the C is fading would be eaten and the frames would diverge).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAssets } from '../../src/assets';
import { createCtx, type Ctx } from '../../src/ctx';
import { DataArchive } from '../../src/data/archive';
import { runGame } from '../../src/game';
import { VirtualClock } from '../../src/platform/clock';
import { STORAGE_KEYS, bytesToBase64 } from '../../src/platform/storage';
import { NullPresenter } from '../../src/video/presenter';
import { Stop, installScript, type ScriptStep } from '../../test/helpers/script-input';
import { writeScenario } from './discover';
import type { KeyPress, Scenario, TypedChar } from './scenarios';
import { EPISODE_END_SAVE_REL, buildEpisodeEndSave, buildTsSave } from './ts-save';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const RET = 40, RIGHT = 79, LEFT = 80, LCTRL = 224, LALT = 226, BKSP = 42, ESC = 41, SPACE = 44, DOWN = 81, UP = 82, F2 = 59, F6 = 63, F7 = 64;

const dead = (): ((c: Ctx) => boolean) => {
  let wasAlive = false; // isAlive is also false before the level starts
  return (c) => {
    wasAlive = wasAlive || c.game.players[0].isAlive;
    return wasAlive && !c.game.players[0].isAlive && !c.game.varz.firstGameOver;
  };
};

/** title -> Full Game -> episode 1 -> difficulty (after `difficultyKeys`) -> shop 1 (Next Level) -> first planet. */
const toLevel = (difficultyKeys: number[] = []): ScriptStep[] => [
  { sc: RET }, { sc: RET }, { sc: RET }, ...difficultyKeys.map((sc) => ({ sc })), { sc: RET },
  { sc: DOWN, after: 12 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: RET, after: 1 }, { sc: RET, after: 4 },
];
const shopNextLevel = (first: number): ScriptStep[] => [
  { sc: DOWN, after: first }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: RET, after: 1 }, { sc: RET, after: 4 },
];
/** The F2+F6+F7 cheat: ends the level; a key cuts the tally's glow animation short, another leaves its final "Press a key". */
const skipLevel = (wait: number): ScriptStep[] => [
  { sc: F2, hold: 4, after: wait }, { sc: F6, hold: 4, after: 0 }, { sc: F7, hold: 4, after: 0 }, { sc: RET, after: 120 }, { sc: RET, after: 8 },
];
const gameOver = (): ScriptStep => ({ sc: RET, when: dead(), hold: 1 });


/**
 * Real held input for one level: fire held for `frames`, a sweep of arrow holds (deterministic LCG pattern, overlapping holds are
 * allowed), the change-fire key tapped now and then, and the left / right sidekick keys held in bursts.
 */
const playHolds = (frames: number, seed: number): ScriptStep[] => {
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
const readCube = (): ScriptStep[] => [{ sc: RET, after: 60 }, { sc: ESC, after: 100 }, { sc: ESC, after: 30 }];
/** The weapon sim: power +2 on the current weapon, Done buys. */
const buyWeapon = (): ScriptStep[] => [
  { sc: RIGHT, after: 40 }, { sc: RIGHT, after: 12 }, { sc: DOWN, after: 12 }, { sc: DOWN, after: 12 }, { sc: RET, after: 12 }, { sc: RET, after: 12 },
];
/** A list screen (shield, generator, sidekick): the entry below the current one is bought. */
const buyListItem = (): ScriptStep[] => [{ sc: DOWN, after: 20 }, { sc: RET, after: 12 }, { sc: ESC, after: 12 }];
/** The sidekick screen (list plus sim): the entry below the current one, Return buys and leaves for the Upgrade Ship menu. */
const buySidekick = (): ScriptStep[] => [{ sc: UP, after: 20 }, { sc: RET, after: 20 }];
/**
 * Shop: Upgrade Ship (the menu starts on Ship Type each visit), the sub-screen of `row` (1 front gun, 2 rear gun, 3 shield, 4 generator,
 * 5 left sidekick, 6 right sidekick) with a purchase, Esc to the main menu, then Next Level (the main menu cursor stays on Upgrade Ship).
 */
const shopBuyNextLevel = (first: number, row = 1): ScriptStep[] => [
  { sc: DOWN, after: first }, { sc: DOWN, after: 8 }, { sc: RET, after: 8 },
  ...Array.from({ length: row }, () => ({ sc: DOWN, after: 12 })), { sc: RET, after: 12 },
  ...(row <= 2 ? buyWeapon() : row <= 4 ? buyListItem() : buySidekick()),
  { sc: ESC, after: 20 },
  { sc: DOWN, after: 12 }, { sc: DOWN, after: 8 }, { sc: RET, after: 8 }, { sc: RET, after: 8 },
];

/** Frames of fire/arrow play per level and the seed of its pattern: levels 2-4 kill a ship that does not dodge after ~210-390 frames, so they are skipped (F2+F6+F7) before that. */
const SEEDS = [1, 2, 3, 4], LENS = [2600, 300, 300, 300];
interface Spec { steps: () => ScriptStep[]; tail: number; extra?: Partial<Scenario>; setup?: (ctx: Ctx) => void }

const SPECS: Record<string, Spec> = {
  'session-ep1-hard': { tail: 10, steps: () => [...toLevel([DOWN]), { sc: SPACE, hold: 200, after: 120 }] },
  /** The arcade: Stalker ship, no cash, arcade shop, level with fire held until the lives are gone. */
  'session-arcade-ep1': {
    tail: 40,
    steps: () => [{ sc: RET }, { sc: DOWN }, { sc: RET }, { sc: RET }, { sc: RET }, { sc: RET, after: 12 }, { sc: SPACE, hold: 2600, after: 150 }],
  },
  /** Episode 1, levels 1-4 with real held input (fire, arrows, sidekicks), shops in between (a front weapon upgrade), backup saves. */
  'session-long-ep1': {
    tail: 40,
    steps: () => [
      { sc: RET }, { sc: RET }, { sc: RET }, { sc: RET },
      ...shopBuyNextLevel(12, 1), ...playHolds(LENS[0]!, SEEDS[0]!), ...skipLevel(60),
      ...readCube(), ...shopBuyNextLevel(40, 3), ...playHolds(LENS[1]!, SEEDS[1]!), ...skipLevel(60),
      ...shopBuyNextLevel(60, 4), ...playHolds(LENS[2]!, SEEDS[2]!), ...skipLevel(60),
      ...shopBuyNextLevel(60, 5), ...playHolds(LENS[3]!, SEEDS[3]!), ...skipLevel(60),
    ],
  },
  /** Idle ship dies, any key at the game-over text, restore from the backup save, the shop, level 1 again. */
  'session-full-ep1': {
    tail: 20,
    steps: () => [...toLevel(), gameOver(), ...shopNextLevel(60), { sc: SPACE, hold: 60, after: 130 }],
  },
  /** Two sessions in one process: ... game over, restored shop, quit to the title, then the whole thing again. */
  'session-twice-ep1': {
    tail: 20,
    steps: () => {
      const one = (): ScriptStep[] => [...toLevel(), gameOver(), { sc: ESC, after: 60 }, { sc: RET, after: 8 }];
      return [...one(), ...one()];
    },
  },
  /** F2+F6+F7 ends levels 1 and 2: end-level tally, shop, planet map, briefing, the next level start (backup saves). */
  'session-skip-levels': {
    tail: 40,
    steps: () => [
      ...toLevel(), ...skipLevel(150),
      ...shopNextLevel(60), { sc: SPACE, hold: 30, after: 60 },
      ...skipLevel(40), // level 2 kills an idle ship after ~140 frames: end it while the ship is alive
      { sc: DOWN, after: 60 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 },
    ],
  },
  /**
   * Keys on consecutive frames while the ship explodes (one service_SDL_events call per frame): the C's SDL pump delivers an event
   * pushed right after a handled one a frame late (Input.pollEvent), so the cheat fires two frames after F7, not one.
   */
  'session-dead-keys': {
    tail: 80,
    steps: () => {
      const dying = (c: Ctx): boolean => !c.game.players[0].isAlive && c.game.players[0].explodingTicks > 0 && c.game.players[0].explodingTicks < 50;
      return [...toLevel(), { sc: F2, hold: 4, when: dying }, { sc: F6, hold: 4, after: 1 }, { sc: F7, hold: 4, after: 1 }];
    },
  },
  /** The C loads a save the TS port wrote: Load Game, slot 2, the restored game's first screens. */
  'ts-save-load': {
    tail: 40,
    extra: { homeSeed: 'test-data/ts-save/tyrian.sav' },
    setup: (ctx) => { ctx.storage.set(STORAGE_KEYS.sav, bytesToBase64(buildTsSave())); },
    steps: () => [{ sc: DOWN }, { sc: RET, after: 1 }, { sc: DOWN }, { sc: RET }, { sc: DOWN, after: 60 }, { sc: DOWN, after: 1 }],
  },
  ...episodeEnd(),
};

/** Typed characters of a name, one per `gap` frames (the entry loop presents frames continuously). */
const typed = (text: string, gap = 20): ScriptStep[] => [...text].map((ch) => ({
  sc: ch === ' ' ? SPACE : ch >= '0' && ch <= '9' ? (ch === '0' ? 39 : 30 + Number(ch) - 1) : 4 + (ch.toLowerCase().charCodeAt(0) - 97), ch, after: gap,
}));
const idleKey = (sc = RET): ScriptStep => ({ sc, idle: true });
const loadSlot = (n: number): ScriptStep[] => [{ sc: DOWN }, { sc: RET }, ...Array.from({ length: n - 1 }, () => ({ sc: DOWN })), { sc: RET }];

/** Sessions that start from episode-end.sav (a HOME-seeded save standing at the `]Q` section of an episode). */
function episodeEnd(): Record<string, Spec> {
  const seed: Partial<Scenario> = { homeSeed: EPISODE_END_SAVE_REL };
  const setup = (ctx: Ctx): void => { ctx.storage.set(STORAGE_KEYS.sav, bytesToBase64(buildEpisodeEndSave())); };
  return {
    /** Episode 1 ends: the end text, a new high score typed in (lower case, a digit, a backspace), the table, then the episode 2 title, its first shop and level 1 (the backup save at the level start writes tyrian.sav with the new high score). */
    'session-ep1-end': {
      tail: 60, extra: seed, setup,
      steps: () => [...loadSlot(1), { sc: RET }, ...typed('Ace 7x'), { sc: BKSP, after: 10 }, { sc: RET, after: 10 }, { sc: RET }, { sc: RET, idle: true }, ...shopNextLevel(60), { sc: SPACE, hold: 30, after: 60 }],
    },
    /** Episode 5 ends in a game that began in episode 1: no high score, credits (cut short by a key), the SuperCarrot roll, back to episode 1. */
    'session-ep5-credits': {
      tail: 60, extra: seed, setup,
      steps: () => [...loadSlot(2), idleKey(), idleKey(), idleKey(), { sc: RET, after: 1500 }, idleKey(), idleKey(), ...shopNextLevel(60), { sc: SPACE, hold: 30, after: 60 }],
    },
    /** The credits run to their end (the last tick repeats until a key), so every text line, picture and ship pass is drawn. */
    'session-ep5-credits-full': {
      tail: 40, extra: seed, setup,
      steps: () => [...loadSlot(2), idleKey(), idleKey(), idleKey(), { sc: RET, after: 7800 }, idleKey(), idleKey(), ...shopNextLevel(60), { sc: SPACE, hold: 30, after: 60 }],
    },
  };
}

function run(name: string, write: boolean): void {
  const spec = SPECS[name];
  if (!spec) throw new Error(`unknown session ${name}`);
  const dir = join(ROOT, 'data/tyrian2000');
  const files = new Map<string, Uint8Array>();
  for (const f of readdirSync(dir)) files.set(f, new Uint8Array(readFileSync(join(dir, f))));
  const ctx = createCtx({ assets: loadAssets(new DataArchive(files)), clock: new VirtualClock(), presenter: new NullPresenter(), versionString: 'oracle', seed: 1 });
  spec.setup?.(ctx);
  const steps = spec.steps();
  const sr = installScript(ctx, steps, { idleLimit: 1000 });
  // run until the script is exhausted and `tail` frames have passed
  const sink = ctx.frameSink!;
  let exhaustedAt = -1;
  ctx.frameSink = (s, p) => {
    sink(s, p);
    if (sr.fires.length === steps.length && exhaustedAt < 0) exhaustedAt = sr.frames;
    const lastKeyEnd = Math.max(...sr.fires.map((f, i) => f + (steps[i]!.hold ?? 0)));
    if (exhaustedAt >= 0 && sr.frames > lastKeyEnd + spec.tail) throw new Stop();
  };
  let ok = true;
  void runGame(ctx).catch((e: unknown) => { if (!(e instanceof Stop)) { ok = false; console.error(e); } }).then(() => {
    if (!ok) return;
    // the oracle's frame index: the key is injected after that frame is presented
    const keys: KeyPress[] = steps.flatMap((s, i) => {
      if (s.ch !== undefined) return [];
      const frame = sr.fires[i]! - (s.idle ? 0 : 1);
      return [s.hold ? { frame, scancode: s.sc, hold: s.hold } : { frame, scancode: s.sc }];
    });
    const text: TypedChar[] = steps.flatMap((s, i) => (s.ch === undefined ? [] : [{ frame: sr.fires[i]! - 1, scancode: s.sc, char: s.ch }]));
    const lastEnd = Math.max(...keys.map((k) => k.frame + (k.hold ?? 0)), ...text.map((t) => t.frame));
    const sc: Scenario = { maxFrames: lastEnd + spec.tail + 1, keys, ...(text.length ? { text } : {}), hash: true, state2: true, saveDump: true, ...(spec.extra ?? {}) };
    console.log(`${name}: ${JSON.stringify(sc)}`);
    if (write) writeScenario(name, sc);
  });
}

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
if (!target) throw new Error(`usage: ts-scenario.ts <${Object.keys(SPECS).join('|')}|all> [--no-write]`);
for (const n of target === 'all' ? Object.keys(SPECS) : [target]) run(n, !args.includes('--no-write'));
