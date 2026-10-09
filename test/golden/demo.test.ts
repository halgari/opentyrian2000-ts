// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR } from '../helpers/frames';
import { readHashes } from '../helpers/hash-frames';
import { readStates, STATE_FIELDS } from '../helpers/state-trace';
import { runDemoScenario } from './demo-harness';

/** Every frame of each demo: CRC of palette+pixels and the whole state record equal the C oracle. */
for (const name of ['demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5'] as const) {
  const wantHashes = readHashes(resolve(ORACLE_DIR, `${name}.hash`));
  const wantStates = readStates(resolve(ORACLE_DIR, `${name}.state`));
  (testArchive && wantHashes && wantStates ? describe : describe.skip)(`golden: ${name}`, () => {
    it('all frame hashes and states equal the oracle', async () => {
      const actual = await runDemoScenario(name, wantHashes!.length);
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
