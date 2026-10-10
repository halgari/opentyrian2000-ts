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
import { EPISODE_END_SAVE_REL, SEEDS, buildEpisodeEndSave, buildTsSave, seedRel } from './ts-save';
import {
  BKSP, DOWN, ESC, F2, F6, F7, LALT, LCTRL, LEFT, RET, RIGHT, SPACE, UP, type Spec,
  buyListItem, buySidekick, buyWeapon, dead, gameOver, idleKey, loadSlot, playHolds, readCube, shopBuyNextLevel, shopNextLevel, skipLevel, toLevel, typed,
} from './ts-steps';
import { POLISH_SPECS_ENGAGE, registerPolishSeeds } from './ts-specs-polish';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Frames of fire/arrow play per level and the seed of its pattern: levels 2-4 kill a ship that does not dodge after ~210-390 frames, so they are skipped (F2+F6+F7) before that. */
const PLAY_SEEDS = [1, 2, 3, 4], LENS = [2600, 300, 300, 300];

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
      ...shopBuyNextLevel(12, 1), ...playHolds(LENS[0]!, PLAY_SEEDS[0]!), ...skipLevel(60),
      ...readCube(), ...shopBuyNextLevel(40, 3), ...playHolds(LENS[1]!, PLAY_SEEDS[1]!), ...skipLevel(60),
      ...shopBuyNextLevel(60, 4), ...playHolds(LENS[2]!, PLAY_SEEDS[2]!), ...skipLevel(60),
      ...shopBuyNextLevel(60, 5), ...playHolds(LENS[3]!, PLAY_SEEDS[3]!), ...skipLevel(60),
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
  ...POLISH_SPECS_ENGAGE,
};

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
  registerPolishSeeds();
  spec.setup?.(ctx);
  if (spec.seed) {
    const bytes = SEEDS[seedRel(spec.seed)]?.();
    if (!bytes) throw new Error(`unknown seed ${spec.seed}`);
    ctx.storage.set(STORAGE_KEYS.sav, bytesToBase64(bytes));
  }
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
  void runGame(ctx).catch((e: unknown) => { if (!(e instanceof Stop)) { ok = false; console.error(e); console.error(`steps fired ${sr.fires.length}/${steps.length} at frames ${sr.fires.join(',')}; ${sr.frames} frames presented`); } }).then(() => {
    if (!ok) return;
    // the oracle's frame index: the key is injected after that frame is presented
    const keys: KeyPress[] = steps.flatMap((s, i) => {
      if (s.ch !== undefined) return [];
      const frame = sr.fires[i]! - (s.idle ? 0 : 1);
      return [s.hold ? { frame, scancode: s.sc, hold: s.hold } : { frame, scancode: s.sc }];
    });
    const text: TypedChar[] = steps.flatMap((s, i) => (s.ch === undefined ? [] : [{ frame: sr.fires[i]! - 1, scancode: s.sc, char: s.ch }]));
    const lastEnd = Math.max(...keys.map((k) => k.frame + (k.hold ?? 0)), ...text.map((t) => t.frame));
    const sc: Scenario = { maxFrames: lastEnd + spec.tail + 1, keys, ...(text.length ? { text } : {}), hash: true, state2: true, state3: true, saveDump: true, ...(spec.seed ? { homeSeed: seedRel(spec.seed) } : {}), ...(spec.extra ?? {}) };
    console.log(`${name}: ${JSON.stringify(sc)}`);
    if (write) writeScenario(name, sc);
  });
}

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
if (!target) throw new Error(`usage: ts-scenario.ts <${Object.keys(SPECS).join('|')}|all> [--no-write]`);
for (const n of target === 'all' ? Object.keys(SPECS) : [target]) run(n, !args.includes('--no-write'));
