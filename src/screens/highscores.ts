// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_highScoreScreen)
import { S_CURSOR, S_SPRING } from '../audio/ids';
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { loadCompShapes } from '../data/shapes';
import { SDL_BUTTON_LEFT, SDL_BUTTON_RIGHT } from '../platform/input';
import { Scancode } from '../platform/scancodes';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHvShadow } from '../video/font';
import { FULL_SHADE, textShade } from '../video/fonthand';
import { textState } from '../video/glow-text';
import { MOUSE_POINTER_NORMAL, mouseReplace, mouseStart } from '../video/mouse';
import { blitSprite2x2 } from '../video/sprite2';
import { copySurface, fillRect } from '../video/surface';
import { showVGA } from '../video/video';
import { helpBox } from './help-box';

// port of JE_highScoreScreen (mainint.c:1118)
export async function highScoreScreen(ctx: Ctx): Promise<void> {
  const { vga, palette, assets, audio, input } = ctx;
  const c = ctx.game.config;
  const tables = assets.shapes.tables;
  const { miscText, episodeName, timedBattleName, difficultyNameB } = assets.helpText;
  const screen = vga.screen;
  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(assets.archive, '1'); // need mouse pointer and arrow sprites

  let restart = true;
  let episodeIndex = 0;
  const episodeCount = 8; // five episodes, three timed battles

  const xCenter = 160, yMenuHeader = 3, yEpisodeHeader = 30;
  const xLeftControl = 83, xRightControl = 213, wControl = 24, yControls = 179;

  const drawBoard = (board: number, y0: number): void => {
    for (let i = 0; i < 3; ++i) {
      const y = y0 + 10 * i;
      const entry = c.t2kHighScores[board]![i]!;
      if (entry.difficulty > 9) entry.difficulty = 0;
      const rank = entry.difficulty;
      textShade(screen, tables, 20, y, `~#${i + 1}:~  ${entry.score}`, 15, 0, FULL_SHADE);
      textShade(screen, tables, 110, y, entry.playerName, 15, 2, FULL_SHADE);
      textShade(screen, tables, 250, y, difficultyNameB[rank]!, 15, rank + (rank === 0 ? 0 : -1), FULL_SHADE);
    }
  };

  for (;;) {
    if (restart) {
      loadPic(assets.pics, palette, vga.screen2, 2, false);
      fillRect(vga.screen2, 0, 192, 320, 8, 0);
      drawFontHvShadow(vga.screen2, tables, xCenter, yMenuHeader, miscText[50]!, Font.Large, Align.Centered, 15, -3, false, 2);
    }
    copySurface(screen, vga.screen2);

    let header: string;
    let boardOnePlayer: number, boardTwoPlayer: number;
    if (episodeIndex < 5) {
      header = episodeName[episodeIndex + 1]!;
      boardOnePlayer = 10 + episodeIndex * 2;
      boardTwoPlayer = 11 + episodeIndex * 2;
    } else {
      header = `${timedBattleName[0]} ${timedBattleName[episodeIndex - 4]}`;
      boardOnePlayer = episodeIndex - 5;
      boardTwoPlayer = -1;
    }

    drawFontHvShadow(screen, tables, xCenter, yEpisodeHeader, header, Font.Normal, Align.Centered, 15, -3, false, 2);

    // Draw 1-player scores.
    drawFontHvShadow(screen, tables, xCenter, 55, miscText[46]!, Font.Normal, Align.Centered, 15, -3, false, 2);
    drawBoard(boardOnePlayer, 75);

    // Draw 2-player scores.
    if (boardTwoPlayer >= 0) {
      drawFontHvShadow(screen, tables, xCenter, 120, miscText[47]!, Font.Normal, Align.Centered, 15, -3, false, 2);
      drawBoard(boardTwoPlayer, 135);
    }

    // Draw paging controls.
    const leftControlVisible = episodeIndex > 0;
    const rightControlVisible = episodeIndex < episodeCount - 1;
    if (leftControlVisible) blitSprite2x2(screen, xLeftControl, yControls, ctx.shopSpriteSheet, 279);
    if (rightControlVisible) blitSprite2x2(screen, xRightControl, yControls, ctx.shopSpriteSheet, 281);

    textState(ctx).helpBoxColor = 15;
    helpBox(ctx, screen, 103, 182, miscText[56]!, 25);

    if (restart) {
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;
      await fadePalette(ctx, palette.colors, 10, 0, 255);
      restart = false;
    }

    do {
      input.serviceEvents(true);
      mouseStart(ctx);
      showVGA(ctx);
      mouseReplace(ctx);
      await ctx.clock.sleep(16);
      input.serviceEvents(false);
    } while (!(input.newkey || input.newmouse));

    let leftAction = false, rightAction = false, done = false;

    if (input.newmouse) {
      switch (input.lastmouseBut) {
        case SDL_BUTTON_LEFT:
          if (leftControlVisible && input.mouseY >= yControls && input.mouseX >= xLeftControl && input.mouseX < xLeftControl + wControl) {
            audio.playSample(S_CURSOR);
            leftAction = true;
          } else if (rightControlVisible && input.mouseY >= yControls && input.mouseX >= xRightControl && input.mouseX < xRightControl + wControl) {
            audio.playSample(S_CURSOR);
            rightAction = true;
          }
          break;
        case SDL_BUTTON_RIGHT:
          audio.playSample(S_SPRING);
          done = true;
          break;
      }
    } else if (input.newkey) {
      switch (input.lastkeyScan) {
        case Scancode.Left:
          audio.playSample(S_CURSOR);
          leftAction = true;
          break;
        case Scancode.Right:
          audio.playSample(S_CURSOR);
          rightAction = true;
          break;
        case Scancode.Space:
        case Scancode.Return:
        case Scancode.Escape:
          audio.playSample(S_SPRING);
          done = true;
          break;
      }
    }

    if (leftAction) episodeIndex = episodeIndex === 0 ? episodeCount - 1 : episodeIndex - 1;
    else if (rightAction) episodeIndex = episodeIndex === episodeCount - 1 ? 0 : episodeIndex + 1;

    if (done) {
      await fadeBlack(ctx, 15);
      return;
    }
  }
}
