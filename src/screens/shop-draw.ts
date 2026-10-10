// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/game_menu.c (shop state, JE_cashLeft, JE_drawItem, JE_drawMenuHeader, JE_drawMenuChoices,
//   draw_ship_illustration, JE_drawScore, JE_drawMainMenuHelpText), src/helptext.c (menuHelp)
import { u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { getCost } from '../game/economy';
import { PlayerItems, SA_LASTSHIP } from '../game/world';
import { DARKEN, FULL_SHADE, dString, fontCenter, textShade } from '../video/fonthand';
import { FONT_SHAPES, OPTION_SHAPES, SMALL_FONT_SHAPES, WEAPON_SHAPES, blitSprite, blitSpriteHv } from '../video/sprite';
import { blitSprite2x2 } from '../video/sprite2';
import { textState } from '../video/glow-text';
import { helpBox } from './help-box';
import type { NavState } from './shop-nav';

// game_menu.c:46-62 (the menu enum)
export const MENU_FULL_GAME = 0;
export const MENU_UPGRADES = 1;
export const MENU_OPTIONS = 2;
export const MENU_PLAY_NEXT_LEVEL = 3;
export const MENU_UPGRADE_SUB = 4;
export const MENU_KEYBOARD_CONFIG = 5;
export const MENU_LOAD_SAVE = 6;
export const MENU_DATA_CUBES = 7;
export const MENU_DATA_CUBE_SUB = 8;
export const MENU_2_PLAYER_ARCADE = 9;
export const MENU_1_PLAYER_ARCADE = 10;
export const MENU_LIMITED_OPTIONS = 11;
export const MENU_JOYSTICK_CONFIG = 12;
export const MENU_SUPER_TYRIAN = 13;
export const MENU_MOUSE_CONFIG = 14;
export const MENU_MAX = 15;

// game_menu.c:101-103
export const MENU_CHOICES_DEFAULT: readonly number[] = [7, 9, 9, 0, 0, 11, Math.trunc(22 / 2) + 2, 0, 0, 6, 4, 6, 7, 5, 6];
export const MENU_ESC: readonly number[] = [0, 1, 1, 1, 2, 3, 3, 1, 8, 0, 0, 11, 3, 0, 2];
export const ITEM_AVAIL_MAP: readonly number[] = [1, 2, 3, 9, 4, 6, 7];

// helptext.c:32 menuHelp[MENU_MAX][11] (0 = unused)
const MENU_HELP: readonly (readonly number[])[] = [
  [1, 34, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11, 11, 12], [13, 14, 15, 15, 16, 17, 35, 12], [], [], [], [], [], [],
  [4, 30, 30, 3, 5], [4, 37, 12], [16, 17, 15, 15, 12], [31, 31, 31, 31, 32, 12], [4, 34, 3, 5], [35, 35, 35, 36, 12],
];

/** One loaded data cube (game_menu.c struct cube_struct); filled by Task 11's load_cubes. */
export interface Cube { title: string; header: string; faceSprite: number; text: string[]; lastLine: number }

/**
 * The file-scope statics of game_menu.c, per shop visit. `itemScreen` allocates a fresh one on every visit; the C statics
 * that survive between visits are all reassigned on entry to the menu that reads them, so nothing needs to carry over.
 * Field names are the C names.
 */
export class ShopState {
  curMenu = MENU_FULL_GAME;
  readonly curSel = new Uint8Array(MENU_MAX).fill(2);
  readonly menuChoices = Uint8Array.from(MENU_CHOICES_DEFAULT);
  col = 1; colC = 0;                       // JE_integer
  newPal = 0; curPal = 0; oldPal = 0;
  quikSave = false; oldMenu = 0;
  backFromHelp = false; firstMenu9 = false; paletteChanged = false;
  lastDirection = 0;                       // JE_integer
  lastCurSel = 0;
  weaponSimTime = 0;                       // game_menu.c static, JE_weaponSimUpdate's 150-frame cycle
  keyboardUsed = false;
  leftPower = false; rightPower = false; rightPowerAfford = false;
  /** Task 10 temp_weapon_power[7]: stays an local of JE_itemScreen in the C; kept here so Task 10 can reach it. */
  readonly tempWeaponPower = new Int32Array(7);
  /** old_items[2] (game_menu.c:96), the shop's "owned" snapshot. */
  readonly oldItems: [PlayerItems, PlayerItems] = [new PlayerItems(), new PlayerItems()];
  /** The mouse.c globals the shop uses besides varz.mouseX/Y; JE_operation (Task 11) reads the stale mouseButton. */
  mouseButton = 0;                         // JE_word
  /** Per-game copy of helpText.menuInt: JE_menuFunction / JE_genItemMenu strcpy into rows 4 and 5. */
  menuInt: string[][] = [];
  cubes: Cube[] = [];                      // Task 11
  currentCube = 0;
  yLoc = 0; yChg = 0;                      // data cube reader scroll (JE_word, JE_shortint)
  joystickConfig = 0;                      // which joystick is being configured
  nav: NavState | null = null;
}

// playeritem_map (game_menu.c:121): index 0..6 = ship, front, rear, shield, generator, left sidekick, right sidekick
export function getPlayerItem(items: PlayerItems, i: number): number {
  switch (i) {
    case 0: return items.ship;
    case 1: return items.weapon[0].id;
    case 2: return items.weapon[1].id;
    case 3: return items.shield;
    case 4: return items.generator;
    case 5: return items.sidekick[0];
    case 6: return items.sidekick[1];
  }
  throw new RangeError(`playeritem_map: assert(i < 7) failed (${i})`);
}

export function setPlayerItem(items: PlayerItems, i: number, v: number): void {
  v = u8(v);
  switch (i) {
    case 0: items.ship = v; return;
    case 1: items.weapon[0].id = v; return;
    case 2: items.weapon[1].id = v; return;
    case 3: items.shield = v; return;
    case 4: items.generator = v; return;
    case 5: items.sidekick[0] = v; return;
    case 6: items.sidekick[1] = v; return;
  }
  throw new RangeError(`playeritem_map: assert(i < 7) failed (${i})`);
}

// port of JE_cashLeft (game_menu.c:133). tempL is a JE_longint; writes the global tempW.
export function cashLeft(ctx: Ctx, s: ShopState): number {
  const g = ctx.game;
  const p0 = g.players[0];
  const sel = s.curSel[MENU_UPGRADES]!;
  let tempL = p0.cash;
  const itemNum = getPlayerItem(p0.items, sel - 2);

  tempL -= getCost(ctx, sel, itemNum);

  g.scratch.tempW = 0;

  switch (sel) {
    case 3:
    case 4:
      for (let i = 1; i < p0.items.weapon[sel - 3]!.power; ++i) {
        g.scratch.tempW = u16(g.scratch.tempW + g.items.weaponPort[itemNum]!.cost * i);
        tempL -= g.scratch.tempW;
      }
      break;
  }
  return tempL | 0;
}

// port of JE_drawItem (game_menu.c:1869)
export function drawItem(ctx: Ctx, itemType: number, itemNum: number, x: number, y: number): void {
  const g = ctx.game;
  let tempW = 0;

  if (itemNum > 0) {
    switch (itemType) {
      case 2:
      case 3:
        tempW = g.items.weaponPort[itemNum]!.itemgraphic;
        break;
      case 5:
        tempW = g.items.powerSys[itemNum]!.itemgraphic;
        break;
      case 6:
      case 7:
        tempW = g.items.options[itemNum]!.itemgraphic;
        break;
      case 4:
        tempW = g.items.shields[itemNum]!.itemgraphic;
        break;
    }

    if (itemType === 1) {
      // TODO(task 10): itemNum > 90 (JE_SGr / extraShips, the ship editor's custom ships)
      if (itemNum > 90) throw new Error('unported: shop custom ship graphic (extraShips, varz.c:354)');
      const ship = g.items.ships[itemNum]!;
      if (ship.shipgraphic > 500) blitSprite2x2(ctx.vga.screen, x, y, ctx.assets.shapes.spriteSheetT2000, ship.shipgraphic - 500);
      else blitSprite2x2(ctx.vga.screen, x, y, ctx.assets.shapes.spriteSheet9, ship.shipgraphic);
    } else if (tempW > 0) {
      blitSprite2x2(ctx.vga.screen, x, y, ctx.shopSpriteSheet!, tempW);
    }
  }
}

// port of JE_drawMenuHeader (game_menu.c:1917)
export function drawMenuHeader(ctx: Ctx, s: ShopState): void {
  let str: string;
  switch (s.curMenu) {
    case MENU_DATA_CUBE_SUB:
      str = s.cubes[s.curSel[MENU_DATA_CUBES]! - 2]!.header;
      break;
    case MENU_DATA_CUBES:
      str = s.menuInt[1]![1]!;
      break;
    case MENU_LOAD_SAVE:
      str = s.menuInt[3]![(ctx.game.varz.performSave ? 1 : 0) + 1]!;
      break;
    default:
      str = s.menuInt[s.curMenu + 1]![0]!;
      break;
  }
  const tables = ctx.assets.shapes.tables;
  dString(ctx.vga.screen, tables, 74 + fontCenter(str, tables, FONT_SHAPES), 10, str, FONT_SHAPES);
}

// port of JE_drawMenuChoices (game_menu.c:1943)
export function drawMenuChoices(ctx: Ctx, s: ShopState): void {
  const tables = ctx.assets.shapes.tables;
  const menu = s.curMenu;
  for (let x = 2; x <= s.menuChoices[menu]!; x++) {
    let tempY = 38 + (x - 1) * 16;

    if (menu === MENU_FULL_GAME) {
      if (x === 7) tempY += 16;
    }

    if (menu === MENU_2_PLAYER_ARCADE) {
      if (x > 3) tempY += 16;
      if (x > 4) tempY += 16;
    }

    if (!(menu === MENU_PLAY_NEXT_LEVEL && x === s.menuChoices[menu])) tempY -= 16;

    if (menu === MENU_MOUSE_CONFIG) tempY += (x - 2) * 8;

    const text = s.menuInt[menu + 1]![x - 1]!;
    dString(ctx.vga.screen, tables, 166, tempY, s.curSel[menu] === x ? '~' + text : text, SMALL_FONT_SHAPES);
  }
}

// port of JE_drawScore (game_menu.c:2659): only the upgrade submenu shows the running cash
export function drawScore(ctx: Ctx, s: ShopState): void {
  if (s.curMenu === MENU_UPGRADE_SUB) {
    textShade(ctx.vga.screen, ctx.assets.shapes.tables, 65, 173, String(cashLeft(ctx, s)), 1, 6, DARKEN);
  }
}

// port of JE_drawMainMenuHelpText (game_menu.c:2344)
export function drawMainMenuHelpText(ctx: Ctx, s: ShopState): void {
  const mainMenuHelp = ctx.assets.helpText.mainMenuHelp;
  const menu = s.curMenu;
  const temp = u8(s.curSel[menu]! - 2);
  let str: string;

  if (menu === MENU_JOYSTICK_CONFIG) { // joystick settings menu help
    const help = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 24, 11];
    str = mainMenuHelp[help[s.curSel[menu]! - 2]!]!;
  } else if (menu < MENU_PLAY_NEXT_LEVEL || menu >= MENU_2_PLAYER_ARCADE) {
    str = mainMenuHelp[MENU_HELP[menu]![temp]! - 1]!;
  } else if (menu === MENU_KEYBOARD_CONFIG && s.curSel[MENU_KEYBOARD_CONFIG] === 10) {
    str = mainMenuHelp[25 - 1]!;
  } else if (s.leftPower || s.rightPower) {
    str = mainMenuHelp[24 - 1]!;
  } else if (temp === s.menuChoices[menu]! - 2 || (menu === MENU_DATA_CUBES && ctx.game.config.cubeMax === 0)) {
    str = mainMenuHelp[12 - 1]!;
  } else {
    str = mainMenuHelp[17 + menu - 3]!;
  }

  textShade(ctx.vga.screen, ctx.assets.shapes.tables, 10, 187, str, 14, 1, DARKEN);
}

