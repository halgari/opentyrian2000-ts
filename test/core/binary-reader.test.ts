import { describe, expect, it } from 'vitest';
import { BinaryReader } from '../../src/core/binary-reader';

describe('BinaryReader', () => {
  const data = new Uint8Array([0x01, 0xff, 0x34, 0x12, 0xfe, 0xff, 0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff]);
  it('reads little-endian ints', () => {
    const r = new BinaryReader(data);
    expect(r.u8()).toBe(1);
    expect(r.s8()).toBe(-1);
    expect(r.u16()).toBe(0x1234);
    expect(r.s16()).toBe(-2);
    expect(r.u32()).toBe(0x12345678);
    expect(r.s32()).toBe(-1);
    expect(r.eof()).toBe(true);
  });
  it('bool is any non-zero byte', () => {
    const r = new BinaryReader(new Uint8Array([0, 2]));
    expect(r.bool()).toBe(false);
    expect(r.bool()).toBe(true);
  });
  it('bytes/seek/skip', () => {
    const r = new BinaryReader(data);
    r.skip(2);
    expect(Array.from(r.bytes(2))).toEqual([0x34, 0x12]);
    r.seek(0);
    expect(r.pos).toBe(0);
    expect(r.length).toBe(14);
  });
  it('throws RangeError past the end', () => {
    const r = new BinaryReader(new Uint8Array([1]));
    expect(() => r.u16()).toThrow(RangeError);
    expect(() => new BinaryReader(new Uint8Array(2)).bytes(3)).toThrow(RangeError);
  });
});
