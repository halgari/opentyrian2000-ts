// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/sprite.c

import type { Surface } from './surface';
import { VGA_WIDTH } from './surface';

export interface Sprite2Sheet { data: Uint8Array }

type Op = (dst: number, src: number) => number;

function start(sheet: Sprite2Sheet, index: number): number {
  const d = sheet.data;
  return d[(index - 1) * 2]! | (d[(index - 1) * 2 + 1]! << 8);
}

// shared body of blit_sprite2, _blend, _darken, _filter (no left/right clipping)
function blit2(s: Surface, x: number, y: number, sheet: Sprite2Sheet, index: number, op: Op): void {
  const data = sheet.data;
  const px = s.pixels;
  const ul = s.h * s.pitch;
  let p = y * s.pitch + x;
  for (let d = start(sheet, index); data[d] !== 0x0f; ++d) {
    p += data[d]! & 0x0f;                 // second nibble: transparent pixel count
    let count = (data[d]! & 0xf0) >> 4;   // first nibble: opaque pixel count
    if (count === 0) {
      p += VGA_WIDTH - 12;                // move to next pixel row
    } else {
      while (count--) {
        ++d;
        if (p >= ul) return;
        if (p >= 0) px[p] = op(px[p]!, data[d]!);
        ++p;
      }
    }
  }
}

// shared body of blit_sprite2_clip, _filter_clip
function blit2Clip(s: Surface, x: number, y: number, sheet: Sprite2Sheet, index: number, op: Op): void {
  const data = sheet.data;
  for (let d = start(sheet, index); data[d] !== 0x0f; ++d) {
    if (y >= s.h) return;
    const skip = data[d]! & 0x0f;
    let fill = (data[d]! >> 4) & 0x0f;
    x += skip;
    if (fill === 0) {
      y += 1;
      x -= 12;
    } else if (y >= 0) {
      const row = y * s.pitch;
      do {
        ++d;
        if (x >= 0 && x < s.pitch) s.pixels[row + x] = op(s.pixels[row + x]!, data[d]!);
        x += 1;
      } while (--fill);
    } else {
      d += fill;
      x += fill;
    }
  }
}

const plain: Op = (_d, v) => v;
const blend: Op = (d, v) => ((((v & 0x0f) + (d & 0x0f)) >> 1) | (v & 0xf0));
const darken: Op = (d) => ((d & 0x0f) >> 1) + (d & 0xf0);
const filterOp = (filter: number): Op => (_d, v) => filter | (v & 0x0f);

// ports of blit_sprite2, _clip, _blend, _darken, _filter, _filter_clip
export const blitSprite2 = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number): void => blit2(s, x, y, sh, i, plain);
export const blitSprite2Clip = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number): void => blit2Clip(s, x, y, sh, i, plain);
export const blitSprite2Blend = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number): void => blit2(s, x, y, sh, i, blend);
export const blitSprite2Darken = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number): void => blit2(s, x, y, sh, i, darken);
export const blitSprite2Filter = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number, f: number): void => blit2(s, x, y, sh, i, filterOp(f));
export const blitSprite2FilterClip = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number, f: number): void => blit2Clip(s, x, y, sh, i, filterOp(f));

type One = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number) => void;
function quad(one: One): One {
  return (s, x, y, sh, i) => {
    one(s, x, y, sh, i);
    one(s, x + 12, y, sh, i + 1);
    one(s, x, y + 14, sh, i + 19);
    one(s, x + 12, y + 14, sh, i + 20);
  };
}

// ports of blit_sprite2x2, _clip, _blend, _darken, _filter, _filter_clip
export const blitSprite2x2 = quad(blitSprite2);
export const blitSprite2x2Clip = quad(blitSprite2Clip);
export const blitSprite2x2Blend = quad(blitSprite2Blend);
export const blitSprite2x2Darken = quad(blitSprite2Darken);
export const blitSprite2x2Filter = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number, f: number): void =>
  quad((s2, x2, y2, sh2, i2) => blitSprite2Filter(s2, x2, y2, sh2, i2, f))(s, x, y, sh, i);
export const blitSprite2x2FilterClip = (s: Surface, x: number, y: number, sh: Sprite2Sheet, i: number, f: number): void =>
  quad((s2, x2, y2, sh2, i2) => blitSprite2FilterClip(s2, x2, y2, sh2, i2, f))(s, x, y, sh, i);
