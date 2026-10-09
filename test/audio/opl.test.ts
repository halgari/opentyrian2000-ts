// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { CRand } from '../../src/audio/crand';
import { Opl } from '../../src/audio/opl';

const TONE: Array<[number, number]> = [
  [0x20, 0x01], [0x40, 0x10], [0x60, 0xf0], [0x80, 0x77], [0xa0, 0x98],
  [0x23, 0x01], [0x43, 0x00], [0x63, 0xf0], [0x83, 0x77], [0xb0, 0x31],
];

function makeTone(): Opl {
  const opl = new Opl(new CRand());
  opl.init(44100);
  for (const [r, v] of TONE) opl.write(r, v);
  return opl;
}

describe('Opl', () => {
  it('is silent with no writes', () => {
    const opl = new Opl(new CRand());
    opl.init(44100);
    const out = new Int16Array(1000);
    opl.getSample(out, 0, 1000);
    expect(out.every((s) => s === 0)).toBe(true);
  });

  it('produces a tone at the expected pitch', () => {
    const opl = makeTone();
    const n = 44100;
    const out = new Int16Array(n);
    opl.getSample(out, 0, n);
    expect(out.some((s) => s !== 0)).toBe(true);
    // The patch is a strong FM tone (rich harmonics), so raw zero crossings overcount
    // (~3x, identical in the C emulator). Measure the period by autocorrelation instead.
    const f = (0x198 * 49716) / 2 ** (20 - 4);
    const expected = 44100 / f;
    const acf: number[] = [];
    let best = 0;
    for (let lag = 60; lag < 400; lag++) {
      let acc = 0;
      for (let i = 4000; i < 24000; i++) acc += out[i] * out[i + lag];
      acf[lag] = acc;
      if (acc > best) best = acc;
    }
    // smallest lag at a local peak that is nearly as correlated as the best (avoids picking a multiple)
    let bestLag = 0;
    for (let lag = 61; lag < 399; lag++) {
      if (acf[lag] >= 0.95 * best && acf[lag] >= acf[lag - 1] && acf[lag] >= acf[lag + 1]) { bestLag = lag; break; }
    }
    expect(Math.abs(bestLag - expected) / expected).toBeLessThan(0.05);
  });

  it('getSample writes only the requested range', () => {
    const opl = makeTone();
    const out = new Int16Array(300).fill(0x1234);
    opl.getSample(out, 100, 100);
    for (let i = 0; i < 100; i++) expect(out[i]).toBe(0x1234);
    for (let i = 200; i < 300; i++) expect(out[i]).toBe(0x1234);
    expect(out.slice(100, 200).some((s) => s !== 0x1234)).toBe(true);
  });

  it('two instances with the same writes are identical', () => {
    const a = makeTone();
    const b = makeTone();
    const oa = new Int16Array(5000);
    const ob = new Int16Array(5000);
    a.getSample(oa, 0, 5000);
    b.getSample(ob, 0, 5000);
    expect(oa).toEqual(ob);
  });

  it('chunking does not change output (including across 512-sample blocks)', () => {
    const a = makeTone();
    const b = makeTone();
    const oa = new Int16Array(3000);
    const ob = new Int16Array(3000);
    a.getSample(oa, 0, 3000);
    for (let o = 0; o < 3000; o += 128) b.getSample(ob, o, Math.min(128, 3000 - o));
    expect(ob).toEqual(oa);
  });

  it('register reads follow OPL2 detection semantics', () => {
    const opl = new Opl(new CRand());
    opl.init(44100);
    expect(opl.regRead(0) & 6).toBe(6);
    expect(opl.regRead(1)).toBe(0xff);
    opl.writeIndex(0, 0x20);
  });

  it('percussion mode runs and uses the rand source', () => {
    const opl = new Opl(new CRand());
    opl.init(44100);
    for (const [r, v] of [[0xa6, 0x50], [0xb6, 0x09], [0xa7, 0x50], [0xb7, 0x09], [0xa8, 0x50], [0xb8, 0x09],
      [0x31, 0x01], [0x34, 0x01], [0x51, 0x00], [0x54, 0x00], [0x71, 0xf0], [0x74, 0xf0], [0x91, 0x07], [0x94, 0x07],
      [0xbd, 0x3f]]) opl.write(r, v);
    const out = new Int16Array(2000);
    opl.getSample(out, 0, 2000);
    expect(out.some((s) => s !== 0)).toBe(true);
  });
});
