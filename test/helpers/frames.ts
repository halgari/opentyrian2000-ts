// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FRAME_RECORD_SIZE = 4 + 768 + 64000;
export const ORACLE_DIR = fileURLToPath(new URL('../../test-data/oracle', import.meta.url));

export interface Frame { index: number; palette: Uint8Array; pixels: Uint8Array }

export function parseFrames(bytes: Uint8Array): Frame[] {
  if (bytes.length % FRAME_RECORD_SIZE !== 0) throw new Error('frames file ends in a partial record');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Frame[] = [];
  for (let p = 0; p < bytes.length; p += FRAME_RECORD_SIZE) {
    out.push({
      index: view.getUint32(p, true),
      palette: bytes.slice(p + 4, p + 772),
      pixels: bytes.slice(p + 772, p + FRAME_RECORD_SIZE),
    });
  }
  return out;
}

export function readFramesFile(path: string): Frame[] | null {
  return existsSync(path) ? parseFrames(new Uint8Array(readFileSync(path))) : null;
}
