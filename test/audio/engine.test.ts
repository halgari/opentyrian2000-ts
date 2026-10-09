// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/audio/engine';
import { buildVolumeFactorTable } from '../../src/audio/volume-table';
import { describeData, testArchive } from '../helpers/data';

function engineWith(...sounds: Int16Array[]): AudioEngine {
  const e = new AudioEngine(44100);
  e.loadSounds(sounds);
  return e;
}
const constant = (v: number, n: number) => new Int16Array(n).fill(v);

describe('AudioEngine mixer', () => {
  it('is silent when nothing plays', () => {
    const e = engineWith();
    const out = new Int16Array(64).fill(7);
    e.render(out);
    expect(out.every((v) => v === 0)).toBe(true);
  });
  it('plays a single sample then falls silent', () => {
    const e = engineWith(constant(1000, 10));
    e.multiSamplePlay(0, 0, 7);
    const out = new Int16Array(16);
    e.render(out);
    expect(Array.from(out)).toEqual([...Array(10).fill(1000), ...Array(6).fill(0)]);
  });
  it('replaces a sample on the same channel', () => {
    const e = engineWith(constant(1000, 10), constant(200, 10));
    e.multiSamplePlay(0, 0, 7);
    e.multiSamplePlay(1, 0, 7);
    const out = new Int16Array(4);
    e.render(out);
    expect(Array.from(out)).toEqual([200, 200, 200, 200]);
  });
  it('scales by channel volume level', () => {
    const e = engineWith(constant(1000, 4));
    e.multiSamplePlay(0, 0, 3);
    const out = new Int16Array(4);
    e.render(out);
    expect(Array.from(out)).toEqual([500, 500, 500, 500]);
  });
  it('clamps the sum', () => {
    const e = engineWith(constant(30000, 4));
    e.multiSamplePlay(0, 0, 7);
    e.multiSamplePlay(0, 1, 7);
    e.multiSamplePlay(0, 2, 7);
    const neg = new AudioEngine(44100);
    neg.loadSounds([constant(-30000, 4)]);
    neg.multiSamplePlay(0, 0, 7);
    neg.multiSamplePlay(0, 1, 7);
    const out = new Int16Array(4);
    e.render(out);
    expect(out[0]).toBe(32767);
    neg.render(out);
    expect(out[0]).toBe(-32768);
  });
  it('ignores multiSamplePlay when samples are disabled', () => {
    const e = engineWith(constant(1000, 4));
    e.samplesDisabled = true;
    e.multiSamplePlay(0, 0, 7);
    e.samplesDisabled = false;
    const out = new Int16Array(4);
    e.render(out);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });
  it('playSample uses sound n-1 on channel 0 at FX_PLAY_VOL', () => {
    const e = engineWith(constant(1000, 2), constant(800, 2));
    e.playSample(2);
    const out = new Int16Array(2);
    e.render(out);
    expect(Array.from(out)).toEqual([500, 500]); // 800 * (4096*5/8) >> 12
  });
  it('playSong out of range warns without throwing', () => {
    const e = new AudioEngine(44100);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => e.playSong(99)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(e.songPlaying).toBe(99);
    warn.mockRestore();
  });
});

