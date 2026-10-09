// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/engine';
import { buildVolumeFactorTable } from '../../src/audio/volume-table';
import { AUDIO_SCENARIOS, type AudioScenarioName } from '../../tools/oracle/scenarios';
import { AUDIO_ORACLE_DIR, readOraclePcm } from '../helpers/audio-oracle';
import { testArchive } from '../helpers/data';
import { existsSync, readFileSync } from 'node:fs';

for (const name of ['title-mixed', 'title-fade'] as AudioScenarioName[]) {
  const expected = readOraclePcm(name);
  const d = testArchive && expected ? describe : describe.skip;
  d(`golden audio: ${name}`, () => {
    it('matches the C mixed output sample for sample', { timeout: 120_000 }, () => {
      const sc = AUDIO_SCENARIOS[name];
      expect(expected!.pcm.length).toBe(sc.samples);
      const e = new AudioEngine(44100);
      e.samplesDisabled = true;
      e.setVolume(sc.musicVolume, 255);
      e.loadMusic(testArchive!.get('music.mus'));
      e.playSong(sc.song);
      const pcm = new Int16Array(sc.samples);
      for (let base = 0; base < sc.samples; base += 1024) {
        if (sc.fadeAt >= 0 && base === sc.fadeAt) e.fadeSong();
        e.render(pcm.subarray(base, Math.min(base + 1024, sc.samples)));
      }
      let first = -1;
      for (let i = 0; i < sc.samples; i++) if (pcm[i] !== expected!.pcm[i]) { first = i; break; }
      if (first >= 0) throw new Error(`${name}: first mismatch at ${first}: got ${pcm[first]}, want ${expected!.pcm[first]}`);
    });
  });
}

const volPath = `${AUDIO_ORACLE_DIR}voltable.pcm`;
(existsSync(volPath) ? describe : describe.skip)('golden audio: voltable', () => {
  it('matches the C volume factor table', () => {
    const b = readFileSync(volPath);
    const want = new Int32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    expect(want.length).toBe(256);
    expect(Array.from(buildVolumeFactorTable())).toEqual(Array.from(want));
  });
});
