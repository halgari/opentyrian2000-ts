// SPDX-License-Identifier: GPL-2.0-or-later
import { loadAssets } from '../../src/assets';
import { createCtx, type Ctx } from '../../src/ctx';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import { testArchive } from './data';

export function testCtx(): Ctx | null {
  if (!testArchive) return null;
  const ctx = createCtx({
    assets: loadAssets(testArchive), clock: new VirtualClock(), presenter: new NullPresenter(),
    versionString: 'oracle', seed: 1,
  });
  ctx.vga.cur = ctx.vga.gameScreen; // the gameplay unit tests draw as the level loop does (VGAScreen = game_screen)
  return ctx;
}
