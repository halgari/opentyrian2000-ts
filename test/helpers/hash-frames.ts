// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { crc32 } from './crc32';

/** CRC-32 over palette(768) || pixels(64000): the value the oracle's OT_HASH writes per frame. */
export function frameCrc(palette: Uint8Array, pixels: Uint8Array): number {
  return crc32(pixels, crc32(palette));
}

/** Parses an OT_HASH file (pairs of u32 frame, u32 crc) into crc[frame]. Frame indexes must be sequential. */
export function parseHashes(bytes: Uint8Array): Uint32Array {
  if (bytes.length % 8 !== 0) throw new Error('hash file ends in a partial record');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length / 8;
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const frame = view.getUint32(i * 8, true);
    if (frame !== i) throw new Error(`hash file: record ${i} has frame index ${frame}`);
    out[i] = view.getUint32(i * 8 + 4, true);
  }
  return out;
}

/** Returns null when the oracle file is absent (golden tests then skip). */
export function readHashes(path: string): Uint32Array | null {
  return existsSync(path) ? parseHashes(new Uint8Array(readFileSync(path))) : null;
}
