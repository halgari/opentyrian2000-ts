// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/font.c

import { s8 } from '../core/int';
import { FONT_ASCII, textWidth } from './fonthand';
import { blitSpriteDark, blitSpriteHv, blitSpriteHvBlend, spriteExists, type SpriteTable } from './sprite';
import type { Surface } from './surface';

export { FONT_ASCII };
type Tables = readonly SpriteTable[];

export enum Font { Large = 0, Normal = 1, Small = 2 }
export enum Align { Left, Centered, Right }

function alignX(x: number, text: string, tables: Tables, font: Font, align: Align): number {
  if (align === Align.Centered) return x - Math.trunc(textWidth(text, tables, font) / 2);
  if (align === Align.Right) return x - textWidth(text, tables, font);
  return x;
}

// port of draw_font_hv
export function drawFontHv(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, hue: number, value: number): void {
  value = s8(value); // C parameter is Sint8
  x = alignX(x, text, tables, font, align);
  const t = tables[font]!;
  let highlight = false;
  for (const ch of text) {
    const id = FONT_ASCII[ch.charCodeAt(0) & 0xff]!;
    if (ch === ' ') x += 6;
    else if (ch === '~') {
      highlight = !highlight;
      value = s8(highlight ? value + 4 : value - 4);
    } else if (id !== -1 && spriteExists(t, id)) {
      blitSpriteHv(s, x, y, t, id, hue, value);
      x += t.sprites[id]!.width + 1;
    }
  }
}

// port of draw_font_hv_blend
export function drawFontHvBlend(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, hue: number, value: number): void {
  value = s8(value); // C parameter is Sint8
  x = alignX(x, text, tables, font, align);
  const t = tables[font]!;
  for (const ch of text) {
    const id = FONT_ASCII[ch.charCodeAt(0) & 0xff]!;
    if (ch === ' ') x += 6;
    else if (ch === '~') { /* not drawn */ }
    else if (id !== -1 && spriteExists(t, id)) {
      blitSpriteHvBlend(s, x, y, t, id, hue, value);
      x += t.sprites[id]!.width + 1;
    }
  }
}

// port of draw_font_dark
export function drawFontDark(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, black: boolean): void {
  x = alignX(x, text, tables, font, align);
  const t = tables[font]!;
  for (const ch of text) {
    const id = FONT_ASCII[ch.charCodeAt(0) & 0xff]!;
    if (ch === ' ') x += 6;
    else if (ch === '~') { /* not drawn */ }
    else if (id !== -1 && spriteExists(t, id)) {
      blitSpriteDark(s, x, y, t, id, black);
      x += t.sprites[id]!.width + 1;
    }
  }
}

// port of draw_font_hv_shadow
export function drawFontHvShadow(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, hue: number, value: number, black: boolean, shadowDist: number): void {
  drawFontDark(s, tables, x + shadowDist, y + shadowDist, text, font, align, black);
  drawFontHv(s, tables, x, y, text, font, align, hue, value);
}

// port of draw_font_hv_full_shadow
export function drawFontHvFullShadow(s: Surface, tables: Tables, x: number, y: number, text: string, font: Font, align: Align, hue: number, value: number, black: boolean, shadowDist: number): void {
  drawFontDark(s, tables, x, y - shadowDist, text, font, align, black);
  drawFontDark(s, tables, x + shadowDist, y, text, font, align, black);
  drawFontDark(s, tables, x, y + shadowDist, text, font, align, black);
  drawFontDark(s, tables, x - shadowDist, y, text, font, align, black);
  drawFontHv(s, tables, x, y, text, font, align, hue, value);
}
