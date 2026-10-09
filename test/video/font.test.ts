import { describe, expect, it } from 'vitest';
import { Align, FONT_ASCII, Font, drawFontHv } from '../../src/video/font';
import { dString, fontCenter, textWidth } from '../../src/video/fonthand';
import { emptySpriteTable, type SpriteTable } from '../../src/video/sprite';
import { createSurface } from '../../src/video/surface';
import { loadMainShapeTables } from '../../src/data/shapes';
import { describeData, testArchive } from '../helpers/data';

// Font table where every glyph is a 2x1 sprite of pixel value 0x05.
function fakeTables(): SpriteTable[] {
  const t = emptySpriteTable();
  t.count = 127;
  for (let i = 0; i < 127; i++) t.sprites[i] = { width: 2, height: 1, size: 2, data: new Uint8Array([5, 5]) };
  return [t, t, t, emptySpriteTable(), emptySpriteTable(), emptySpriteTable(), emptySpriteTable(), emptySpriteTable()];
}

describe('fonts', () => {
  it('FONT_ASCII maps letters like the C table', () => {
    expect(FONT_ASCII.length).toBe(256);
    expect(FONT_ASCII['A'.charCodeAt(0)]).toBe(0);
    expect(FONT_ASCII['a'.charCodeAt(0)]).toBe(34);
    expect(FONT_ASCII['0'.charCodeAt(0)]).toBe(79);
    expect(FONT_ASCII['~'.charCodeAt(0)]).toBe(-1);
    expect(FONT_ASCII[0x80]).toBe(86);
  });
  it('textWidth: glyph width + 1, space = 6, unknown chars = 0', () => {
    const t = fakeTables();
    expect(textWidth('AB C', t, Font.Normal)).toBe(3 + 3 + 6 + 3);
    expect(textWidth('~', t, Font.Normal)).toBe(0);
    expect(fontCenter('AB', t, Font.Normal)).toBe(160 - 3);
  });
  it('drawFontHv centers and toggles +4 brightness on ~', () => {
    const t = fakeTables();
    const s = createSurface();
    drawFontHv(s, t, 100, 0, 'A~A', Font.Normal, Align.Centered, 1, 0);
    // width 6 → starts at x=97
    expect([s.pixels[97], s.pixels[100]]).toEqual([0x15, 0x19]);
  });
  it('dString draws a dark shadow at +2,+2 and hue 15 at brightness -3', () => {
    const t = fakeTables();
    const s = createSurface();
    s.pixels.fill(0x2e);
    dString(s, t, 10, 10, 'A', Font.Normal);
    expect(s.pixels[10 * 320 + 10]).toBe(0xf2);   // 0xf0 | (5 - 3)
    expect(s.pixels[12 * 320 + 12]).toBe(0x27);   // shadow: 0x20 | (0xe / 2)
  });
});

describeData('real fonts', () => {
  it('menu item widths are stable', () => {
    const tables = loadMainShapeTables(testArchive!.get('tyrian.shp')).tables;
    expect(textWidth('Start New Game', tables, Font.Normal)).toBeGreaterThan(50);
    expect(textWidth('Quit', tables, Font.Normal)).toBeLessThan(textWidth('Start New Game', tables, Font.Normal));
  });
});
