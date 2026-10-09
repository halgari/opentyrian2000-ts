// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_operation), src/game_menu.c (JE_saveRequest, the LOAD_SAVE parts of JE_itemScreen and
//   JE_menuFunction, the Alt+S / Alt+L quick save and load)
//
// The save/load screen of the shop: slot list, name entry, the save confirmation dialog.
import { S_CLICK, S_CURSOR, S_SELECT, S_SPRING } from '../audio/ids';
import { idiv, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadGame, saveGame, saveName } from '../game/save';
import { Scancode } from '../platform/scancodes';
import { waitDelay, waitDelayPlain, waitNoInput } from '../platform/wait';
import { FONT_ASCII, DARKEN, FULL_SHADE, outText, outTextAdjust, textShade, textWidth } from '../video/fonthand';
import { mouseReplace, mouseStart } from '../video/mouse';
import { FONT_SHAPES, OPTION_SHAPES, TINY_FONT, blitSprite } from '../video/sprite';
import { barShade, fillRectangleXY } from '../video/vga256d';
import { showVGA } from '../video/video';
import { MENU_DATA_CUBES, MENU_DATA_CUBE_SUB, MENU_FULL_GAME, MENU_LOAD_SAVE, MENU_OPTIONS, drawMenuHeader, type ShopState } from './shop-draw';

/** The load/save slot list (game_menu.c:375-424). */
export function drawLoadSave(ctx: Ctx, s: ShopState): void {
  const g = ctx.game;
  const c = g.config;
  const sc = g.scratch;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const ht = ctx.assets.helpText;

  let min: number, max: number;
  if (c.twoPlayerMode) {
    min = 13;
    max = 24;
  } else {
    min = 2;
    max = 13;
  }

  for (let x = min; x <= max; x++) {
    /* Highlight if current selection */
    sc.temp2 = x - min + 2 === s.curSel[s.curMenu] ? 15 : 28;

    /* Write save game slot */
    let tempStr: string;
    if (x === max) tempStr = ht.miscText[6 - 1]!;
    else if (c.saveFiles[x - 2]!.level === 0) tempStr = ht.miscText[3 - 1]!;
    else tempStr = saveName(c.saveFiles[x - 2]!);

    const tempY = 38 + (x - min) * 11;

    textShade(screen, tables, 163, tempY, tempStr, idiv(sc.temp2, 16), (sc.temp2 % 16) - 8, DARKEN);

    if (x < max) { /* x == max isn't a save slot */
      /* Highlight if current selection */
      sc.temp2 = x - min + 2 === s.curSel[s.curMenu] ? 252 : 250;

      const sf = c.saveFiles[x - 2]!;
      if (sf.level === 0) {
        tempStr = '-----'; /* Empty save slot */
      } else {
        tempStr = sf.levelName;
        textShade(screen, tables, 297, tempY, `${ht.miscTextB[1 - 1]!}${sf.episode}`, idiv(sc.temp2, 16), (sc.temp2 % 16) - 8, DARKEN);
      }

      textShade(screen, tables, 245, tempY, tempStr, idiv(sc.temp2, 16), (sc.temp2 % 16) - 8, DARKEN);
    }

    drawMenuHeader(ctx, s);
  }
}

