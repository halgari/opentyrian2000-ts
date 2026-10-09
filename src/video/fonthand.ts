// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/fonthand.c

import type { Surface } from './surface';
import {
  TINY_FONT, blitSpriteDark, blitSpriteHv, blitSpriteHvBlend, blitSpriteHvUnsafe, spriteExists, type SpriteTable,
} from './sprite';

type Tables = readonly SpriteTable[];

export const PART_SHADE = 0;
export const FULL_SHADE = 1;
export const DARKEN = 2;
export const TRICK = 3;

// port of font_ascii — copy the 256 values verbatim from fonthand.c
export const FONT_ASCII = new Int16Array([
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, 26, 33, 60, 61, 62, -1, 32, 64, 65, 63, 84, 29, 83, 28, 80,
  79, 70, 71, 72, 73, 74, 75, 76, 77, 78, 31, 30, -1, 85, -1, 27,
  -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 68, 82, 69, -1, -1,
  -1, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
  49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 66, 81, 67, -1, -1,
  86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101,
  102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117,
  118, 119, 120, 121, 122, 123, 124, 125, 126, -1, -1, -1, -1, -1, -1, -1,
  ...new Array(5 * 16).fill(-1),
]);

const glyph = (c: string): number => FONT_ASCII[c.charCodeAt(0) & 0xff]!;
const width = (t: SpriteTable, id: number): number => t.sprites[id]!.width;

// port of JE_dString
export function dString(s: Surface, tables: Tables, x: number, y: number, text: string, font: number): void {
  const defaultBrightness = -3;
  let bright = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (ch === '~') bright = bright === 0 ? 2 : 0;
    else if (id !== -1) {
      blitSpriteDark(s, x + 2, y + 2, tables[font]!, id, false);
      blitSpriteHvUnsafe(s, x, y, tables[font]!, id, 0xf, defaultBrightness + bright);
      x += width(tables[font]!, id) + 1;
    }
  }
}

// port of JE_textWidth
export function textWidth(text: string, tables: Tables, font: number): number {
  let x = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (id !== -1) x += width(tables[font]!, id) + 1;
  }
  return x;
}

// port of JE_fontCenter
export function fontCenter(text: string, tables: Tables, font: number): number {
  return 160 - Math.trunc(textWidth(text, tables, font) / 2);
}

// port of JE_outText
export function outText(s: Surface, tables: Tables, x: number, y: number, text: string, colorbank: number, brightness: number): void {
  const t = tables[TINY_FONT]!;
  let bright = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (ch === '~') bright = bright === 0 ? 4 : 0;
    else if (id !== -1 && spriteExists(t, id)) {
      if (brightness >= 0) blitSpriteHvUnsafe(s, x, y, t, id, colorbank, brightness + bright);
      else blitSpriteDark(s, x, y, t, id, true);
      x += width(t, id) + 1;
    }
  }
}

// port of JE_outTextModify
export function outTextModify(s: Surface, tables: Tables, x: number, y: number, text: string, filter: number, brightness: number, font: number): void {
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (id !== -1) {
      blitSpriteHvBlend(s, x, y, tables[font]!, id, filter, brightness);
      x += width(tables[font]!, id) + 1;
    }
  }
}

// port of JE_outTextAdjust (note: the C checks spriteExists against TINY_FONT, not `font` — keep it)
export function outTextAdjust(s: Surface, tables: Tables, x: number, y: number, text: string, filter: number, brightness: number, font: number, shadow: boolean): void {
  let bright = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (ch === '~') bright = bright === 0 ? 4 : 0;
    else if (id !== -1 && spriteExists(tables[TINY_FONT]!, id)) {
      if (shadow) blitSpriteDark(s, x + 2, y + 2, tables[font]!, id, false);
      blitSpriteHv(s, x, y, tables[font]!, id, filter, brightness + bright);
      x += width(tables[font]!, id) + 1;
    }
  }
}

// port of JE_outTextAndDarken (same TINY_FONT existence check quirk)
export function outTextAndDarken(s: Surface, tables: Tables, x: number, y: number, text: string, colorbank: number, brightness: number, font: number): void {
  let bright = 0;
  for (const ch of text) {
    const id = glyph(ch);
    if (ch === ' ') x += 6;
    else if (ch === '~') bright = bright === 0 ? 4 : 0;
    else if (id !== -1 && spriteExists(tables[TINY_FONT]!, id)) {
      blitSpriteDark(s, x + 1, y + 1, tables[font]!, id, false);
      blitSpriteHvUnsafe(s, x, y, tables[font]!, id, colorbank, brightness + bright);
      x += width(tables[font]!, id) + 1;
    }
  }
}

// port of JE_textShade
export function textShade(s: Surface, tables: Tables, x: number, y: number, text: string, colorbank: number, brightness: number, shadetype: number): void {
  switch (shadetype) {
    case PART_SHADE:
      outText(s, tables, x + 1, y + 1, text, 0, -1);
      outText(s, tables, x, y, text, colorbank, brightness);
      break;
    case FULL_SHADE:
      outText(s, tables, x - 1, y, text, 0, -1);
      outText(s, tables, x + 1, y, text, 0, -1);
      outText(s, tables, x, y - 1, text, 0, -1);
      outText(s, tables, x, y + 1, text, 0, -1);
      outText(s, tables, x, y, text, colorbank, brightness);
      break;
    case DARKEN:
      outTextAndDarken(s, tables, x + 1, y + 1, text, colorbank, brightness, TINY_FONT);
      break;
    case TRICK:
      outTextModify(s, tables, x, y, text, colorbank, brightness, TINY_FONT);
      break;
  }
}
