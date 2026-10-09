// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR, readFramesFile } from '../helpers/frames';
import { readStates } from '../helpers/state-trace';
import { runDemoFrames, runDemoScenario } from './demo-harness';

/**
 * Player position (p0x, p0y) against the oracle. Divergence is expected once enemy shots / enemy collisions
 * (JE_playerCollide knockback, task 12/13; the shield drops or the ship is shoved a few frames before) start pushing the ship, so each demo is asserted only up to a frame
 * safely before its first measured divergence (measured with enemies and enemy shots ported: demo-1 1387, demo-2 496, demo-3 1103, demo-4 1246, demo-5 593).
 */
const LIMITS = { 'demo-1': 1380, 'demo-2': 490, 'demo-3': 1100, 'demo-4': 1240, 'demo-5': 590 } as const;

for (const [name, limit] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
  const states = readStates(resolve(ORACLE_DIR, `${name}.state`));
  const d = testArchive && states ? describe : describe.skip;
  d(`golden: player movement ${name}`, () => {
    it(`p0x/p0y equal the oracle through frame ${limit}`, async () => {
      const actual = await runDemoScenario(name, limit + 1);
      for (let f = 0; f <= limit; f++) {
        expect([f, actual.states[f]!.p0x, actual.states[f]!.p0y]).toEqual([f, states![f]!.p0x, states![f]!.p0y]);
      }
    });
  });
}

// Ship, shadow, banking and sidekick pixels: the raw oracle dumps of the first loop frames (the rest of the
// play window is also equal there, so the whole 264x184 window is compared).
const raw = readFramesFile(resolve(ORACLE_DIR, 'demo-4.raw.frames'));
(testArchive && raw ? describe : describe.skip)('golden: ship pixels demo-4', () => {
  it('play window of the raw frames equals the oracle', async () => {
    const last = Math.max(...raw!.map((f) => f.index));
    const frames = new Map(raw!.map((f) => [f.index, f]));
    
    const shots = await runDemoFrames('demo-4', last + 1, new Set(frames.keys()));
    for (const [idx, pixels] of shots) {
      const want = frames.get(idx)!.pixels;
      let diff = 0;
      for (let y = 0; y < 184; y++) for (let x = 0; x < 264; x++) if (pixels[y * 320 + x] !== want[y * 320 + x]) diff++;
      expect(diff, `frame ${idx}`).toBe(0);
    }
  });
});
