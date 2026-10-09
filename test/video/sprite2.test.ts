// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { createSurface } from '../../src/video/surface';
import {
  blitSprite2, blitSprite2Blend, blitSprite2Clip, blitSprite2Darken, blitSprite2Filter,
  blitSprite2FilterClip, blitSprite2x2, type Sprite2Sheet,
} from '../../src/video/sprite2';

// One sprite at index 1: row0 = skip 1, 2 opaque [5,6]; next row; row1 = 1 opaque [7]; end.
function sheet(): Sprite2Sheet {
  const body = [0x21, 5, 6, 0x00, 0x10, 7, 0x0f];
  return { data: new Uint8Array([2, 0, ...body]) };
}
const at = (s: { pixels: Uint8Array }, x: number, y: number) => s.pixels[y * 320 + x];

describe('blitSprite2', () => {
  it('decodes nibble runs and row advance (row start = x)', () => {
    const s = createSurface();
    blitSprite2(s, 20, 10, sheet(), 1);
    expect([at(s, 20, 10), at(s, 21, 10), at(s, 22, 10)]).toEqual([0, 5, 6]);
    // pointer at x+3 after the run; 0x00 adds 320-12 -> row y+1, column x+3-12 = 11
    expect(at(s, 11, 11)).toBe(7);
  });
  it('clip variant skips negative rows and off-screen x', () => {
    const s = createSurface();
    blitSprite2Clip(s, -1, -1, sheet(), 1); // row -1 skipped; row 0: x = -1 + 3 - 12 = -10 -> off-screen
    expect(s.pixels.reduce((a, b) => a + b, 0)).toBe(0);
    blitSprite2Clip(s, 318, 0, sheet(), 1);
    expect([at(s, 319, 0)]).toEqual([5]); // x=320 for the 6 is clipped
  });
  it('blend / darken / filter', () => {
    const s = createSurface();
    s.pixels[10 * 320 + 21] = 0x13;
    blitSprite2Blend(s, 20, 10, sheet(), 1);
    expect(at(s, 21, 10)).toBe(0x04);
    const d = createSurface();
    d.pixels[10 * 320 + 21] = 0x2e;
    blitSprite2Darken(d, 20, 10, sheet(), 1);
    expect(at(d, 21, 10)).toBe(0x27);
    const f = createSurface();
    blitSprite2Filter(f, 20, 10, sheet(), 1, 0xf0);
    expect(at(f, 21, 10)).toBe(0xf5);
    const fc = createSurface();
    blitSprite2FilterClip(fc, 20, 10, sheet(), 1, 0xf0);
    expect(at(fc, 22, 10)).toBe(0xf6);
  });
  it('x2 draws four sub-sprites with index offsets 0, 1, 19, 20', () => {
    const offsets = new Array(21).fill(0);
    const bodies: number[] = [];
    const base = 21 * 2;
    for (const [idx, color] of [[1, 1], [2, 2], [20, 3], [21, 4]] as const) {
      offsets[idx - 1] = base + bodies.length;
      bodies.push(0x10, color, 0x0f);
    }
    const data = new Uint8Array(base + bodies.length);
    offsets.forEach((o, i) => { data[i * 2] = o & 0xff; data[i * 2 + 1] = o >> 8; });
    data.set(bodies, base);
    const s = createSurface();
    blitSprite2x2(s, 0, 0, { data }, 1);
    expect([at(s, 0, 0), at(s, 12, 0), at(s, 0, 14), at(s, 12, 14)]).toEqual([1, 2, 3, 4]);
  });
});
