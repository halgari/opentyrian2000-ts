// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_highScoreScreen)
import { S_CURSOR, S_SPRING } from '../audio/ids';
import { s32, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { sortHighScores } from '../game/config';
import { totalScore } from '../game/economy';
import { waitDelay, waitInput, waitNoInput } from '../platform/wait';
import { loadPic } from '../data/pic';
import { loadCompShapes } from '../data/shapes';
import { SDL_BUTTON_LEFT, SDL_BUTTON_RIGHT } from '../platform/input';
import { Scancode } from '../platform/scancodes';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHvShadow } from '../video/font';
import { FONT_ASCII, FULL_SHADE, dString, fontCenter, outText, textShade, textWidth } from '../video/fonthand';
import { outTextGlow, textState } from '../video/glow-text';
import { FONT_SHAPES, OPTION_SHAPES, SMALL_FONT_SHAPES, TINY_FONT, blitSprite } from '../video/sprite';
import { barShade, fillRectangleXY } from '../video/vga256d';
import { MOUSE_POINTER_NORMAL, mouseReplace, mouseStart } from '../video/mouse';
import { blitSprite2x2 } from '../video/sprite2';
import { clearSurface, copySurface, fillRect } from '../video/surface';
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

// port of JE_highScoreCheck (mainint.c:2022): the name entry after an episode, once per player in two-player mode
export async function highScoreCheck(ctx: Ctx): Promise<void> {
  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(ctx.assets.archive, '1'); // need mouse pointer sprite
  for (let tempP = 0; tempP < (ctx.game.config.twoPlayerMode ? 2 : 1); ++tempP) await highScoreCheckPlayer(ctx, tempP);
}

