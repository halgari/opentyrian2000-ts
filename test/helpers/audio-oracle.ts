// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CRand } from '../../src/audio/crand';
import { LdsPlayer } from '../../src/audio/lds';
import { parseMusicFile, songBytes } from '../../src/audio/music-file';
import { Opl } from '../../src/audio/opl';
import { testArchive } from './data';

export const AUDIO_ORACLE_DIR = fileURLToPath(new URL('../../test-data/oracle/audio/', import.meta.url));

export function readOraclePcm(name: string): { pcm: Int16Array; meta: { loopedAtSample: number; stoppedAtSample: number } } | null {
  const p = `${AUDIO_ORACLE_DIR}${name}.pcm`;
  if (!existsSync(p) || !existsSync(`${p}.json`)) return null;
  const b = readFileSync(p);
  const pcm = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return { pcm, meta: JSON.parse(readFileSync(`${p}.json`, 'utf8')) };
}

const SAMPLE_RATE = 44100;
const LDS_UPDATE2_RATE = 139;
const CHUNK = 1024;

/** TS replica of the raw-mode loop in tools/oracle/audio-render.c (needs music.mus in the test archive). */
export function renderRaw(song: number, samples: number, fadeAt: number): { pcm: Int16Array; loopedAtSample: number; stoppedAtSample: number } {
  const mus = parseMusicFile(testArchive!.get('music.mus'));
  const data = songBytes(mus, song);
  if (!data) throw new Error(`song ${song} out of range`);
  const opl = new Opl(new CRand());
  opl.init(SAMPLE_RATE);
  const lds = new LdsPlayer(opl, SAMPLE_RATE);
  if (!lds.load(data)) throw new Error('lds load failed');

  const perUpdate = 2 * Math.floor(SAMPLE_RATE / LDS_UPDATE2_RATE);
  const perUpdateFrac = 2 * (SAMPLE_RATE % LDS_UPDATE2_RATE);
  let untilUpdate = 0;
  let untilFrac = 0;
  let loopedAt = -1;
  let stoppedAt = -1;
  const pcm = new Int16Array(samples);

  for (let chunkBase = 0; chunkBase < samples; chunkBase += CHUNK) {
    if (fadeAt >= 0 && chunkBase === fadeAt) lds.fade(1);
    const n = Math.min(CHUNK, samples - chunkBase);
    let off = 0;
    while (off < n) {
      if (untilUpdate === 0) {
        lds.update();
        if (lds.songlooped && loopedAt < 0) loopedAt = chunkBase + off;
        if (!lds.playing && stoppedAt < 0) stoppedAt = chunkBase + off;
        untilUpdate += perUpdate;
        untilFrac += perUpdateFrac;
        if (untilFrac >= LDS_UPDATE2_RATE) {
          untilUpdate += 1;
          untilFrac -= LDS_UPDATE2_RATE;
        }
      }
      const count = Math.min(untilUpdate, n - off);
      opl.getSample(pcm, chunkBase + off, count);
      off += count;
      untilUpdate -= count;
    }
  }
  return { pcm, loopedAtSample: loopedAt, stoppedAtSample: stoppedAt };
}
