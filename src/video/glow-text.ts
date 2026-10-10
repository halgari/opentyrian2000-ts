// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_outCharGlow), src/fonthand.c (JE_updateWarning, JE_outTextGlow),
//   src/tyrian2.c (JE_displayText), src/nortvars.c (JE_barDrawShadow, JE_anyButton)
import { S_WARNING } from '../audio/ids';
import { s8, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { waitDelayPlain } from '../platform/wait';
import { FONT_ASCII, fontCenter, outTextAdjust, textShade, PART_SHADE } from './fonthand';
import type { GameWorld, TextGroup } from '../game/world';
import { blitSpriteDark, blitSpriteHv, TINY_FONT } from './sprite';
import type { Surface } from './surface';
import { barShade, fillRectangleXY, pix } from './vga256d';
import { showVGA } from './video';

/** The per-game text globals live in `ctx.game.text` (world.ts TextGroup); this is the accessor the screens use. */
export const textState = (ctx: { game: GameWorld }): TextGroup => ctx.game.text;

// port of JE_anyButton (nortvars.c:33): clears newkey/newmouse as a side effect (survey 7.3)
export function anyButton(ctx: Ctx): boolean {
  ctx.input.pollJoysticks();
  ctx.input.serviceEvents(true);
  return ctx.input.newkey || ctx.input.mousedown || ctx.input.joydown;
}

// port of JE_updateWarning (fonthand.c:259)
export function updateWarning(ctx: Ctx, screen: Surface): void {
  if (ctx.delay.getDelayTicks2() !== 0) return;
  const v = ctx.game.varz;
  v.warningCol = u8(v.warningCol + v.warningColChange);
  if (v.warningCol > 14 * 16 + 10 || v.warningCol < 14 * 16 + 4) v.warningColChange = s8(-v.warningColChange);
  fillRectangleXY(screen, 0, 0, 319, 5, v.warningCol);
  fillRectangleXY(screen, 0, 194, 319, 199, v.warningCol);
  showVGA(ctx);

  ctx.delay.setDelay2(6);

  if (v.warningSoundDelay > 0) {
    v.warningSoundDelay--;
  } else {
    v.warningSoundDelay = 14;
    ctx.audio.playSample(S_WARNING);
  }
}

// port of JE_outCharGlow (mainint.c:84). ESCPressed is dead in the C (never set) and omitted.
export async function outCharGlow(ctx: Ctx, x: number, y: number, s: string): Promise<void> {
  const ts = textState(ctx);
  const c = ctx.game.config;
  const tables = ctx.assets.shapes.tables;
  const screen = ctx.vga.screen;

  ctx.delay.setDelay2(1);

  const bank = ts.warningRed ? 7 : (ctx.game.varz.useLastBank ? 15 : 14);

  if (s.length === 0) return;

  if (c.frameCountMax === 0) {
    textShade(screen, tables, x, y, s, bank, 0, PART_SHADE);
    showVGA(ctx);
    return;
  }

  const maxloc = s.length;
  const cap = Math.max(60, maxloc); // C arrays hold 60; longer strings are UB there
  const glowcol = new Int8Array(cap).fill(-8);
  const glowcolc = new Int8Array(cap).fill(1);
  const textloc = new Uint16Array(cap);

  let loc = x;
  for (let z = 0; z < maxloc; z++) {
    textloc[z] = loc;
    const id = FONT_ASCII[s.charCodeAt(z) & 0xff]!;
    if (s[z] === ' ') loc += 6;
    else if (id !== -1) loc += tables[TINY_FONT]!.sprites[id]!.width + 1;
  }

  for (loc = 0; loc < maxloc + 28; loc++) {
    ctx.delay.setDelay(c.frameCountMax);

    let id = -1;
    let z: number;
    for (z = loc - 28; z <= loc; z++) {
      if (z >= 0 && z < maxloc) {
        id = FONT_ASCII[s.charCodeAt(z) & 0xff]!;
        if (id !== -1) {
          blitSpriteHv(screen, textloc[z]!, y, tables[TINY_FONT]!, id, bank, glowcol[z]!);
          glowcol[z] = glowcol[z]! + glowcolc[z]!;
          if (glowcol[z]! > 9) glowcolc[z] = -1;
        }
      }
    }
    if (id !== -1 && --z < maxloc) blitSpriteDark(screen, textloc[z]! + 1, y + 1, tables[TINY_FONT]!, id, true);

    if (anyButton(ctx)) c.frameCountMax = 0;

    do {
      if (ts.levelWarningDisplay) updateWarning(ctx, screen);
      await ctx.clock.sleep(16);
    } while (ctx.delay.getDelayTicks() !== 0);

    showVGA(ctx);
  }
}

// port of JE_outTextGlow (fonthand.c:287)
export async function outTextGlow(ctx: Ctx, screen: Surface, x: number, y: number, s: string): Promise<void> {
  const ts = textState(ctx);
  const c = ctx.game.config;
  const tables = ctx.assets.shapes.tables;
  const col = ts.warningRed ? 7 : 15;

  outTextAdjust(screen, tables, x - 1, y, s, 0, -12, ts.textGlowFont, false);
  outTextAdjust(screen, tables, x, y - 1, s, 0, -12, ts.textGlowFont, false);
  outTextAdjust(screen, tables, x + 1, y, s, 0, -12, ts.textGlowFont, false);
  outTextAdjust(screen, tables, x, y + 1, s, 0, -12, ts.textGlowFont, false);

  const step = async (z: number): Promise<void> => {
    ctx.delay.setDelay(c.frameCountMax);
    outTextAdjust(screen, tables, x, y, s, col, z - 10, ts.textGlowFont, false);
    if (anyButton(ctx)) c.frameCountMax = 0;
    showVGA(ctx);
    await waitDelayPlain(ctx);
  };

  if (c.frameCountMax > 0) for (let z = 1; z <= 12; z++) await step(z);
  for (let z = c.frameCountMax === 0 ? 6 : 12; z >= ts.textGlowBrightness; z--) await step(z);
  ts.textGlowBrightness = 6;
}

// port of JE_displayText (tyrian2.c:3832)
export async function displayText(ctx: Ctx): Promise<void> {
  const ts = textState(ctx);
  const c = ctx.game.config;
  const sc = ctx.game.scratch;
  const tables = ctx.assets.shapes.tables;
  const miscText = ctx.assets.helpText.miscText;

  /* Display Warning Text */
  let tempY = 55;
  if (ts.warningRed) tempY = 2;
  for (sc.temp = 0; sc.temp < ts.levelWarningLines; sc.temp = u8(sc.temp + 1)) {
    await outCharGlow(ctx, 10, tempY, ts.levelWarningText[sc.temp] ?? '');
    // Unreachable: haltGame is only set by the network code (no netplay build), so JE_tyrianHalt(5) never runs here.
    if (ts.haltGame) throw new Error('unported: JE_tyrianHalt (tyrian2.c JE_displayText)');
    tempY += 10;
  }
  if (c.frameCountMax !== 0) {
    c.frameCountMax = 6;
    sc.temp = 1;
  } else {
    sc.temp = 0;
  }
  ts.textGlowFont = TINY_FONT;
  sc.tempW = 184;
  if (ts.warningRed) sc.tempW = 7 * 16 + 6;

  await outCharGlow(ctx, fontCenter(miscText[4]!, tables, TINY_FONT), sc.tempW, miscText[4]!);

  do {
    if (ts.levelWarningDisplay) updateWarning(ctx, ctx.vga.screen);
    ctx.delay.setDelay(1);
    await waitDelayPlain(ctx);
  } while (!(anyButton(ctx) || (c.frameCountMax === 0 && sc.temp === 1)));
  ts.levelWarningDisplay = false;
}

// port of JE_barDrawShadow (nortvars.c:63)
export function barDrawShadow(s: Surface, x: number, y: number, res: number, col: number, amt: number, xsize: number, ysize: number): void {
  x = u16(x); y = u16(y); res = u16(res); col = u16(col); amt = u16(amt); xsize = u16(xsize - 1); ysize = u16(ysize - 1);
  for (let z = 1; z <= Math.trunc(amt / res); z++) {
    barShade(s, x + 2, y + 2, x + xsize + 2, y + ysize + 2);
    fillRectangleXY(s, x, y, x + xsize, y + ysize, col + 12);
    fillRectangleXY(s, x, y, x + xsize, y, col + 13);
    pix(s, x, y, col + 15);
    fillRectangleXY(s, x, y + ysize, x + xsize, y + ysize, col + 11);
    x += xsize + 2;
  }
  amt %= res;
  if (amt > 0) {
    barShade(s, x + 2, y + 2, x + xsize + 2, y + ysize + 2);
    fillRectangleXY(s, x, y, x + xsize, y + ysize, col + Math.trunc(12 / res) * amt);
  }
}
