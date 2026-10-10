// SPDX-License-Identifier: GPL-2.0-or-later
// Polish/ship modes: sessions seeded with TS-written saves (tools/oracle/ts-save.ts SEEDS) and driven through the real menus.
import { describe, expect, it, vi } from 'vitest';
import { SCENARIOS, type Scenario } from '../../tools/oracle/scenarios';
import { SEEDS } from '../../tools/oracle/ts-save';
import { registerPolishSeeds } from '../../tools/oracle/ts-specs-polish';
import { STORAGE_KEYS, bytesToBase64 } from '../../src/platform/storage';
import { testArchive } from '../helpers/data';
import { expectSessionMatches, hasOracle, missingOracleFiles, type SessionResult } from '../helpers/session';

vi.mock('../../src/screens/shop', async (orig) => (await import('../helpers/shop-registry')).shopMock(orig as never));
registerPolishSeeds();

/** TS-side assertions on the finished run (what the scenario is meant to exercise). */
const INSPECT: Record<string, (r: SessionResult) => void> = {
  // the super-arcade power-up substitution (tyrian2.c:1654-1665) must have fired (the counter starts at 1 and steps up on each substitution)
  'polish-code-stealth': (r) => { expect(r.ctx.game.config.superArcadePowerUp).toBeGreaterThan(1); },
};

const NAMES = Object.keys(SCENARIOS).filter((n) => n.startsWith('polish-'));
const only = process.env.SESSION?.split(',');
for (const name of NAMES) {
  if (only && !only.includes(name)) continue;
  const sc = (SCENARIOS as Record<string, Scenario>)[name]!;
  (testArchive && hasOracle(name) ? describe : describe.skip)(`golden: ${name}`, () => {
    it('matches HASH, STATE2, STATE3 and the saved files', () => expectSessionMatches(name, sc, {
      inspect: INSPECT[name],
      setup: sc.homeSeed ? (ctx) => { ctx.storage.set(STORAGE_KEYS.sav, bytesToBase64(SEEDS[sc.homeSeed!]!())); } : undefined,
    }), 600000);
  });
}
(testArchive && hasOracle('') ? describe : describe.skip)('golden: polish oracle files are complete', () => {
  it('every polish scenario has its HASH, STATE2, STATE3 and save dump', () => {
    const missing = NAMES.flatMap((n) => missingOracleFiles(n, (SCENARIOS as Record<string, Scenario>)[n]!).map((f) => `${n}: ${f}`));
    expect(missing).toEqual([]);
  });
});
