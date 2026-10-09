// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/vga256d.c

import type { Surface } from './surface';
import { fillRect } from './surface';

// port of JE_pix
export function pix(s: Surface, x: number, y: number, c: number): void {
  if (x < s.pitch && y < s.h) {
    const i = y * s.pitch + x;
    if (i >= 0) s.pixels[i] = c;
  }
}

// port of JE_pix3
export function pix3(s: Surface, x: number, y: number, c: number): void {
  pix(s, x, y, c);
  pix(s, x - 1, y, c);
  pix(s, x + 1, y, c);
  pix(s, x, y - 1, c);
  pix(s, x, y + 1, c);
}

// port of JE_rectangle (x1, y1, x2, y2, color)
export function rectangle(s: Surface, a: number, b: number, c: number, d: number, e: number): void {
  if (a < s.pitch && b < s.h && c < s.pitch && d < s.h) {
    const v = s.pixels, p = s.pitch;
    v.fill(e, b * p + a, b * p + a + (c - a + 1));
    v.fill(e, d * p + a, d * p + a + (c - a + 1));
    for (let i = (b + 1) * p + a; i < d * p + a; i += p) v[i] = e;
    for (let i = (b + 1) * p + c; i < d * p + c; i += p) v[i] = e;
  }
}

// port of fill_rectangle_xy
export function fillRectangleXY(s: Surface, x: number, y: number, x2: number, y2: number, color: number): void {
  fillRect(s, x, y, x2 - x + 1, y2 - y + 1, color);
}

// port of fill_rectangle_wh (vga256d.h)
export function fillRectangleWH(s: Surface, x: number, y: number, w: number, h: number, color: number): void {
  fillRect(s, x, y, w, h, color);
}

// port of JE_barShade
export function barShade(s: Surface, a: number, b: number, c: number, d: number): void {
  if (a < s.pitch && b < s.h && c < s.pitch && d < s.h) {
    const v = s.pixels, p = s.pitch, width = c - a + 1;
    for (let i = b * p + a; i <= d * p + a; i += p)
      for (let j = 0; j < width; j++) v[i + j] = ((v[i + j]! & 0x0f) >> 1) | (v[i + j]! & 0xf0);
  }
}

// port of JE_barBright
export function barBright(s: Surface, a: number, b: number, c: number, d: number): void {
  if (a < s.pitch && b < s.h && c < s.pitch && d < s.h) {
    const v = s.pixels, p = s.pitch, width = c - a + 1;
    for (let i = b * p + a; i <= d * p + a; i += p)
      for (let j = 0; j < width; j++) {
        const ah = v[i + j]! & 0xf0;
        let al = (v[i + j]! & 0x0f) + 2;
        if (al > 0x0f) al = 0x0f;
        v[i + j] = al + ah;
      }
  }
}

// port of draw_segmented_gauge
export function drawSegmentedGauge(
  s: Surface, x: number, y: number, color: number,
  segmentWidth: number, segmentHeight: number, segmentValue: number, value: number,
): void {
  const segments = Math.trunc(value / segmentValue);
  const partial = value % segmentValue;
  for (let i = 0; i < segments; ++i) {
    fillRectangleWH(s, x, y, segmentWidth, segmentHeight, color + 12);
    x += segmentWidth + 1;
  }
  if (partial > 0) fillRectangleWH(s, x, y, segmentWidth, segmentHeight, color + Math.trunc((12 * partial) / segmentValue));
}
