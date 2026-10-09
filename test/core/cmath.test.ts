import { describe, expect, it } from 'vitest';
import { cosf, f32, rngMod, roundf32, sinf } from '../../src/core/cmath';

describe('cmath', () => {
  it('rngMod emulates unsigned long % int', () => {
    expect(rngMod(10, -3)).toBe(10);
    expect(rngMod(10, 3)).toBe(1);
    expect(rngMod(4294967295, 100)).toBe(95);
    expect(() => rngMod(10, 0)).toThrow();
  });
  it('roundf32 rounds half away from zero', () => {
    expect(roundf32(2.5)).toBe(3);
    expect(roundf32(-2.5)).toBe(-3);
    expect(roundf32(0.5)).toBe(1);
    expect(roundf32(-0.5)).toBe(-1);
    expect(roundf32(0.49999997)).toBe(0);
    expect(roundf32(1.4999999)).toBe(1);
    expect(roundf32(16777217)).toBe(16777216); // float32 reduction first
    expect(roundf32(Infinity)).toBe(Infinity);
  });
  it('f32 / sinf / cosf return float32 values', () => {
    expect(f32(0.1)).toBe(Math.fround(0.1));
    expect(sinf(1)).toBe(Math.fround(Math.sin(1)));
    expect(cosf(1)).toBe(Math.fround(Math.cos(1)));
    expect(Math.fround(sinf(2))).toBe(sinf(2));
  });
});
