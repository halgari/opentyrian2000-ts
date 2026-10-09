// SPDX-License-Identifier: GPL-2.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { zlibSync } from 'fflate';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function writeRgbPng(path: string, w: number, h: number, rgb: Uint8Array): void {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array()),
  ];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat(parts));
}

export function writeIndexedPng(path: string, frame: { palette: Uint8Array; pixels: Uint8Array }): void {
  const rgb = new Uint8Array(320 * 200 * 3);
  for (let i = 0; i < 64000; i++) {
    const c = frame.pixels[i]! * 3;
    rgb[i * 3] = frame.palette[c]!;
    rgb[i * 3 + 1] = frame.palette[c + 1]!;
    rgb[i * 3 + 2] = frame.palette[c + 2]!;
  }
  writeRgbPng(path, 320, 200, rgb);
}