const WEAPON_SPRITES = [
  -1, 0, 1, 2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 21, 5, 13, -1, 14, 15, 0,
  14, 9, 8, 2, 15, 0, 13, 0, 8, 8,
  11, 1, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 2, 1, 0, 0, 1, 1, 1,
];
const FRONT_WEAPON_XY_LIST = [
  -1, 4, 9, 3, 8, 2, 5, 10, 1, -1,
  -1, -1, -1, 7, 8, -1, -1, 0, -1, 4,
  0, -1, -1, 3, -1, 4, -1, 4, -1, -1,
  -1, 9, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 3, 9, 4, 4, 9, 9, 9,
];
const FRONT_WEAPON_X = [59, 66, 66, 54, 61, 51, 58, 51, 61, 52, 53, 58];
const FRONT_WEAPON_Y = [38, 53, 41, 36, 48, 35, 41, 35, 53, 41, 39, 31];
const REAR_WEAPON_XY_LIST = [
  -1, -1, -1, -1, -1, -1, -1, -1, -1, 0,
  1, 2, 3, -1, 4, 5, -1, -1, 6, -1,
  -1, 1, 0, -1, 6, -1, 5, -1, 0, 0,
  3, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, -1, -1, -1, -1, -1, -1, -1,
];
const REAR_WEAPON_X = [41, 27, 49, 43, 51, 39, 41];
const REAR_WEAPON_Y = [92, 92, 113, 102, 97, 96, 76];
const SHIP_X = [31, 0, 0, 0, 35, 31, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 36, 30];
const SHIP_Y = [36, 0, 0, 0, 33, 35, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 33, 30];
const GENERATOR_X = [62, 64, 67, 66, 63];
const GENERATOR_Y = [84, 85, 86, 84, 97];

