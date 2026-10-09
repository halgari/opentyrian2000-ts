// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/video.c

// Replaces the 8-bit SDL_Surfaces of video.c (VGAScreen, VGAScreen2, game_screen).
export const VGA_WIDTH = 320;
export const VGA_HEIGHT = 200;

export interface Surface { w: number; h: number; pitch: number; pixels: Uint8Array }

export function createSurface(w = VGA_WIDTH, h = VGA_HEIGHT): Surface {
  return { w, h, pitch: w, pixels: new Uint8Array(w * h) };
}

export function copySurface(dst: Surface, src: Surface): void {
  dst.pixels.set(src.pixels);
}

// port of JE_clr256
export function clearSurface(s: Surface): void {
  s.pixels.fill(0);
}

/** SDL_FillRect semantics: rectangle clipped to the surface; non-positive sizes draw nothing. */
export function fillRect(s: Surface, x: number, y: number, w: number, h: number, color: number): void {
  let x0 = x, y0 = y, x1 = x + w, y1 = y + h;
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 > s.w) x1 = s.w;
  if (y1 > s.h) y1 = s.h;
  if (x1 <= x0 || y1 <= y0) return;
  for (let row = y0; row < y1; row++) s.pixels.fill(color, row * s.pitch + x0, row * s.pitch + x1);
}
