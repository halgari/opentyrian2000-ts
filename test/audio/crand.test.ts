// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { CRand } from '../../src/audio/crand';

const FIRST = [1804289383, 846930886, 1681692777, 1714636915, 1957747793];

describe('CRand', () => {
  it('matches glibc seed 1', () => {
    const r = new CRand();
    expect(FIRST.map(() => r.rand())).toEqual(FIRST);
  });
  it('srand(1) restarts the sequence', () => {
    const r = new CRand();
    r.rand();
    r.rand();
    r.srand(1);
    expect(FIRST.map(() => r.rand())).toEqual(FIRST);
  });
  it('srand(0) behaves as seed 1', () => {
    const r = new CRand(0);
    expect(FIRST.map(() => r.rand())).toEqual(FIRST);
  });
});
