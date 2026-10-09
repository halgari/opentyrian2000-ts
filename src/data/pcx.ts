// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/pcxload.c

import type { Surface } from '../video/surface';

/**
 * port of JE_loadPCX (pcxload.c) — only meant to load tshp2.pcx.
 * Decodes the 320x200 RLE image into `surface` and, when the file ends with a 0x0C-prefixed 768-byte VGA palette,
 * copies that palette (raw bytes, as the C does) into `colors`.
 */
export function loadPCX(bytes: Uint8Array, surface: Surface, colors: Uint8Array): void {
  if (bytes.length < 769 + 128) throw new RangeError('loadPCX: file too short');
  const palPos = bytes.length - 769;
  if (bytes[palPos] === 12) colors.set(bytes.subarray(palPos + 1, palPos + 769).subarray(0, 768));

  const px = surface.pixels;
  let s = 0;
  let src = 128;
  for (let i = 0; i < 320 * 200; ) {
    if (src >= bytes.length) throw new RangeError('loadPCX: RLE data ends early');
    const p = bytes[src++]!;
    if ((p & 0xc0) === 0xc0) {
      const run = p & 0x3f;
      const v = bytes[src++]!;
      i += run;
      px.fill(v, s, s + run);
      s += run;
    } else {
      i++;
      px[s++] = p;
    }
    if (i && i % 320 === 0) s += surface.pitch - 320;
  }
}
