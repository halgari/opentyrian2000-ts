// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/audio/engine';
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
