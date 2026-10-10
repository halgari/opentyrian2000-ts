// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c
import { u16 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { loadCompShapes } from '../data/shapes';
import { S_CURSOR, S_SELECT, S_SPRING, SONG_TITLE, V_DANGER } from '../platform/audio';
import { SDL_BUTTON_LEFT, SDL_BUTTON_RIGHT } from '../platform/input';
import { Scancode } from '../platform/scancodes';
import { waitDelay } from '../platform/wait';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHv, drawFontHvShadow } from '../video/font';
import { textWidth } from '../video/fonthand';
import { MOUSE_POINTER_NORMAL, mouseReplace, mouseStartFilter } from '../video/mouse';
import { PLANET_SHAPES, blitSprite } from '../video/sprite';
import { copySurface } from '../video/surface';
import { showVGA } from '../video/video';
import { saveConfiguration } from '../game/save';
import { helpSystem } from './help-system';
import { highScoreScreen } from './highscores';
import { loadScreen } from './loadscreen';
import { newGame } from './select';
import { setupMenu } from './setup';
import { newSuperArcadeGame, newSuperTyrianGame, whoa } from './supermodes';

export const SA_DESTRUCT = 10;
export const SA_ENGAGE = 11;

const MENU_ITEM_NEW_GAME = 0, MENU_ITEM_LOAD_GAME = 1, MENU_ITEM_HIGH_SCORES = 2, MENU_ITEM_INSTRUCTIONS = 3,
  MENU_ITEM_SETUP = 4, MENU_ITEM_DEMO = 5, MENU_ITEM_QUIT = 6;

