// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/menus.c (gameplaySelect, episodeSelect, difficultySelect), src/tyrian2.c (newGame)
import { S_CURSOR, S_SELECT, S_SPRING } from '../audio/ids';
import { idiv } from '../core/int';
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { loadCompShapes } from '../data/shapes';
import { initEpisode } from '../game/episodes';
import {
  DIFFICULTY_EASY, DIFFICULTY_HARD, DIFFICULTY_IMPOSSIBLE, DIFFICULTY_NORMAL, DIFFICULTY_SUICIDE, DIFFICULTY_ZINGLON, EPISODE_AVAILABLE,
} from '../game/world';
import { SDL_BUTTON_LEFT, SDL_BUTTON_RIGHT } from '../platform/input';
import { Scancode } from '../platform/scancodes';
import { fadeBlack, fadePalette } from '../video/fade';
import { Align, Font, drawFontHvShadow } from '../video/font';
import { textWidth } from '../video/fonthand';
import { MOUSE_POINTER_NORMAL, mouseReplace, mouseStart } from '../video/mouse';
import { copySurface } from '../video/surface';
import { showVGA } from '../video/video';

const SC_D = 7, SC_G = 10, SC_L = 15, SC_O = 18, SC_R = 21, SC_RIGHTBRACKET = 48; // SDL scancodes

/** Shared head of the three selects: load the background, draw the header into screen2, restore it to screen. */
function drawBackground(ctx: Ctx, header: string, yHeader: number): void {
  const { vga, palette, assets } = ctx;
  loadPic(assets.pics, palette, vga.screen2, 2, false);
  drawFontHvShadow(vga.screen2, assets.shapes.tables, 160, yHeader, header, Font.Large, Align.Centered, 15, -3, false, 2);
  copySurface(vga.screen, vga.screen2);
}

/** The service_SDL_events / mouse / show / delay-poll tail shared by the menus; returns mouseMoved. */
async function pollMenu(ctx: Ctx): Promise<boolean> {
  const { input } = ctx;
  input.serviceEvents(true);
  mouseStart(ctx);
  showVGA(ctx);
  mouseReplace(ctx);

  let mouseMoved = false;
  do {
    await ctx.clock.sleep(16);
    const oldMouseX = input.mouseX & 0xffff; // Uint16 oldMouseX = mouse_x
    const oldMouseY = input.mouseY & 0xffff;
    input.serviceEvents(false);
    mouseMoved = input.mouseX !== oldMouseX || input.mouseY !== oldMouseY;
  } while (!(input.newkey || input.newmouse || mouseMoved));
  return mouseMoved;
}

interface MenuGeometry {
  count: number;
  xOf(i: number): number;
  yOf(i: number): number;
  w: number[];
  h: number;
}

/** Hover / click detection shared by all three selects. Returns the new selected index and whether a click activated it. */
function mouseSelect(ctx: Ctx, geo: MenuGeometry, selected: number): { selected: number; action: boolean } {
  const { input, audio } = ctx;
  let action = false;
  for (let i = 0; i < geo.count; ++i) {
    const x = geo.xOf(i);
    if (input.mouseX >= x && input.mouseX < x + geo.w[i]!) {
      const y = geo.yOf(i);
      if (input.mouseY >= y && input.mouseY < y + geo.h) {
        if (selected !== i) {
          audio.playSample(S_CURSOR);
          selected = i;
        }
        if (input.newmouse && input.lastmouseBut === SDL_BUTTON_LEFT &&
            input.lastmouseX >= x && input.lastmouseX < x + geo.w[i]! &&
            input.lastmouseY >= y && input.lastmouseY < y + geo.h) {
          action = true;
        }
        break;
      }
    }
  }
  return { selected, action };
}

/** The Up / Down / Space / Return / Escape / right-click handling shared by all three selects. */
function navKeys(ctx: Ctx, selected: number, count: number): { selected: number; action: boolean; cancel: boolean } {
  const { input, audio } = ctx;
  let action = false;
  let cancel = false;
  if (input.newmouse) {
    if (input.lastmouseBut === SDL_BUTTON_RIGHT) {
      audio.playSample(S_SPRING);
      cancel = true;
    }
  } else if (input.newkey) {
    switch (input.lastkeyScan) {
      case Scancode.Up:
        audio.playSample(S_CURSOR);
        selected = selected === 0 ? count - 1 : selected - 1;
        break;
      case Scancode.Down:
        audio.playSample(S_CURSOR);
        selected = selected === count - 1 ? 0 : selected + 1;
        break;
      case Scancode.Space:
      case Scancode.Return:
        action = true;
        break;
      case Scancode.Escape:
        audio.playSample(S_SPRING);
        cancel = true;
        break;
    }
  }
  return { selected, action, cancel };
}

