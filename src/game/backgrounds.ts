// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/backgrnd.c (plus the background-1 scroll block of src/tyrian2.c:1286-1303)
import type { Ctx } from '../ctx';
import type { Surface } from '../video/surface';
import { MAP1_COLS, STARFIELD_HUE } from './world';

// port of initialize_starfield (backgrnd.c:481)
//
// 4 draws per star (x, y, speed, color) = 400 per call; the oracle state confirms it: mtCalls goes 175 -> 575
// across level start. (The survey and plan say 300; that undercounts, position takes two draws.)
//
// Evaluation order of `mt_rand() % 320 + mt_rand() % 200 * VGAScreen->pitch` (survey 4.1): C leaves the two
// calls unsequenced. The oracle is built with gcc -O2 (reference/oracle/Makefile); a probe compiled with
// gcc -O2 and with -O0 evaluates the LEFT operand first, so the order is %320 (x), then %200 (y).
// Confirmed against oracle pixels (demo-4, frames 218 and 240; demo-1/2/3/5 hide the stars behind opaque ground):
// x-then-y predicts 70 of 70 star pixels (hue 0x9_) after the scroll offset, y-then-x predicts ~1 of 72.
export function initializeStarfield(ctx: Ctx): void {
  const { rng } = ctx;
  const pitch = ctx.vga.screen.pitch; // VGAScreen is VGAScreenSeg when called from JE_main
  const stars = ctx.game.backgrounds.starfieldStars;
  for (let i = 100 - 1; i >= 0; --i) {
    const x = rng.rand() % 320;
    const y = rng.rand() % 200;
    stars.position[i] = x + y * pitch; // JE_word position
    stars.speed[i] = rng.rand() % 3 + 2;
    stars.color[i] = rng.rand() % 16 + STARFIELD_HUE;
  }
}

// Scroll block of JE_main (tyrian2.c:1286-1303): background 1 advances once per map1YDelay ticks.
// Implemented in task 4 because curLoc drives event timing; task 5 owns this file now.
export function advanceBackgrounds(ctx: Ctx): void {
  const b = ctx.game.backgrounds;
  const e = ctx.game.events;
  if (--b.map1YDelay === 0) {
    b.map1YDelay = b.map1YDelayMax;

    e.curLoc = (e.curLoc + b.backMove) & 0xffff;
    b.backPos = (b.backPos + b.backMove) & 0xffff;

    if (b.backPos > 27) {
      b.backPos = (b.backPos - 28) & 0xffff;
      b.mapY = (b.mapY - 1) & 0xffff;
      b.mapYPos -= MAP1_COLS; // Map Width
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Stub slots of the level loop (task 5 owns the bodies)
// ---------------------------------------------------------------------------------------------

// STUB(task 5): JE_checkSmoothies (backgrnd.c:315); sets anySmoothies
export function checkSmoothies(_ctx: Ctx): void {}

// STUB(task 5): draw_background_1 (backgrnd.c:155); clears the surface to 0, then draws the 8 tile rows
export function drawBackground1(_ctx: Ctx, _surface: Surface): void {}

// STUB(task 5): draw_background_2 (backgrnd.c)
export function drawBackground2(_ctx: Ctx, _surface: Surface): void {}

// STUB(task 5): draw_background_2_blend (backgrnd.c); only reached when `wild`, which level.ts rejects
export function drawBackground2Blend(_ctx: Ctx, _surface: Surface): void {}

// STUB(task 5): JE_darkenBackground (backgrnd.c:45); superWild only
export function darkenBackground(_ctx: Ctx, _neat: number): void {}

// STUB(task 5): draw_background_3 (backgrnd.c)
export function drawBackground3(_ctx: Ctx, _surface: Surface): void {}

// STUB(task 5): update_and_draw_starfield (backgrnd.c:495)
export function updateAndDrawStarfield(_ctx: Ctx, _surface: Surface, _moveSpeed: number): void {}

// STUB(task 5): JE_filterScreen (backgrnd.c:257)
export function filterScreen(_ctx: Ctx, _light: number, _brightness: number): void {}
