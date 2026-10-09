// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_helpSystem, helpSystemPage)
//
// The help pages: the F1 key in the shop starts at topic 2, the title screen's Instructions at topic 1.
import { S_CURSOR, S_SELECT, S_SPRING, SONG_MAPVIEW } from '../audio/ids';
import { idiv, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadCompShapes } from '../data/shapes';
import { loadPic } from '../data/pic';
import { SDL_BUTTON_LEFT, SDL_BUTTON_RIGHT } from '../platform/input';
import { Scancode } from '../platform/scancodes';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHv, drawFontHvShadow } from '../video/font';
import { textWidth } from '../video/fonthand';
import { textState } from '../video/glow-text';
import { MOUSE_POINTER_LEFT, MOUSE_POINTER_NORMAL, MOUSE_POINTER_RIGHT, mouseReplace, mouseStart } from '../video/mouse';
import { copySurface } from '../video/surface';
import { fillRectangleWH } from '../video/vga256d';
import { showVGA } from '../video/video';
import { hBox } from './help-box';
import type { ShopState } from './shop-draw';

const MAX_PAGE = 8;
const TOPICS = 6;
const TOPIC_START = [0, 1, 2, 3, 7, 255];

// the pages' text boxes: [x, y, helpTxt number, width]
const PAGES: Record<number, number[][]> = {
  1: [[10, 20, 2, 60], [10, 50, 5, 60], [10, 80, 21, 60], [10, 110, 1, 60], [10, 140, 28, 60]],
  2: [[10, 20, 1, 60], [10, 60, 2, 60], [10, 100, 21, 60], [10, 140, 28, 60]],
  3: [[10, 20, 5, 60], [10, 70, 6, 60], [10, 110, 7, 60]],
  4: [[10, 20, 8, 60], [10, 55, 9, 60], [10, 87, 10, 60], [10, 120, 11, 60], [10, 170, 13, 60]],
  5: [[10, 20, 14, 60], [10, 80, 15, 60], [10, 120, 16, 60]],
  6: [[10, 20, 17, 60], [10, 40, 18, 60], [10, 130, 20, 60]],
  7: [[10, 20, 21, 60], [10, 70, 22, 60], [10, 110, 23, 60], [10, 140, 24, 60]],
  8: [[10, 20, 25, 60], [10, 60, 26, 60], [10, 100, 27, 60], [10, 140, 28, 60], [10, 170, 29, 60]],
};