function ensurePointerSprites(ctx: Ctx): void {
  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(ctx.assets.archive, '1'); // need mouse pointer sprites
}

// port of gameplaySelect (menus.c:42)
export async function gameplaySelect(ctx: Ctx): Promise<boolean> {
  const MENU_ITEM_1_PLAYER_FULL_GAME = 0, MENU_ITEM_1_PLAYER_ARCADE = 1, MENU_ITEM_1_PLAYER_TIMED_BATTLE = 2,
    MENU_ITEM_2_PLAYER_ARCADE = 3, MENU_ITEM_NETWORK = 4;
  const { vga, palette, assets, audio } = ctx;
  const c = ctx.game.config;
  const tables = assets.shapes.tables;
  const names = assets.helpText.gameplayName;
  ensurePointerSprites(ctx);

  let restart = true;
  const count = names.length - 1;
  let selected = MENU_ITEM_1_PLAYER_FULL_GAME;
  const xCenter = 160, yHeader = 20, yItems = 54, dyItems = 24, hItem = 13;
  const w = new Array<number>(count).fill(0);

  for (;;) {
    if (restart) drawBackground(ctx, names[0]!, yHeader);
    else copySurface(vga.screen, vga.screen2);

    for (let i = 0; i < count; ++i) {
      const text = names[i + 1]!;
      w[i] = textWidth(text, tables, Font.Normal);
      const x = xCenter - idiv(w[i]!, 2);
      const y = yItems + dyItems * i;
      const disabled = i === MENU_ITEM_NETWORK;
      drawFontHvShadow(vga.screen, tables, x, y, text, Font.Normal, Align.Left, 15, -4 + (i === selected ? 2 : 0) + (disabled ? -4 : 0), false, 2);
    }

    if (restart) {
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;
      await fadePalette(ctx, palette.colors, 10, 0, 255);
      restart = false;
    }

    const mouseMoved = await pollMenu(ctx);
    const { input } = ctx;

    let action = false;
    if (mouseMoved || input.newmouse) {
      const r = mouseSelect(ctx, { count, xOf: (i) => xCenter - idiv(w[i]!, 2), yOf: (i) => yItems + dyItems * i, w, h: hItem }, selected);
      selected = r.selected;
      action = r.action;
    }
    const k = navKeys(ctx, selected, count);
    selected = k.selected;
    action = action || k.action;
    const cancel = k.cancel;

    if (action) {
      switch (selected) {
        case MENU_ITEM_1_PLAYER_FULL_GAME:
        case MENU_ITEM_1_PLAYER_ARCADE:
        case MENU_ITEM_1_PLAYER_TIMED_BATTLE:
        case MENU_ITEM_2_PLAYER_ARCADE:
          audio.playSample(S_SELECT);
          await fadeBlack(ctx, 10);
          c.onePlayerAction = selected === MENU_ITEM_1_PLAYER_ARCADE;
          c.timedBattleMode = selected === MENU_ITEM_1_PLAYER_TIMED_BATTLE;
          c.twoPlayerMode = selected === MENU_ITEM_2_PLAYER_ARCADE;
          return true;
        default: // network
          audio.playSample(S_SPRING);
          break;
      }
    }

    if (cancel) {
      await fadeBlack(ctx, 15);
      return false;
    }
  }
}

