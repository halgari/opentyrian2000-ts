// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/varz.c (JE_tyrianHalt)
// The C prints this to the console as JE_tyrianHalt exits the program after NortShip Z is unlocked (varz.c:487-500, opentyr.c:885).
// The page has no exit, so the same text is shown on a screen and the session goes back to the title.
import type { Ctx } from '../ctx';
import { waitInput, waitNoInput } from '../platform/wait';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHvShadow } from '../video/font';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';

/** The text lines of the C's printf (varz.c:487-500), blank lines dropped; trentWinScreen sets each one at its own position and font. */
export const TRENT_LINES: readonly string[] = [
  'Sleep well, Trent, you deserve the rest.',
  'You now have permission to borrow my ship on your next mission.',
  'Also, you might want to try out the YESXMAS parameter in Dos.',
  '  Type: File0001 YESXMAS',
  ' Press a Key to Quit',
];

// port of the trentWin printf of JE_tyrianHalt (varz.c:487-500), drawn on a screen instead of the console
export async function trentWinScreen(ctx: Ctx): Promise<void> {
  const { vga, palette, assets } = ctx;
  const tables = assets.shapes.tables;
  clearSurface(vga.screen);
  palette.colors.set(assets.palettes[0]!);
  drawFontHvShadow(vga.screen, tables, 160, 40, TRENT_LINES[0]!, Font.Normal, Align.Centered, 15, -3, false, 2);
  drawFontHvShadow(vga.screen, tables, 160, 80, TRENT_LINES[1]!, Font.Small, Align.Centered, 15, 0, false, 1);
  drawFontHvShadow(vga.screen, tables, 160, 110, TRENT_LINES[2]!, Font.Small, Align.Centered, 15, 0, false, 1);
  drawFontHvShadow(vga.screen, tables, 160, 124, TRENT_LINES[3]!.trim(), Font.Small, Align.Centered, 15, 0, false, 1);
  drawFontHvShadow(vga.screen, tables, 160, 180, TRENT_LINES[4]!.trim(), Font.Small, Align.Centered, 15, -2, false, 1);
  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 10, 0, 255);
  await waitNoInput(ctx, true, true, false);
  await waitInput(ctx, true, true, false);
  await waitNoInput(ctx, true, true, false);
  await fadeBlack(ctx, 10);
}
