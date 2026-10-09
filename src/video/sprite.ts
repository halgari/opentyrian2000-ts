// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/sprite.c

import { BinaryReader } from '../core/binary-reader';
import { s8, u8 } from '../core/int';
import type { Surface } from './surface';

export const FONT_SHAPES = 0;
export const SMALL_FONT_SHAPES = 1;
export const TINY_FONT = 2;
export const PLANET_SHAPES = 3;
export const FACE_SHAPES = 4;
export const OPTION_SHAPES = 5; // also help shapes
export const WEAPON_SHAPES = 6;
export const EXTRA_SHAPES = 7;  // ending pics
export const SPRITE_TABLES_MAX = 8;
export const SPRITES_PER_TABLE_MAX = 152;

export interface Sprite { width: number; height: number; size: number; data: Uint8Array | null }
export interface SpriteTable { count: number; sprites: Sprite[] }

export function emptySpriteTable(): SpriteTable {
  return {
    count: 0,
    sprites: Array.from({ length: SPRITES_PER_TABLE_MAX }, () => ({ width: 0, height: 0, size: 0, data: null })),
  };
}

// port of load_sprites
export function loadSpriteTable(r: BinaryReader): SpriteTable {
  const t = emptySpriteTable();
  t.count = r.u16();
  if (t.count > SPRITES_PER_TABLE_MAX) throw new Error(`sprite table too large: ${t.count}`);
  for (let i = 0; i < t.count; ++i) {
    if (!r.bool()) continue; // sprite is empty
    const width = r.u16(), height = r.u16(), size = r.u16();
    t.sprites[i] = { width, height, size, data: r.bytes(size) };
  }
  return t;
}

export const spriteExists = (t: SpriteTable, i: number): boolean => t.sprites[i]?.data != null;
export const spriteWidth = (t: SpriteTable, i: number): number => (spriteExists(t, i) ? t.sprites[i]!.width : 0);
export const spriteHeight = (t: SpriteTable, i: number): number => (spriteExists(t, i) ? t.sprites[i]!.height : 0);

/** Shared walker for every blit_sprite* variant: `op(dst, src)` returns the new pixel. */
function blitWith(s: Surface, x: number, y: number, t: SpriteTable, index: number, op: (dst: number, src: number) => number): void {
  if (index >= t.count || !spriteExists(t, index)) return;
  const sp = t.sprites[index]!;
  const data = sp.data!;
  const width = sp.width;
  const px = s.pixels;
  const ul = s.h * s.pitch;
  let p = y * s.pitch + x;
  let xOff = 0;
  for (let d = 0; d < sp.size; ++d) {
    const v = data[d]!;
    switch (v) {
      case 255: // transparent run, next byte is the count
        d++;
        p += data[d]!;
        xOff += data[d]!;
        break;
      case 254: // next pixel row
        p += width - xOff;
        xOff = width;
        break;
      case 253: // one transparent pixel
        p++;
        xOff++;
        break;
      default:
        if (p >= ul) return;
        if (p >= 0) px[p] = op(px[p]!, v);
        p++;
        xOff++;
        break;
    }
    if (xOff >= width) {
      p += s.pitch - xOff;
      xOff = 0;
    }
  }
}

// port of blit_sprite (JE_newDrawCShapeNum)
export function blitSprite(s: Surface, x: number, y: number, t: SpriteTable, i: number): void {
  blitWith(s, x, y, t, i, (_d, v) => v);
}

// port of blit_sprite_blend (JE_newDrawCShapeTrick)
export function blitSpriteBlend(s: Surface, x: number, y: number, t: SpriteTable, i: number): void {
  blitWith(s, x, y, t, i, (d, v) => (v & 0xf0) | (((d & 0x0f) + (v & 0x0f)) >> 1));
}

// port of blit_sprite_hv_unsafe (JE_newDrawCShapeBright) — value may overflow into hue
export function blitSpriteHvUnsafe(s: Surface, x: number, y: number, t: SpriteTable, i: number, hue: number, value: number): void {
  value = s8(value); // C parameter is Sint8
  const h = u8(hue << 4);
  blitWith(s, x, y, t, i, (_d, v) => u8(h | ((v & 0x0f) + value)));
}

function hvValue(v: number, value: number): number {
  let tv = u8((v & 0x0f) + value);
  if (tv > 0xf) tv = tv >= 0x1f ? 0x0 : 0xf;
  return tv;
}

// port of blit_sprite_hv (JE_newDrawCShapeAdjust)
export function blitSpriteHv(s: Surface, x: number, y: number, t: SpriteTable, i: number, hue: number, value: number): void {
  value = s8(value); // C parameter is Sint8
  const h = u8(hue << 4);
  blitWith(s, x, y, t, i, (_d, v) => h | hvValue(v, value));
}

// port of blit_sprite_hv_blend (JE_newDrawCShapeModify)
export function blitSpriteHvBlend(s: Surface, x: number, y: number, t: SpriteTable, i: number, hue: number, value: number): void {
  value = s8(value); // C parameter is Sint8
  const h = u8(hue << 4);
  blitWith(s, x, y, t, i, (d, v) => h | (((d & 0x0f) + hvValue(v, value)) >> 1));
}

// port of blit_sprite_dark (JE_newDrawCShapeDarken / JE_newDrawCShapeShadow)
export function blitSpriteDark(s: Surface, x: number, y: number, t: SpriteTable, i: number, black: boolean): void {
  blitWith(s, x, y, t, i, (d) => (black ? 0x00 : (d & 0xf0) | ((d & 0x0f) >> 1)));
}
