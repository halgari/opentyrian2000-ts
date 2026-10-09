// SPDX-License-Identifier: GPL-2.0-or-later
import { BinaryReader } from '../core/binary-reader';

export interface PakEntry { name: string; data: Uint8Array }

const MAGIC = [0x54, 0x32, 0x4b, 0x50]; // "T2KP"

export function encodePak(entries: PakEntry[]): Uint8Array {
  let size = 8;
  for (const e of entries) size += 1 + e.name.length + 4 + e.data.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint32(4, entries.length, true);
  let p = 8;
  for (const e of entries) {
    if (e.name.length > 255) throw new Error(`name too long: ${e.name}`);
    out[p++] = e.name.length;
    for (let i = 0; i < e.name.length; i++) out[p++] = e.name.charCodeAt(i) & 0xff;
    view.setUint32(p, e.data.length, true);
    p += 4;
  }
  for (const e of entries) {
    out.set(e.data, p);
    p += e.data.length;
  }
  return out;
}

export function decodePak(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length < 8 || MAGIC.some((m, i) => bytes[i] !== m)) {
    throw new Error('not a Tyrian data pack (bad magic)');
  }
  const r = new BinaryReader(bytes, 4);
  const count = r.u32();
  const heads: { name: string; size: number }[] = [];
  for (let i = 0; i < count; i++) {
    const len = r.u8();
    const name = String.fromCharCode(...r.bytes(len));
    heads.push({ name, size: r.u32() });
  }
  const files = new Map<string, Uint8Array>();
  for (const h of heads) files.set(h.name, r.bytes(h.size));
  return files;
}
