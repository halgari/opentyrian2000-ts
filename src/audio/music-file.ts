// SPDX-License-Identifier: GPL-2.0-or-later
import { BinaryReader } from '../core/binary-reader';

export interface MusicFile {
  bytes: Uint8Array;
  /** songCount + 1 entries; the last is the file size. */
  offsets: Uint32Array;
  songCount: number;
}

// port of load_music (loudness.c)
export function parseMusicFile(bytes: Uint8Array): MusicFile {
  const r = new BinaryReader(bytes);
  const songCount = r.u16();
  const offsets = new Uint32Array(songCount + 1);
  for (let i = 0; i < songCount; i++) offsets[i] = r.u32();
  offsets[songCount] = bytes.length;
  return { bytes, offsets, songCount };
}

// port of load_song (loudness.c): the byte range of one song
export function songBytes(m: MusicFile, song: number): Uint8Array | null {
  if (!(song >= 0 && song < m.songCount)) return null;
  return m.bytes.subarray(m.offsets[song], m.offsets[song + 1]);
}
