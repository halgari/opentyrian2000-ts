// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/game_menu.c (the OPTIONS, LIMITED_OPTIONS, KEYBOARD_CONFIG, JOYSTICK_CONFIG, MOUSE_CONFIG parts of
//   JE_itemScreen and JE_menuFunction), src/nortsong.c (JE_changeVolume)
//
// Shop C, options: volume sliders, the key and mouse configuration screens and the (joystick-less) joystick screen.
// The volume rows are the only "options" the shop has: detail level and game speed live in the in-game menu.
import { S_CLICK, S_CURSOR } from '../audio/ids';
import { changeVolume } from '../audio/volume';
import { idiv, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { defaultKeySettings, defaultKeySettings2, defaultMouseSettings } from '../game/world';
import { Scancode } from '../platform/scancodes';
import { scancodeName } from '../platform/scancode-names';
import { waitDelayPlain, waitNoInput } from '../platform/wait';
import { DARKEN, PART_SHADE, textShade } from '../video/fonthand';
import { barDrawShadow } from '../video/glow-text';
import { rectangle } from '../video/vga256d';
import { showVGA } from '../video/video';
import { cubesMenuFunction } from './shop-cubes';
import { drawLoadSave, loadSaveMenuFunction } from './save-ui';
import {
  MENU_1_PLAYER_ARCADE, MENU_FULL_GAME, MENU_JOYSTICK_CONFIG, MENU_KEYBOARD_CONFIG, MENU_LIMITED_OPTIONS, MENU_MOUSE_CONFIG,
  MENU_OPTIONS, type ShopState,
} from './shop-draw';

const SC_F11 = 68, SC_P = 19; // SDL_SCANCODE_F11 / _P

/** The key map the keyboard config screen edits: map B (web extension) on its second page, else the C's keySettings. */
function keyMap(ctx: Ctx, s: ShopState): Int32Array {
  const c = ctx.game.config;
  return c.sharedKeyboard && s.keyPageB ? c.keySettings2 : c.keySettings;
}

/** Left/Right on the keyboard config screen flips between the two maps, only while the shared keyboard is on (web extension). */
export function keyboardConfigLeftRight(ctx: Ctx, s: ShopState): void {
  if (s.curMenu !== MENU_KEYBOARD_CONFIG || !ctx.game.config.sharedKeyboard) return;
  ctx.audio.playSample(S_CURSOR);
  s.keyPageB = !s.keyPageB;
}

/** The pre-draw hooks of JE_itemScreen for the config list menus (game_menu.c:308-455). */
export function drawConfigLists(ctx: Ctx, s: ShopState): void {
  const g = ctx.game;
  const c = g.config;
  const sc = g.scratch;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const ht = ctx.assets.helpText;

  switch (s.curMenu) {
    case MENU_MOUSE_CONFIG:
      for (let i = 0; i < 3; ++i) {
        const tempY = 51 + i * 24;
        textShade(screen, tables, 215, tempY, ht.joyButtonNames[c.mouseSettings[i]! - 1]!, 15, 2, PART_SHADE);
      }
      break;

    case 6: // MENU_LOAD_SAVE
      drawLoadSave(ctx, s);
      break;

    case MENU_KEYBOARD_CONFIG: {
      const keys = keyMap(ctx, s);
      if (c.sharedKeyboard) { // web extension: page indicator (Left/Right switches maps)
        textShade(screen, tables, 166, 28, s.keyPageB ? '< Keyboard 2 (web only)' : 'Keyboard 1 >', 15, 0, DARKEN);
      }
      for (let x = 2; x <= 11; x++) {
        sc.temp2 = x === s.curSel[s.curMenu] ? 15 : 28;

        textShade(screen, tables, 166, 38 + (x - 2) * 12, s.menuInt[s.curMenu + 1]![x - 1]!, idiv(sc.temp2, 16), (sc.temp2 % 16) - 8, DARKEN);

        if (x < 10) { /* 10 = reset to defaults, 11 = done */
          sc.temp2 = x === s.curSel[s.curMenu] ? 252 : 250;
          textShade(screen, tables, 236, 38 + (x - 2) * 12, scancodeName(keys[x - 2]!), idiv(sc.temp2, 16), (sc.temp2 % 16) - 8, DARKEN);
        }
      }
      s.menuChoices[MENU_KEYBOARD_CONFIG] = 11;
      break;
    }

    case MENU_JOYSTICK_CONFIG: {
      const mi = s.menuInt[6]!;
      const menuItem = ['JOYSTICK', 'ANALOG AXES', ' SENSITIVITY', ' THRESHOLD', mi[1]!, mi[4]!, mi[2]!, mi[3]!, mi[5]!, mi[6]!,
        mi[7]!, mi[8]!, 'MENU', 'PAUSE', mi[9]!, mi[10]!];

      for (let i = 0; i < menuItem.length; i++) {
        let temp = i === s.curSel[s.curMenu]! - 2 ? 15 : 28;

        textShade(screen, tables, 166, 38 + i * 8, menuItem[i]!, idiv(temp, 16), (temp % 16) - 8, DARKEN);

        temp = i === s.curSel[s.curMenu]! - 2 ? 252 : 250;

        // joysticks == 0: everything below index 14 is disabled
        const value = i < 14 ? '-' : '';
        textShade(screen, tables, 236, 38 + i * 8, value, idiv(temp, 16), (temp % 16) - 8, DARKEN);
      }

      s.menuChoices[s.curMenu] = menuItem.length + 1;
      break;
    }
  }
}

/** "Changing the volume?" bars (game_menu.c:671). */
export function drawVolumeBars(ctx: Ctx, s: ShopState): void {
  if (s.curMenu !== MENU_OPTIONS && s.curMenu !== MENU_LIMITED_OPTIONS) return;
  const c = ctx.game.config;
  const screen = ctx.vga.screen;
  barDrawShadow(screen, 225, 70, 1, ctx.audio.musicDisabled ? 12 : 16, idiv(c.tyrMusicVolume, 12), 3, 13);
  barDrawShadow(screen, 225, 86, 1, ctx.audio.samplesDisabled ? 12 : 16, idiv(c.fxVolume, 12), 3, 13);
}

/** The volume slider part of the mouse handler (game_menu.c:1113-1141). */
export function optionsMouse(ctx: Ctx, s: ShopState): void {
  if (s.curMenu !== MENU_OPTIONS && s.curMenu !== MENU_LIMITED_OPTIONS) return;
  const c = ctx.game.config;
  const { audio } = ctx;
  const mouseX = ctx.game.varz.mouseX, mouseY = ctx.game.varz.mouseY;

  if (mouseX >= 225 - 4 && mouseY >= 70 && mouseY <= 82) {
    if (audio.musicDisabled) {
      audio.musicDisabled = false;
      audio.restartSong();
    }

    s.curSel[MENU_OPTIONS] = 4;

    c.tyrMusicVolume = u16(idiv(mouseX - (225 - 4), 4) * 12);
    if (c.tyrMusicVolume > 255) c.tyrMusicVolume = 255;
  }

  if (mouseX >= 225 - 4 && mouseY >= 86 && mouseY <= 98) {
    audio.samplesDisabled = false;

    s.curSel[MENU_OPTIONS] = 5;

    c.fxVolume = u16(idiv(mouseX - (225 - 4), 4) * 12);
    if (c.fxVolume > 255) c.fxVolume = 255;
  }

  audio.setVolume(c.tyrMusicVolume, c.fxVolume);

  audio.playSample(S_CURSOR);
}

/** The OPTIONS / LIMITED_OPTIONS part of the Left / Right key handlers (game_menu.c:1394-1428, 1481-1515). */
export function optionsLeftRight(ctx: Ctx, s: ShopState, dir: -1 | 1): void {
  if (s.curMenu !== MENU_OPTIONS && s.curMenu !== MENU_LIMITED_OPTIONS) return;
  const c = ctx.game.config;
  const { audio } = ctx;
  const setVolume = (): void => audio.setVolume(c.tyrMusicVolume, c.fxVolume);

  audio.playSample(S_CURSOR);

  switch (s.curSel[s.curMenu]) {
    case 4: {
      const r = changeVolume(c.tyrMusicVolume, 12 * dir, c.fxVolume, 0, (n) => audio.playSample(n));
      c.tyrMusicVolume = r.music; c.fxVolume = r.sample;
      setVolume();
      if (audio.musicDisabled) {
        audio.musicDisabled = false;
        audio.restartSong();
      }
      break;
    }
    case 5: {
      const r = changeVolume(c.tyrMusicVolume, 0, c.fxVolume, 12 * dir, (n) => audio.playSample(n));
      c.tyrMusicVolume = r.music; c.fxVolume = r.sample;
      setVolume();
      audio.samplesDisabled = false;
      break;
    }
  }
}

// the "change key" branch of MENU_KEYBOARD_CONFIG in JE_menuFunction (game_menu.c:2812-2860)
async function captureKey(ctx: Ctx, s: ShopState, curSelect: number): Promise<void> {
  const g = ctx.game;
  const c = g.config;
  const sc = g.scratch;
  const { input } = ctx;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const keys = keyMap(ctx, s);

  sc.temp2 = 254;
  const tempY = 38 + (curSelect - 2) * 12;
  textShade(screen, tables, 236, tempY, scancodeName(keys[curSelect - 2]!), idiv(sc.temp2, 16), (sc.temp2 % 16) - 8, DARKEN);
  showVGA(ctx);

  await waitNoInput(ctx, true, true, true);

  s.col = 248;
  s.colC = 1;

  do {
    ctx.delay.setDelay(1);

    s.col += s.colC;
    if (s.col < 243 || s.col > 248) s.colC *= -1;
    rectangle(screen, 230, tempY - 2, 300, tempY + 7, s.col);

    // poll_joysticks(): none
    input.serviceEvents(true);

    showVGA(ctx);

    await waitDelayPlain(ctx);
  } while (!input.newkey && !input.mousedown /* && !joydown */);

  if (input.newkey) {
    const inOwnMap = keys.includes(input.lastkeyScan);
    // already used? then swap
    for (let i = 0; i < keys.length; ++i) {
      if (keys[i] === input.lastkeyScan) {
        keys[i] = keys[curSelect - 2]!;
        break;
      }
    }

    if (input.lastkeyScan !== Scancode.Escape && // reserved for menu
        input.lastkeyScan !== SC_F11 &&          // reserved for gamma
        input.lastkeyScan !== SC_P) {            // reserved for pause
      ctx.audio.playSample(S_CLICK);
      if (c.sharedKeyboard) { // a key may not be bound in both maps (both players would move together): swap with the other map
        const other = keys === c.keySettings ? c.keySettings2 : c.keySettings;
        const at = other.indexOf(input.lastkeyScan);
        if (at >= 0 && !inOwnMap) other[at] = keys[curSelect - 2]!;
      }
      keys[curSelect - 2] = input.lastkeyScan;
      ++curSelect;
    }

    // JE_wipeKey(): no-op
  }
}

/**
 * The options, data cube, keyboard, joystick and mouse cases of JE_menuFunction (game_menu.c:2708-2985). Returns false when `curMenu` is not one of them.
 * `curSelect` is the C's local copy of curSel[curMenu] taken at entry.
 */
export async function menuFunctionC(ctx: Ctx, s: ShopState, select: number, curSelect: number): Promise<boolean> {
  const g = ctx.game;
  const v = g.varz;
  const c = g.config;
  const sc = g.scratch;

  switch (s.curMenu) {
    case MENU_OPTIONS:
      switch (select) {
        case 2:
          s.curMenu = 6; // MENU_LOAD_SAVE
          v.performSave = false;
          s.quikSave = false;
          break;
        case 3:
          s.curMenu = 6;
          v.performSave = true;
          s.quikSave = false;
          break;
        case 6:
          s.curMenu = MENU_JOYSTICK_CONFIG;
          break;
        case 7:
          s.curMenu = MENU_KEYBOARD_CONFIG;
          break;
        case 8:
          s.curMenu = MENU_MOUSE_CONFIG;
          break;
        case 9:
          s.curMenu = MENU_FULL_GAME;
          break;
      }
      return true;

    case MENU_KEYBOARD_CONFIG:
      if (curSelect === 10) { /* reset to defaults */
        keyMap(ctx, s).set(c.sharedKeyboard && s.keyPageB ? defaultKeySettings2 : defaultKeySettings);
      } else if (curSelect === 11) { /* done */
        s.keyPageB = false;
        s.curMenu = MENU_OPTIONS; // isNetworkGame ? MENU_LIMITED_OPTIONS : MENU_OPTIONS
      } else { /* change key */
        await captureKey(ctx, s, curSelect);
      }
      return true;

    case 6: // MENU_LOAD_SAVE
      await loadSaveMenuFunction(ctx, s, curSelect);
      return true;

    case 7: // MENU_DATA_CUBES
    case 8: // MENU_DATA_CUBE_SUB
      return cubesMenuFunction(ctx, s, curSelect);

    case MENU_LIMITED_OPTIONS:
      switch (select) {
        case 2:
          s.curMenu = MENU_JOYSTICK_CONFIG;
          break;
        case 3:
          s.curMenu = MENU_KEYBOARD_CONFIG;
          break;
        case 6:
          s.curMenu = MENU_1_PLAYER_ARCADE;
          break;
      }
      return true;

    case MENU_JOYSTICK_CONFIG:
      // joysticks == 0: only "Done" (17) does anything
      if (select === 17) s.curMenu = MENU_OPTIONS; // isNetworkGame ? MENU_LIMITED_OPTIONS : MENU_OPTIONS
      return true;

    case MENU_MOUSE_CONFIG:
      switch (s.curSel[s.curMenu]) {
        case 2:
        case 3:
        case 4:
          sc.temp = u8(s.curSel[s.curMenu]! - 2);
          c.mouseSettings[sc.temp] = c.mouseSettings[sc.temp]! + 1;
          if (c.mouseSettings[sc.temp]! > 5) c.mouseSettings[sc.temp] = 1;
          break;
        case 5:
          c.mouseSettings.set(defaultMouseSettings);
          break;
        case 6:
          s.curMenu = MENU_OPTIONS;
          break;
      }
      return true;
  }
  return false;
}
