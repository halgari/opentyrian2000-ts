// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/animlib.c (JE_playAnim)
import type { Ctx } from '../ctx';
import { findPage, loadPage, parseAnim, renderFrame, type AnimPage } from '../data/anim';
import { waitDelayPlain } from '../platform/wait';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';

// port of JE_playAnim (animlib.c:105): plays the LPF file `animfile` from the archive; a key press ends it early.
export async function playAnim(ctx: Ctx, animfile: string, startingframe: number, speed: number): Promise<void> {
  const anim = ctx.assets.archive.has(animfile) ? parseAnim(ctx.assets.archive.get(animfile)) : null;
  if (anim === null) return; /* Failed to open or process file */

  // JE_loadAnim: colors = the file palette; set_palette(colors, 0, 255)
  ctx.palette.colors.set(anim.palette);
  ctx.palette.setPalette(ctx.palette.colors, 0, 255);

  /* Blank screen */
  clearSurface(ctx.vga.screen);
  showVGA(ctx);

  // re nRecords-1: the final frame is a delta of the first and is not shown
  let current: AnimPage | null = null;
  for (let i = startingframe; i < anim.nRecords - 1; i++) {
    ctx.delay.setDelay(speed);

    const pageNum = findPage(anim, i);
    if (pageNum === -1) break;
    if (current === null || current.number !== pageNum) { // JE_loadPage skips an already loaded page
      current = loadPage(anim, pageNum);
      if (current === null) break;
    }

    if (!renderFrame(current, i, ctx.vga.screen.pixels)) break;
    showVGA(ctx);

    /* Return early if user presses a key */
    ctx.input.serviceEvents(true);
    if (ctx.input.newkey) break;

    await waitDelayPlain(ctx); // wait_delay
  }
}
