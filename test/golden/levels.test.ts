// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_DEMO_LEVELS, buildDemo, demoScenarioName, EXPECTED_FAIL } from '../../tools/oracle/demo-levels';
import { demoPath } from '../../tools/oracle/gen-demos';
import { LEVEL_SCENARIOS } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR } from '../helpers/frames';
import { readHashes } from '../helpers/hash-frames';
import { readStates, STATE_FIELDS } from '../helpers/state-trace';
import { runDemoScenario } from './demo-harness';

/**
 * Synthetic demos for every level record of episodes 1-5 (tools/oracle/demo-levels.ts): per presented frame the CRC of
 * palette+pixels and the whole state record equal the C oracle. The TS archive's demo.1 is replaced by the same bytes the
 * oracle's alternate data dir holds. EXPECTED_FAIL levels (smoothies, random explosions: Task 4) must still differ, so
 * the list shrinks as Task 4 lands (it.fails turns an unexpected pass into a failure).
 *
 * KNOWN_DIVERGENT: levels that diverge for a reason not fixed yet, with the diagnosis (same it.fails semantics).
 */
export const KNOWN_DIVERGENT: ReadonlyMap<string, string> = new Map<string, string>([]);

for (const lv of ALL_DEMO_LEVELS) {
  const name = demoScenarioName(lv.ep, lv.file);
  const wantHashes = readHashes(resolve(ORACLE_DIR, `${name}.hash`));
  const wantStates = readStates(resolve(ORACLE_DIR, `${name}.state`));
  const expectFail = EXPECTED_FAIL.has(name) || KNOWN_DIVERGENT.has(name);
  const run = testArchive && wantHashes && wantStates ? (expectFail ? it.fails : it) : it.skip;
  describe(`golden: ${name} (${lv.name.trim()})`, () => {
    run('all frame hashes and states equal the oracle', async () => {
      const bytes = buildDemo(lv);
      const onDisk = demoPath(lv);
      if (existsSync(onDisk)) expect(Buffer.compare(readFileSync(onDisk), bytes), 'demo file is stale: run tsx tools/oracle/gen-demos.ts and the oracle').toBe(0);
      const actual = await runDemoScenario(LEVEL_SCENARIOS[name]!, wantHashes!.length, { 'demo.1': bytes });
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
    }, 120000);
  });
}

describe('level demo set', () => {
  it('covers every level record of every episode (70) and EXPECTED_FAIL names real scenarios', () => {
    expect(ALL_DEMO_LEVELS.length).toBe(70);
    for (const n of EXPECTED_FAIL) expect(LEVEL_SCENARIOS[n], n).toBeDefined();
  });
});
