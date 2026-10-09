// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { SFX_COUNT, VOICE_COUNT } from '../../src/audio/ids';
import { loadSounds, resampleS8 } from '../../src/audio/sound-file';
import { BinaryReader } from '../../src/core/binary-reader';
import { describeData, testArchive } from '../helpers/data';

it('resampleS8 interpolates and holds the last sample', () => {
  const out = resampleS8(new Int8Array([0, 64]), 44100);
  expect(Array.from(out)).toEqual([0, 4096, 8192, 12288, 16384, 16384, 16384, 16384]);
});

it('resampleS8 of empty input is empty', () => {
  expect(resampleS8(new Int8Array(0), 44100).length).toBe(0);
});

it('throws on a wrong sound count', () => {
  const bad = new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(() => loadSounds(bad, bad, 44100)).toThrow('Unexpected data was read from a file.');
});

describeData('loadSounds (real data)', () => {
  it('loads 40 entries with the voice length rule', () => {
    const snd = testArchive!.get('tyrian.snd');
    const voc = testArchive!.get('voices.snd');
    const sounds = loadSounds(snd, voc, 44100);
    expect(sounds.length).toBe(SFX_COUNT + VOICE_COUNT);
    const r = new BinaryReader(voc);
    const count = r.u16();
    const pos: number[] = [];
    for (let i = 0; i < count; i++) pos.push(r.u32());
    pos.push(voc.length);
    for (let i = 0; i < VOICE_COUNT; i++) {
      const raw = pos[i + 1] - pos[i];
      expect(sounds[SFX_COUNT + i].length).toBe(raw >= 100 ? (raw - 100) * 4 : 0);
    }
  });
});
