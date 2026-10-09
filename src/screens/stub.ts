// SPDX-License-Identifier: GPL-2.0-or-later
// Placeholder screens for features arriving in later sub-projects (not a port).
import type { Ctx } from '../ctx';
import { waitDelayOrInput, waitInput, waitNoInput } from '../platform/wait';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHvShadow } from '../video/font';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';

export async function stubScreen(ctx: Ctx, title: string, subtitle = 'Not yet implemented', autoDismissDelay?: number): Promise<void> {
  const { vga, palette, assets } = ctx;
  const tables = assets.shapes.tables;
  clearSurface(vga.screen);
  palette.colors.set(assets.palettes[0]!);
  drawFontHvShadow(vga.screen, tables, 160, 80, title, Font.Normal, Align.Centered, 15, -3, false, 2);
  drawFontHvShadow(vga.screen, tables, 160, 100, subtitle, Font.Small, Align.Centered, 15, 0, false, 1);
  drawFontHvShadow(vga.screen, tables, 160, 180, 'Press any key', Font.Small, Align.Centered, 15, -2, false, 1);
  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 10, 0, 255);
  if (autoDismissDelay !== undefined) {
    ctx.delay.setDelay(autoDismissDelay);
    await waitDelayOrInput(ctx);
  } else {
    await waitNoInput(ctx, true, true, false);
    await waitInput(ctx, true, true, false);
    await waitNoInput(ctx, true, true, false);
  }
  await fadeBlack(ctx, 10);
}

export function quitScreen(ctx: Ctx): Promise<void> {
  return stubScreen(ctx, 'Thanks for playing!', 'Press any key to return to the title screen');
}
