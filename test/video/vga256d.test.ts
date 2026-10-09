import { describe, expect, it } from 'vitest';
import { createSurface } from '../../src/video/surface';
import { barBright, barShade, drawSegmentedGauge, pix, rectangle } from '../../src/video/vga256d';

describe('vga256d', () => {
  it('pix ignores out-of-range x/y like the C (x < pitch && y < h)', () => {
    const s = createSurface();
    pix(s, 319, 199, 1);
    pix(s, 320, 0, 2);
    expect(s.pixels[63999]).toBe(1);
    expect(s.pixels[320]).toBe(0);
  });
  it('rectangle draws the outline only', () => {
    const s = createSurface();
    rectangle(s, 1, 1, 4, 3, 9);
    const at = (x: number, y: number) => s.pixels[y * 320 + x];
    expect([at(1, 1), at(4, 1), at(1, 3), at(4, 3), at(1, 2), at(4, 2)]).toEqual([9, 9, 9, 9, 9, 9]);
    expect(at(2, 2)).toBe(0);
  });
  it('barShade halves the low nibble, barBright adds 2 capped at 15', () => {
    const s = createSurface();
    s.pixels[0] = 0x3f; s.pixels[1] = 0x2e;
    barShade(s, 0, 0, 0, 0);
    expect(s.pixels[0]).toBe(0x37);
    barBright(s, 1, 0, 1, 0);
    expect(s.pixels[1]).toBe(0x2f);
  });
  it('segmented gauge', () => {
    const s = createSurface();
    drawSegmentedGauge(s, 0, 0, 0x10, 2, 1, 10, 25); // 2 full segments + half
    expect(Array.from(s.pixels.subarray(0, 9))).toEqual([0x1c, 0x1c, 0, 0x1c, 0x1c, 0, 0x16, 0x16, 0]);
  });
});