// port of timedBattleSelect (menus.c:678)
export async function timedBattleSelect(ctx: Ctx): Promise<boolean> {
  const { vga, palette, assets, audio } = ctx;
  const g = ctx.game;
  const tables = assets.shapes.tables;
  const names = assets.helpText.timedBattleName;
  ensurePointerSprites(ctx);

  let restart = true;
  const count = names.length - 1;
  let selected = 0;
  const xCenter = 160, yHeader = 20, yItems = 54, dyItems = 24, hItem = 13;
  const w = new Array<number>(count).fill(0);

  for (;;) {
    if (restart) drawBackground(ctx, names[0]!, yHeader);
    else copySurface(vga.screen, vga.screen2);

    for (let i = 0; i < count; ++i) {
      const text = names[i + 1]!;
      w[i] = textWidth(text, tables, Font.Normal);
      const x = xCenter - idiv(w[i]!, 2);
      const y = yItems + dyItems * i;
      drawFontHvShadow(vga.screen, tables, x, y, text, Font.Normal, Align.Left, 15, -4 + (i === selected ? 2 : 0), false, 2);
    }

    if (restart) {
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;
      await fadePalette(ctx, palette.colors, 10, 0, 255);
      restart = false;
    }

    const mouseMoved = await pollMenu(ctx);
    const { input } = ctx;

    let action = false;
    if (mouseMoved || input.newmouse) {
      const r = mouseSelect(ctx, { count, xOf: (i) => xCenter - idiv(w[i]!, 2), yOf: (i) => yItems + dyItems * i, w, h: hItem }, selected);
      selected = r.selected;
      action = r.action;
    }
    const k = navKeys(ctx, selected, count);
    selected = k.selected;
    action = action || k.action;

    if (action) {
      audio.playSample(S_SELECT);
      await fadeBlack(ctx, 10);
      // I don't know how T2K determines episode from this, I'm assuming it's hardcoded (initial_episode_num is not touched)
      initEpisode(ctx, selected === 0 ? 1 : 5);
      g.config.timeBattleSelection = selected + 1;
      return true;
    }

    if (k.cancel) {
      await fadeBlack(ctx, 15);
      return false;
    }
  }
}

// port of episodeSelect (menus.c:247)
export async function episodeSelect(ctx: Ctx): Promise<boolean> {
  const { vga, palette, assets, audio } = ctx;
  const g = ctx.game;
  const tables = assets.shapes.tables;
  const names = assets.helpText.episodeName;
  ensurePointerSprites(ctx);

  let restart = true;
  const count = EPISODE_AVAILABLE;
  let selected = 0;
  const yHeader = 20, xItem = 20, yItems = 50, dyItems = 30, hItem = 13;
  const w = new Array<number>(count).fill(0);

  for (;;) {
    if (restart) drawBackground(ctx, names[0]!, yHeader);
    else copySurface(vga.screen, vga.screen2);

    for (let i = 0; i < count; ++i) {
      const text = names[i + 1]!;
      w[i] = textWidth(text, tables, Font.Normal);
      const y = yItems + dyItems * i;
      const disabled = !g.items.episodeAvail[i];
      drawFontHvShadow(vga.screen, tables, xItem, y, text, Font.Normal, Align.Left, 15, -4 + (i === selected ? 2 : 0) + (disabled ? -4 : 0), false, 2);
    }

    if (restart) {
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;
      await fadePalette(ctx, palette.colors, 10, 0, 255);
      restart = false;
    }

    const mouseMoved = await pollMenu(ctx);
    const { input } = ctx;

    let action = false;
    if (mouseMoved || input.newmouse) {
      const r = mouseSelect(ctx, { count, xOf: () => xItem, yOf: (i) => yItems + dyItems * i, w, h: hItem }, selected);
      selected = r.selected;
      action = r.action;
    }
    const k = navKeys(ctx, selected, count);
    selected = k.selected;
    action = action || k.action;

    if (action) {
      if (g.items.episodeAvail[selected]) {
        audio.playSample(S_SELECT);
        await fadeBlack(ctx, 10);
        initEpisode(ctx, selected + 1);
        g.items.initialEpisodeNum = g.items.episodeNum;
        return true;
      }
      audio.playSample(S_SPRING);
    }

    if (k.cancel) {
      await fadeBlack(ctx, 15);
      return false;
    }
  }
}

const DIFFICULTY_BY_ROW = [DIFFICULTY_EASY, DIFFICULTY_NORMAL, DIFFICULTY_HARD, DIFFICULTY_IMPOSSIBLE, DIFFICULTY_SUICIDE, DIFFICULTY_ZINGLON];