// port of JE_helpSystem (mainint.c:191)
export async function helpSystem(ctx: Ctx, startTopic: number): Promise<void> {
  const { input, audio, vga, palette, assets } = ctx;
  const screen = vga.screen;
  const tables = assets.shapes.tables;
  const topicName = assets.helpText.topicName;

  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(assets.archive, '1'); // need mouse pointer sprites

  const st = { topic: startTopic, restart: true };

  const menuItemsCount = TOPICS - 1;
  let selectedIndex = 0;

  const xCenter = 320 / 2;
  const yMenuHeader = 30;
  const yMenuItems = 60;
  const dyMenuItems = 20;
  const hMenuItem = 13;
  const wMenuItem: number[] = new Array<number>(menuItemsCount).fill(0);

  for (;;) {
    if (st.restart) {
      audio.playSong(SONG_MAPVIEW);

      loadPic(assets.pics, palette, vga.screen2, 2, false);
    }

    if (st.topic > 1) {
      if (!(await helpSystemPage(ctx, st))) return;

      selectedIndex = st.topic - 1;
      st.topic = 1;
      continue;
    }

    // Restore background.
    copySurface(screen, vga.screen2);

    // Draw header.
    drawFontHvShadow(screen, tables, xCenter, yMenuHeader, topicName[0]!, Font.Large, Align.Centered, 15, -3, false, 2);

    // Draw menu items.
    for (let i = 0; i < menuItemsCount; ++i) {
      const text = topicName[i + 1]!;

      wMenuItem[i] = textWidth(text, tables, Font.Normal);
      const y = yMenuItems + dyMenuItems * i;

      const selected = i === selectedIndex;

      drawFontHvShadow(screen, tables, xCenter, y, text, Font.Normal, Align.Centered, 15, -3 + (selected ? 2 : 0), false, 2);
    }

    ctx.mouse.cursor = MOUSE_POINTER_NORMAL;

    if (st.restart) {
      await fadePalette(ctx, palette.colors, 10, 0, 255);

      st.restart = false;
    }

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

    let action = false;
    let done = false;

    if (mouseMoved || input.newmouse) {
      // Find menu item that was hovered or clicked.
      for (let i = 0; i < menuItemsCount; ++i) {
        const xMenuItem = xCenter - idiv(wMenuItem[i]!, 2);
        if (input.mouseX >= xMenuItem && input.mouseX < xMenuItem + wMenuItem[i]!) {
          const yMenuItem = yMenuItems + dyMenuItems * i;
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

    if (action) {
      audio.playSample(S_SELECT);

      st.topic = selectedIndex + 2;

      if (selectedIndex === menuItemsCount - 1) done = true;
    }

    if (done) {
      await fadeBlack(ctx, 15);

      return;
    }
  }
}

// port of helpSystemPage (mainint.c:381). Returns false when the player left the help system.
async function helpSystemPage(ctx: Ctx, st: { topic: number; restart: boolean }): Promise<boolean> {
  const { input, audio, vga, palette, assets } = ctx;
  const screen = vga.screen;
  const tables = assets.shapes.tables;
  const ht = assets.helpText;
  const ts = textState(ctx);

  let page = TOPIC_START[st.topic - 1]!;

  const xCenter = 320 / 2;

  for (;;) {
    if (page === 0) {
      st.topic = 1;
      return true;
    } else if (page > MAX_PAGE) {
      st.topic = TOPICS - 1;
      return true;
    }

    for (let temp = 0; temp < TOPICS; ++temp) {
      if (TOPIC_START[temp]! <= page) st.topic = temp + 1;
      else break;
    }

    // Restore background.
    copySurface(screen, vga.screen2);

    fillRectangleWH(screen, 0, 192, 320, 8, 0);

    const text = ht.topicName[st.topic - 1]!;

    // Draw header.
    drawFontHvShadow(screen, tables, xCenter, 1, text, Font.Normal, Align.Centered, 15, -3, false, 2);

    // Draw footer.
    drawFontHv(screen, tables, 10, 192, `${ht.miscText[24]!} ${page - TOPIC_START[st.topic - 1]! + 1}`, Font.Small, Align.Left, 13, 5);
    drawFontHv(screen, tables, 320 - 10, 192, `${ht.miscText[25]!} ${page} of ${MAX_PAGE}`, Font.Small, Align.Right, 13, 5);

    // Draw text.
    ts.helpBoxBrightness = 3;
    ts.verticalHeight = 8;

    for (const [x, y, n, w] of PAGES[page] ?? []) hBox(ctx, screen, x!, y!, n!, w!);

    ts.helpBoxBrightness = 1;
    ts.verticalHeight = 7;

    if (st.restart) {
      await fadePalette(ctx, palette.colors, 10, 0, 255);

      st.restart = false;
    }

    do {
      ctx.mouse.cursor = input.mouseX < xCenter ? MOUSE_POINTER_LEFT : MOUSE_POINTER_RIGHT;

      input.serviceEvents(true);

      mouseStart(ctx);
      showVGA(ctx);
      mouseReplace(ctx);

      await ctx.clock.sleep(16);

      // push_joysticks_as_keyboard(): no joysticks
      input.serviceEvents(false);
    } while (!(input.newkey || input.newmouse));

    // Handle interaction.

    let done = false;

    if (input.newmouse) {
      switch (input.lastmouseBut) {
        case SDL_BUTTON_LEFT:
          audio.playSample(S_CURSOR);

          if (input.mouseX < xCenter) page = u8(page - 1);
          else page = u8(page + 1);
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

          page = u8(page - 1);
          break;
        case Scancode.Right:
        case Scancode.Space:
        case Scancode.Return:
          audio.playSample(S_CURSOR);

          page = u8(page + 1);
          break;
        case Scancode.Escape:
          audio.playSample(S_SPRING);

          done = true;
          break;
      }
    }

    if (done) {
      await fadeBlack(ctx, 15);

      return false;
    }
  }
}

/** The F1 key of the shop (game_menu.c:1316-1345; isNetworkGame is never set). */
export async function shopHelp(ctx: Ctx, s: ShopState): Promise<void> {
  const { vga, palette, assets } = ctx;
  await fadeBlack(ctx, 10);
  await helpSystem(ctx, 2);

  ctx.audio.playSong(ctx.game.varz.songBuy);

  loadPic(assets.pics, palette, vga.screen, 1, false);
  s.newPal = 1;

  switch (s.curMenu) {
    case 3:
      s.newPal = 18;
      break;
    case 7:
    case 8:
      break;
  }

  copySurface(vga.screen2, vga.screen);

  s.curPal = s.newPal;
  palette.colors.set(palette.palettes[s.newPal - 1]!);
  showVGA(ctx);
  s.newPal = 0;
  s.backFromHelp = true;
}
