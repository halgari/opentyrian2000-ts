import { describe, expect, it } from 'vitest';
import { loadPCX } from '../../src/data/pcx';
import { createSurface } from '../../src/video/surface';
import { testArchive } from '../helpers/data';

function encode(pixels: Uint8Array, palette: Uint8Array | null): Uint8Array {
  const out: number[] = new Array<number>(128).fill(0);
  for (let i = 0; i < pixels.length; ) {
    let run = 1;
    while (i + run < pixels.length && pixels[i + run] === pixels[i] && run < 63 && (i + run) % 320 !== 0) run++;
    if (run > 1 || pixels[i]! >= 0xc0) out.push(0xc0 | run, pixels[i]!);
    else out.push(pixels[i]!);
    i += run;
  }
  if (palette) out.push(12, ...palette);
  else out.push(0, ...new Array<number>(768).fill(0));
  return Uint8Array.from(out);
}

describe('loadPCX (pcxload.c)', () => {
  it('decodes RLE runs and literals, including literal bytes >= 0xC0, and the trailing palette', () => {
    const px = new Uint8Array(64000);
    for (let i = 0; i < px.length; i++) px[i] = i % 320 < 100 ? 7 : (i * 31) & 0xff;
    px[5000] = 0xc5;
    const pal = Uint8Array.from({ length: 768 }, (_, i) => i & 0xff);
    const s = createSurface();
    const colors = new Uint8Array(768);
    loadPCX(encode(px, pal), s, colors);
    expect(Array.from(s.pixels)).toEqual(Array.from(px));
    expect(Array.from(colors)).toEqual(Array.from(pal));
  });
  it('leaves colors untouched when the palette marker is not 12', () => {
    const colors = new Uint8Array(768).fill(9);
    loadPCX(encode(new Uint8Array(64000).fill(3), null), createSurface(), colors);
    expect(colors.every((v) => v === 9)).toBe(true);
  });
  it('throws on truncated data', () => {
    expect(() => loadPCX(new Uint8Array(1000), createSurface(), new Uint8Array(768))).toThrow();
  });
  it.skipIf(!testArchive)('decodes the shipped tshp2.pcx', () => {
    const s = createSurface();
    const colors = new Uint8Array(768);
    loadPCX(testArchive!.get('tshp2.pcx'), s, colors);
    expect(s.pixels.some((v) => v !== 0)).toBe(true);
    expect(colors.some((v) => v !== 0)).toBe(true);
  });
});
