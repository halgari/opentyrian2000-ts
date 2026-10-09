// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_DEMO_LEVELS, buildDemo, demoScenarioName, EXPECTED_FAIL, LONG_DEMO_LEVELS, longScenarioName } from '../../tools/oracle/demo-levels';
import { demoPath } from '../../tools/oracle/gen-demos';
import { LEVEL_SCENARIOS, LONG_LEVEL_SCENARIOS } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR } from '../helpers/frames';
import { readHashes } from '../helpers/hash-frames';
import { readStates, STATE_FIELDS } from '../helpers/state-trace';
import { runDemoScenario } from './demo-harness';

/**
 * Synthetic demos for every level record of episodes 1-5 (tools/oracle/demo-levels.ts): per presented frame the CRC of
 * palette+pixels and the whole state record equal the C oracle. The TS archive's demo.1 is replaced by the same bytes the
 * oracle's alternate data dir holds. EXPECTED_FAIL levels (none now) must still differ, so
 * (it.fails turns an unexpected pass into a failure).
 *
 * KNOWN_DIVERGENT: levels that diverge for a reason not fixed yet, with the diagnosis (same it.fails semantics).
 */
export const KNOWN_DIVERGENT: ReadonlyMap<string, string> = new Map<string, string>([]);

/**
 * Long-run demos (lvlx-*): the levels whose late smoothie / flip / lighting / random-explosion events the standard demos do
 * not reach. REQUIRE lists the features the TS run must actually exercise (so a regenerated key stream cannot silently stop
 * covering an event): `s<k>` = smoothie k enabled on some frame (1 lava, 2 water, 3 iced blur, 4 blur, 5 iced, 6 lighting,
 * 9 flip), `code1` / `code2` = starShowVGASpecialCode flip / lighting, `rand` = random explosions enabled. Events: ep1 16 blur
 * @3015; ep4 3 water @3660; ep4 10 blur @2590; ep4 12 flip @2976; ep4 13 flip @5136; ep4 15 lava @3440, iced @5000, random
 * explosions @10000 (its water @3490 only turns water off); ep4 20 blur @0 (its curLoc jumps past the later events).
 */
const REQUIRE: ReadonlyMap<string, readonly string[]> = new Map([
  ['lvlx-1-16', ['s1', 's4', 'code2']],
  ['lvlx-4-03', ['s2']],
  ['lvlx-4-10', ['s4']],
  ['lvlx-4-12', ['s1', 'code1']],
  ['lvlx-4-13', ['code1']],
  ['lvlx-4-15', ['s1', 's5', 'rand']],
  ['lvlx-4-20', ['s4']],
]);

function goldenFor(lv: (typeof ALL_DEMO_LEVELS)[number], long: boolean): void {
  const name = long ? longScenarioName(lv.ep, lv.file) : demoScenarioName(lv.ep, lv.file);
  const scenario = long ? LONG_LEVEL_SCENARIOS[name]! : LEVEL_SCENARIOS[name]!;
  const wantHashes = readHashes(resolve(ORACLE_DIR, `${name}.hash`));
  const wantStates = readStates(resolve(ORACLE_DIR, `${name}.state`));
  const expectFail = EXPECTED_FAIL.has(name) || KNOWN_DIVERGENT.has(name);
  const run = testArchive && wantHashes && wantStates ? (expectFail ? it.fails : it) : it.skip;
  describe(`golden: ${name} (${lv.name.trim()})`, () => {
    run('all frame hashes and states equal the oracle', async () => {
      const bytes = buildDemo(lv, long);
      const onDisk = demoPath(lv, long);
      if (existsSync(onDisk)) expect(Buffer.compare(readFileSync(onDisk), bytes), 'demo file is stale: run tsx tools/oracle/gen-demos.ts and the oracle').toBe(0);
      const seen = new Set<string>();
      const actual = await runDemoScenario(scenario, wantHashes!.length, { 'demo.1': bytes }, (ctx) => {
        const c = ctx.game.config;
        c.smoothies.forEach((on, i) => { if (on) seen.add(`s${i + 1}`); });
        if (c.starShowVGASpecialCode) seen.add(`code${c.starShowVGASpecialCode}`);
        if (ctx.game.varz.randomExplosions) seen.add('rand');
      });
      expect(actual.hashes.length).toBe(wantHashes!.length);
      let firstState: string | null = null;
      for (let f = 0; f < wantStates!.length && firstState === null; f++) {
        const bad = STATE_FIELDS.filter((k) => actual.states[f]![k] !== wantStates![f]![k]);
        if (bad.length) firstState = `frame ${f} field ${bad[0]} (got ${actual.states[f]![bad[0]!]}, want ${wantStates![f]![bad[0]!]})`;
      }
      expect(firstState, 'first state mismatch').toBeNull();
      let firstHash: string | null = null;
      for (let f = 0; f < wantHashes!.length; f++) {
        if (actual.hashes[f] !== wantHashes![f]) { firstHash = `frame ${f}`; break; }
      }
      expect(firstHash, 'first hash mismatch').toBeNull();
      const need = REQUIRE.get(name);
      if (need !== undefined) for (const f of need) expect(seen.has(f), `${name} must exercise ${f} (saw ${[...seen].join(',')})`).toBe(true);
    }, 240000);
  });
}

for (const lv of ALL_DEMO_LEVELS) goldenFor(lv, false);
for (const lv of LONG_DEMO_LEVELS) goldenFor(lv, true);

describe('level demo set', () => {
  it('covers every level record of every episode (70) and EXPECTED_FAIL names real scenarios', () => {
    expect(ALL_DEMO_LEVELS.length).toBe(70);
    for (const n of EXPECTED_FAIL) expect(LEVEL_SCENARIOS[n], n).toBeDefined();
  });
});
