import { describe, expect, it } from 'vitest';
import { MersenneTwister } from '../../src/core/mtrand';

describe('MersenneTwister (port of mtrand.c)', () => {
  it('uses default seed 5489 when never seeded', () => {
    const mt = new MersenneTwister();
    expect([mt.rand(), mt.rand(), mt.rand(), mt.rand(), mt.rand()]).toEqual([
      3499211612, 581869302, 3890346734, 3586334585, 545404204,
    ]);
  });
  it('matches reference outputs for seed 1', () => {
    const mt = new MersenneTwister();
    mt.srand(1);
    expect([mt.rand(), mt.rand(), mt.rand()]).toEqual([1791095845, 4282876139, 3093770124]);
  });
  it('wraps its state pointers past 624 outputs', () => {
    const mt = new MersenneTwister();
    mt.srand(5489);
    let last = 0;
    for (let i = 0; i < 10000; i++) last = mt.rand();
    expect(last).toBe(4123659995); // 10000th output of MT19937 default seed
  });
  it('rand1 / randLt1 are float32 in range', () => {
    const mt = new MersenneTwister();
    mt.srand(7);
    for (let i = 0; i < 1000; i++) {
      const a = mt.rand1();
      const b = mt.randLt1();
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(b).toBeLessThan(1);
      expect(Math.fround(a)).toBe(a);
    }
  });
  it('counts rand() calls, including rand1/randLt1', () => {
    const mt = new MersenneTwister();
    mt.srand(1);
    expect(mt.calls).toBe(0);
    mt.rand(); mt.rand1(); mt.randLt1();
    expect(mt.calls).toBe(3);
  });
});
