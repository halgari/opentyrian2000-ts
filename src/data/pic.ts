// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/picload.c

import { BinaryReader } from '../core/binary-reader';
import type { PaletteState } from '../video/palette';
import type { Surface } from '../video/surface';
import { PCX_NUM, PCX_PAL } from './pcxmast';

export class PicFile {
  readonly count = PCX_NUM;
  private readonly pos: number[] = [];

  constructor(private readonly bytes: Uint8Array) {
    const r = new BinaryReader(bytes);
    r.u16(); // picture count (unused by the C)
    for (let i = 0; i < PCX_NUM; i++) this.pos.push(r.s32());
    this.pos.push(bytes.length);
  }

  /** RLE-decode picture `picNumber` (1-based) into a 320x200 buffer. */
  decode(picNumber: number, out: Uint8Array): void {
    const n = picNumber - 1;
    if (n < 0 || n >= PCX_NUM) throw new RangeError(`picture ${picNumber} out of range`);
    const end = this.pos[n + 1]!;
    let p = this.pos[n]!;
    const b = this.bytes;
    for (let i = 0; i < 320 * 200; ) {
      if (p >= end) throw new RangeError(`picture ${picNumber}: RLE data ends early`);
      const c = b[p]!;
      if ((c & 0xc0) === 0xc0) {
        const run = c & 0x3f;
        out.fill(b[p + 1]!, i, i + run);
        i += run;
        p += 2;
      } else {
        out[i++] = c;
        p++;
      }
    }
  }
}

// port of JE_loadPic
export function loadPic(pics: PicFile, ps: PaletteState, surface: Surface, picNumber: number, storePal: boolean): void {
  pics.decode(picNumber, surface.pixels);
  ps.colors.set(ps.palettes[PCX_PAL[picNumber - 1]!]!);
  if (storePal) ps.setPalette(ps.colors, 0, 255);
}
