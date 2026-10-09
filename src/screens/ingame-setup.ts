// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_doInGameSetup, JE_inGameSetup, JE_inGameHelp)
import { S_CURSOR, S_SELECT, S_SPRING } from '../audio/ids';
import { changeVolume } from '../audio/volume';
import { idiv, u16 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadCompShapes } from '../data/shapes';
import { initProcessorType, setNewGameSpeed } from '../game/config';
import { SDL_BUTTON_LEFT, SDL_BUTTON_RIGHT } from '../platform/input';
import { Scancode } from '../platform/scancodes';
import { Align, Font, drawFontHvShadow } from '../video/font';
import { outText, outTextAdjust, textWidth } from '../video/fonthand';
import { barDrawShadow, textState } from '../video/glow-text';
import { MOUSE_POINTER_NORMAL, mouseReplace, mouseStart } from '../video/mouse';
import { OPTION_SHAPES, TINY_FONT, blitSprite } from '../video/sprite';
import { copySurface } from '../video/surface';
import { barShade, fillRectangleXY } from '../video/vga256d';
import { showVGA } from '../video/video';
import { hBox } from './help-box';

const SC_W = 26; // SDL_SCANCODE_W

export interface InGameSetupHooks {
  /** mouseSetRelative(): pointer lock is a platform concern (Task 6). */
  mouseSetRelative?(relative: boolean): void;
}

// port of JE_doInGameSetup (mainint.c:1389). The network branches are dead (isNetworkGame is always false).
export async function doInGameSetup(ctx: Ctx, hooks: InGameSetupHooks = {}): Promise<void> {
  const v = ctx.game.varz;
  hooks.mouseSetRelative?.(false);

  textState(ctx).haltGame = false;

  if (v.yourInGameMenuRequest) {
    if (await inGameSetup(ctx)) {
      v.reallyEndLevel = true;
      v.playerEndLevel = true;
    }
    v.quitRequested = false;

    ctx.input.keysactive[Scancode.Escape] = 0;
  }

  v.yourInGameMenuRequest = false;

  // skipStarShowVGA = true is commented out in the C; the caller (JE_main) sets it (tyrian2.c:2250)

  hooks.mouseSetRelative?.(true);
}

const MENU_MUSIC_VOLUME = 0, MENU_EFFECTS_VOLUME = 1, MENU_DETAIL_LEVEL = 2, MENU_GAME_SPEED = 3,
  MENU_RETURN_TO_GAME = 4, MENU_QUIT = 5;

