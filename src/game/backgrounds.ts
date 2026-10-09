// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/backgrnd.c (plus the background-1 scroll block of src/tyrian2.c:1286-1303)
import { s8, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import type { Surface } from '../video/surface';
import { MAP1_COLS, MAP2_COLS, MAP3_COLS, STARFIELD_HUE, type MegaData } from './world';

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
// Map memory model (spec 2.5)
//
// `mapYPos` & co. are flat slot indexes into megaDataN.mainmap (C: JE_byte **). A row pointer is
// `row * cols - 1`; blit_background_row reads 12 consecutive slots from `mapYPos + mapXbpPos - 12 + 14*i`,
// so a negative mapXbpPos or a row near the edge spills into the neighbouring row's slots, exactly as the
// C does (a flat array is the same memory).
//
// Out-of-range slots (conclusion of the final review, Important 3). In the C, megaData1/2/3 are separate
// globals (varz.c:211-213) and the slots outside mainmap are other memory, read as `JE_byte *` and then
// dereferenced if non-NULL. In the oracle binary (nm -n -S) the layout is, ascending:
//   <small varz globals: skipStarShowVGA ... demo_file, play_demo, displayTime, flashChange, flash>
//   megaData3 | megaData2 | megaData1 | enemyKilled ...
// each megaData directly abutting the next (sizes are exact multiples of 8). So:
//  - Before megaData3 (slots -13..-2, the case reachable at the layer-3 wrap) lie live scalar globals
//    (levelTimer*, soundQueue, demo_keys*, demo_file, play_demo, ...); several are non-zero while playing
//    (e.g. demo_file is a FILE*, play_demo is 1 in demos), and reading them as pointers would dereference
//    garbage and normally crash. Before megaData2 / megaData1 lie the tail of the previous struct's shape
//    pixel bytes, also non-zero.
//  - After a mainmap lies the same struct's shapes[0] (also pixel data).
// That memory is layout/toolchain dependent (not part of the game's contract) and holds values that vary by
// run state, so it cannot be reproduced deterministically. The demo goldens (all five levels, frame-exact)
// never trigger it. We therefore read NULL and count the reads in MegaData.oobReads, warning once.
// sp4 RISK: if a full-game playthrough logs this warning, that level's C output is undefined behaviour.
// ---------------------------------------------------------------------------------------------

/** Pixel offset of a slot value's tile inside megaData.shapes (megaData1: stride 672; 2/3: 4 + 672, sh at +4). */
function tileBase(layer: number, slot: number): number {
  return layer === 0 ? slot * 672 : slot * 676 + 4;
}

// port of blit_background_row / blit_background_row_blend (backgrnd.c:62, 113). `map` is a flat slot index.
function blitRow(surface: Surface, md: MegaData, layer: number, x: number, y: number, map: number, blend: boolean): void {
  const px = surface.pixels;
  const pitch = surface.pitch;
  const ll = 0;
  const ul = surface.h * pitch;
  let pos = y * pitch + x;
  const mm = md.mainmap;

  for (let row = 0; row < 28; row++) {
    // not drawing on screen yet; skip y
    if (pos + 12 * 24 < ll) { pos += pitch; continue; }

    for (let tile = 0; tile < 12; tile++) {
      const slot = map + tile;
      // Outside the layer's mainmap the C reads other memory as a `JE_byte *` (see the memory-model note
      // above); we read NULL (nothing drawn) and count it so sp4 can see whether any level depends on it.
      let t = -1;
      if (slot >= 0 && slot < mm.length) t = mm[slot]!;
      else if (md.oobReads++ === 0) {
        console.warn(`warning: megaData${layer + 1} mainmap read outside the array (slot ${slot}); the C reads neighbouring memory here, modelled as NULL`);
      }
      if (t === -1) { pos += 24; continue; } // no tile; skip tile

      let d = tileBase(layer, t) + row * 24;
      for (let xx = 24; xx; xx--) {
        if (pos >= ul) return;
        const v = md.shapes[d]!;
        if (pos >= ll && v !== 0) {
          px[pos] = blend ? (v & 0xf0) | (((px[pos]! & 0x0f) + (v & 0x0f)) >> 1) : v;
        }
        pos++;
        d++;
      }
    }
    pos += pitch - 12 * 24;
  }
}

// port of JE_darkenBackground (backgrnd.c:45); superWild only
export function darkenBackground(ctx: Ctx, neat: number): void {
  const surf = ctx.vga.gameScreen; // VGAScreen == game_screen inside the level loop (tyrian2.c:1258)
  const px = surf.pixels;
  let s = 24;
  for (let y = 184; y; y--) {
    for (let x = 264; x; x--) {
      const cur = px[s]!;
      const below = y === 184 ? 0 : px[s - (surf.pitch - 1)]!;
      px[s] = u8((((((cur & 0x0f) << 4) - (cur & 0x0f) + ((((x - neat - y) >> 2) + px[s - 2]! + below) & 0x0f)) >> 4) | (cur & 0xf0)));
      s++;
    }
    s += surf.pitch - 264;
  }
}

// port of draw_background_1 (backgrnd.c:155)
export function drawBackground1(ctx: Ctx, surface: Surface): void {
  const b = ctx.game.backgrounds;
  surface.pixels.fill(0);
  let map = b.mapYPos + b.mapXbpPos - 12;
  for (let i = -1; i < 7; i++) {
    blitRow(surface, ctx.game.map.megaData1, 0, b.mapXPos, i * 28 + b.backPos, map, false);
    map += 14;
  }
}

function advanceBackground2(b: { map2YDelay: number; map2YDelayMax: number; backPos2: number; backMove2: number; mapY2: number; mapY2Pos: number }): void {
  /*Set Movement of background*/
  if (u8(--b.map2YDelay) === 0) {
    b.map2YDelay = b.map2YDelayMax;
    b.backPos2 = u16(b.backPos2 + b.backMove2);
    if (b.backPos2 > 27) {
      b.backPos2 = u16(b.backPos2 - 28);
      b.mapY2 = u16(b.mapY2 - 1);
      b.mapY2Pos -= MAP2_COLS; /*Map Width*/
    }
  }
}

// port of draw_background_2 (backgrnd.c:171)
export function drawBackground2(ctx: Ctx, surface: Surface): void {
  const g = ctx.game;
  const b = g.backgrounds;
  if (b.map2YDelayMax > 1 && b.backMove2 < 2) b.backMove2 = (b.map2YDelay === 1) ? 1 : 0;

  if (g.config.background2) {
    // water effect combines background 1 and 2 by synchronizing the x coordinate
    const water = g.config.smoothies[1]!;
    const x = water ? b.mapXPos : b.mapX2Pos;
    let map = b.mapY2Pos + (water ? b.mapXbpPos : b.mapX2bpPos) - 12;
    for (let i = -1; i < 7; i++) {
      blitRow(surface, g.map.megaData2, 1, x, i * 28 + b.backPos2, map, false);
      map += 14;
    }
  }
  advanceBackground2(b);
}

// port of draw_background_2_blend (backgrnd.c:205)
export function drawBackground2Blend(ctx: Ctx, surface: Surface): void {
  const g = ctx.game;
  const b = g.backgrounds;
  if (b.map2YDelayMax > 1 && b.backMove2 < 2) b.backMove2 = (b.map2YDelay === 1) ? 1 : 0;

  let map = b.mapY2Pos + b.mapX2bpPos - 12;
  for (let i = -1; i < 7; i++) {
    blitRow(surface, g.map.megaData2, 1, b.mapX2Pos, i * 28 + b.backPos2, map, true);
    map += 14;
  }
  advanceBackground2(b);
}

// port of draw_background_3 (backgrnd.c:236)
export function drawBackground3(ctx: Ctx, surface: Surface): void {
  const g = ctx.game;
  const b = g.backgrounds;
  /* Movement of background */
  b.backPos3 = u16(b.backPos3 + b.backMove3);
  if (b.backPos3 > 27) {
    b.backPos3 = u16(b.backPos3 - 28);
    b.mapY3 = u16(b.mapY3 - 1);
    b.mapY3Pos -= MAP3_COLS; /*Map Width*/
  }

  let map = b.mapY3Pos + b.mapX3bpPos - 12;
  for (let i = -1; i < 7; i++) {
    blitRow(surface, g.map.megaData3, 2, b.mapX3Pos, i * 28 + b.backPos3, map, false);
    map += 15;
  }
}

// port of JE_filterScreen (backgrnd.c:257). `col` and `int_` are JE_shortint (-99 = off).
export function filterScreen(ctx: Ctx, col: number, int_: number): void {
  const c = ctx.game.config;
  const surf = ctx.vga.gameScreen; // VGAScreen == game_screen inside the level loop (tyrian2.c:1258)
  if (c.filterFade) {
    c.levelBrightness = s8(c.levelBrightness + c.levelBrightnessChg);
    if ((c.filterFadeStart && c.levelBrightness < -14) || c.levelBrightness > 14) {
      c.levelBrightnessChg = s8(-c.levelBrightnessChg);
      c.filterFadeStart = false;
      c.levelFilter = c.levelFilterNew;
    }
    if (!c.filterFadeStart && c.levelBrightness === 0) {
      c.filterFade = false;
      c.levelBrightness = -99;
    }
  }

  const px = surf.pixels;
  if (col !== -99 && c.filtrationAvail) {
    const hi = s8(col << 4) & 0xff; // col <<= 4 on a shortint, then `col | ...` stored into a byte
    let s = 24;
    for (let y = 184; y; y--) {
      for (let x = 264; x; x--) { px[s] = hi | (px[s]! & 0x0f); s++; }
      s += surf.pitch - 264;
    }
  }

  if (int_ !== -99 && c.explosionTransparent) {
    let s = 24;
    for (let y = 184; y; y--) {
      for (let x = 264; x; x--) {
        const temp = (px[s]! & 0x0f) + int_ >>> 0; // unsigned int arithmetic
        px[s] = (px[s]! & 0xf0) | (temp >= 0x1f ? 0 : (temp >= 0x0f ? 0x0f : temp));
        s++;
      }
      s += surf.pitch - 264;
    }
  }
}

// port of JE_checkSmoothies (backgrnd.c:315)
export function checkSmoothies(ctx: Ctx): void {
  const c = ctx.game.config;
  const sm = c.smoothies;
  const pt = c.processorType;
  ctx.game.backgrounds.anySmoothies =
    (pt > 2 && (sm[0]! || sm[1]!)) || (pt > 1 && (sm[2]! || sm[3]! || sm[4]!));
}

// port of update_and_draw_starfield (backgrnd.c:495)
export function updateAndDrawStarfield(ctx: Ctx, surface: Surface, moveSpeed: number): void {
  const p = surface.pixels;
  const pitch = surface.pitch;
  const stars = ctx.game.backgrounds.starfieldStars;
  for (let i = 100 - 1; i >= 0; --i) {
    const pos = u16(stars.position[i]! + (stars.speed[i]! + moveSpeed) * pitch); // JE_word wraps
    stars.position[i] = pos;
    const color = stars.color[i]!;
    if (pos < 177 * pitch) {
      if (p[pos] === 0) p[pos] = color;
      // If star is bright enough, draw surrounding pixels
      if (color - 4 >= STARFIELD_HUE) {
        const c4 = color - 4;
        if (p[pos + 1] === 0) p[pos + 1] = c4;
        if (pos > 0 && p[pos - 1] === 0) p[pos - 1] = c4;
        if (p[pos + pitch] === 0) p[pos + pitch] = c4;
        if (pos >= pitch && p[pos - pitch] === 0) p[pos - pitch] = c4;
      }
    }
  }
}