/** The body of the C's `for (temp_p ...)` loop. */
async function highScoreCheckPlayer(ctx: Ctx, tempP: number): Promise<void> {
  const { vga, palette, assets, audio, input } = ctx;
  const g = ctx.game;
  const c = g.config;
  const sc = g.scratch;
  const tables = assets.shapes.tables;
  const { miscText, episodeName, timedBattleName } = assets.helpText;
  const screen = vga.screen;

  const timed = c.timedBattleMode;

  sortHighScores(ctx);

  let table = 10 + (g.items.initialEpisodeNum - 1) * 2;
  let tempScore: number; // Sint32 temp_score
  let p = tempP;
  if (timed) {
    // timed battle score is just money
    tempScore = s32(g.players[0].cash);
    table = c.timeBattleSelection - 1;
  } else if (c.twoPlayerMode) {
    // ask for the highest scorer first
    if (g.players[0].cash < g.players[1].cash) p = tempP === 0 ? 1 : 0;
    tempScore = s32(g.players[p]!.cash);
    ++table;
  } else {
    // single player highscore includes cost of upgrades
    tempScore = s32(totalScore(ctx, g.players[0]));
  }

  let slot: number;
  for (slot = 0; slot < 3; ++slot) {
    if (tempScore > c.t2kHighScores[table]![slot]!.score) break;
  }

  // did you get a high score?
  if (slot >= 3) return;

  // shift down old scores
  for (let i = 2; i > slot; --i) {
    const from = c.t2kHighScores[table]![i - 1]!;
    c.t2kHighScores[table]![i] = { score: from.score, playerName: from.playerName, difficulty: from.difficulty };
  }

  await waitNoInput(ctx, false, true, false);

  clearSurface(screen);
  showVGA(ctx);
  palette.colors.set(palette.palettes[0]!);

  if (!timed) audio.playSong(33); // Doesn't play this music

  /* Enter Thy name */
  let flash = 8 * 16 + 10;
  let fadein = true;
  let quit = false, cancel = false;
  const stemp: string[] = new Array<string>(29).fill(' ');

  sc.temp = 0;

  // As astoundingly ugly as this makes the shade below look, this is in fact what Tyrian 2000 does.
  if (timed) loadPic(assets.pics, palette, screen, 13, false);

  barShade(screen, 65, 55, 255, 155);

  do {
    input.serviceEvents(true);

    dString(screen, tables, fontCenter(miscText[51]!, tables, FONT_SHAPES), 3, miscText[51]!, FONT_SHAPES);

    sc.temp3 = c.twoPlayerMode ? 58 + p : 53;

    dString(screen, tables, fontCenter(miscText[sc.temp3 - 1]!, tables, SMALL_FONT_SHAPES), 30, miscText[sc.temp3 - 1]!, SMALL_FONT_SHAPES);

    blitSprite(screen, 50, 50, tables[OPTION_SHAPES]!, 35); // message box

    textShade(screen, tables, 60, 55, c.twoPlayerMode ? `${miscText[48 + p]} ${miscText[53]}` : miscText[53]!, 11, 4, FULL_SHADE);
    textShade(screen, tables, 70, 70, `${miscText[37]} ${tempScore}`, 11, 4, FULL_SHADE);

    do {
      flash = flash === 8 * 16 + 10 ? 8 * 16 + 2 : 8 * 16 + 10;
      sc.temp3 = sc.temp3 === 6 ? 2 : 6;

      const tempstr = stemp.slice(0, sc.temp).join('');
      outText(screen, tables, 65, 89, tempstr, 8, 3);
      sc.tempW = u16(65 + textWidth(tempstr, tables, TINY_FONT));
      barShade(screen, sc.tempW + 2, 90, sc.tempW + 6, 95);
      fillRectangleXY(screen, sc.tempW + 1, 89, sc.tempW + 5, 94, flash);

      for (let i = 0; i < 14; i++) {
        ctx.delay.setDelay(1);

        mouseStart(ctx);
        showVGA(ctx);
        if (fadein) {
          await fadePalette(ctx, palette.colors, 15, 0, 255);
          fadein = false;
        }
        mouseReplace(ctx);

        await waitDelay(ctx);

        if (input.newkey || input.newmouse) break;
      }
    } while (!input.newkey && !input.newmouse && !input.newText);

    if (!audio.playing) audio.playSong(31);

    if (ctx.mouse.button > 0) {
      const mx = g.varz.mouseX, my = g.varz.mouseY;
      if (mx > 56 && mx < 142 && my > 123 && my < 149) {
        quit = true;
      } else if (mx > 151 && mx < 237 && my > 123 && my < 149) {
        quit = true;
        cancel = true;
      }
    } else if (input.newText) {
      for (const ch of input.lastText) {
        const code = ch.charCodeAt(0);
        const cc = code <= 127 ? (ch >= 'a' && ch <= 'z' ? ch.toUpperCase() : ch) : '\0';
        if ((cc === ' ' || FONT_ASCII[cc.charCodeAt(0)] !== -1) && sc.temp < 28) {
          stemp[sc.temp] = cc;
          sc.temp = u8(sc.temp + 1);
        }
      }
    } else if (input.newkey) {
      switch (input.lastkeyScan) {
        case Scancode.Backspace:
        case Scancode.Delete:
          if (sc.temp) {
            sc.temp = u8(sc.temp - 1);
            stemp[sc.temp] = ' ';
          }
          break;
        case Scancode.Escape:
          quit = true;
          cancel = true;
          break;
        case Scancode.Return:
          quit = true;
          break;
        default:
          break;
      }
    }
  } while (!quit);

  const entry = c.t2kHighScores[table]![slot]!;
  if (!cancel || timed) { // Timed Battle mode doesn't allow cancelling, so we ignore it
    entry.score = tempScore;
    entry.playerName = stemp.join('');
    entry.difficulty = c.difficultyLevel;
  }

  await fadeBlack(ctx, 15);
  loadPic(assets.pics, palette, screen, 2, false);

  dString(screen, tables, fontCenter(miscText[50]!, tables, FONT_SHAPES), 10, miscText[50]!, FONT_SHAPES);
  const caption = timed ? timedBattleName[c.timeBattleSelection]! : episodeName[g.items.episodeNum]!;
  dString(screen, tables, fontCenter(caption, tables, SMALL_FONT_SHAPES), 35, caption, SMALL_FONT_SHAPES);

  for (let i = 0; i < 3; ++i) {
    if (i !== slot) {
      const e = c.t2kHighScores[table]![i]!;
      textShade(screen, tables, 20, i * 12 + 65, `~#${i + 1}:~  ${e.score}`, 15, 0, FULL_SHADE);
      textShade(screen, tables, 150, i * 12 + 65, e.playerName, 15, 2, FULL_SHADE);
    }
  }

  showVGA(ctx);

  await fadePalette(ctx, palette.colors, 15, 0, 255);

  const buffer = `~#${slot + 1}:~  ${entry.score}`;

  const ts = textState(ctx);
  c.frameCountMax = 6;
  ts.textGlowFont = TINY_FONT;

  ts.textGlowBrightness = 10;
  await outTextGlow(ctx, screen, 20, slot * 12 + 65, buffer);
  ts.textGlowBrightness = 10;
  await outTextGlow(ctx, screen, 150, slot * 12 + 65, entry.playerName);
  ts.textGlowBrightness = 10;
  await outTextGlow(ctx, screen, fontCenter(miscText[4]!, tables, TINY_FONT), 180, miscText[4]!);

  showVGA(ctx);

  if (c.frameCountMax !== 0) await waitInput(ctx, true, true, true);

  await fadeBlack(ctx, 15);
}
