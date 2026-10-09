// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/opentyr.c (setupMenu)
//
// Web-lite: the Graphics (display, scaler, scaling mode), Jukebox and Destruct entries are not ported (the canvas scaling is the
// page's business). Setup keeps Sound... (music and sound volume, on/off toggles) and Done, laid out like the C menu.
import { S_CLICK, S_CURSOR, S_SELECT, S_SPRING } from '../audio/ids';
import { idiv } from '../core/int';
import { changeVolume } from '../audio/volume';
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { loadCompShapes } from '../data/shapes';
import { SDL_BUTTON_LEFT, SDL_BUTTON_RIGHT } from '../platform/input';
import { Scancode } from '../platform/scancodes';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHvShadow } from '../video/font';
import { PART_SHADE, textShade } from '../video/fonthand';
import { barDrawShadow } from '../video/glow-text';
import { MOUSE_POINTER_NORMAL, mouseReplace, mouseStart } from '../video/mouse';
import { copySurface, fillRect } from '../video/surface';
import { rectangle } from '../video/vga256d';
import { showVGA } from '../video/video';

const enum Item { Done, Sound, MusicVolume, SoundVolume }
const enum MenuId { None, Setup, Sound }

interface MenuItem { id: Item; name: string; description: string }
interface Menu { header: string; items: MenuItem[] }

const MENUS: Record<number, Menu> = {
  [MenuId.Setup]: {
    header: 'Setup',
    items: [
      { id: Item.Sound, name: 'Sound...', description: 'Change the sound settings.' },
      { id: Item.Done, name: 'Done', description: 'Return to the main menu.' },
    ],
  },
  [MenuId.Sound]: {
    header: 'Sound',
    items: [
      { id: Item.MusicVolume, name: 'Music Volume', description: 'Change volume with the left/right arrow keys.' },
      { id: Item.SoundVolume, name: 'Sound Volume', description: 'Change volume with the left/right arrow keys.' },
      { id: Item.Done, name: 'Done', description: 'Return to the previous menu.' },
    ],
  },
};

