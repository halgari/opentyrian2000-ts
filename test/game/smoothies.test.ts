// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { MersenneTwister } from '../../src/core/mtrand';
import { randomExplosionsFrame, starShowVGA } from '../../src/game/level';
import { blurFilter, icedBlurFilter, lavaFilter, waterFilter } from '../../src/game/smoothies';
import { createSurface } from '../../src/video/surface';
import { testCtx } from '../helpers/ctx';
import { describeData } from '../helpers/data';

const filled = (v: number) => { const s = createSurface(); s.pixels.fill(v); return s; };
const at = (s: ReturnType<typeof createSurface>, x: number, y: number) => s.pixels[y * 320 + x]!;

describe('smoothie filters on synthetic buffers', () => {
  it('iced blur: (src&15 + dst&15)/2 with hue 0x80, 184 rows only', () => {
    const dst = filled(0x2b), src = filled(0x75); // nibbles 11 + 5 = 16 -> 8
    icedBlurFilter(dst, src);
    expect(at(dst, 0, 0)).toBe(0x88);
    expect(at(dst, 319, 183)).toBe(0x88);
    expect(at(dst, 0, 184)).toBe(0x2b);
  });
  it('blur: same average, keeps the source hue', () => {
    const dst = filled(0x2b), src = filled(0x75);
    blurFilter(dst, src);
    expect(at(dst, 10, 10)).toBe(0x78);
    expect(at(dst, 10, 184)).toBe(0x2b);
  });
  it('water: non-blue source is copied, blue is averaged with the destination below, hue from smoothie_data', () => {
    const src = createSurface();
    src.pixels.fill(0x05); // (0x05 & 0x30) == 0: copied
    src.pixels[10 * 320 + 10] = 0x39; // blue bits set
    const dst = filled(0x07);
    waterFilter(dst, src, 3);
    expect(at(dst, 50, 50)).toBe(0x05);
    expect(at(dst, 10, 10)).toBe(((9 + 5) >> 1) | 0x30); // the row below (11) was rewritten first (bottom-up) with the copied 0x05
  });
  it('lava: history dependent, processes rows bottom-up and reads the row below it just wrote', () => {
    const src = filled(0x04), dst = filled(0x08);
    lavaFilter(dst, src);
    // uniform buffers: waver does not matter. Row 184 reads row 185 (untouched, nibble 8) and row 183 (nibble 8).
    let below = Math.floor((4 * 2 + 8 + 8) / 4); // 6
    expect(at(dst, 100, 184)).toBe(below | 0x70);
    for (let y = 183; y >= 1; y--) {
      below = Math.floor((4 * 2 + below + 8) / 4); // row above (y-1) is still last frame's nibble 8
      expect(at(dst, 100, y)).toBe(below | 0x70);
    }
    // top row: the "row above" read is skipped
    below = Math.floor((4 * 2 + below) / 4);
    expect(at(dst, 100, 0)).toBe(below | 0x70);
    expect(at(dst, 100, 185)).toBe(0x08);
    // a second pass starts from the first pass's picture (history)
    const row183 = at(dst, 100, 183) & 15; // row above 184, still the previous frame's picture
    lavaFilter(dst, src);
    expect(at(dst, 100, 184)).toBe(Math.floor((8 + 8 + row183) / 4) | 0x70);
  });
});

describeData('starShowVGA special codes', () => {
  it('code 1 flips the 264x184 window vertically', async () => {
    const ctx = testCtx()!;
    const gs = ctx.vga.gameScreen;
    for (let y = 0; y < 200; y++) gs.pixels.fill(y, y * 320, y * 320 + 320);
    ctx.game.config.smoothScroll = false;
    ctx.game.config.starShowVGASpecialCode = 1;
    await starShowVGA(ctx);
    expect(ctx.vga.screen.pixels[0 * 320 + 5]).toBe(183);
    expect(ctx.vga.screen.pixels[183 * 320 + 5]).toBe(0);
    expect(ctx.vga.screen.pixels[100 * 320 + 263]).toBe(83);
  });
  it('code 2 darkens everything outside the lit cone around the ship', async () => {
    const ctx = testCtx()!;
    ctx.vga.gameScreen.pixels.fill(0x54);
    ctx.game.config.smoothScroll = false;
    ctx.game.config.starShowVGASpecialCode = 2;
    ctx.game.config.processorType = 3;
    ctx.game.players[0].x = 100;
    ctx.game.players[0].y = 100; // lighty 72, lightx 181
    await starShowVGA(ctx);
    const px = ctx.vga.screen.pixels;
    expect(px[134 * 320 + 100]).toBe(0x51); // screen row 134 = y 50 < lighty: dark, (0x4 >> 2) = 1
    expect(px[0 * 320 + 194]).toBe(0x54); // y=184, x=70: dist 183 < 184 -> unchanged
    expect(px[0 * 320 + 197]).toBe(0x53); // x=67: dist 186, dist - y = 2 -> (4 + 3*3)/4 = 3
    expect(px[0 * 320 + 250]).toBe(0x51); // x=14: far -> dark
  });
});

describeData('random explosions (tyrian2.c:2049)', () => {
  it('one draw per frame while enabled; when it hits (== 1) y is drawn before x', () => {
    let seed = 1;
    const probe = (s: number) => { const r = new MersenneTwister(); r.srand(s); return [r.rand(), r.rand(), r.rand()]; };
    while (probe(seed)[0]! % 10 !== 1) seed++;
    const [, y, x] = probe(seed).map((v) => v);
    const ctx = testCtx()!;
    ctx.rng.srand(seed);
    ctx.game.varz.randomExplosions = true;
    randomExplosionsFrame(ctx);
    const rep = ctx.game.explosions.repExplosions[0]!;
    expect(rep.ttl).toBe(10);
    expect(rep.y).toBe(y! % 180);
    expect(rep.x).toBe(x! % 280);
  });
  it('misses consume exactly one draw, disabled consumes none', () => {
    let seed = 1;
    const probe = (s: number) => { const r = new MersenneTwister(); r.srand(s); return [r.rand(), r.rand()]; };
    while (probe(seed)[0]! % 10 === 1) seed++;
    const ctx = testCtx()!;
    ctx.rng.srand(seed);
    randomExplosionsFrame(ctx); // disabled
    ctx.game.varz.randomExplosions = true;
    randomExplosionsFrame(ctx);
    expect(ctx.game.explosions.repExplosions[0]!.ttl).toBe(0);
    expect(ctx.rng.rand()).toBe(probe(seed)[1]);
  });
});
