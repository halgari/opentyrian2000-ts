// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mouse.c
import { u16 } from '../core/int';
import type { Ctx } from '../ctx';
import { blitSprite2x2Clip, blitSprite2x2FilterClip } from './sprite2';

export const MOUSE_POINTER_NORMAL = 0;
export const MOUSE_POINTER_UP = 1;
export const MOUSE_POINTER_DOWN = 2;
export const MOUSE_POINTER_LEFT = 3;
export const MOUSE_POINTER_RIGHT = 4;

interface PointerInfo { index: number; x: number; y: number; w: number; h: number; fx: number; fy: number }
const POINTERS: readonly PointerInfo[] = [
  { index: 273, x: 0, y: 0, w: 11, h: 16, fx: 0, fy: 0 },
  { index: 275, x: 0, y: 0, w: 21, h: 16, fx: 10, fy: 8 },
  { index: 277, x: 0, y: 0, w: 21, h: 16, fx: 10, fy: 7 },
  { index: 279, x: 0, y: 0, w: 16, h: 21, fx: 8, fy: 10 },
  { index: 281, x: 8, y: 0, w: 16, h: 21, fx: 7, fy: 10 },
];

/** `button` is the mouse.c global `mouseButton` as JE_mouseStart(Filter) writes it (mouse.c:121,143); JE_operation reads it. */
export interface MouseCursor { hasMouse: boolean; cursor: number; grabX: number; grabY: number; grab: Uint8Array; button: number }

export function createMouseCursor(): MouseCursor {
  return { hasMouse: true, cursor: MOUSE_POINTER_NORMAL, grabX: 0, grabY: 0, grab: new Uint8Array(24 * 28), button: 0 };
}

// port of JE_grabShapeTypeOne / JE_drawShapeTypeOne
function copyBlock(ctx: Ctx, toScreen: boolean): void {
  const scr = ctx.vga.screen, m = ctx.mouse;
  const limit = scr.h * scr.pitch;
  let s = m.grabY * scr.pitch + m.grabX, p = 0;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 24; x++) {
      if (s >= limit) return;
      if (toScreen) scr.pixels[s] = m.grab[p]!;
      else m.grab[p] = scr.pixels[s]!;
      s++; p++;
    }
    s += scr.pitch - 24;
  }
}

function grabPosition(ctx: Ctx, info: PointerInfo): void {
  const { mouseX, mouseY } = ctx.input;
  ctx.mouse.grabX = u16(Math.min(Math.max(info.fx, mouseX), 320 - (info.w - info.fx)) - info.fx);
  ctx.mouse.grabY = u16(Math.min(Math.max(info.fy, mouseY), 200 - (info.h - info.fy)) - info.fy);
}

// port of JE_mouseStart
export function mouseStart(ctx: Ctx): void {
  if (!ctx.mouse.hasMouse) return;
  ctx.input.serviceEvents(false);
  ctx.mouse.button = ctx.input.mousedown ? ctx.input.lastmouseBut : 0; /* incorrect, possibly unimportant (C comment) */
  const info = POINTERS[ctx.mouse.cursor]!;
  grabPosition(ctx, info);
  copyBlock(ctx, false);
  if (!ctx.input.mouseInactive && ctx.shopSpriteSheet) {
    blitSprite2x2Clip(ctx.vga.screen, ctx.input.mouseX - info.x - info.fx, ctx.input.mouseY - info.y - info.fy, ctx.shopSpriteSheet, info.index);
  }
}

// port of JE_mouseStartFilter
export function mouseStartFilter(ctx: Ctx, filter: number): void {
  if (!ctx.mouse.hasMouse) return;
  ctx.mouse.button = ctx.input.mousedown ? ctx.input.lastmouseBut : 0;
  const info = POINTERS[ctx.mouse.cursor]!;
  grabPosition(ctx, info);
  copyBlock(ctx, false);
  if (!ctx.input.mouseInactive && ctx.shopSpriteSheet) {
    blitSprite2x2FilterClip(ctx.vga.screen, ctx.input.mouseX - info.x - info.fx, ctx.input.mouseY - info.y - info.fy, ctx.shopSpriteSheet, info.index, filter);
  }
}

// port of JE_mouseReplace
export function mouseReplace(ctx: Ctx): void {
  if (ctx.mouse.hasMouse) copyBlock(ctx, true);
}
