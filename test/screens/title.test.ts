// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { runGame } from '../../src/game';
import { titleScreen } from '../../src/screens/title';
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
});
