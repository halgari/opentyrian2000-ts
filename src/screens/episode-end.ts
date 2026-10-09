// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_nextEpisode)
import type { Ctx } from '../ctx';
import { findNextEpisode, initEpisode } from '../game/episodes';
import { fadeBlack, fadePalette } from '../video/fade';
import { SMALL_FONT_SHAPES } from '../video/sprite';
import { dString, fontCenter } from '../video/fonthand';
import { anyButton } from '../video/glow-text';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';
import { playCredits } from './credits';
import { highScoreCheck } from './highscores';


// port of JE_nextEpisode (mainint.c:975); isNetworkGame and constantPlay are never set in the port
export async function nextEpisode(ctx: Ctx): Promise<void> {
  const g = ctx.game;
  const c = g.config;
  const it = g.items;
  const { palette, audio, assets } = ctx;
  const tables = assets.shapes.tables;
  const screen = ctx.vga.screen;

  c.lastLevelName = 'Completed';

  if (it.episodeNum === it.initialEpisodeNum && !c.gameHasRepeated) {
    await highScoreCheck(ctx);
  }

  const newEpisode = findNextEpisode(ctx);

  if (it.jumpBackToEpisode1) {
    if (it.episodeNum > 2) await playCredits(ctx);

    // randomly give player the SuperCarrot
    if (ctx.rng.rand() % 6 === 0) {
      const p0 = g.players[0], p1 = g.players[1];
      p0.items.ship = 2; // SuperCarrot
      p0.items.weapon[0].id = 23; // Banana Blast
      p0.items.weapon[1].id = 24; // Banana Blast Rear

      for (const w of p0.items.weapon) w.power = 1;

      p1.items.weapon[1].id = 24; // Banana Blast Rear

      p0.lastItems.copyFrom(p0.items);
    }
  }

  if (newEpisode !== it.episodeNum) initEpisode(ctx, newEpisode);

  g.varz.gameLoaded = true;
  c.mainLevel = 1; // FIRST_LEVEL
  c.saveLevel = 1;

  audio.playSong(26);

  clearSurface(screen);
  palette.colors.set(palette.palettes[6 - 1]!);

  const name = assets.helpText.episodeName[it.episodeNum]!;
  const prompt = assets.helpText.miscText[5 - 1]!;
  dString(screen, tables, fontCenter(name, tables, SMALL_FONT_SHAPES), 130, name, SMALL_FONT_SHAPES);
  dString(screen, tables, fontCenter(prompt, tables, SMALL_FONT_SHAPES), 185, prompt, SMALL_FONT_SHAPES);

  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 15, 0, 255);

  do {
    await ctx.clock.sleep(16);
  } while (!anyButton(ctx));

  await fadeBlack(ctx, 15);
}