// port of difficultySelect (menus.c:434), including the hidden rows (Shift+G, Shift+], L-O-R-D)
export async function difficultySelect(ctx: Ctx): Promise<boolean> {
  const { vga, palette, assets, audio, input } = ctx;
  const c = ctx.game.config;
  const tables = assets.shapes.tables;
  const names = assets.helpText.difficultyName;
  ensurePointerSprites(ctx);

  let restart = true;
  const count = names.length - 1;
  let visible = count - 3;
  let selected = 1;
  let lordProgress = 0;
  const xCenter = 160, yHeader = 20, yItems = 54, dyItems = 24, hItem = 13;
  const w = new Array<number>(count).fill(0);
  const lordKeys = [SC_L, SC_O, SC_R, SC_D];

  for (;;) {
    if (restart) drawBackground(ctx, names[0]!, yHeader);
    else copySurface(vga.screen, vga.screen2);

    for (let i = 0; i < visible; ++i) {
      const text = names[i + 1]!;
      w[i] = textWidth(text, tables, Font.Normal);
      const x = xCenter - idiv(w[i]!, 2);
      const y = yItems + dyItems * i;
      drawFontHvShadow(vga.screen, tables, x, y, text, Font.Normal, Align.Left, 15, -4 + (i === selected ? 2 : 0), false, 2);
    }

    if (restart) {
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;
      await fadePalette(ctx, palette.colors, 10, 0, 255);
      restart = false;
    }

    const mouseMoved = await pollMenu(ctx);

    if (visible === 5) {
      if (lordKeys.every((sc) => input.keysactive[sc])) visible = 6;
      if (input.newkey) {
        // Due to key jamming, holding down 4 keys simultaneously may not be possible: the keys may also be typed in order.
        if (lordProgress < lordKeys.length && input.lastkeyScan === lordKeys[lordProgress]) {
          lordProgress += 1;
          if (lordProgress === lordKeys.length) visible = 6;
        } else {
          lordProgress = 0;
        }
      }
    }
    if (input.keysactive[Scancode.LShift] || input.keysactive[Scancode.RShift]) { // SDL_GetModState() & KMOD_SHIFT
      if (visible === 4 && input.keysactive[SC_RIGHTBRACKET]) visible = 5;
      if (visible === 3 && input.keysactive[SC_G]) visible = 4;
    }

    let action = false;
    if (mouseMoved || input.newmouse) {
      const r = mouseSelect(ctx, { count: visible, xOf: (i) => xCenter - idiv(w[i]!, 2), yOf: (i) => yItems + dyItems * i, w, h: hItem }, selected);
      selected = r.selected;
      action = r.action;
    }
    const k = navKeys(ctx, selected, visible);
    selected = k.selected;
    action = action || k.action;

    if (action) {
      audio.playSample(S_SELECT);
      c.difficultyLevel = DIFFICULTY_BY_ROW[selected]!;
      await fadeBlack(ctx, 10);
      return true;
    }

    if (k.cancel) {
      await fadeBlack(ctx, 15);
      return false;
    }
  }
}

// port of newGame (tyrian2.c:3625)
export async function newGame(ctx: Ctx): Promise<boolean> {
  const g = ctx.game;
  const c = g.config;
  const [p0] = g.players;

  if (await gameplaySelect(ctx)) {
    if (c.timedBattleMode) {
      c.onePlayerAction = true;
      if (await timedBattleSelect(ctx) && await difficultySelect(ctx)) g.varz.gameLoaded = true;
    } else if (await episodeSelect(ctx) && await difficultySelect(ctx)) g.varz.gameLoaded = true;

    c.initialDifficulty = c.difficultyLevel;

    if (c.onePlayerAction) {
      p0.cash = 0;
      p0.items.ship = 8; // Stalker
    } else if (c.twoPlayerMode) {
      for (const pl of g.players) pl.cash = 0;
      p0.items.ship = 11; // Silver Ship
      c.difficultyLevel += 1;
      c.inputDevice[0] = 1;
      c.inputDevice[1] = 2;
    } else if (g.varz.gameLoaded) { // (richMode is a command-line option and is never set)
      // allows player to smuggle arcade/super-arcade ships into full game
      const initialCash = [10000, 15000, 20000, 30000, 20000];
      p0.cash = initialCash[g.items.episodeNum - 1]!;
    }
  }

  return g.varz.gameLoaded;
}
