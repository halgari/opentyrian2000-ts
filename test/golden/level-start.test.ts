// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR } from '../helpers/frames';
import { readHashes } from '../helpers/hash-frames';
import { firstStateDiff, readStates } from '../helpers/state-trace';
import { runDemoScenario } from './demo-harness';

/**
 * Frames 0..212 of demo-1: boot, menu navigation to Demo, fade_black(15), the level-start frame (162) and the
 * 50-frame fade-in. Frame 213 is the first level_loop frame; it is
 * covered by the region goldens (hud-region, backgrounds).
 */
const FIRST_LEVEL_FRAME = 162;
const LAST_FADE_FRAME = FIRST_LEVEL_FRAME + 50;

const hashes = readHashes(resolve(ORACLE_DIR, 'demo-1.hash'));
const states = readStates(resolve(ORACLE_DIR, 'demo-1.state'));
const d = testArchive && hashes && states ? describe : describe.skip;

d('golden: demo-1 level start', () => {
  it('frames 0..212 hash-equal and state-equal to the C original', async () => {
    const actual = await runDemoScenario('demo-1', LAST_FADE_FRAME + 2); // + first loop frame (not compared)
    expect(actual.hashes.length).toBe(LAST_FADE_FRAME + 2);
    for (let f = 0; f <= LAST_FADE_FRAME; f++) {
      expect(actual.hashes[f], `frame ${f}: first hash mismatch (use pnpm oracle:run demo-1 --raw ${f})`).toBe(hashes![f]);
      const diff = firstStateDiff(states![f]!, actual.states[f]!);
      expect(diff, `frame ${f}: state field ${diff} expected ${diff && states![f]![diff]} got ${diff && actual.states[f]![diff]}`).toBeNull();
    }
  });

  it('starts the level on the oracle frame and draws 400 starfield values', async () => {
    const actual = await runDemoScenario('demo-1', LAST_FADE_FRAME + 2);
    // mtCalls: 174 config burn + 1 initPlayerData (frame 0..212), then initialize_starfield = 4 draws x 100 stars
    expect(states![LAST_FADE_FRAME]!.mtCalls).toBe(175);
    expect(actual.states[FIRST_LEVEL_FRAME]!.mtCalls).toBe(175);
    expect(states![LAST_FADE_FRAME + 1]!.mtCalls).toBe(575);
    expect(actual.states[LAST_FADE_FRAME + 1]!.mtCalls).toBe(575);
  });
});