// port of JE_inGameSetup (mainint.c:1518). Draws on VGAScreenSeg (ctx.vga.screen) over the frozen frame.
export async function inGameSetup(ctx: Ctx): Promise<boolean> {
  const { input, audio, vga, assets } = ctx;
  const g = ctx.game;
  const c = g.config;
  const screen = vga.screen;
  const tables = assets.shapes.tables;
  const ht = assets.helpText;
  let result = false;

  const helpIndexes = [14, 14, 27, 28, 25, 26];

  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(assets.archive, '1'); // need mouse pointer sprites

  let restart = true;
  const menuItemsCount = ht.inGameText.length;
  let selectedIndex = MENU_MUSIC_VOLUME;

  const yMenuItems = 20, dyMenuItems = 20, xMenuItem = 10;
  const xMenuItemName = xMenuItem, wMenuItemName = 110;
  const xMenuItemValue = xMenuItemName + wMenuItemName, wMenuItemValue = 90;
  const wMenuItem = wMenuItemName + wMenuItemValue, hMenuItem = 13;

  const setVolume = (): void => audio.setVolume(c.tyrMusicVolume, c.fxVolume);

  for (let done = false; !done; ) {
    if (restart) {
      // Main box
      barShade(screen, 3, 13, 217, 137);
      barShade(screen, 5, 15, 215, 135);
      // Help box
      barShade(screen, 3, 143, 257, 157);
      barShade(screen, 5, 145, 255, 155);

      copySurface(vga.screen2, screen);
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;
      restart = false;
    }

    // Restore background.
    copySurface(screen, vga.screen2);

    // Draw menu items.
    for (let i = 0; i < menuItemsCount; ++i) {
      const y = yMenuItems + dyMenuItems * i;
      const selected = i === selectedIndex;
      const value = -4 + (selected ? 2 : 0);

      drawFontHvShadow(screen, tables, xMenuItemName, y, ht.inGameText[i]!, Font.Normal, Align.Left, 15, value, false, 2);

      switch (i) {
        case MENU_MUSIC_VOLUME:
          barDrawShadow(screen, xMenuItemValue, y, 1, audio.musicDisabled ? 12 : 16, idiv(c.tyrMusicVolume + 6, 12), 3, 13);
          break;
        case MENU_EFFECTS_VOLUME:
          barDrawShadow(screen, xMenuItemValue, y, 1, audio.samplesDisabled ? 12 : 16, idiv(c.fxVolume + 6, 12), 3, 13);
          break;
        case MENU_DETAIL_LEVEL:
          drawFontHvShadow(screen, tables, xMenuItemValue, y, ht.detailLevel[c.processorType - 1]!, Font.Normal, Align.Left, 15, value, false, 2);
          break;
        case MENU_GAME_SPEED:
          drawFontHvShadow(screen, tables, xMenuItemValue, y, ht.gameSpeedText[c.gameSpeed - 1]!, Font.Normal, Align.Left, 15, value, false, 2);
          break;
      }
    }

    // Draw help text.
    outTextAdjust(screen, tables, 10, 147, ht.mainMenuHelp[helpIndexes[selectedIndex]!]!, 14, 6, TINY_FONT, true);

    input.serviceEvents(true);

    mouseStart(ctx);
    showVGA(ctx);
    mouseReplace(ctx);

    let mouseMoved = false;
    do {
      await ctx.clock.sleep(16);

      const oldMouseX = u16(input.mouseX);
      const oldMouseY = u16(input.mouseY);

      // push_joysticks_as_keyboard(): no joysticks
      input.serviceEvents(false);

      mouseMoved = input.mouseX !== oldMouseX || input.mouseY !== oldMouseY;
    } while (!(input.newkey || input.newmouse || mouseMoved));

    // Handle interaction.
    let action = false, leftAction = false, rightAction = false;

    if (mouseMoved || input.newmouse) {
      // Find menu item that was hovered or clicked.
      if (input.mouseX >= xMenuItem && input.mouseX < xMenuItem + wMenuItem) {
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
              if (input.lastmouseX >= xMenuItemName && input.lastmouseX < xMenuItemName + wMenuItemName) {
                // Act on menu item via name.
                action = true;
              } else if (input.lastmouseX >= xMenuItemValue && input.lastmouseX < xMenuItemValue + wMenuItemValue) {
                // Act on menu item via value.
                switch (i) {
                  case MENU_MUSIC_VOLUME: {
                    audio.playSample(S_CURSOR);
                    const w = idiv(255 + 6, 12) * (3 + 1) - 1;
                    const value = idiv((input.lastmouseX - xMenuItemValue) * 255, w - 1);
                    c.tyrMusicVolume = Math.min(Math.max(0, value), 255);
                    setVolume();
                    break;
                  }
                  case MENU_EFFECTS_VOLUME: {
                    const w = idiv(255 + 6, 12) * (3 + 1) - 1;
                    const value = idiv((input.lastmouseX - xMenuItemValue) * 255, w - 1);
                    c.fxVolume = Math.min(Math.max(0, value), 255);
                    setVolume();
                    audio.playSample(S_CURSOR);
                    break;
                  }
                  case MENU_DETAIL_LEVEL:
                  case MENU_GAME_SPEED:
                    rightAction = true;
                    break;
                }
              }
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
          selectedIndex = selectedIndex === 0 ? menuItemsCount - 1 : selectedIndex - 1;
          break;
        case Scancode.Down:
          audio.playSample(S_CURSOR);
          selectedIndex = selectedIndex === menuItemsCount - 1 ? 0 : selectedIndex + 1;
          break;
        case Scancode.Left:
          leftAction = true;
          break;
        case Scancode.Right:
          rightAction = true;
          break;
        case Scancode.Space:
        case Scancode.Return:
          action = true;
          break;
        case Scancode.Escape:
          audio.playSample(S_SPRING);
          done = true;
          break;
        case SC_W:
          if (selectedIndex === MENU_DETAIL_LEVEL) {
            c.processorType = 6;
            initProcessorType(ctx);
          }
          break;
      }
    }

    if (action) {
      switch (selectedIndex) {
        case MENU_MUSIC_VOLUME:
          audio.playSample(S_SELECT);
          audio.musicDisabled = !audio.musicDisabled;
          break;
        case MENU_EFFECTS_VOLUME:
          audio.samplesDisabled = !audio.samplesDisabled;
          audio.playSample(S_SELECT);
          break;
        case MENU_RETURN_TO_GAME:
          audio.playSample(S_SELECT);
          done = true;
          break;
        case MENU_QUIT:
          audio.playSample(S_SELECT);
          // constantPlay / isNetworkGame branches are dead
          result = true;
          done = true;
          break;
      }
    } else if (leftAction || rightAction) {
      const dir = leftAction ? -1 : 1;
      switch (selectedIndex) {
        case MENU_MUSIC_VOLUME: {
          audio.playSample(S_CURSOR);
          const r = changeVolume(c.tyrMusicVolume, 12 * dir, c.fxVolume, 0, (n) => audio.playSample(n));
          c.tyrMusicVolume = r.music; c.fxVolume = r.sample;
          setVolume();
          break;
        }
        case MENU_EFFECTS_VOLUME: {
          const r = changeVolume(c.tyrMusicVolume, 0, c.fxVolume, 12 * dir, (n) => audio.playSample(n));
          c.tyrMusicVolume = r.music; c.fxVolume = r.sample;
          setVolume();
          audio.playSample(S_CURSOR);
          break;
        }
        case MENU_DETAIL_LEVEL:
          audio.playSample(S_CURSOR);
          if (leftAction) c.processorType = c.processorType > 1 ? c.processorType - 1 : 4;
          else c.processorType = c.processorType < 4 ? c.processorType + 1 : 1;
          initProcessorType(ctx);
          setNewGameSpeed(ctx);
          break;
        case MENU_GAME_SPEED:
          audio.playSample(S_CURSOR);
          if (leftAction) c.gameSpeed = c.gameSpeed > 1 ? c.gameSpeed - 1 : 5;
          else c.gameSpeed = c.gameSpeed < 5 ? c.gameSpeed + 1 : 1;
          initProcessorType(ctx);
          setNewGameSpeed(ctx);
          break;
      }
    }
  }

  return result;
}

