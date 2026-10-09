import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import { DataArchive } from '../../src/data/archive';
import { encodePak } from '../../src/data/pak';
import { describeData, testArchive } from '../helpers/data';

describe('DataArchive', () => {
  const pak = encodePak([{ name: 'tyrian.pic', data: new Uint8Array([7]) }]);
  it('is case-insensitive and throws a clear error on missing files', () => {
    const a = new DataArchive(new Map([['tyrian.pic', new Uint8Array([7])]]));
    expect(a.get('TYRIAN.PIC')[0]).toBe(7);
    expect(a.has('Tyrian.Pic')).toBe(true);
    expect(() => a.get('nope.dat')).toThrow('missing data file: nope.dat');
  });
  it('fromPakBytes accepts raw and gzip-compressed packs', async () => {
    expect((await DataArchive.fromPakBytes(pak)).get('tyrian.pic')[0]).toBe(7);
    expect((await DataArchive.fromPakBytes(gzipSync(pak))).get('tyrian.pic')[0]).toBe(7);
  });
});

describeData('real data (pnpm data)', () => {
  it('contains the files the Foundation needs', () => {
    for (const f of ['palette.dat', 'tyrian.pic', 'tyrian.shp', 'tyrian.hdt', 'newsh1.shp']) {
      expect(testArchive!.has(f)).toBe(true);
    }
    expect(testArchive!.has('tyrian2.exe')).toBe(false);
  });
});
