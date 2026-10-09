// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR, readFramesFile } from '../helpers/frames';
import { runDemoFrames } from './demo-harness';

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
