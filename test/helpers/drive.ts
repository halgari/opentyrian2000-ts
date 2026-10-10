// SPDX-License-Identifier: GPL-2.0-or-later
// Shared drivers for the menu-screen tests: a menu-ready context and a runner that feeds a Timeline of input to one screen.
import type { Ctx } from '../../src/ctx';
import { scanForEpisodes } from '../../src/game/episodes';
import { loadConfigurationDefaults, initPlayerData } from '../../src/game/config';
import { Timeline } from '../../tools/oracle/scenarios-shopc';
import { Stop, injectOracleInput } from './inject';
import { testCtx } from './ctx';

export function menuCtx(): Ctx {
  const ctx = testCtx()!;
  ctx.vga.cur = ctx.vga.screen;
  loadConfigurationDefaults(ctx);
  initPlayerData(ctx);
  scanForEpisodes(ctx);
  return ctx;
}

/** Runs `screen` while the timeline's input arrives (frame 1 on); fails (Stop) if the screen is still waiting at the end. */
export async function drive<T>(ctx: Ctx, screen: (c: Ctx) => Promise<T>, build: (t: Timeline) => void, tail = 60): Promise<T> {
  const t = new Timeline(12); // the fade-in (10 frames) eats input
  build(t);
  const last = t.f + tail;
  injectOracleInput(ctx, { keys: t.keys, text: t.text, mouse: t.mouse }, 0, () => 0, (i) => { idle = 0; if (i >= last) throw new Stop(); });
  // a screen that is still waiting once every input has been delivered (the injector fires one entry per 2000 idle polls)
  const budget = 2000 * (t.keys.length + t.text.length + t.mouse.length + 1) + 500;
  let idle = 0;
  const sleep = ctx.clock.sleep.bind(ctx.clock);
  ctx.clock.sleep = (ms: number) => { if (++idle > budget) throw new Stop(); return sleep(ms); };
  return screen(ctx);
}
