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
import type { KeyPress, Scenario } from './scenarios';
import { buildTsSave } from './ts-save';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const RET = 40, ESC = 41, SPACE = 44, DOWN = 81, UP = 82, F2 = 59, F6 = 63, F7 = 64;

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

interface Spec { steps: () => ScriptStep[]; tail: number; extra?: Partial<Scenario>; setup?: (ctx: Ctx) => void }

const SPECS: Record<string, Spec> = {
  'session-ep1-hard': { tail: 10, steps: () => [...toLevel([DOWN]), { sc: SPACE, hold: 200, after: 120 }] },
  /** The arcade: Stalker ship, no cash, arcade shop, level with fire held until the lives are gone. */
  'session-arcade-ep1': {
    tail: 40,
    steps: () => [{ sc: RET }, { sc: DOWN }, { sc: RET }, { sc: RET }, { sc: RET }, { sc: RET, after: 12 }, { sc: SPACE, hold: 2600, after: 150 }],
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
};

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
    const keys: KeyPress[] = steps.map((s, i) => {
      const frame = sr.fires[i]! - 1; // the oracle's frame index: the key is injected after that frame is presented
      return s.hold ? { frame, scancode: s.sc, hold: s.hold } : { frame, scancode: s.sc };
    });
    const lastEnd = Math.max(...keys.map((k) => k.frame + (k.hold ?? 0)));
    const sc: Scenario = { maxFrames: lastEnd + spec.tail + 1, keys, hash: true, state2: true, saveDump: true, ...(spec.extra ?? {}) };
    console.log(`${name}: ${JSON.stringify(sc)}`);
    if (write) writeScenario(name, sc);
  });
}

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
if (!target) throw new Error(`usage: ts-scenario.ts <${Object.keys(SPECS).join('|')}|all> [--no-write]`);
for (const n of target === 'all' ? Object.keys(SPECS) : [target]) run(n, !args.includes('--no-write'));
