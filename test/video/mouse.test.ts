// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { mouseReplace, mouseStartFilter } from '../../src/video/mouse';
import { loadCompShapes } from '../../src/data/shapes';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('mouse cursor', () => {
  it('draws when active and restores the background exactly', () => {
    const ctx = testCtx()!;
    ctx.shopSpriteSheet = loadCompShapes(ctx.assets.archive, '1');
    ctx.vga.screen.pixels.fill(0x11);
    ctx.input.mouseInactive = false;
    ctx.input.mouseX = 100; ctx.input.mouseY = 100;
    mouseStartFilter(ctx, 0xf0);
    expect(ctx.vga.screen.pixels.some((v) => v !== 0x11)).toBe(true);
    mouseReplace(ctx);
    expect(ctx.vga.screen.pixels.every((v) => v === 0x11)).toBe(true);
  });
  it('never throws or writes outside the screen for out-of-range positions', () => {
    const ctx = testCtx()!;
    ctx.shopSpriteSheet = loadCompShapes(ctx.assets.archive, '1');
    ctx.input.mouseInactive = false;
    for (const [x, y] of [[-50, -50], [-5, 250], [400, 10], [319, 199], [0, 0]]) {
      ctx.input.mouseX = x!; ctx.input.mouseY = y!;
      expect(() => { mouseStartFilter(ctx, 0xf0); mouseReplace(ctx); }).not.toThrow();
      expect(ctx.vga.screen.pixels.length).toBe(64000);
    }
  });
});
