// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { describeData } from './helpers/data';
import { testCtx } from './helpers/ctx';

describeData('createCtx', () => {
  it('wires assets and blank screens; palette starts black', () => {
    const ctx = testCtx()!;
    expect(ctx.assets.palettes).toHaveLength(24);
    expect(ctx.vga.screen.pixels.length).toBe(64000);
    expect(ctx.palette.current.every((v) => v === 0)).toBe(true);
    expect(ctx.state.versionString).toBe('oracle');
    expect(ctx.rng.rand()).toBe(1791095845); // seeded with 1
  });
});
