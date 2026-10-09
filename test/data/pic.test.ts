import { describe, expect, it } from 'vitest';
import { PicFile, loadPic } from '../../src/data/pic';
import { loadPalettes } from '../../src/data/palette-file';
import { PCX_PAL } from '../../src/data/pcxmast';
import { PaletteState } from '../../src/video/palette';
import { createSurface } from '../../src/video/surface';
import { describeData, testArchive } from '../helpers/data';

function buildPicFile(bodies: number[][]): Uint8Array {
  const header = 2 + 14 * 4;
  const out: number[] = [14, 0];
  let off = header;
  const offsets: number[] = [];
  for (let i = 0; i < 14; i++) { offsets.push(off); off += (bodies[i] ?? []).length; }
  for (const o of offsets) out.push(o & 0xff, (o >> 8) & 0xff, (o >> 16) & 0xff, (o >> 24) & 0xff);
  for (let i = 0; i < 14; i++) out.push(...(bodies[i] ?? []));
  return new Uint8Array(out);
}

describe('PicFile', () => {
  it('decodes RLE runs and literals', () => {
    // runs are at most 63 pixels (0xc0 | 63)
    const body: number[] = [];
    let left = 64000 - 3;
    body.push(5, 6, 7);                  // three literals
    while (left > 0) { const n = Math.min(63, left); body.push(0xc0 | n, 9); left -= n; }
    const pics = new PicFile(buildPicFile([body]));
    const out = new Uint8Array(64000);
    pics.decode(1, out);
    expect(Array.from(out.subarray(0, 4))).toEqual([5, 6, 7, 9]);
    expect(out[63999]).toBe(9);
  });
  it('loadPic copies palettes[pcxpal[n-1]] into colors and optionally sets it', () => {
    const body: number[] = [];
    for (let left = 64000; left > 0; left -= 63) body.push(0xc0 | Math.min(63, left), 1);
    const bodies = Array.from({ length: 14 }, () => body);
    const pics = new PicFile(buildPicFile(bodies));
    const palettes = Array.from({ length: 24 }, (_, i) => new Uint8Array(768).fill(i));
    const ps = new PaletteState(palettes);
    const s = createSurface();
    loadPic(pics, ps, s, 2, false);
    expect(ps.colors[0]).toBe(PCX_PAL[1]);
    expect(ps.current[0]).toBe(0);
    loadPic(pics, ps, s, 2, true);
    expect(ps.current[0]).toBe(PCX_PAL[1]);
  });
});

describeData('real tyrian.pic', () => {
  it('every picture decodes to exactly 64000 pixels without overrunning its body', () => {
    const pics = new PicFile(testArchive!.get('tyrian.pic'));
    expect(pics.count).toBe(14);
    const out = new Uint8Array(64000);
    for (let n = 1; n <= 14; n++) expect(() => pics.decode(n, out)).not.toThrow();
  });
  it('picture 4 uses palette 8 (pcxpal[3])', () => {
    const ps = new PaletteState(loadPalettes(testArchive!.get('palette.dat')));
    loadPic(new PicFile(testArchive!.get('tyrian.pic')), ps, createSurface(), 4, false);
    expect(Array.from(ps.colors)).toEqual(Array.from(ps.palettes[8]!));
  });
});
