// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/game_menu.c (JE_itemScreen) -- STUB
import type { Ctx } from '../ctx';

/**
 * JE_itemScreen (game_menu.c:157). STUB until Task 9 replaces this file with the real shop.
 *
 * It does what a player who opens the shop and picks "Next Level" and then the first planet causes, and nothing else:
 *   - play_song(songBuy)                                  (game_menu.c:170)
 *   - gameLoaded = false                                  (game_menu.c:182)
 *   - MENU_PLAY_NEXT_LEVEL select (game_menu.c:2781, also :2929 / :2964 / :3085 for the keyboard/mouse variants):
 *       mainLevel = mapSection[curSelect - 2]  with curSelect == 2 (the cursor starts on the first planet)
 *       jumpSection = true                                (ends the shop loop, `while (!(quit || gameLoaded || jumpSection))`)
 * The real screen also drags in drawing, the scratch globals (temp/temp2/temp3/tempW), mouse globals, the
 * last_items merge into itemAvail and fade_black on load; none of those are reproduced here.
 */
// TODO(task 9): replace with the real JE_itemScreen
export async function itemScreen(ctx: Ctx): Promise<void> {
  const g = ctx.game;
  ctx.audio.playSong(g.varz.songBuy);
  g.varz.gameLoaded = false;
  g.config.mainLevel = g.varz.mapSection[0]!;
  g.varz.jumpSection = true;
}
