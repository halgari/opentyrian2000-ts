// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { S_CLINK } from '../../src/audio/ids';
import { changeVolume } from '../../src/audio/volume';

describe('changeVolume', () => {
  it('clamps high and clinks once', () => {
    const spy = vi.fn();
    expect(changeVolume(250, 10, 100, 0, spy)).toEqual({ music: 255, sample: 100 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(S_CLINK);
  });
  it('clamps negative to 0 with a clink', () => {
    const spy = vi.fn();
    expect(changeVolume(5, 0, 3, -10, spy)).toEqual({ music: 5, sample: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('never clinks with zero delta', () => {
    const spy = vi.fn();
    expect(changeVolume(300, 0, -4, 0, spy)).toEqual({ music: 300, sample: -4 });
    expect(spy).not.toHaveBeenCalled();
  });
  it('passes through in-range changes', () => {
    const spy = vi.fn();
    expect(changeVolume(100, 10, 100, -10, spy)).toEqual({ music: 110, sample: 90 });
    expect(spy).not.toHaveBeenCalled();
  });
});