// port of JE_inGameHelp (mainint.c:1920). Draws on VGAScreenSeg (ctx.vga.screen).
export async function inGameHelp(ctx: Ctx): Promise<void> {
  const { input, vga, assets } = ctx;
  const screen = vga.screen;
  const tables = assets.shapes.tables;
  const opt = tables[OPTION_SHAPES]!;
  const ts = textState(ctx);

  // JE_clearKeyboard() and JE_wipeKey() are no-ops

  barShade(screen, 1, 1, 262, 182); /* Main Box */
  barShade(screen, 3, 3, 260, 180);
  barShade(screen, 5, 5, 258, 178);
  barShade(screen, 7, 7, 256, 176);
  fillRectangleXY(screen, 9, 9, 254, 174, 0);

  // TODO(sp5): twoPlayerMode help page (mainint.c:1938-1969)
  if (ctx.game.config.twoPlayerMode) throw new Error('unported: JE_inGameHelp twoPlayerMode (mainint.c:1938)');

  const box = (x: number, y: number, n: number, w: number): void => {
    ts.helpBoxColor = 5;
    ts.helpBoxBrightness = 3;
    hBox(ctx, screen, x, y, n, w);
  };

  // power bar help
  blitSprite(screen, 15, 5, opt, 40);
  box(40, 10, 31, 45);

  // weapon help
  blitSprite(screen, 5, 37, opt, 39);
  box(40, 40, 32, 44);
  box(40, 60, 33, 44);

  // sidekick help
  blitSprite(screen, 5, 98, opt, 41);
  box(40, 103, 34, 44);

  // shield/armor help
  blitSprite(screen, 2, 138, opt, 42);
  box(54, 143, 35, 40);

  // "press a key"
  const pressAKey = assets.helpText.miscText[5 - 1]!;
  blitSprite(screen, 16, 189, opt, 36); // in-game text area
  outText(screen, tables, 120 - idiv(textWidth(pressAKey, tables, TINY_FONT), 2) + 20, 190, pressAKey, 0, 4);

  do {
    input.serviceEvents(true);

    mouseStart(ctx);
    showVGA(ctx);
    mouseReplace(ctx);

    await ctx.clock.sleep(16);

    // push_joysticks_as_keyboard(): no joysticks
    input.serviceEvents(false);
  } while (!(input.newkey || input.newmouse));

  ctx.game.varz.textErase = 1;
}