// port of JE_saveRequest (game_menu.c:2381)
export async function saveRequest(ctx: Ctx, slot: number, savename: string): Promise<boolean> {
  const { input, audio } = ctx;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const miscText = ctx.assets.helpText.miscText;
  let saveSelected = true, done = false;

  // JE_clearKeyboard() and JE_wipeKey() are no-ops
  await waitNoInput(ctx, true, true, true);

  barShade(screen, 65, 55, 255, 155);

  while (!done) {
    let col = 8;
    let colC = 1;

    do {
      input.serviceEvents(true);
      ctx.delay.setDelay(4);

      blitSprite(screen, 50, 50, tables[OPTION_SHAPES]!, 35); // message box
      textShade(screen, tables, 70, 66, miscText[68]!, 0, 5, FULL_SHADE); // Are you sure you want to save?
      textShade(screen, tables, 74, 90, miscText[1]!, 12, 1, FULL_SHADE); // Save name:
      textShade(screen, tables, 135, 90, savename, 12, 1, FULL_SHADE);
      textShade(screen, tables, 74, 100, miscText[69]!, 12, 1, FULL_SHADE); // Original save:
      textShade(screen, tables, 140, 100, saveName(ctx.game.config.saveFiles[slot - 1]!), 12, 1, FULL_SHADE);

      col = u8(col + colC);
      if (col > 8 || col < 2) colC = -colC;

      let tempX = 54 + 45 - idiv(textWidth(miscText[9]!, tables, FONT_SHAPES), 2);
      let tempC = saveSelected ? col - 12 : -5;
      outTextAdjust(screen, tables, tempX, 128, miscText[9]!, 15, tempC, FONT_SHAPES, true);

      tempX = 149 + 45 - idiv(textWidth(miscText[10]!, tables, FONT_SHAPES), 2);
      tempC = !saveSelected ? col - 12 : -5;
      outTextAdjust(screen, tables, tempX, 128, miscText[10]!, 15, tempC, FONT_SHAPES, true);

      if (ctx.mouse.hasMouse) {
        mouseStart(ctx);
        showVGA(ctx);
        mouseReplace(ctx);
      } else {
        showVGA(ctx);
      }

      await waitDelayPlain(ctx);

      // push_joysticks_as_keyboard(): no joysticks
      input.serviceEvents(false);
    } while (!input.newkey && !input.mousedown);

    if (input.mousedown) {
      if (input.lastmouseY > 123 && input.lastmouseY < 149) {
        if (input.lastmouseX > 56 && input.lastmouseX < 142) {
          saveSelected = true;
          done = true;
        } else if (input.lastmouseX > 151 && input.lastmouseX < 237) {
          saveSelected = false;
          done = true;
        }
      }
      input.mousedown = false;
    } else if (input.newkey) {
      switch (input.lastkeyScan) {
        case Scancode.Left:
        case Scancode.Right:
        case Scancode.Tab:
          saveSelected = !saveSelected;
          audio.playSample(S_CURSOR);
          break;
        case Scancode.Return:
        case Scancode.Space:
          done = true;
          break;
        case Scancode.Escape:
          saveSelected = false;
          done = true;
          break;
      }
    }
  }

  audio.playSample(saveSelected ? S_SELECT : S_CLICK);
  return saveSelected;
}

