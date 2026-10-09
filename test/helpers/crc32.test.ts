// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32';
import { frameCrc, parseHashes } from './hash-frames';

const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('crc32', () => {
  it('matches the zlib check value', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926);
  });
  it('empty input is 0', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
  it('chains through the seed', () => {
    expect(crc32(ascii('6789'), crc32(ascii('12345')))).toBe(0xcbf43926);
  });
  it('frameCrc is crc32(palette || pixels)', () => {
    const pal = new Uint8Array(768).map((_, i) => i & 63);
    const px = new Uint8Array(64000).map((_, i) => (i * 7) & 255);
    const all = new Uint8Array(768 + 64000);
    all.set(pal); all.set(px, 768);
    expect(frameCrc(pal, px)).toBe(crc32(all));
  });
});

describe('parseHashes', () => {
  it('reads sequential (frame, crc) pairs', () => {
    const b = new Uint8Array(16);
    const v = new DataView(b.buffer);
    v.setUint32(0, 0, true); v.setUint32(4, 0xdeadbeef, true);
    v.setUint32(8, 1, true); v.setUint32(12, 7, true);
    expect(Array.from(parseHashes(b))).toEqual([0xdeadbeef, 7]);
  });
  it('rejects non-sequential frames and partial records', () => {
    const b = new Uint8Array(16);
    new DataView(b.buffer).setUint32(8, 5, true);
    expect(() => parseHashes(b)).toThrow(/frame index/);
    expect(() => parseHashes(new Uint8Array(7))).toThrow(/partial/);
  });
});
