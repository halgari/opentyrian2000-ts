// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/game_menu.c (JE_updateNavScreen, JE_drawNavLines, JE_drawDots, JE_drawPlanet, JE_computeDots,
//   JE_partWay, planetX/planetY)
import { f32, roundf32 } from '../core/cmath';
import { s16, u16, u32, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { OPTION_SHAPES, PLANET_SHAPES, blitSprite, blitSpriteDark, spriteHeight, spriteWidth } from '../video/sprite';
import { fillRectangleXY, pix3, rectangle } from '../video/vga256d';
import { MENU_PLAY_NEXT_LEVEL, type ShopState } from './shop-draw';

export const PLANET_X: readonly number[] = [200, 150, 240, 300, 270, 280, 320, 260, 220, 150, 160, 210, 80, 240, 220, 180, 310, 330, 150, 240, 200];
export const PLANET_Y: readonly number[] = [40, 90, 90, 80, 170, 30, 50, 130, 120, 150, 220, 200, 80, 50, 160, 10, 55, 55, 90, 90, 40];

/** game_menu.c:88-95: the planet-map statics. */
export class NavState {
  planetAni = 0; planetAniWait = 0;        // JE_byte
  currentDotNum = 0; currentDotWait = 0;   // JE_byte
  navX = 0; navY = 0; newNavX = 0; newNavY = 0; // JE_real (float32)
  tempNavX = 0; tempNavY = 0;              // JE_integer
  readonly planetDots = new Uint8Array(5);
  readonly planetDotX = Array.from({ length: 5 }, () => new Int16Array(10));
  readonly planetDotY = Array.from({ length: 5 }, () => new Int16Array(10));
}

// port of JE_partWay (game_menu.c:2310): all C int arithmetic (division truncates toward zero)
export function partWay(start: number, finish: number, dots: number, dist: number): number {
  return s16(Math.trunc((finish - start) / (dots + 2)) * (dist + 1) + start);
}

// port of JE_computeDots (game_menu.c:2282)
export function computeDots(ctx: Ctx, nav: NavState): void {
  const v = ctx.game.varz;
  for (let x = 0; x < v.mapPNum; x++) {
    const p = v.mapPlanet[x]! - 1;
    const o = v.mapOrigin - 1;
    const distX = PLANET_X[p]! - PLANET_X[o]!;
    const distY = PLANET_Y[p]! - PLANET_Y[o]!;
    const tempX = s16(Math.abs(distX) + Math.abs(distY));

    if (tempX !== 0) nav.planetDots[x] = u8(roundf32(f32(Math.sqrt(f32(Math.sqrt(f32(distX * distX + distY * distY)))))) - 1);
    else nav.planetDots[x] = 0;

    if (nav.planetDots[x]! > 10) nav.planetDots[x] = 10;

    for (let y = 0; y < nav.planetDots[x]!; y++) {
      nav.planetDotX[x]![y] = partWay(PLANET_X[o]!, PLANET_X[p]!, nav.planetDots[x]!, y);
      nav.planetDotY[x]![y] = partWay(PLANET_Y[o]!, PLANET_Y[p]!, nav.planetDots[x]!, y);
    }
  }
}

// port of JE_drawNavLines (game_menu.c:2133)
export function drawNavLines(ctx: Ctx, nav: NavState, dark: boolean): void {
  const screen = ctx.vga.screen;
  const tempX2 = nav.tempNavX >> 1;
  const tempY2 = nav.tempNavY >> 1;

  let tempW = 0;
  for (let x = 1; x <= 20; x++) {
    tempW = u16(tempW + 15);
    const tempX = s16(tempW - tempX2);
    if (tempX > 18 && tempX < 135) {
      if (dark) rectangle(screen, tempX + 1, 16, tempX + 1, 169, 1);
      else rectangle(screen, tempX, 16, tempX, 169, 5);
    }
  }

  tempW = 0;
  for (let y = 1; y <= 20; y++) {
    tempW = u16(tempW + 15);
    const tempY = s16(tempW - tempY2);
    if (tempY > 15 && tempY < 169) {
      if (dark) rectangle(screen, 19, tempY + 1, 135, tempY + 1, 1);
      else rectangle(screen, 8, tempY, 160, tempY, 5);

      let tempW2 = 0;
      for (let x = 0; x < 20; x++) {
        tempW2 = u16(tempW2 + 15);
        const tempX = s16(tempW2 - tempX2);
        if (tempX > 18 && tempX < 135) pix3(screen, tempX, tempY, 7);
      }
    }
  }
}

// port of JE_drawDots (game_menu.c:2214)
export function drawDots(ctx: Ctx, s: ShopState, nav: NavState): void {
  const opt = ctx.assets.shapes.tables[OPTION_SHAPES]!;
  for (let x = 0; x < ctx.game.varz.mapPNum; x++) {
    for (let y = 0; y < nav.planetDots[x]!; y++) {
      const tempX = s16(nav.planetDotX[x]![y]! - nav.tempNavX + 66 - 2);
      const tempY = s16(nav.planetDotY[x]![y]! - nav.tempNavY + 85 - 2);
      if (tempX > 0 && tempX < 140 && tempY > 0 && tempY < 168) {
        blitSprite(ctx.vga.screen, tempX, tempY, opt, (x === s.curSel[MENU_PLAY_NEXT_LEVEL]! - 2 && y < nav.currentDotNum) ? 30 : 29); // navigation dots
      }
    }
  }
}

// port of JE_drawPlanet (game_menu.c:2232)
export function drawPlanet(ctx: Ctx, nav: NavState, planetNum: number): void {
  const planets = ctx.assets.shapes.tables[PLANET_SHAPES]!;
  let tempZ = ctx.game.tables.PGR[planetNum]! - 1;
  const w = spriteWidth(planets, tempZ);
  const h = spriteHeight(planets, tempZ);
  const tempX = s16(PLANET_X[planetNum]! + 66 - nav.tempNavX - Math.trunc(w / 2));
  const tempY = s16(PLANET_Y[planetNum]! + 85 - nav.tempNavY - Math.trunc(h / 2));

  if (tempX > -7 && tempX + w < 170 && tempY > 0 && tempY < 160) {
    if (ctx.game.tables.PAni[planetNum]) tempZ += nav.planetAni;

    blitSpriteDark(ctx.vga.screen, tempX + 3, tempY + 3, planets, tempZ, false);
    blitSprite(ctx.vga.screen, tempX, tempY, planets, tempZ); // planets
  }
}

// port of JE_updateNavScreen (game_menu.c:1992)
export function updateNavScreen(ctx: Ctx, s: ShopState, nav: NavState): void {
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const planets = tables[PLANET_SHAPES]!;
  const v = ctx.game.varz;
  const PGR = ctx.game.tables.PGR;
  const sel = s.curSel[MENU_PLAY_NEXT_LEVEL]!;
  const choices = s.menuChoices[MENU_PLAY_NEXT_LEVEL]!;

  nav.tempNavX = s16(roundf32(nav.navX));
  nav.tempNavY = s16(roundf32(nav.navY));
  fillRectangleXY(screen, 19, 16, 135, 169, 2);
  drawNavLines(ctx, nav, true);
  drawNavLines(ctx, nav, false);
  drawDots(ctx, s, nav);

  for (let x = 0; x < 11; x++) drawPlanet(ctx, nav, x);

  for (let x = 0; x < choices - 1; x++) {
    if (v.mapPlanet[x]! > 11) drawPlanet(ctx, nav, v.mapPlanet[x]! - 1);
  }

  if (v.mapOrigin > 11) drawPlanet(ctx, nav, v.mapOrigin - 1);

  blitSprite(screen, 0, 0, tables[OPTION_SHAPES]!, 28); // navigation screen interface

  if (sel < choices) {
    // `unsigned int` offsets: the sums below are unsigned arithmetic, converted to float for the division
    const originGr = PGR[v.mapOrigin - 1]! - 1;
    const destPlanet = v.mapPlanet[sel - 2]! - 1;
    const destGr = PGR[destPlanet]! - 1;
    const originXOff = Math.trunc(spriteWidth(planets, originGr) / 2);
    const originYOff = Math.trunc(spriteHeight(planets, originGr) / 2);
    const destXOff = Math.trunc(spriteWidth(planets, destGr) / 2);
    const destYOff = Math.trunc(spriteHeight(planets, destGr) / 2);

    nav.newNavX = f32(f32(u32(u32(PLANET_X[v.mapOrigin - 1]! - originXOff) + u32(PLANET_X[destPlanet]! - destXOff))) / 2);
    nav.newNavY = f32(f32(u32(u32(PLANET_Y[v.mapOrigin - 1]! - originYOff) + u32(PLANET_Y[destPlanet]! - destYOff))) / 2);
  }

  nav.navX = f32(nav.navX + f32(f32(nav.newNavX - nav.navX) / 2));
  nav.navY = f32(nav.navY + f32(f32(nav.newNavY - nav.navY) / 2));

  if (Math.abs(f32(nav.newNavX - nav.navX)) < 1) nav.navX = nav.newNavX;
  if (Math.abs(f32(nav.newNavY - nav.navY)) < 1) nav.navY = nav.newNavY;

  fillRectangleXY(screen, 314, 0, 319, 199, 230);

  if (nav.planetAniWait > 0) {
    nav.planetAniWait--;
  } else {
    nav.planetAni = u8(nav.planetAni + 1);
    if (nav.planetAni > 14) nav.planetAni = 0;
    nav.planetAniWait = 3;
  }

  if (nav.currentDotWait > 0) {
    nav.currentDotWait--;
  } else {
    if (nav.currentDotNum < nav.planetDots[sel - 2]!) nav.currentDotNum++;
    nav.currentDotWait = 5;
  }
}
