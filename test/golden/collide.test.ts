// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR } from '../helpers/frames';
import { readStates, STATE_FIELDS } from '../helpers/state-trace';
import { runDemoScenario } from './demo-harness';

/** Whole state record (enemies, shots, explosions, cash, mtCalls, ...) equals the oracle for every demo frame. */
for (const name of ['demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5'] as const) {
  const want = readStates(resolve(ORACLE_DIR, `${name}.state`));
  (testArchive && want ? describe : describe.skip)(`golden: player shot collision ${name}`, () => {
    it('state trace equals the oracle for the whole demo', async () => {
      const actual = await runDemoScenario(name, want!.length);
      for (let f = 0; f < want!.length; f++) {
        const bad = STATE_FIELDS.filter((k) => actual.states[f]![k] !== want![f]![k]);
        expect([f, bad]).toEqual([f, []]);
      }
    }, 120000);
  });
}