// port of JE_operation (mainint.c:2940). Reads the mouse.c `mouseButton` global (mainint.c:3012), which JE_mouseStart writes.
export async function operation(ctx: Ctx, s: ShopState, slot: number): Promise<void> {
  const g = ctx.game;
  const sc = g.scratch;
  const c = g.config;
  const { input, audio } = ctx;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const miscText = ctx.assets.helpText.miscText;

  if (!g.varz.performSave) {
    if (c.saveFiles[slot - 1]!.level > 0) {
      c.gameJustLoaded = true;
      loadGame(ctx, slot);
      g.varz.gameLoaded = true;
    }
  } else if (slot % 11 !== 0) {
    // char stemp[21] = 14 spaces, then the file's name copied over the front
    const stemp = new Uint8Array(21);
    stemp.fill(32, 0, 14);
    const fname = c.saveFiles[slot - 1]!.name;
    let nlen = 0;
    while (nlen < fname.length && fname[nlen] !== 0) nlen++;
    stemp.set(fname.subarray(0, Math.min(nlen, 14)), 0);
    const cstrlen = (): number => { let n = 0; while (n < stemp.length && stemp[n] !== 0) n++; return n; };
    const stempStr = (): string => String.fromCharCode(...stemp.subarray(0, cstrlen()));

    sc.temp = u8(cstrlen());
    while (stemp[sc.temp - 1] === 32 && --sc.temp);

    let flash = 8 * 16 + 10;

    await waitNoInput(ctx, false, true, false);

    barShade(screen, 65, 55, 255, 155);

    let quit = false;
    while (!quit) {
      input.serviceEvents(true);

      blitSprite(screen, 50, 50, tables[OPTION_SHAPES]!, 35); // message box

      textShade(screen, tables, 60, 55, miscText[1 - 1]!, 11, 4, DARKEN);
      textShade(screen, tables, 70, 70, c.levelName, 11, 4, DARKEN);

      do {
        flash = flash === 8 * 16 + 10 ? 8 * 16 + 2 : 8 * 16 + 10;
        sc.temp3 = sc.temp3 === 6 ? 2 : 6;

        let tempStr = miscText[2 - 1]!;
        tempStr += String.fromCharCode(...stemp.subarray(0, Math.min(sc.temp, cstrlen())));
        outText(screen, tables, 65, 89, tempStr, 8, 3);
        sc.tempW = u16(65 + textWidth(tempStr, tables, TINY_FONT));
        barShade(screen, sc.tempW + 2, 90, sc.tempW + 6, 95);
        fillRectangleXY(screen, sc.tempW + 1, 89, sc.tempW + 5, 94, flash);

        let textX = 54 + 45 - idiv(textWidth(miscText[9]!, tables, FONT_SHAPES), 2);
        outTextAdjust(screen, tables, textX, 128, miscText[9]!, 15, -5, FONT_SHAPES, true);

        textX = 149 + 45 - idiv(textWidth(miscText[10]!, tables, FONT_SHAPES), 2);
        outTextAdjust(screen, tables, textX, 128, miscText[10]!, 15, -5, FONT_SHAPES, true);

        for (let i = 0; i < 14; i++) {
          ctx.delay.setDelay(1);

          // push_joysticks_as_keyboard(): no joysticks
          await waitDelay(ctx); // service_wait_delay()

          mouseStart(ctx);
          showVGA(ctx);
          mouseReplace(ctx);

          if (input.newkey || input.newmouse || input.newText) break;
        }
      } while (!input.newkey && !input.newmouse && !input.newText);

      if (ctx.mouse.button > 0) { // mouse.c mouseButton, last written by JE_mouseStart in the loop above
        if (input.lastmouseX > 56 && input.lastmouseX < 142 && input.lastmouseY > 123 && input.lastmouseY < 149) {
          quit = true;
          if (await saveRequest(ctx, slot, stempStr())) saveGame(ctx, slot, stempStr());
        } else if (input.lastmouseX > 151 && input.lastmouseX < 237 && input.lastmouseY > 123 && input.lastmouseY < 149) {
          quit = true;
          audio.playSample(S_SPRING);
        }
      } else if (input.newText) {
        const text = input.lastText;
        for (let ti = 0; ti < text.length; ++ti) {
          const code = text.charCodeAt(ti);
          const ch = code <= 127 ? (code >= 97 && code <= 122 ? code - 32 : code) : 0; // toupper
          if ((ch === 32 || FONT_ASCII[ch] !== -1) && sc.temp < 14) {
            audio.playSample(S_CURSOR);
            stemp[sc.temp] = ch;
            sc.temp = u8(sc.temp + 1);
          }
        }
      } else if (input.newkey) {
        switch (input.lastkeyScan) {
          case Scancode.Backspace:
          case Scancode.Delete:
            if (sc.temp) {
              sc.temp = u8(sc.temp - 1);
              stemp[sc.temp] = 32;
              audio.playSample(S_CLICK);
            }
            break;
          case Scancode.Escape:
            quit = true;
            audio.playSample(S_SPRING);
            break;
          case Scancode.Return:
            quit = true;
            if (await saveRequest(ctx, slot, stempStr())) saveGame(ctx, slot, stempStr());
            break;
        }
      }
    }
  }

  await waitNoInput(ctx, false, true, false);
}

/** The MENU_LOAD_SAVE case of JE_menuFunction (game_menu.c:2832-2858). */
export async function loadSaveMenuFunction(ctx: Ctx, s: ShopState, curSelect: number): Promise<void> {
  const g = ctx.game;
  if (curSelect === 13) {
    if (s.quikSave) {
      s.curMenu = s.oldMenu;
      s.newPal = s.oldPal;
    } else {
      s.curMenu = MENU_OPTIONS;
    }
  } else {
    g.scratch.temp = g.config.twoPlayerMode ? 11 : 0;
    await operation(ctx, s, curSelect - 1 + g.scratch.temp);
    if (s.quikSave) {
      s.curMenu = s.oldMenu;
      s.newPal = s.oldPal;
    }
  }
}

const SC_L = 15, SC_S = 22; // SDL_SCANCODE_L / _S

/** Alt+S / Alt+L quick save and load after the poll in the inner loop (game_menu.c:1002-1030). */
export function quickSaveLoad(ctx: Ctx, s: ShopState): void {
  const { input } = ctx;
  if (s.curMenu === MENU_LOAD_SAVE) return;
  const alt = input.keysactive[Scancode.LAlt] || input.keysactive[Scancode.RAlt];
  for (const [sc, save] of [[SC_S, true], [SC_L, false]] as const) {
    if (input.keysactive[sc] && alt) {
      if (s.curMenu === MENU_DATA_CUBE_SUB || s.curMenu === MENU_DATA_CUBES) s.curMenu = MENU_FULL_GAME;
      s.quikSave = true;
      s.oldMenu = s.curMenu;
      s.curMenu = MENU_LOAD_SAVE;
      ctx.game.varz.performSave = save;
      s.newPal = 1;
      s.oldPal = s.curPal;
    }
  }
}