// port of setupMenu (opentyr.c:100), web-lite
export async function setupMenu(ctx: Ctx): Promise<void> {
  const { vga, palette, assets, audio, input } = ctx;
  const c = ctx.game.config;
  const tables = assets.shapes.tables;
  const screen = vga.screen;
  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(assets.archive, '1'); // need mouse pointer sprites

  let restart = true;
  const menuParents: number[] = [MenuId.None, MenuId.None, MenuId.None];
  const selectedIndexes: number[] = [0, 0, 0];
  let currentMenu: number = MenuId.Setup;

  const xCenter = 160, yMenuHeader = 4, xMenuItem = 45, xMenuItemName = xMenuItem, wMenuItemName = 135;
  const xMenuItemValue = xMenuItemName + wMenuItemName, wMenuItemValue = 95, wMenuItem = wMenuItemName + wMenuItemValue;
  const yMenuItems = 37, dyMenuItems = 21, hMenuItem = 13;

  const setVolume = (): void => audio.setVolume(c.tyrMusicVolume, c.fxVolume);

  for (;;) {
    if (restart) {
      loadPic(assets.pics, palette, vga.screen2, 2, false);
      fillRect(vga.screen2, 0, 192, 320, 8, 0);
    }
    copySurface(screen, vga.screen2); // restore background

    const menu = MENUS[currentMenu]!;
    drawFontHvShadow(screen, tables, xCenter, yMenuHeader, menu.header, Font.Large, Align.Centered, 15, -3, false, 2);

    const items = menu.items;
    const menuItemsCount = items.length;
    const sel = selectedIndexes[currentMenu]!;

    for (let i = 0; i < menuItemsCount; ++i) {
      const y = yMenuItems + dyMenuItems * i;
      const selected = i === sel;
      drawFontHvShadow(screen, tables, xMenuItemName, y, items[i]!.name, Font.Normal, Align.Left, 15, -3 + (selected ? 2 : 0), false, 2);

      switch (items[i]!.id) {
        case Item.MusicVolume:
          barDrawShadow(screen, xMenuItemValue, y, 1, audio.musicDisabled ? 170 : 174, idiv(c.tyrMusicVolume + 4, 8), 2, 10);
          rectangle(screen, xMenuItemValue - 2, y - 2, xMenuItemValue + 96, y + 11, 242);
          break;
        case Item.SoundVolume:
          barDrawShadow(screen, xMenuItemValue, y, 1, audio.samplesDisabled ? 170 : 174, idiv(c.fxVolume + 4, 8), 2, 10);
          rectangle(screen, xMenuItemValue - 2, y - 2, xMenuItemValue + 96, y + 11, 242);
          break;
      }
    }

    // Draw status text.
    textShade(screen, tables, xMenuItemName, 190, items[sel]!.description, 15, 4, PART_SHADE);

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

    let action = false;

    if (mouseMoved || input.newmouse) {
      // Find menu item name or value that was hovered or clicked.
      if (input.mouseX >= xMenuItem && input.mouseX < xMenuItem + wMenuItem) {
        for (let i = 0; i < menuItemsCount; ++i) {
          const yMenuItem = yMenuItems + dyMenuItems * i;
          if (input.mouseY >= yMenuItem && input.mouseY < yMenuItem + hMenuItem) {
            if (selectedIndexes[currentMenu] !== i) {
              audio.playSample(S_CURSOR);
              selectedIndexes[currentMenu] = i;
            }
            if (input.newmouse && input.lastmouseBut === SDL_BUTTON_LEFT && input.lastmouseY >= yMenuItem && input.lastmouseY < yMenuItem + hMenuItem) {
              if (input.lastmouseX >= xMenuItemName && input.lastmouseX < xMenuItemName + wMenuItemName) {
                action = true; // act on the menu item via its name
              } else if (input.lastmouseX >= xMenuItemValue && input.lastmouseX < xMenuItemValue + wMenuItemValue) {
                const value = Math.min(Math.max(0, idiv((input.lastmouseX - xMenuItemValue) * 255, wMenuItemValue - 1)), 255);
                switch (items[i]!.id) {
                  case Item.MusicVolume:
                    audio.playSample(S_CURSOR);
                    c.tyrMusicVolume = value;
                    setVolume();
                    break;
                  case Item.SoundVolume:
                    c.fxVolume = value;
                    setVolume();
                    audio.playSample(S_CURSOR);
                    break;
                }
              }
            }
            break;
          }
        }
      }
    }

    const selectedId = items[selectedIndexes[currentMenu]!]!.id;
    const nudge = (musicDelta: number, fxDelta: number): void => {
      const r = changeVolume(c.tyrMusicVolume, musicDelta, c.fxVolume, fxDelta, (n) => audio.playSample(n));
      c.tyrMusicVolume = r.music;
      c.fxVolume = r.sample;
      setVolume();
    };

    if (input.newmouse) {
      if (input.lastmouseBut === SDL_BUTTON_RIGHT) {
        audio.playSample(S_SPRING);
        currentMenu = menuParents[currentMenu]!;
      }
    } else if (input.newkey) {
      switch (input.lastkeyScan) {
        case Scancode.Up:
          audio.playSample(S_CURSOR);
          selectedIndexes[currentMenu] = selectedIndexes[currentMenu] === 0 ? menuItemsCount - 1 : selectedIndexes[currentMenu]! - 1;
          break;
        case Scancode.Down:
          audio.playSample(S_CURSOR);
          selectedIndexes[currentMenu] = selectedIndexes[currentMenu] === menuItemsCount - 1 ? 0 : selectedIndexes[currentMenu]! + 1;
          break;
        case Scancode.Left:
        case Scancode.Right: {
          const dir = input.lastkeyScan === Scancode.Left ? -8 : 8;
          if (selectedId === Item.MusicVolume) {
            audio.playSample(S_CURSOR);
            nudge(dir, 0);
          } else if (selectedId === Item.SoundVolume) {
            nudge(0, dir);
            audio.playSample(S_CURSOR);
          }
          break;
        }
        case Scancode.Space:
        case Scancode.Return:
          action = true;
          break;
        case Scancode.Escape:
          audio.playSample(S_SPRING);
          currentMenu = menuParents[currentMenu]!;
          break;
      }
    }

    if (action) {
      switch (selectedId) {
        case Item.Done:
          audio.playSample(S_SELECT);
          currentMenu = menuParents[currentMenu]!;
          break;
        case Item.Sound:
          audio.playSample(S_SELECT);
          menuParents[MenuId.Sound] = currentMenu;
          currentMenu = MenuId.Sound;
          selectedIndexes[currentMenu] = 0;
          break;
        case Item.MusicVolume:
          audio.playSample(S_CLICK);
          audio.musicDisabled = !audio.musicDisabled;
          if (!audio.musicDisabled) audio.restartSong();
          break;
        case Item.SoundVolume:
          audio.samplesDisabled = !audio.samplesDisabled;
          audio.playSample(S_CLICK);
          break;
      }
    }

    if (currentMenu === MenuId.None) {
      await fadeBlack(ctx, 10);
      return;
    }
  }
}
