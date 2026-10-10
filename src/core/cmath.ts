// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// C numeric helpers (libm roundf/sinf/cosf, and `unsigned long % int`) with the C's semantics.

/** float32 rounding of a JS double (C: assignment to / arithmetic in `float`). */
export const f32 = Math.fround;

/** C roundf(): round half away from zero. The argument is first reduced to float32. */
export function roundf32(x: number): number {
  const v = Math.fround(x);
  if (!Number.isFinite(v)) return v;
  // |v| + 0.5 is exact in double for every float32 magnitude, so this never double-rounds.
  const r = Math.floor(Math.abs(v) + 0.5);
  return v < 0 ? -r : r;
}

/**
 * C `mt_rand() % m` where mt_rand() is a 64-bit `unsigned long` and m is a signed `int`.
 * A negative m converts to 2^64 + m, which exceeds every 32-bit r, so the result is r itself.
 * m == 0 is undefined behaviour in C; it throws here.
 */
export function rngMod(r: number, m: number): number {
  if (m === 0) throw new Error('rngMod: modulo by zero');
  return m < 0 ? r : r % m;
}

/** C sinf(): float32 of Math.sin (may differ from glibc in the last ulp; see spec §2.4). */
export const sinf = (x: number): number => Math.fround(Math.sin(Math.fround(x)));
/** C cosf(): float32 of Math.cos. */
export const cosf = (x: number): number => Math.fround(Math.cos(Math.fround(x)));
export const atanf = (x: number): number => Math.fround(Math.atan(Math.fround(x)));
