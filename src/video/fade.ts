// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/palette.c
import type { Ctx } from '../ctx';
import { waitDelay } from '../platform/wait';
import { initStepFadePalette, initStepFadeSolid, stepFadePalette } from './palette';
import { showVGA } from './video';

// port of fade_palette
export async function fadePalette(ctx: Ctx, colors: Uint8Array, steps: number, first: number, last: number): Promise<void> {
  const diff = new Int32Array(768);
  initStepFadePalette(ctx.palette, diff, colors, first, last);
  for (; steps > 0; steps--) {
    ctx.delay.setDelay(1);
    stepFadePalette(ctx.palette, diff, steps, first, last);
    showVGA(ctx);
    await waitDelay(ctx);
  }
}

// port of fade_solid
export async function fadeSolid(ctx: Ctx, r: number, g: number, b: number, steps: number, first: number, last: number): Promise<void> {
  const diff = new Int32Array(768);
  initStepFadeSolid(ctx.palette, diff, r, g, b, first, last);
  for (; steps > 0; steps--) {
    ctx.delay.setDelay(1);
    stepFadePalette(ctx.palette, diff, steps, first, last);
    showVGA(ctx);
    await waitDelay(ctx);
  }
}

// port of fade_black / fade_white
export const fadeBlack = (ctx: Ctx, steps: number): Promise<void> => fadeSolid(ctx, 0, 0, 0, steps, 0, 255);
export const fadeWhite = (ctx: Ctx, steps: number): Promise<void> => fadeSolid(ctx, 255, 255, 255, steps, 0, 255);
