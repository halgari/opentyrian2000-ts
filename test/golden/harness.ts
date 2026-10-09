// SPDX-License-Identifier: GPL-2.0-or-later
import { loadAssets } from '../../src/assets';
import { createCtx } from '../../src/ctx';
import { runGame } from '../../src/game';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import type { Scenario } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import type { Frame } from '../helpers/frames';

class StopScenario extends Error {}

export async function runScenario(scenario: Scenario): Promise<Frame[]> {
  const ctx = createCtx({
    assets: loadAssets(testArchive!), clock: new VirtualClock(), presenter: new NullPresenter(),
    versionString: 'oracle', seed: 1,
  });
  const frames: Frame[] = [];
  ctx.frameSink = (screen, palette) => {
    const index = frames.length;
    frames.push({ index, palette: palette.slice(), pixels: screen.pixels.slice() });
    for (const k of scenario.keys) {
      if (k.frame === index) {
        ctx.input.push({ type: 'keydown', scancode: k.scancode, mod: 0 });
        ctx.input.push({ type: 'keyup', scancode: k.scancode });
      }
    }
    if (frames.length >= scenario.maxFrames) throw new StopScenario();
  };
  try {
    await runGame(ctx);
  } catch (e) {
    if (!(e instanceof StopScenario)) throw e;
  }
  return frames;
}
