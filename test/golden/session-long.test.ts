// SPDX-License-Identifier: GPL-2.0-or-later
// Long golden: episode 1, levels 1-4 played with real held input (fire, arrows, sidekick keys), four shops with purchases in between
// (front weapon, shield, generator, left sidekick), data cube reading, end-level tallies and the backup saves. HASH and STATE2 on
// every frame and the saved files byte for byte (authored with tools/oracle/ts-scenario.ts session-long-ep1).
import { describe, expect, it, vi } from 'vitest';
import { SCENARIOS, type Scenario } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import { expectSessionMatches, hasOracle } from '../helpers/session';

vi.mock('../../src/screens/shop', async (orig) => (await import('../helpers/shop-registry')).shopMock(orig as never));

const NAME = 'session-long-ep1';
(testArchive && hasOracle(NAME) ? describe : describe.skip)('golden: long session (episode 1, levels 1-4)', () => {
  it('matches HASH, STATE2 and sav BYTES, and the purchases landed', async () => {
    await expectSessionMatches(NAME, SCENARIOS[NAME as keyof typeof SCENARIOS] as Scenario, {
      inspect: ({ ctx }) => {
        const p = ctx.game.players[0], it = p.items;
        expect(it.weapon[0].id).toBe(7);   // front weapon bought in shop 1
        expect(it.shield).toBe(5);         // shield, shop 2
        expect(it.generator).toBe(3);      // generator, shop 3
        expect(it.sidekick[0]).toBe(6);    // left sidekick, shop 4
        expect(p.cash).toBeLessThan(10000);
      },
    });
  }, 120000);
});
