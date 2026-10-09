// SPDX-License-Identifier: GPL-2.0-or-later
// Episode end from HOME-seeded saves standing at the `]Q` section (tools/oracle/ts-save.ts makes test-data/ts-save/episode-end.sav):
// HASH and STATE2 (incl. mtCalls) on every frame, and tyrian.sav BYTES for the high score entry.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SCENARIOS } from '../../tools/oracle/scenarios';
import { buildEpisodeEndSave } from '../../tools/oracle/ts-save';
import { testArchive } from '../helpers/data';
import { expectSessionMatches, hasOracle } from '../helpers/session';
import { EPEND_SAV, setupFor } from './epend-setup';

vi.mock('../../src/screens/shop', async (orig) => (await import('../helpers/shop-registry')).shopMock(orig as never));

const NAMES = ['session-ep1-end', 'session-ep5-credits', 'session-ep5-credits-full'];

for (const name of NAMES) {
  const sc = (SCENARIOS as Record<string, (typeof SCENARIOS)[keyof typeof SCENARIOS]>)[name];
  (testArchive && sc && hasOracle(name) && existsSync(EPEND_SAV) ? describe : describe.skip)(`golden: ${name}`, () => {
    it('matches HASH, STATE2 and the saved files', async () => {
      expect(new Uint8Array(readFileSync(EPEND_SAV))).toEqual(buildEpisodeEndSave()); // the seed is what the TS port writes today
      await expectSessionMatches(name, sc!, { setup: setupFor });
    }, 600000);
  });
}
