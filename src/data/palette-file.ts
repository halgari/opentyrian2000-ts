// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/palette.c

export const PALETTE_COUNT = 24;

// port of JE_loadPals
export function loadPalettes(bytes: Uint8Array): Uint8Array[] {
  if (bytes.length !== PALETTE_COUNT * 768) throw new Error(`palette.dat must hold 24 palettes (got ${bytes.length} bytes)`);
  const out: Uint8Array[] = [];
  for (let p = 0; p < PALETTE_COUNT; ++p) {
    const pal = new Uint8Array(768);
    for (let i = 0; i < 768; ++i) {
      const c = bytes[p * 768 + i]!;
      pal[i] = (c << 2) | (c >> 4);
    }
    out.push(pal);
  }
  return out;
}
