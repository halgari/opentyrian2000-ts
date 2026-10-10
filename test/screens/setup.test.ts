// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { parseOpentyrianConfig, saveConfiguration } from '../../src/game/save';
import { createGameWorld } from '../../src/game/world';
import { STORAGE_KEYS } from '../../src/platform/storage';
import type { ScalingMode } from '../../src/platform/scaling';
import { setupMenu } from '../../src/screens/setup';
import { SC } from '../../tools/oracle/scenarios-shopc';
import { describeData } from '../helpers/data';
import { drive, menuCtx } from '../helpers/drive';

const D = SC.Down, R = SC.Return, E = SC.Escape, RIGHT = SC.Right, LEFT = SC.Left;

describeData('setup: Graphics page and Jukebox', () => {
  it('Fullscreen calls the toggle hook once; Esc leaves the page and Setup', async () => {
    const ctx = menuCtx();
    let toggles = 0;
    ctx.display.toggleFullscreen = () => { toggles++; };
    await drive(ctx, setupMenu, (t) => t.tap(R, R, E, E));
    expect(toggles).toBe(1);
  });

  it('Scaling Mode cycles in order, reports each change, and is saved in opentyrian.cfg', async () => {
    const ctx = menuCtx();
    const seen: ScalingMode[] = [];
    ctx.display.onScalingChange = (m) => seen.push(m);
    await drive(ctx, setupMenu, (t) => t.tap(R, D, RIGHT, RIGHT, E, E));
    expect(seen).toEqual(['fit-8-5', 'integer']);
    expect(ctx.display.scalingMode).toBe('integer');
    expect(ctx.game.config.scalingMode).toBe('integer');

    saveConfiguration(ctx);
    const back = createGameWorld().config;
    parseOpentyrianConfig(back, ctx.storage.get(STORAGE_KEYS.opentyrianCfg));
    expect(back.scalingMode).toBe('integer');
  });

  it('Left cycles backwards and Return cycles forwards, wrapping', async () => {
    const ctx = menuCtx();
    await drive(ctx, setupMenu, (t) => t.tap(R, D, LEFT, E, E));
    expect(ctx.display.scalingMode).toBe('integer');
    const c2 = menuCtx();
    await drive(c2, setupMenu, (t) => t.tap(R, D, R, E, E));
    expect(c2.display.scalingMode).toBe('fit-8-5');
  });

  it('an unknown stored scaling mode falls back to fit-4-3', () => {
    const c = createGameWorld().config;
    parseOpentyrianConfig(c, JSON.stringify({ version: 1, scalingMode: 'stretch' }));
    expect(c.scalingMode).toBe('fit-4-3');
  });

  it('Jukebox opens from Setup and Esc returns to it', async () => {
    const ctx = menuCtx();
    await drive(ctx, setupMenu, (t) => t.tap(D, D, R).wait(40).tap(E).wait(60).tap(E), 120);
    expect(ctx.starlib).not.toBeNull();
  });
});
