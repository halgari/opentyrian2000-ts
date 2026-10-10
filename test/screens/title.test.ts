// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { runGame } from '../../src/game';
import { titleScreen } from '../../src/screens/title';
import { SC } from '../../tools/oracle/scenarios-shopc';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { scanForEpisodes } from '../../src/game/episodes';
import { STORAGE_KEYS } from '../../src/platform/storage';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('titleScreen', () => {
  it('Escape quits after the menu appears', async () => {
    const ctx = testCtx()!;
    let frames = 0;
    ctx.frameSink = () => {
      frames++;
      // Frame 31 is the idle menu (10 logo-fade + 20 menu-fade + 1). A key pressed during a
      // fade would be consumed by the fade's event servicing, exactly like the C.
      if (frames === 31) ctx.input.push({ type: 'keydown', scancode: 41, mod: 0 });
    };
    expect(await titleScreen(ctx)).toBe(false);
    expect(frames).toBe(10 + 20 + 1 + 15); // logo fade + menu fade + idle frame + fade_black(15)
  });
  it('idling 30 s requests the demo', async () => {
    const ctx = testCtx()!;
    expect(await titleScreen(ctx)).toBe(true);
    expect(ctx.state.playDemo).toBe(true);
  });
  it('intro + title produce the C frame sequence (82 intro frames, then 10 + 29 + 20 + 1)', async () => {
    const ctx = testCtx()!;
    let frames = 0;
    const stop = new Error('stop');
    ctx.frameSink = () => {
      if (++frames === 142) throw stop;
    };
    await expect(runGame(ctx)).rejects.toBe(stop);
    expect(frames).toBe(142);
    expect(ctx.state.moveTyrianLogoUp).toBe(false);
  });
  it('the idle demo stub dismisses itself and returns to the title without input', async () => {
    const ctx = testCtx()!;
    let frames = 0, demoFrames = 0, sawDemo = false;
    const stop = new Error('stop');
    ctx.frameSink = () => {
      frames++;
      if (ctx.state.playDemo) { sawDemo = true; demoFrames++; }
      else if (sawDemo) throw stop; // loop restarted: back at the title
      if (frames > 100000) throw new Error('never returned to the title');
    };
    await expect(runGame(ctx)).rejects.toBe(stop);
    expect(demoFrames).toBeGreaterThan(0);
  });
  it('saves the configuration after Setup (Scaling Mode reaches opentyrian.cfg)', async () => {
    const ctx = testCtx()!;
    ctx.vga.cur = ctx.vga.screen;
    loadConfigurationDefaults(ctx);
    initPlayerData(ctx);
    scanForEpisodes(ctx);
    // The title waits 30 s of virtual time before it returns for the demo, so the oracle's idle injector would be too late;
    // type each key once the screen has been idle (no frame, a few sleeps) instead.
    const keys: number[] = [SC.Down, SC.Down, SC.Down, SC.Down, SC.Return, // Setup is the fifth row
      SC.Return, SC.Down, SC.Right, SC.Escape, SC.Escape, // Graphics, Scaling Mode, Right, back out of both
      SC.Escape]; // quit the title
    let idle = 0;
    const sleep = ctx.clock.sleep.bind(ctx.clock);
    ctx.clock.sleep = (ms: number) => {
      if (++idle >= 5 && keys.length > 0) {
        idle = 0;
        const sc = keys.shift()!;
        ctx.input.push({ type: 'keydown', scancode: sc, mod: 0 });
        ctx.input.push({ type: 'keyup', scancode: sc });
      }
      return sleep(ms);
    };
    ctx.frameSink = () => { idle = 0; };
    expect(await titleScreen(ctx)).toBe(false);
    expect(keys).toHaveLength(0);
    expect(JSON.parse(ctx.storage.get(STORAGE_KEYS.opentyrianCfg)!).scalingMode).toBe('fit-8-5');
  });
});
