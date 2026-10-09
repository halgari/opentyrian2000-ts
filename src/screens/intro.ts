// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { fadeBlack, fadePalette, fadeWhite } from '../video/fade';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';
import { waitDelayOrInput } from '../platform/wait';

// port of intro_logos (tyrian2.c)
export async function introLogos(ctx: Ctx): Promise<void> {
  const { palette, vga, assets } = ctx;
  ctx.state.moveTyrianLogoUp = true;

  clearSurface(vga.screen);
  await fadeWhite(ctx, 25);

  loadPic(assets.pics, palette, vga.screen, 10, false);
  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 25, 0, 255);
  ctx.delay.setDelay(200);
  await waitDelayOrInput(ctx);
  await fadeBlack(ctx, 10);

  loadPic(assets.pics, palette, vga.screen, 12, false);
  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 10, 0, 255);
  ctx.delay.setDelay(200);
  await waitDelayOrInput(ctx);
  await fadeBlack(ctx, 10);
}
