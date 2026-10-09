// SPDX-License-Identifier: GPL-2.0-or-later
// C fixed-width integer semantics.
export const u8 = (x: number): number => x & 0xff;
export const s8 = (x: number): number => (x << 24) >> 24;
export const u16 = (x: number): number => x & 0xffff;
export const s16 = (x: number): number => (x << 16) >> 16;
export const u32 = (x: number): number => x >>> 0;
export const s32 = (x: number): number => x | 0;
/** C integer division (truncates toward zero). */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);
