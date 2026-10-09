// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { buildVolumeFactorTable } from '../../src/audio/volume-table';
import * as ids from '../../src/audio/ids';

describe('buildVolumeFactorTable', () => {
  const t = buildVolumeFactorTable();
  it('has fixed endpoints and length', () => {
    expect(t.length).toBe(256);
    expect(t[0]).toBe(0);
    expect(t[255]).toBe(4096);
  });
  it('is non-decreasing', () => {
    for (let i = 1; i < 256; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
  });
  it('matches the float32 C expression', () => {
    const f = Math.fround;
    const k = f(-30 / f(20 * 255));
    for (let i = 1; i < 256; i++) {
      const e = f(Math.pow(10, f(f(255 - i) * k)));
      expect(t[i]).toBe(Math.trunc(f(e * 4096)));
    }
    expect(t[1]).toBe(Math.trunc(f(Math.pow(10, f(f(254) * f(-30 / (20 * 255))))) * 4096));
  });
});

describe('ids', () => {
  it('has counts and key values', () => {
    expect(ids.SFX_COUNT).toBe(31);
    expect(ids.SOUND_COUNT).toBe(40);
    expect(ids.V_ACCELERATE).toBe(40);
    expect(ids.S_SELECT).toBe(8);
    expect(ids.MUSIC_NUM).toBe(41);
    expect(ids.FX_PLAY_VOL).toBe(4);
  });
});
