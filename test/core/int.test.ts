import { describe, expect, it } from 'vitest';
import { idiv, s16, s32, s8, u16, u32, u8 } from '../../src/core/int';

describe('int helpers', () => {
  it('wraps like C fixed-width types', () => {
    expect(u8(256 + 5)).toBe(5);
    expect(u8(-1)).toBe(255);
    expect(s8(255)).toBe(-1);
    expect(s8(128)).toBe(-128);
    expect(u16(-1)).toBe(65535);
    expect(s16(0x8000)).toBe(-32768);
    expect(u32(-1)).toBe(4294967295);
    expect(s32(0xffffffff)).toBe(-1);
  });
  it('idiv truncates toward zero like C', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
    expect(idiv(7, -2)).toBe(-3);
  });
});