describeData('AudioEngine music + samples', () => {
  const musicEngine = (...sounds: Int16Array[]) => {
    const e = new AudioEngine(44100);
    e.loadMusic(testArchive!.get('music.mus'));
    e.loadSounds(sounds);
    e.playSong(29);
    return e;
  };
  const clamp = (v: number) => Math.min(Math.max(-32768, v), 32767);
  const N = 2048;
  const WARM = 22050; // the song starts quietly; skip ahead so the music term is non-trivial

  it('mixes music and samples: out = clamp(((raw*musicFactor) + sample*sampleFactor) >> 12)', () => {
    // The samples-disabled render is clamp((raw*mf) >> 12); adding sample*sf (a multiple of 4096) before the
    // shift changes the floor result by exactly sample*sf/4096, so the expectation is clamp(ref + 3000) wherever
    // ref itself did not clamp.
    const mk = (samplesOff: boolean) => {
      const e = musicEngine(constant(3000, N));
      e.setVolume(255, 255);
      e.samplesDisabled = true;
      e.render(new Int16Array(WARM));
      e.samplesDisabled = samplesOff;
      if (!samplesOff) e.multiSamplePlay(0, 0, 7); // factor 4096 * 8/8
      const o = new Int16Array(N);
      e.render(o);
      return o;
    };
    const ref = mk(true);
    const out = mk(false);
    expect(ref.some((v) => v !== 0)).toBe(true);
    for (let i = 0; i < N; i++) {
      if (ref[i] > -32768 && ref[i] < 32767) expect(out[i]).toBe(clamp(ref[i] + 3000));
    }
  });

  it('musicDisabled with a sample playing gives sample only, and music does not advance', () => {
    const e = musicEngine(constant(1000, 64));
    e.musicDisabled = true;
    e.multiSamplePlay(0, 0, 7);
    const out = new Int16Array(64);
    e.render(out);
    expect(out.every((v) => v === 1000)).toBe(true);
    // music did not advance: re-enabled output equals a fresh engine's
    e.musicDisabled = false;
    const a = new Int16Array(N); e.render(a);
    const f = musicEngine(); const b = new Int16Array(N); f.render(b);
    expect(a).toEqual(b);
  });

  it('both disabled is silent and music does not advance', () => {
    const e = musicEngine(constant(1000, 64));
    e.musicDisabled = true;
    e.samplesDisabled = true;
    const out = new Int16Array(64).fill(5);
    e.render(out);
    expect(out.every((v) => v === 0)).toBe(true);
    e.musicDisabled = false; e.samplesDisabled = false;
    const a = new Int16Array(N); e.render(a);
    const f = musicEngine(); const b = new Int16Array(N); f.render(b);
    expect(a).toEqual(b);
  });

  it('toggling flags between render calls follows the branch each time', () => {
    const e = musicEngine(constant(1000, 4096));
    e.multiSamplePlay(0, 0, 7);
    e.samplesDisabled = true; e.render(new Int16Array(WARM)); e.samplesDisabled = false;
    e.multiSamplePlay(0, 0, 7);
    const o1 = new Int16Array(16); e.render(o1);          // music + sample
    e.samplesDisabled = true;
    const o2 = new Int16Array(16); e.render(o2);          // music only (sample channel keeps its position)
    e.samplesDisabled = false; e.musicDisabled = true;
    const o3 = new Int16Array(16); e.render(o3);          // sample only: resumes at pos 16
    expect(o3.every((v) => v === 1000)).toBe(true);
    e.samplesDisabled = true;
    const o4 = new Int16Array(16).fill(9); e.render(o4);  // both off
    expect(o4.every((v) => v === 0)).toBe(true);
    e.samplesDisabled = false;
    const o5 = new Int16Array(16); e.render(o5);
    expect(o5.every((v) => v === 1000)).toBe(true);
    expect(o1.some((v) => v !== 1000)).toBe(true);
    expect(o2.some((v) => v !== 0)).toBe(true);
  });
});

describe('AudioEngine sample volume', () => {
  it('setVolume(255, 128) scales samples by the table factor', () => {
    const full = engineWith(constant(10000, 4));
    full.setVolume(255, 255);
    full.multiSamplePlay(0, 0, 7);
    const a = new Int16Array(4); full.render(a);
    const half = engineWith(constant(10000, 4));
    half.setVolume(255, 128);
    half.multiSamplePlay(0, 0, 7);
    const b = new Int16Array(4); half.render(b);
    const f = buildVolumeFactorTable()[128];
    expect(a[0]).toBe(10000);
    expect(b[0]).toBe((10000 * Math.trunc((f * 8) / 8)) >> 12);
    expect(b[0]).toBeLessThan(a[0]);
    expect(b[0]).toBeGreaterThan(0);
  });
});

describeData('AudioEngine music', () => {
  it('is independent of render chunk size', { timeout: 60_000 }, () => {
    const make = () => {
      const e = new AudioEngine(44100);
      e.loadMusic(testArchive!.get('music.mus'));
      e.samplesDisabled = true;
      e.playSong(29);
      return e;
    };
    const a = new Int16Array(44100);
    make().render(a);
    const b = new Int16Array(44100);
    const eb = make();
    for (let i = 0; i < 44100; i += 128) eb.render(b.subarray(i, Math.min(i + 128, 44100)));
    expect(b).toEqual(a);
    expect(a.some((v) => v !== 0)).toBe(true);
  });
});
