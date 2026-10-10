// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_loadScreen)
import { S_CLINK, S_CURSOR, S_SELECT, S_SPRING } from '../audio/ids';
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { loadCompShapes } from '../data/shapes';
import { saveName } from '../game/save';
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
import { operation } from './save-ui';
import { ShopState } from './shop-draw';

// port of JE_loadScreen (mainint.c:628): returns gameLoaded
export async function loadScreen(ctx: Ctx): Promise<boolean> {
  const { vga, palette, assets, audio, input } = ctx;
  const g = ctx.game;
  const c = g.config;
  const tables = assets.shapes.tables;
  const { miscText, miscTextB } = assets.helpText;
  const screen = vga.screen;
  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(assets.archive, '1'); // need mouse pointer and arrow sprites

  let restart = true;
  let playersIndex = 0;
  const menuItemsCount = 12;
  let selectedIndex = 0;

  const xCenter = 160, yMenuHeader = 5, xMenuItem = 10, xMenuItemName = xMenuItem, xMenuItemLastLevel = 120, xMenuItemEpisode = 250;
  const wMenuItem = 300, yMenuItems = 30, dyMenuItems = 13, hMenuItem = 8;
  const xLeftControl = 83, xRightControl = 213, wControl = 24, yControls = 179;

  for (;;) {
    if (restart) {
      loadPic(assets.pics, palette, vga.screen2, 2, false);
      fillRect(vga.screen2, 0, 192, 320, 8, 0);
    }

    // Restore background.
    copySurface(screen, vga.screen2);

    // Draw header.
    drawFontHvShadow(screen, tables, xCenter, yMenuHeader, miscText[38 + playersIndex]!, Font.Large, Align.Centered, 15, -3, false, 2);

    // Draw menu items.
    for (let i = 0; i < menuItemsCount; ++i) {
      const y = yMenuItems + dyMenuItems * i;
      const selected = i === selectedIndex;

      if (i === menuItemsCount - 1) {
        textShade(screen, tables, xMenuItemName, y, miscText[33]!, 13, selected ? 6 : 2, FULL_SHADE);
        continue;
      }

      const saveFile = c.saveFiles[playersIndex * 11 + i]!;
      if (saveFile.level === 0) { // disabled
        textShade(screen, tables, xMenuItemName, y, miscText[2]!, 13, selected ? 6 : 0, FULL_SHADE);
        textShade(screen, tables, xMenuItemLastLevel, y, `${miscTextB[2]} -----`, 5, selected ? 6 : 0, FULL_SHADE);
      } else {
        textShade(screen, tables, xMenuItemName, y, saveName(saveFile), 13, selected ? 6 : 2, FULL_SHADE);
        textShade(screen, tables, xMenuItemLastLevel, y, `${miscTextB[2]} ${saveFile.levelName}`, 5, selected ? 6 : 2, FULL_SHADE);
        textShade(screen, tables, xMenuItemEpisode, y, `${miscTextB[1]} ${saveFile.episode}`, 5, selected ? 6 : 2, FULL_SHADE);
      }
    }

    // Draw paging controls.
    const leftControlVisible = playersIndex > 0;
    const rightControlVisible = playersIndex < 1;
    if (leftControlVisible) blitSprite2x2(screen, xLeftControl, yControls, ctx.shopSpriteSheet, 279);
    if (rightControlVisible) blitSprite2x2(screen, xRightControl, yControls, ctx.shopSpriteSheet, 281);

    textState(ctx).helpBoxColor = 15;
    helpBox(ctx, screen, 103, 182, miscText[55]!, 25);

    if (restart) {
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;
      await fadePalette(ctx, palette.colors, 10, 0, 255);
      restart = false;
    }

    input.serviceEvents(true);
    mouseStart(ctx);
    showVGA(ctx);
    mouseReplace(ctx);

    let mouseMoved = false;
    do {
      await ctx.clock.sleep(16);
      const oldMouseX = input.mouseX & 0xffff;
      const oldMouseY = input.mouseY & 0xffff;
      input.serviceEvents(false);
      mouseMoved = input.mouseX !== oldMouseX || input.mouseY !== oldMouseY;
    } while (!(input.newkey || input.newmouse || mouseMoved));

    // Handle interaction.
    let leftAction = false, rightAction = false, action = false, done = false;

    if (mouseMoved || input.newmouse) {
      if (leftControlVisible && input.mouseY >= yControls && input.mouseX >= xLeftControl && input.mouseX < xLeftControl + wControl) {
        if (input.newmouse && input.lastmouseBut === SDL_BUTTON_LEFT) {
          audio.playSample(S_CURSOR);
          leftAction = true;
        }
      } else if (rightControlVisible && input.mouseY >= yControls && input.mouseX >= xRightControl && input.mouseX < xRightControl + wControl) {
        if (input.newmouse && input.lastmouseBut === SDL_BUTTON_LEFT) {
          audio.playSample(S_CURSOR);
          rightAction = true;
        }
      } else if (input.mouseX >= xMenuItem && input.mouseX < xMenuItem + wMenuItem) {
        // Find menu item that was hovered or clicked.
        for (let i = 0; i < menuItemsCount; ++i) {
          const yMenuItem = yMenuItems + dyMenuItems * i;
          if (input.mouseY >= yMenuItem && input.mouseY < yMenuItem + hMenuItem) {
            if (selectedIndex !== i) {
              audio.playSample(S_CURSOR);
              selectedIndex = i;
            }
            if (input.newmouse && input.lastmouseBut === SDL_BUTTON_LEFT &&
                input.lastmouseX >= xMenuItem && input.lastmouseX < xMenuItem + wMenuItem &&
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
        case Scancode.Left:
          audio.playSample(S_CURSOR);
          leftAction = true;
          break;
        case Scancode.Right:
          audio.playSample(S_CURSOR);
          rightAction = true;
          break;
        case Scancode.Up:
          audio.playSample(S_CURSOR);
          selectedIndex = selectedIndex === 0 ? menuItemsCount - 1 : selectedIndex - 1;
          break;
        case Scancode.Down:
          audio.playSample(S_CURSOR);
          selectedIndex = selectedIndex === menuItemsCount - 1 ? 0 : selectedIndex + 1;
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

    if (leftAction) {
      playersIndex = playersIndex === 0 ? 1 : 0;
    } else if (rightAction) {
      playersIndex = playersIndex === 1 ? 0 : 1;
    } else if (action) {
      if (selectedIndex === menuItemsCount - 1) { // "Exit to Main Menu"
        audio.playSample(S_SELECT);
        done = true;
      } else {
        const saveFileIndex = playersIndex * 11 + selectedIndex;
        if (c.saveFiles[saveFileIndex]!.level === 0) { // "EMPTY SLOT"
          audio.playSample(S_CLINK);
        } else {
          audio.playSample(S_SELECT);

          g.varz.performSave = false;
          await operation(ctx, new ShopState(), saveFileIndex + 1);

          await fadeBlack(ctx, 15);
          return g.varz.gameLoaded;
        }
      }
    }

    if (done) {
      await fadeBlack(ctx, 15);
      return false;
    }
  }
}
