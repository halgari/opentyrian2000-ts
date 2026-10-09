// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { AUDIO_SCENARIOS, type AudioScenarioName } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import { readOraclePcm, renderRaw } from '../helpers/audio-oracle';

const names: AudioScenarioName[] = ['title-raw', 'perc-raw', 'loop-raw', 'stop-raw'];

for (const name of names) {
  const expected = readOraclePcm(name);
  const d = testArchive && expected ? describe : describe.skip;
  d(`golden audio: ${name}`, () => {
    it('matches the C LDS+OPL output sample for sample', { timeout: 120_000 }, () => {
      const sc = AUDIO_SCENARIOS[name];
      expect(expected!.pcm.length).toBe(sc.samples);
      const out = renderRaw(sc.song, sc.samples, sc.fadeAt);
      let first = -1;
      for (let i = 0; i < sc.samples; i++) if (out.pcm[i] !== expected!.pcm[i]) { first = i; break; }
      if (first >= 0) throw new Error(`${name}: first mismatch at ${first}: got ${out.pcm[first]}, want ${expected!.pcm[first]}`);
      expect(out.loopedAtSample).toBe(expected!.meta.loopedAtSample);
      expect(out.stoppedAtSample).toBe(expected!.meta.stoppedAtSample);
    });
  });
}