// port of titleScreen (tyrian2.c)
export async function titleScreen(ctx: Ctx): Promise<boolean> {
  const { input, palette, vga, assets, audio } = ctx;
  const tables = assets.shapes.tables;
  const menuText = assets.helpText.menuText;
  const specialName = assets.helpText.specialName;

  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(assets.archive, '1'); // mouse pointer sprites

  let restart = true;
  let selectedIndex = MENU_ITEM_NEW_GAME;
  const specialNameProgress = new Array<number>(SA_ENGAGE).fill(0);
  const xCenter = vga.screen.w / 2;
  const yMenuItems = 104;
  const hMenuItem = 13;
  const wMenuItem = new Array<number>(menuText.length).fill(0);

  for (;;) {
    if (restart) {
      audio.playSong(SONG_TITLE);
      loadPic(assets.pics, palette, vga.screen, 4, false);
      drawFontHvShadow(vga.screen, tables, 2, 192, ctx.state.versionString, Font.Small, Align.Left, 15, 0, false, 1);

      if (ctx.state.moveTyrianLogoUp) {
        copySurface(vga.screen2, vga.screen);
        blitSprite(vga.screen, 11, 62, tables[PLANET_SHAPES]!, 146); // tyrian logo
        blitSprite(vga.screen, 155, 41, tables[PLANET_SHAPES]!, 151); // 2000(tm)
        await fadePalette(ctx, palette.colors, 10, 0, 255 - 16);
        for (let yLogo = 60, y2K = 45; yLogo >= 4; yLogo -= 2, ++y2K) {
          ctx.delay.setDelay(2);
          copySurface(vga.screen, vga.screen2);
          blitSprite(vga.screen, 11, yLogo, tables[PLANET_SHAPES]!, 146);
          blitSprite(vga.screen, 155, y2K, tables[PLANET_SHAPES]!, 151);
          showVGA(ctx);
          await waitDelay(ctx);
        }
        ctx.state.moveTyrianLogoUp = false;
      } else {
        blitSprite(vga.screen, 11, 4, tables[PLANET_SHAPES]!, 146);
        blitSprite(vga.screen, 155, 73, tables[PLANET_SHAPES]!, 151);
        await fadePalette(ctx, palette.colors, 10, 0, 255 - 16);
      }

      for (let i = 0; i < menuText.length; ++i) {
        const text = menuText[i]!;
        wMenuItem[i] = textWidth(text, tables, Font.Normal);
        const x = xCenter - Math.trunc(wMenuItem[i]! / 2);
        const y = yMenuItems + hMenuItem * i;
        drawFontHv(vga.screen, tables, x - 1, y - 1, text, Font.Normal, Align.Left, 15, -10);
        drawFontHv(vga.screen, tables, x + 1, y + 1, text, Font.Normal, Align.Left, 15, -10);
        drawFontHv(vga.screen, tables, x + 1, y - 1, text, Font.Normal, Align.Left, 15, -10);
        drawFontHv(vga.screen, tables, x - 1, y + 1, text, Font.Normal, Align.Left, 15, -10);
        drawFontHv(vga.screen, tables, x, y, text, Font.Normal, Align.Left, 15, -3);
      }

      copySurface(vga.screen2, vga.screen);
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;
      await fadePalette(ctx, palette.colors, 20, 255 - 16 + 1, 255); // fade in menu items
      restart = false;
    }

    copySurface(vga.screen, vga.screen2);
    drawFontHv(vga.screen, tables, vga.screen.w / 2, yMenuItems + hMenuItem * selectedIndex, menuText[selectedIndex]!, Font.Normal, Align.Centered, 15, -1);

    input.serviceEvents(true);
    mouseStartFilter(ctx, 0xf0);
    showVGA(ctx);
    mouseReplace(ctx);

    const idleStartTick = ctx.clock.now();
    let mouseMoved = false;
    do {
      if (ctx.clock.now() - idleStartTick > 30000) { // play demo after idle for 30 seconds
        await fadeBlack(ctx, 15);
        ctx.state.playDemo = true;
        return true;
      }
      await ctx.clock.sleep(16);
      // C stores the old position in Uint16 and compares with the int: negative coordinates
      // always count as "moved". Keep that quirk.
      const oldMouseX = u16(input.mouseX);
      const oldMouseY = u16(input.mouseY);
      ctx.input.pushJoysticksAsKeyboard();
      input.serviceEvents(false);
      mouseMoved = input.mouseX !== oldMouseX || input.mouseY !== oldMouseY;
    } while (!(input.newkey || input.newText || input.newmouse || mouseMoved));

    let action = false;
    let done = false;

    if (mouseMoved || input.newmouse) {
      for (let i = 0; i < menuText.length; ++i) {
        const xMenuItem = xCenter - Math.trunc(wMenuItem[i]! / 2);
        if (input.mouseX >= xMenuItem && input.mouseX < xMenuItem + wMenuItem[i]!) {
          const yMenuItem = yMenuItems + hMenuItem * i;
          if (input.mouseY >= yMenuItem && input.mouseY < yMenuItem + hMenuItem) {
            if (selectedIndex !== i) {
              audio.playSample(S_CURSOR);
              selectedIndex = i;
            }
            if (input.newmouse && input.lastmouseBut === SDL_BUTTON_LEFT &&
                input.lastmouseX >= xMenuItem && input.lastmouseX < xMenuItem + wMenuItem[i]! &&
                input.lastmouseY >= yMenuItem && input.lastmouseY < yMenuItem + hMenuItem) {
              action = true;
            }
            break;
          }
        }
      }
    }

    if (input.newmouse) {
      if (input.lastmouseBut === SDL_BUTTON_RIGHT) {
        audio.playSample(S_SPRING);
        done = true;
      }
    } else if (input.newkey) {
      switch (input.lastkeyScan) {
        case Scancode.Up:
          audio.playSample(S_CURSOR);
          selectedIndex = selectedIndex === 0 ? menuText.length - 1 : selectedIndex - 1;
          break;
        case Scancode.Down:
          audio.playSample(S_CURSOR);
          selectedIndex = selectedIndex === menuText.length - 1 ? 0 : selectedIndex + 1;
          break;
        case Scancode.Space:
        case Scancode.Return:
          action = true;
          break;
        case Scancode.Escape:
          audio.playSample(S_SPRING);
          done = true;
          break;
      }
    }

    if (input.newText) {
      for (const raw of input.lastText) {
        const c = raw.toUpperCase();
        for (let i = 0; i < SA_ENGAGE; i++) {
          const name = specialName[i]!;
          // C: progress >= COUNTOF(specialName[i]) - 1 (= 9) || c != specialName[i][progress]
          if (specialNameProgress[i]! >= 9 || c !== (name[specialNameProgress[i]!] ?? '\0')) {
            specialNameProgress[i] = 0;
            continue;
          }
          specialNameProgress[i]!++;
          if (specialNameProgress[i] === name.length) {
            if (i + 1 === SA_DESTRUCT) {
              await fadeBlack(ctx, 10);
              ctx.state.loadDestruct = true;
              return true;
            } else if (i + 1 === SA_ENGAGE) {
              audio.playSample(V_DANGER);
              await whoa(ctx);
              palette.setColors(0, 0, 0, 0, 255);
              if (await newSuperTyrianGame(ctx)) return true;
              restart = true;
            } else {
              await fadeBlack(ctx, 10);
              if (await newSuperArcadeGame(ctx, i)) return true;
              restart = true;
            }
          }
        }
      }
    }

    if (action) {
      audio.playSample(S_SELECT);
      switch (selectedIndex) {
        case MENU_ITEM_NEW_GAME:
          await fadeBlack(ctx, 15);
          if (await newGame(ctx)) return true;
          restart = true;
          break;
        case MENU_ITEM_LOAD_GAME:
          await fadeBlack(ctx, 15);
          if (await loadScreen(ctx)) return true;
          restart = true;
          break;
        case MENU_ITEM_HIGH_SCORES:
          await fadeBlack(ctx, 15);
          await highScoreScreen(ctx);
          restart = true;
          break;
        case MENU_ITEM_INSTRUCTIONS:
          await fadeBlack(ctx, 15);
          await helpSystem(ctx, 1);
          restart = true;
          break;
        case MENU_ITEM_SETUP:
          await fadeBlack(ctx, 15);
          await setupMenu(ctx);
          saveConfiguration(ctx); // web: the C persists the volumes only in JE_tyrianHalt, which a page never reaches reliably
          restart = true;
          break;
        case MENU_ITEM_DEMO:
          await fadeBlack(ctx, 15);
          ctx.state.playDemo = true;
          return true;
        case MENU_ITEM_QUIT:
          await fadeBlack(ctx, 15);
          return false;
      }
    }

    if (done) {
      await fadeBlack(ctx, 15);
      return false;
    }
  }
}
