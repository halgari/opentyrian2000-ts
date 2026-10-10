// SPDX-License-Identifier: GPL-2.0-or-later
// Whole sessions from boot through runGame: every presented frame must hash like the C's, every STATE2 record must agree and the
// saved files (tyrian.sav / tyrian.cfg) must equal the C's byte for byte.
import { describe, expect, it, vi } from 'vitest';
import { SCENARIOS, type Scenario } from '../../tools/oracle/scenarios';
import { INPUT_SCENARIOS } from '../../tools/oracle/scenarios-input';
import { testArchive } from '../helpers/data';
import { expectSessionMatches, hasOracle, missingOracleFiles } from '../helpers/session';

vi.mock('../../src/screens/shop', async (orig) => (await import('../helpers/shop-registry')).shopMock(orig as never));

const ALL: Record<string, (typeof SCENARIOS)[keyof typeof SCENARIOS]> = {
  'newgame-ep1-first-shop-to-level': SCENARIOS['newgame-ep1-first-shop-to-level'],
  ...INPUT_SCENARIOS,
  ...Object.fromEntries(Object.entries(SCENARIOS).filter(([n, s]) => n.startsWith('session-') && !(s as Scenario).homeSeed)),
};
const only = process.env.SESSION?.split(',');

for (const [name, sc] of Object.entries(ALL)) {
  if (only && !only.includes(name)) continue;
  (testArchive && hasOracle(name) ? describe : describe.skip)(`golden: session ${name}`, () => {
    it('matches HASH, STATE2 and the saved files', () => expectSessionMatches(name, sc), 300000);
  });
}

// When the oracle directory exists, every session scenario must have its files: a lost golden fails instead of skipping.
(testArchive && hasOracle('') ? describe : describe.skip)('golden: session oracle files are complete', () => {
  it('every session scenario has its HASH, STATE2 and save dump', () => {
    const missing = Object.entries(ALL).flatMap(([name, sc]) => missingOracleFiles(name, sc as Scenario).map((f) => `${name}: ${f}`));
    expect(missing).toEqual([]);
  });
});
