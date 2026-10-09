import { describe, expect, it } from 'vitest';
import { BinaryReader } from '../../src/core/binary-reader';
import { createSurface } from '../../src/video/surface';
import {
  PLANET_SHAPES, blitSprite, blitSpriteBlend, blitSpriteDark, blitSpriteHv, blitSpriteHvBlend,
  blitSpriteHvUnsafe, emptySpriteTable, loadSpriteTable, spriteWidth, type SpriteTable,
} from '../../src/video/sprite';
import { describeData, testArchive } from '../helpers/data';

function table(width: number, height: number, data: number[]): SpriteTable {
  const t = emptySpriteTable();
  t.count = 1;
  t.sprites[0] = { width, height, size: data.length, data: new Uint8Array(data) };
  return t;
}
const at = (s: { pixels: Uint8Array }, x: number, y: number) => s.pixels[y * 320 + x];

describe('blitSpriteHv value wrap', () => {
  it('treats value 250 like -6 (Sint8 parameter)', () => {
    const t = table(2, 1, [0x0a, 0x03]);
    const a = createSurface(), b = createSurface();
    blitSpriteHv(a, 0, 0, t, 0, 3, 250);
    blitSpriteHv(b, 0, 0, t, 0, 3, -6);
    expect([a.pixels[0], a.pixels[1]]).toEqual([b.pixels[0], b.pixels[1]]);
    expect([b.pixels[0], b.pixels[1]]).toEqual([0x34, 0x30]);
    const c = createSurface(), d = createSurface();
    blitSpriteHvUnsafe(c, 0, 0, t, 0, 3, 250);
    blitSpriteHvUnsafe(d, 0, 0, t, 0, 3, -6);
    expect([c.pixels[0], c.pixels[1]]).toEqual([d.pixels[0], d.pixels[1]]);
  });
});

describe('blitSprite', () => {
  it('handles literals, 253, 255 n and 254 row ends', () => {
    // 3 wide: row0 = [1, skip, 2]; row1 = [skip 2 via 255 2, 3]; row2 = [4, end-of-row]
    const t = table(3, 3, [1, 253, 2, 255, 2, 3, 4, 254]);
    const s = createSurface();
    s.pixels.fill(0xee);
    blitSprite(s, 10, 10, t, 0);
    expect([at(s, 10, 10), at(s, 11, 10), at(s, 12, 10)]).toEqual([1, 0xee, 2]);
    expect([at(s, 10, 11), at(s, 11, 11), at(s, 12, 11)]).toEqual([0xee, 0xee, 3]);
    expect([at(s, 10, 12), at(s, 11, 12), at(s, 12, 12)]).toEqual([4, 0xee, 0xee]);
  });
  it('wraps onto the next row instead of clipping at the right edge', () => {
    const t = table(3, 1, [7, 7, 7]);
    const s = createSurface();
    blitSprite(s, 318, 5, t, 0);
    expect([at(s, 318, 5), at(s, 319, 5), at(s, 0, 6)]).toEqual([7, 7, 7]);
  });
  it('stops at the bottom of the surface and skips writes above the top', () => {
    const t = table(1, 3, [5, 5, 5]);
    const s = createSurface();
    blitSprite(s, 0, 198, t, 0);
    expect([at(s, 0, 198), at(s, 0, 199)]).toEqual([5, 5]);
    const s2 = createSurface();
    blitSprite(s2, 0, -2, t, 0);
    expect(at(s2, 0, 0)).toBe(5);
    expect(s2.pixels.reduce((a, b) => a + b, 0)).toBe(5);
  });
  it('ignores missing sprites', () => {
    const s = createSurface();
    expect(() => blitSprite(s, 0, 0, emptySpriteTable(), 3)).not.toThrow();
  });
});

describe('blit variants', () => {
  const t = table(1, 1, [0x47]);
  it('blend averages low nibbles, keeps src hue', () => {
    const s = createSurface(); s.pixels[0] = 0x2b;
    blitSpriteBlend(s, 0, 0, t, 0);
    expect(s.pixels[0]).toBe(0x49); // 0x40 | ((0xb + 0x7) / 2)
  });
  it('hv_unsafe ORs hue with (value nibble + value), overflow leaks into hue', () => {
    const s = createSurface();
    blitSpriteHvUnsafe(s, 0, 0, t, 0, 3, 10); // 0x30 | (7 + 10 = 17 = 0x11) = 0x31
    expect(s.pixels[0]).toBe(0x31);
  });
  it('hv clamps: >0xf saturates to 0xf, >=0x1f (incl. negative wrap) to 0', () => {
    const s = createSurface();
    blitSpriteHv(s, 0, 0, t, 0, 3, 10);
    expect(s.pixels[0]).toBe(0x3f);
    blitSpriteHv(s, 0, 0, t, 0, 3, -10); // 7-10 = -3 -> u8 253 -> 0
    expect(s.pixels[0]).toBe(0x30);
    blitSpriteHv(s, 0, 0, t, 0, 3, -3);
    expect(s.pixels[0]).toBe(0x34);
  });
  it('hv_blend averages with destination low nibble', () => {
    const s = createSurface(); s.pixels[0] = 0x0a;
    blitSpriteHvBlend(s, 0, 0, t, 0, 2, 1); // t = 8; (0xa + 8) / 2 = 9
    expect(s.pixels[0]).toBe(0x29);
  });
  it('dark halves the destination or paints black', () => {
    const s = createSurface(); s.pixels[0] = 0x5e;
    blitSpriteDark(s, 0, 0, t, 0, false);
    expect(s.pixels[0]).toBe(0x57);
    blitSpriteDark(s, 0, 0, t, 0, true);
    expect(s.pixels[0]).toBe(0);
  });
});

describeData('real tyrian.shp sprite tables', () => {
  it('table 3 (planet shapes) has 152 sprites; logo 146 is 304x121', () => {
    const bytes = testArchive!.get('tyrian.shp');
    const r = new BinaryReader(bytes);
    r.seek(new DataView(bytes.buffer, bytes.byteOffset).getInt32(2 + 3 * 4, true));
    const t = loadSpriteTable(r);
    expect(t.count).toBe(152);
    expect(spriteWidth(t, 146)).toBe(304);
    expect(t.sprites[146]!.height).toBe(121);
    expect(PLANET_SHAPES).toBe(3);
  });
});
