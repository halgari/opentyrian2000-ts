// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { buildLut } from '../../src/video/presenter';

describe('buildLut', () => {
  it('packs RGB as little-endian RGBA with opaque alpha', () => {
    const pal = new Uint8Array(768);
    pal[3] = 0x11; pal[4] = 0x22; pal[5] = 0x33;
    const lut = new Uint32Array(256);
    buildLut(pal, lut);
    expect(lut[1]).toBe(0xff332211);
    expect(lut[0]).toBe(0xff000000);
  });
});
