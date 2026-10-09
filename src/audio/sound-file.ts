// SPDX-License-Identifier: GPL-2.0-or-later
import { BinaryReader } from '../core/binary-reader';
import { SFX_COUNT, SOUND_COUNT, VOICE_COUNT } from './ids';

const SOURCE_RATE = 11025;
const DIE = 'Unexpected data was read from a file.';

// stands in for the SDL_AudioCVT conversion in loadSndFile (nortsong.c): s8 @ 11025 Hz -> s16 @ outputRate, linear interpolation
export function resampleS8(src: Int8Array, outputRate: number): Int16Array {
  const outLen = Math.round((src.length * outputRate) / SOURCE_RATE);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const num = i * SOURCE_RATE;
    const idx = Math.floor(num / outputRate);
    const rem = num - idx * outputRate; // fraction = rem / outputRate
    const a = src[Math.min(idx, src.length - 1)] * 256;
    const b = src[Math.min(idx + 1, src.length - 1)] * 256;
    out[i] = a + Math.trunc(((b - a) * rem) / outputRate);
  }
  return out;
}

function readTable(file: Uint8Array, expectedCount: number): { pos: Uint32Array } {
  const r = new BinaryReader(file);
  let count: number;
  try {
    count = r.u16();
    if (count !== expectedCount) throw new Error(DIE);
    const pos = new Uint32Array(count + 1);
    for (let i = 0; i < count; i++) pos[i] = r.u32();
    pos[count] = file.length;
    return { pos };
  } catch (e) {
    if (e instanceof RangeError) throw new Error(DIE);
    throw e;
  }
}

// port of loadSndFile (nortsong.c)
export function loadSounds(tyrianSnd: Uint8Array, voicesSnd: Uint8Array, outputRate: number): Int16Array[] {
  const raw: Int8Array[] = [];
  const sfx = readTable(tyrianSnd, SFX_COUNT).pos;
  for (let i = 0; i < SFX_COUNT; i++) {
    const n = sfx[i + 1] - sfx[i];
    if (n > 0xffff || sfx[i + 1] > tyrianSnd.length || sfx[i] > sfx[i + 1]) throw new Error(DIE);
    raw.push(new Int8Array(tyrianSnd.slice(sfx[i], sfx[i] + n).buffer));
  }
  const voc = readTable(voicesSnd, VOICE_COUNT).pos;
  for (let i = 0; i < VOICE_COUNT; i++) {
    let n = voc[i + 1] - voc[i];
    n = n >= 100 ? n - 100 : 0; // voice sounds have some bad data at the end
    if (n > 0xffff || voc[i] + n > voicesSnd.length) throw new Error(DIE);
    raw.push(new Int8Array(voicesSnd.slice(voc[i], voc[i] + n).buffer));
  }
  const out: Int16Array[] = [];
  for (let i = 0; i < SOUND_COUNT; i++) out.push(resampleS8(raw[i], outputRate));
  return out;
}
