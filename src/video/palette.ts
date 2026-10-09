// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/palette.c

export class PaletteState {
  readonly current = new Uint8Array(768); // C: static Palette palette
  readonly colors = new Uint8Array(768);  // C: Palette colors
  version = 0;

  constructor(readonly palettes: Uint8Array[]) {}

  // port of set_palette
  setPalette(src: Uint8Array, first: number, last: number): void {
    this.current.set(src.subarray(first * 3, (last + 1) * 3), first * 3);
    this.version++;
  }

  // port of set_colors
  setColors(r: number, g: number, b: number, first: number, last: number): void {
    for (let i = first; i <= last; i++) {
      this.current[i * 3] = r;
      this.current[i * 3 + 1] = g;
      this.current[i * 3 + 2] = b;
    }
    this.version++;
  }
}

// port of init_step_fade_palette
export function initStepFadePalette(ps: PaletteState, diff: Int32Array, colors: Uint8Array, first: number, last: number): void {
  for (let i = first * 3; i < (last + 1) * 3; i++) diff[i] = colors[i]! - ps.current[i]!;
}

// port of init_step_fade_solid
export function initStepFadeSolid(ps: PaletteState, diff: Int32Array, r: number, g: number, b: number, first: number, last: number): void {
  for (let i = first; i <= last; i++) {
    diff[i * 3] = r - ps.current[i * 3]!;
    diff[i * 3 + 1] = g - ps.current[i * 3 + 1]!;
    diff[i * 3 + 2] = b - ps.current[i * 3 + 2]!;
  }
}

// port of step_fade_palette
export function stepFadePalette(ps: PaletteState, diff: Int32Array, steps: number, first: number, last: number): void {
  if (steps <= 0) throw new Error('stepFadePalette: steps must be > 0');
  for (let i = first * 3; i < (last + 1) * 3; i++) {
    const delta = Math.trunc(diff[i]! / steps);
    diff[i] = diff[i]! - delta;
    ps.current[i] = ps.current[i]! + delta; // Uint8 wraps like the C
  }
  ps.version++;
}
