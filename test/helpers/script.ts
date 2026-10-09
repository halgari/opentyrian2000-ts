// SPDX-License-Identifier: GPL-2.0-or-later
import type { Ctx } from '../../src/ctx';
import { DataArchive } from '../../src/data/archive';

const KEY = [204, 129, 63, 255, 71, 19, 25, 62, 1, 99];

/** Inverse of read_encrypted_pascal_string: encodes lines as Pascal strings encrypted like levelsN.dat. */
export function encodeScript(lines: string[]): Uint8Array {
  const out: number[] = [];
  for (const line of lines) {
    out.push(line.length);
    let prev = 0;
    for (let i = 0; i < line.length; i++) {
      const e = (line.charCodeAt(i) ^ KEY[i % 10]! ^ (i > 0 ? prev : 0)) & 0xff;
      out.push(e);
      prev = e;
    }
  }
  return Uint8Array.from(out);
}

/** Replaces `file` (default levels1.dat) in the ctx's archive by a synthetic script made of `lines`. */
export function overrideFile(ctx: Ctx, file: string, bytes: Uint8Array): void {
  const files = new Map<string, Uint8Array>();
  for (const n of ctx.assets.archive.names()) files.set(n, ctx.assets.archive.get(n));
  files.set(file, bytes);
  ctx.assets = { ...ctx.assets, archive: new DataArchive(files) };
}

/** Installs a synthetic script (raw lines, including the `*` section markers) as levels1.dat. */
export function useScript(ctx: Ctx, lines: string[], file = 'levels1.dat'): void {
  overrideFile(ctx, file, encodeScript(lines));
}
