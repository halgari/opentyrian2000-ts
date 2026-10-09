// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { fadeBlack, fadePalette, fadeWhite } from '../../src/video/fade';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('fades', () => {
  it('present once per step and take ~1 delay unit per step', async () => {
    const ctx = testCtx()!;
    const frames: number[] = [];
    ctx.frameSink = (_s, pal) => frames.push(pal[0]!);
    const t0 = ctx.clock.now();
    await fadeWhite(ctx, 25);
    expect(frames).toHaveLength(25);
    expect(frames[24]).toBe(255);
    expect(ctx.clock.now() - t0).toBeGreaterThanOrEqual(25 * 14);
    await fadeBlack(ctx, 10);
    expect(frames).toHaveLength(35);
    expect(frames[34]).toBe(0);
  });
  it('fadePalette only touches [first,last]', async () => {
    const ctx = testCtx()!;
    const target = new Uint8Array(768).fill(200);
    await fadePalette(ctx, target, 5, 0, 239);
    expect(ctx.palette.current[239 * 3]).toBe(200);
    expect(ctx.palette.current[240 * 3]).toBe(0);
  });
});