// port of draw_ship_illustration (game_menu.c:1663). Draws on VGAScreenSeg (= ctx.vga.screen).
export function drawShipIllustration(ctx: Ctx): void {
  const g = ctx.game;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const items = g.players[0].items;

  // ship
  if (!(items.ship > 0)) throw new Error('draw_ship_illustration: assert(player[0].items.ship > 0) failed');
  const shipSprite = items.ship < g.items.ships.length ? g.items.ships[items.ship]!.bigshipgraphic - 1 : 31; // shipedit ships get a default
  blitSprite(screen, SHIP_X[shipSprite - 27] ?? 0, SHIP_Y[shipSprite - 27] ?? 0, tables[OPTION_SHAPES]!, shipSprite);

  // generator
  if (!(items.generator > 0 && items.generator < 7)) throw new Error('draw_ship_illustration: assert(generator in 1..6) failed');
  const genSprite = items.generator === 1 ? items.generator + 15 : items.generator + 14; // generators 1 and 2 share a sprite
  blitSprite(screen, GENERATOR_X[genSprite - 16]!, GENERATOR_Y[genSprite - 16]!, tables[WEAPON_SHAPES]!, genSprite);

  // front weapon
  const front = items.weapon[0].id;
  if (front > 0) {
    const k = FRONT_WEAPON_XY_LIST[front] ?? 0;
    blitSprite(screen, FRONT_WEAPON_X[k]!, FRONT_WEAPON_Y[k]!, tables[WEAPON_SHAPES]!, WEAPON_SPRITES[front] ?? 0);
  }

  // rear weapon
  const rear = items.weapon[1].id;
  if (rear > 0) {
    const k = REAR_WEAPON_XY_LIST[rear] ?? 0;
    blitSprite(screen, REAR_WEAPON_X[k]!, REAR_WEAPON_Y[k]!, tables[WEAPON_SHAPES]!, WEAPON_SPRITES[rear] ?? 0);
  }

  // sidekicks
  drawItem(ctx, 6, items.sidekick[0], 3, 84);
  drawItem(ctx, 7, items.sidekick[1], 129, 84);

  // shield
  blitSpriteHv(screen, 28, 23, tables[OPTION_SHAPES]!, 26, 15, g.items.shields[items.shield]!.mpwr - 10);
}

// port of the super arcade / SuperTyrian branch of the left-side panel of JE_itemScreen (game_menu.c:659-675)
export function drawSuperArcadePanel(ctx: Ctx, _s: ShopState): void {
  const g = ctx.game;
  const c = g.config;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const ts = textState(ctx);
  const superShips = ctx.assets.helpText.superShips;
  const SA = SA_LASTSHIP;
  const p0 = g.players[0];

  ts.helpBoxColor = 15;
  ts.helpBoxBrightness = 4;
  if (!c.superTyrian) helpBox(ctx, screen, 35, 25, superShips[c.superArcadeMode]!, 18);
  else helpBox(ctx, screen, 35, 25, superShips[SA + 3]!, 18);
  ts.helpBoxBrightness = 1;

  textShade(screen, tables, 25, 50, superShips[SA + 1]!, 15, 0, FULL_SHADE);
  helpBox(ctx, screen, 25, 60, g.items.weaponPort[p0.items.weapon[0].id]!.name, 22);
  textShade(screen, tables, 25, 120, superShips[SA + 2]!, 15, 0, FULL_SHADE);
  helpBox(ctx, screen, 25, 130, g.items.special[p0.items.special]!.name, 22);
}
