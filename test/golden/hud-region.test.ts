// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadAssets } from '../../src/assets';
import { createCtx } from '../../src/ctx';
import { runGame } from '../../src/game';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import { SCENARIOS } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR, readFramesFile } from '../helpers/frames';

/**
 * HUD region (x >= 264 or y >= 184 of the visible 320x200 screen) of demo-1's first level-loop frames against the
 * oracle raw frames (`pnpm oracle:run demo-1 --raw 213-215 --fixture`).
 *
 * Excluded:
 *  - armor bar (x 307..315, y >= 137): p0armor is set by getShipInfo; the oracle has 10 there.
 * The shield bar is included: p0shield equals the oracle.
 * Cash (x 30, y 175) and the lives/bomb sprites are outside the region (drawn on the game window).
 */
const FIRST_LOOP_FRAME = 213;
const raw = readFramesFile(resolve(ORACLE_DIR, 'demo-1.raw.frames'));
const d = testArchive && raw ? describe : describe.skip;

d('golden: demo-1 HUD region', () => {
  it('matches the oracle on the first loop frames', async () => {
    const scenario = SCENARIOS['demo-1'];
    const ctx = createCtx({
      assets: loadAssets(testArchive!), clock: new VirtualClock(), presenter: new NullPresenter(),
      versionString: 'oracle', seed: 1,
    });
    const last = Math.max(...raw!.map((f) => f.index));
    const got = new Map<number, Uint8Array>();
    let n = 0;
    class Stop extends Error {}
    ctx.frameSink = (screen) => {
      const index = n++;
      if (index >= FIRST_LOOP_FRAME) got.set(index, screen.pixels.slice());
      for (const k of scenario.keys) {
        if (k.frame === index) {
          ctx.input.push({ type: 'keydown', scancode: k.scancode, mod: 0 });
          ctx.input.push({ type: 'keyup', scancode: k.scancode });
        }
      }
      if (index >= last) throw new Stop();
    };
    try { await runGame(ctx); } catch (e) { if (!(e instanceof Stop)) throw e; }

    for (const f of raw!) {
      const actual = got.get(f.index)!;
      const bad: string[] = [];
      for (let y = 0; y < 200; y++) {
        for (let x = 0; x < 320; x++) {
          if (!(x >= 264 || y >= 184)) continue;
          if (x >= 307 && x <= 315 && y >= 137) continue; // armor bar: set by getShipInfo
          if (actual[y * 320 + x] !== f.pixels[y * 320 + x]) bad.push(`(${x},${y}) got ${actual[y * 320 + x]} want ${f.pixels[y * 320 + x]}`);
        }
      }
      expect(bad.slice(0, 8), `frame ${f.index}: ${bad.length} HUD pixels differ`).toEqual([]);
    }
  });
});
