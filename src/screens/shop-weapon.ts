// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/game_menu.c (the upgrade menus of JE_itemScreen / JE_menuFunction, JE_genItemMenu, JE_initWeaponView,
//   JE_weaponSimUpdate, JE_weaponViewFrame, JE_doShipSpecs and friends), src/shots.c (simulate_player_shots)
//
// Shop B: UPGRADES (1) and UPGRADE_SUB (4) plus the ship specs screen. shop.ts calls the hooks exported here at its
// `// TASK 10` markers.
import { S_CLINK, S_CURSOR, S_ITEM, S_SPRING } from '../audio/ids';
import { f32, roundf32 } from '../core/cmath';
import { s16, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { getCost } from '../game/economy';
import { updateAndDrawStarfield, initializeStarfield } from '../game/backgrounds';
import { getShipInfo, playerShotCreate } from '../game/shots';
import { LEFT_SIDEKICK, MAX_PWEAPON, REAR_WEAPON, RIGHT_SIDEKICK, SHOT_LEFT_SIDEKICK, SHOT_RIGHT_SIDEKICK } from '../game/world';
import { waitInput, waitNoInput } from '../platform/wait';
import { DARKEN, dString, fontCenter, outText, textShade } from '../video/fonthand';
import { anyButton } from '../video/glow-text';
import { OPTION_SHAPES, TINY_FONT, FONT_SHAPES, blitSprite } from '../video/sprite';
import { blitSprite2 } from '../video/sprite2';
import { type Surface, clearSurface } from '../video/surface';
import { fillRectangleXY, pix, pix3, rectangle } from '../video/vga256d';
import { showVGA } from '../video/video';
import { helpBox } from './help-box';
import {
  ITEM_AVAIL_MAP, MENU_FULL_GAME, MENU_UPGRADES, MENU_UPGRADE_SUB, type ShopState, cashLeft, drawItem, getPlayerItem,
  setPlayerItem,
} from './shop-draw';

// The upgrade screen rows: curSel[MENU_UPGRADES] 2 ship, 3 front, 4 rear, 5 shield, 6 generator, 7/8 sidekicks.

function availRow(sel: number): number {
  return ITEM_AVAIL_MAP[sel - 2]! - 1;
}

// itemAvail[row][idx] with the C's flat [9][10] layout (a read one past a row reads the start of the next row)
function availAt(ctx: Ctx, row: number, idx: number): number {
  const a = ctx.game.items.itemAvail;
  const r = row + Math.trunc(idx / 10);
  return a[r]?.[idx % 10] ?? 0;
}

/** The inner loop runs the weapon simulator instead of the plain redraw for these (game_menu.c:838). */
export function isWeaponSimMenu(s: ShopState): boolean {
  const sel = s.curSel[MENU_UPGRADES]!;
  return s.curMenu === MENU_UPGRADE_SUB && (sel === 3 || sel === 4 || (sel >= 6 && sel <= 8));
}

// ---------------------------------------------------------------------------------------------------------------------
// the draw step

/** The block before the header draw (game_menu.c:268): reset temp_weapon_power[] when front/rear is highlighted. */
export function resetTempWeaponPower(ctx: Ctx, s: ShopState): void {
  if (s.curMenu !== MENU_UPGRADES || !(s.curSel[MENU_UPGRADES] === 3 || s.curSel[MENU_UPGRADES] === 4)) return;
  const g = ctx.game;
  const w = g.players[0].items.weapon[s.curSel[MENU_UPGRADES]! - 3]!;
  const item = w.id, itemPower = w.power;
  const i = s.curSel[MENU_UPGRADES]! - 2; // 1 or 2 (front or rear)
  const row = ITEM_AVAIL_MAP[i]! - 1;

  for (let slot = 0; slot < g.items.itemAvailMax[row]!; ++slot) {
    s.tempWeaponPower[slot] = g.items.itemAvail[row]![slot] === item ? itemPower : 1;
  }
  s.tempWeaponPower[g.items.itemAvailMax[row]!] = itemPower;
}

function itemName(ctx: Ctx, kind: number, id: number): string {
  const it = ctx.game.items;
  switch (kind) {
    case 1: return it.ships[id]?.name ?? '';
    case 2:
    case 3: return it.weaponPort[id]?.name ?? '';
    case 4: return it.shields[id]?.name ?? '';
    case 5: return it.powerSys[id]?.name ?? '';
    case 6:
    case 7: return it.options[id]?.name ?? '';
  }
  return '';
}

/** The MENU_UPGRADE_SUB item list (game_menu.c:480-623). */
export function drawUpgradeSub(ctx: Ctx, s: ShopState): void {
  const g = ctx.game;
  const sc = g.scratch;
  const p0 = g.players[0];
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const miscText = ctx.assets.helpText.miscText;
  const sel = s.curSel[MENU_UPGRADES]!;
  const row = availRow(sel);
  const choices = s.menuChoices[MENU_UPGRADE_SUB]!;

  /* Move cursor until we hit either "Done" or a weapon the player can afford */
  while (s.curSel[MENU_UPGRADE_SUB]! < choices &&
         getCost(ctx, sel, availAt(ctx, row, s.curSel[MENU_UPGRADE_SUB]! - 2)) > p0.cash) {
    s.curSel[MENU_UPGRADE_SUB] = s.curSel[MENU_UPGRADE_SUB]! + s.lastDirection;
    if (s.curSel[MENU_UPGRADE_SUB]! < 2) s.curSel[MENU_UPGRADE_SUB] = choices;
    else if (s.curSel[MENU_UPGRADE_SUB]! > choices) s.curSel[MENU_UPGRADE_SUB] = 2;
  }

  if (s.curSel[MENU_UPGRADE_SUB] === choices) {
    /* If cursor on "Done", use previous weapon */
    setPlayerItem(p0.items, sel - 2, getPlayerItem(s.oldItems[0], sel - 2));
  } else {
    /* Otherwise display the selected weapon */
    setPlayerItem(p0.items, sel - 2, availAt(ctx, row, s.curSel[MENU_UPGRADE_SUB]! - 2));
  }

  /* Get power level info for front and rear weapons */
  if ((sel === 3 || sel === 4) && s.curSel[MENU_UPGRADE_SUB]! < choices) {
    if (sel === 4 && availAt(ctx, row, s.curSel[MENU_UPGRADE_SUB]! - 2) === 0) {
      // "None" on rear weapon menu cannot be upgraded ("None" on front weapon menu can -- this is accurate to the original game)
      s.leftPower = false;
      s.rightPower = false;
    } else {
      const itemLevel = p0.items.weapon[sel - 3]!.power;

      // calculate upgradeCost
      getCost(ctx, sel, availAt(ctx, row, s.curSel[MENU_UPGRADE_SUB]! - 2));

      s.leftPower = itemLevel > 1; // can downgrade
      s.rightPower = itemLevel < 11; // can upgrade

      if (s.rightPower) s.rightPowerAfford = cashLeft(ctx, s) >= g.varz.upgradeCost; // can afford upgrade
    }
  } else {
    // Nothing else can be upgraded or downgraded
    s.leftPower = false;
    s.rightPower = false;
  }

  /* submenu title  e.g., "Left Sidekick" */
  const title = s.menuInt[2]![sel - 1]!;
  dString(screen, tables, 74 + fontCenter(title, tables, FONT_SHAPES), 10, title, FONT_SHAPES);

  /* Iterate through all submenu options */
  for (sc.tempW = 1; sc.tempW < choices; sc.tempW = u16(sc.tempW + 1)) {
    const tempW = sc.tempW;
    const tempY = 40 + (tempW - 1) * 26; /* Calculate y position */
    let tempCost: number;

    /* Is this a item or None/DONE? */
    if (tempW < choices - 1) tempCost = getCost(ctx, sel, availAt(ctx, row, tempW - 1)); /* Get base cost for choice */
    else tempCost = 0; /* "None" is free :) */

    const affordShade = tempCost > p0.cash ? 4 : 0; // can player afford current weapon at all

    sc.temp = u8(availAt(ctx, row, tempW - 1)); /* Item ID */
    let tempStr = '';
    switch (sel - 1) {
      case 1: /* ship */
        tempStr = sc.temp > 90 ? `Custom Ship ${sc.temp - 90}` : itemName(ctx, 1, sc.temp);
        break;
      case 2: /* front and rear weapon */
      case 3: tempStr = itemName(ctx, 2, sc.temp); break;
      case 4: tempStr = itemName(ctx, 4, sc.temp); break; /* shields */
      case 5: tempStr = itemName(ctx, 5, sc.temp); break; /* generator */
      case 6: /* sidekicks */
      case 7: tempStr = itemName(ctx, 6, sc.temp); break;
    }
    sc.temp2 = tempW === s.curSel[s.curMenu]! - 1 ? 15 : 28;

    getShipInfo(ctx);

    /* item-owned marker */
    if (sc.temp === getPlayerItem(s.oldItems[0], sel - 2) && sc.temp !== 0 && tempW !== choices - 1) {
      fillRectangleXY(screen, 160, tempY + 7, 300, tempY + 11, 227);
      blitSprite2(screen, 298, tempY + 2, ctx.shopSpriteSheet!, 247);
    }

    /* Draw DONE */
    if (tempW === choices - 1) tempStr = miscText[13]!;
    textShade(screen, tables, 185, tempY, tempStr, sc.temp2 >> 4, (sc.temp2 & 15) - 8 - affordShade, DARKEN);

    /* Draw icon if not DONE. NOTE: None is a normal item with a blank icon. */
    if (tempW < choices - 1) drawItem(ctx, sel - 1, sc.temp, 160, tempY - 4);

    /* Make selected text brighter */
    sc.temp2 = tempW === s.curSel[s.curMenu]! - 1 ? 15 : 28;

    /* Draw Cost: if it's not the DONE option */
    if (tempW !== choices - 1) {
      textShade(screen, tables, 187, tempY + 10, `Cost: ${tempCost}`, sc.temp2 >> 4, (sc.temp2 & 15) - 8 - affordShade, DARKEN);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// JE_menuFunction cases

// port of JE_genItemMenu (game_menu.c:2601)
function genItemMenu(ctx: Ctx, s: ShopState, itemNum: number): void {
  const g = ctx.game;
  const sc = g.scratch;
  const row = ITEM_AVAIL_MAP[itemNum - 2]! - 1;
  const max = g.items.itemAvailMax[row]!;
  s.menuChoices[MENU_UPGRADE_SUB] = max + 2;

  sc.temp3 = 2;
  sc.temp2 = getPlayerItem(g.players[0].items, itemNum - 2);

  const menu5 = s.menuInt[5]!;
  menu5[0] = s.menuInt[2]![itemNum - 1]!;

  for (sc.tempW = 0; sc.tempW < max; sc.tempW = u16(sc.tempW + 1)) {
    sc.temp = g.items.itemAvail[row]![sc.tempW]!;
    let tempStr = '';
    switch (itemNum) {
      case 2: tempStr = itemName(ctx, 1, sc.temp); break;
      case 3:
      case 4: tempStr = itemName(ctx, 2, sc.temp); break;
      case 5: tempStr = itemName(ctx, 4, sc.temp); break;
      case 6: tempStr = itemName(ctx, 5, sc.temp); break;
      case 7:
      case 8: tempStr = itemName(ctx, 6, sc.temp); break;
    }
    if (sc.temp === sc.temp2) sc.temp3 = u8(sc.tempW + 2);
    menu5[sc.tempW] = tempStr;
  }

  menu5[sc.tempW] = ctx.assets.helpText.miscText[13]!;

  s.curSel[MENU_UPGRADE_SUB] = sc.temp3;
}

/** JE_menuFunction case MENU_UPGRADES (game_menu.c:2726) */
export function menuFunctionUpgrades(ctx: Ctx, s: ShopState, select: number): void {
  const p0 = ctx.game.players[0];
  if (select === 9) { // done
    s.curMenu = MENU_FULL_GAME;
  } else { // selected item to upgrade
    s.oldItems[0].copyFrom(p0.items);

    s.weaponSimTime = 0;
    s.lastDirection = 1;
    genItemMenu(ctx, s, select);
    initWeaponView(ctx);
    s.curMenu = MENU_UPGRADE_SUB;
    s.lastCurSel = s.curSel[MENU_UPGRADE_SUB]!;
    p0.cash = p0.cash * 2 - cashLeft(ctx, s);
  }
}

/** JE_menuFunction case MENU_UPGRADE_SUB (game_menu.c:2786) */
export function menuFunctionUpgradeSub(ctx: Ctx, s: ShopState): void {
  if (s.curSel[MENU_UPGRADE_SUB]! < s.menuChoices[MENU_UPGRADE_SUB]!) {
    // select done
    s.curSel[MENU_UPGRADE_SUB] = s.menuChoices[MENU_UPGRADE_SUB]!;
  } else { // if done is selected
    ctx.audio.playSample(S_ITEM);
    ctx.game.players[0].cash = cashLeft(ctx, s);
    s.curMenu = MENU_UPGRADES;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// input hooks (mouse handler :1088, key handler :1253)

function frontRear(s: ShopState): boolean {
  return s.curMenu === MENU_UPGRADE_SUB && (s.curSel[MENU_UPGRADES] === 3 || s.curSel[MENU_UPGRADES] === 4);
}

/** Mouse click on the "Done" row of the upgrade submenu. */
export function upgradeSubDoneClick(ctx: Ctx, s: ShopState): void {
  ctx.game.players[0].cash = cashLeft(ctx, s);
  s.curMenu = MENU_UPGRADES;
  ctx.audio.playSample(S_ITEM);
}

/** Mouse click on another row of the upgrade submenu (curSel != selection; the S_CLICK was already played). */
export function upgradeSubSelectClick(ctx: Ctx, s: ShopState, selection: number): void {
  const g = ctx.game;
  const p0 = g.players[0];
  const sel = s.curSel[MENU_UPGRADES]!;
  if (getCost(ctx, sel, availAt(ctx, availRow(sel), selection - 2)) > p0.cash) {
    ctx.audio.playSample(S_CLINK);
  } else {
    if (sel === 4) p0.weaponMode = 1;
    s.curSel[s.curMenu] = selection;
  }

  // in front or rear weapon upgrade screen?
  if (frontRear(s)) p0.items.weapon[sel - 3]!.power = u8(s.tempWeaponPower[s.curSel[MENU_UPGRADE_SUB]! - 2]!);
}

/** The power -/+ buttons of the mouse handler (game_menu.c:1229). */
export async function upgradeSubPowerButtons(ctx: Ctx, s: ShopState): Promise<void> {
  if (!frontRear(s)) return;
  const v = ctx.game.varz;
  const mouseX = v.mouseX, mouseY = v.mouseY;

  if (mouseX >= 23 && mouseX <= 36 && mouseY >= 149 && mouseY <= 168) {
    ctx.audio.playSample(S_CURSOR);
    powerStep(ctx, s, -1);
    await waitNoInput(ctx, false, true, false);
  }

  if (mouseX >= 119 && mouseX <= 131 && mouseY >= 149 && mouseY <= 168) {
    ctx.audio.playSample(S_CURSOR);
    powerStep(ctx, s, 1);
    await waitNoInput(ctx, false, true, false);
  }
}

function powerStep(ctx: Ctx, s: ShopState, dir: -1 | 1): void {
  const sel = s.curSel[MENU_UPGRADES]!;
  if (sel !== 3 && sel !== 4) return;
  const w = ctx.game.players[0].items.weapon[sel - 3]!;
  const slot = s.curSel[MENU_UPGRADE_SUB]! - 2;
  if (dir < 0 ? s.leftPower : s.rightPower && s.rightPowerAfford) {
    s.tempWeaponPower[slot] = s.tempWeaponPower[slot]! + dir;
    w.power = u8(s.tempWeaponPower[slot]!);
  } else {
    ctx.audio.playSample(S_CLINK);
  }
}

/** Left / Right in UPGRADE_SUB (the S_CURSOR sample was played by the caller's shared code). */
export function upgradeSubLeftRight(ctx: Ctx, s: ShopState, dir: -1 | 1): void {
  ctx.audio.playSample(S_CURSOR);
  powerStep(ctx, s, dir);
}

/** `/` key: cycle the rear weapon mode */
export function upgradeSubSlash(ctx: Ctx, s: ShopState): void {
  if (s.curMenu === MENU_UPGRADE_SUB && s.curSel[MENU_UPGRADES] === 4) {
    const g = ctx.game;
    const p0 = g.players[0];
    if (++p0.weaponMode > g.items.weaponPort[p0.items.weapon[REAR_WEAPON]!.id]!.opnum) p0.weaponMode = 1;
  }
}

/** Space / Return: update "Done" power level (before JE_menuFunction). */
export function upgradeSubEnter(ctx: Ctx, s: ShopState): void {
  if (!frontRear(s)) return;
  const g = ctx.game;
  const sel = s.curSel[MENU_UPGRADES]!;
  s.tempWeaponPower[g.items.itemAvailMax[availRow(sel)]!] = g.players[0].items.weapon[sel - 3]!.power;
}

/** Esc in UPGRADE_SUB: leaving without buying. */
export function upgradeSubEscape(ctx: Ctx, s: ShopState): void {
  if (s.curMenu !== MENU_UPGRADE_SUB) return;
  const p0 = ctx.game.players[0];
  p0.items.copyFrom(s.oldItems[0]);
  s.curSel[MENU_UPGRADE_SUB] = s.lastCurSel;
  p0.cash = cashLeft(ctx, s);
}

/** After Up / Down moved curSel[UPGRADE_SUB] */
export function upgradeSubCursorMoved(ctx: Ctx, s: ShopState): void {
  if (!frontRear(s)) return;
  const p0 = ctx.game.players[0];
  const sel = s.curSel[MENU_UPGRADES]!;
  p0.items.weapon[sel - 3]!.power = u8(s.tempWeaponPower[s.curSel[MENU_UPGRADE_SUB]! - 2]!);
  if (sel === 4) p0.weaponMode = 1;
}

// ---------------------------------------------------------------------------------------------------------------------
// the weapon simulator

// port of JE_initWeaponView (game_menu.c:2256)
export function initWeaponView(ctx: Ctx): void {
  const g = ctx.game;
  const c = g.config;
  const p0 = g.players[0];
  fillRectangleXY(ctx.vga.screen, 8, 8, 144, 177, 0);

  p0.sidekick[LEFT_SIDEKICK].x = 72 - 15;
  p0.sidekick[LEFT_SIDEKICK].y = 120;
  p0.sidekick[RIGHT_SIDEKICK].x = 72 + 15;
  p0.sidekick[RIGHT_SIDEKICK].y = 120;

  p0.x = 72;
  p0.y = 110;
  p0.deltaXShotMove = 0;
  p0.deltaYShotMove = 0;
  p0.lastXExplosionFollow = 72;
  p0.lastYExplosionFollow = 110;
  c.power = 500;
  c.lastPower = 500;

  g.playerShots.shotAvail.fill(0);

  c.shotRepeat.fill(1);
  c.shotMultiPos.fill(0);

  initializeStarfield(ctx);
}

// port of simulate_player_shots (shots.c:30): the shop draws the simulator's shots with this reduced mover
export function simulatePlayerShots(ctx: Ctx): void {
  const g = ctx.game;
  const ps = g.playerShots;
  const screen = ctx.vga.screen;
  const sheets = ctx.assets.shapes;

  /* Player Shot Images */
  for (let z = 0; z < MAX_PWEAPON; z++) {
    if (ps.shotAvail[z] !== 0) {
      ps.shotAvail[z] = ps.shotAvail[z]! - 1;
      if (z !== MAX_PWEAPON - 1) {
        const shot = ps.playerShotData[z]!;

        shot.shotXM = s16(shot.shotXM + shot.shotXC);

        if (shot.shotXM <= 100) shot.shotX = s16(shot.shotX + shot.shotXM);

        shot.shotYM = s16(shot.shotYM + shot.shotYC);
        shot.shotY = s16(shot.shotY + shot.shotYM);

        if (shot.shotYM > 100) {
          shot.shotY = s16(shot.shotY - 120);
          shot.shotY = s16(shot.shotY + g.players[0].deltaYShotMove);
        }

        if (shot.shotComplicated) {
          shot.shotDevX = s16(shot.shotDevX + shot.shotDirX);
          shot.shotX = s16(shot.shotX + shot.shotDevX);

          if (Math.abs(shot.shotDevX) === shot.shotCirSizeX) shot.shotDirX = s16(-shot.shotDirX);

          shot.shotDevY = s16(shot.shotDevY + shot.shotDirY);
          shot.shotY = s16(shot.shotY + shot.shotDevY);

          if (Math.abs(shot.shotDevY) === shot.shotCirSizeY) shot.shotDirY = s16(-shot.shotDirY);
        }

        const tempShotX = shot.shotX;
        const tempShotY = shot.shotY;

        if (shot.shotX < 0 || shot.shotX > 140 || shot.shotY < 0 || shot.shotY > 170) {
          ps.shotAvail[z] = 0;
          continue; // goto draw_player_shot_loop_end
        }

        let animFrame = u16(shot.shotGr + shot.shotAni);
        shot.shotAni = u16(shot.shotAni + 1);
        if (shot.shotAni === shot.shotAniMax) shot.shotAni = 0;

        if (animFrame < 60000) {
          if (animFrame > 1000) animFrame = animFrame % 1000;
          if (animFrame > 500) blitSprite2(screen, tempShotX + 1, tempShotY, sheets.spriteSheet12, animFrame - 500);
          else blitSprite2(screen, tempShotX + 1, tempShotY, sheets.spriteSheet8, animFrame);
        }
      }
    }
  }
}

// port of JE_weaponViewFrame (game_menu.c:3292)
function weaponViewFrame(ctx: Ctx, s: ShopState): void {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const sc = g.scratch;
  const p0 = g.players[0];
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const opts = g.items.options;

  fillRectangleXY(screen, 8, 8, 143, 182, 0);

  /* JE: (* Port Configuration Display *) */

  updateAndDrawStarfield(ctx, screen, 1);

  v.mouseX = u16(p0.x);
  v.mouseY = u16(p0.y);

  // create shots in weapon simulator
  for (let i = 0; i < 2; ++i) {
    if (c.shotRepeat[i]! > 0) {
      --c.shotRepeat[i]!;
    } else {
      const item = p0.items.weapon[i]!.id;
      const itemPower = p0.items.weapon[i]!.power - 1;
      const itemMode = i === REAR_WEAPON ? p0.weaponMode - 1 : 0;

      sc.b = s16(playerShotCreate(ctx, item, i, p0.x, p0.y, v.mouseX, v.mouseY, g.items.weaponPort[item]!.op[itemMode]![itemPower]!, 1));
    }
  }

  if (opts[p0.items.sidekick[LEFT_SIDEKICK]]!.wport > 0) {
    if (c.shotRepeat[SHOT_LEFT_SIDEKICK]! > 0) {
      --c.shotRepeat[SHOT_LEFT_SIDEKICK]!;
    } else {
      const item = p0.items.sidekick[LEFT_SIDEKICK];
      const x = p0.sidekick[LEFT_SIDEKICK].x, y = p0.sidekick[LEFT_SIDEKICK].y;
      sc.b = s16(playerShotCreate(ctx, opts[item]!.wport, SHOT_LEFT_SIDEKICK, x, y, v.mouseX, v.mouseY, opts[item]!.wpnum, 1));
    }
  }

  if (opts[p0.items.sidekick[RIGHT_SIDEKICK]]!.tr === 2) {
    p0.sidekick[RIGHT_SIDEKICK].x = p0.x;
    p0.sidekick[RIGHT_SIDEKICK].y = Math.max(10, p0.y - 20);
  } else {
    p0.sidekick[RIGHT_SIDEKICK].x = 72 + 15;
    p0.sidekick[RIGHT_SIDEKICK].y = 120;
  }

  if (opts[p0.items.sidekick[RIGHT_SIDEKICK]]!.wport > 0) {
    if (c.shotRepeat[SHOT_RIGHT_SIDEKICK]! > 0) {
      --c.shotRepeat[SHOT_RIGHT_SIDEKICK]!;
    } else {
      const item = p0.items.sidekick[RIGHT_SIDEKICK];
      const x = p0.sidekick[RIGHT_SIDEKICK].x, y = p0.sidekick[RIGHT_SIDEKICK].y;
      sc.b = s16(playerShotCreate(ctx, opts[item]!.wport, SHOT_RIGHT_SIDEKICK, x, y, v.mouseX, v.mouseY, opts[item]!.wpnum, 1));
    }
  }

  simulatePlayerShots(ctx);

  const opt = tables[OPTION_SHAPES]!;
  blitSprite(screen, 0, 0, opt, 12); // upgrade interface

  // weapon mode indicator
  if (p0.weaponMode === 1) {
    blitSprite(screen, 3, 56, opt, 18); // lit
    blitSprite(screen, 3, 64, opt, 19); // unlit
  } else { // == 2
    blitSprite(screen, 3, 56, opt, 19); // unlit
    blitSprite(screen, 3, 64, opt, 18); // lit
  }

  /*========================Power Bar=========================*/

  c.power = (c.power + c.powerAdd) >>> 0;
  if (c.power > 900) c.power = 900;

  sc.temp = u8(Math.trunc(c.power / 10));

  for (sc.temp = u8(147 - sc.temp); sc.temp <= 146; sc.temp = u8(sc.temp + 1)) {
    sc.temp2 = u8(113 + Math.trunc((146 - sc.temp) / 9) + 2);
    sc.temp3 = u8((sc.temp + 1) % 6);
    if (sc.temp3 === 1) sc.temp2 = u8(sc.temp2 + 3);
    else if (sc.temp3 !== 0) sc.temp2 = u8(sc.temp2 + 2);

    pix(screen, 141, sc.temp, sc.temp2 - 3);
    pix(screen, 142, sc.temp, sc.temp2 - 3);
    pix(screen, 143, sc.temp, sc.temp2 - 2);
    pix(screen, 144, sc.temp, sc.temp2 - 1);
    fillRectangleXY(screen, 145, sc.temp, 149, sc.temp, sc.temp2);

    if (sc.temp2 - 3 < 112) sc.temp2 = u8(sc.temp2 + 1);
  }

  sc.temp = u8(147 - Math.trunc(c.power / 10));
  sc.temp2 = u8(113 + Math.trunc((146 - sc.temp) / 9) + 4);

  pix(screen, 141, sc.temp - 1, sc.temp2 - 1);
  pix(screen, 142, sc.temp - 1, sc.temp2 - 1);
  pix(screen, 143, sc.temp - 1, sc.temp2 - 1);
  pix(screen, 144, sc.temp - 1, sc.temp2 - 1);

  fillRectangleXY(screen, 145, sc.temp - 1, 149, sc.temp - 1, sc.temp2);

  c.lastPower = sc.temp;
}

// port of JE_weaponSimUpdate (game_menu.c:3236)
export function weaponSimUpdate(ctx: Ctx, s: ShopState): void {
  const g = ctx.game;
  const sc = g.scratch;
  const p0 = g.players[0];
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const miscText = ctx.assets.helpText.miscText;
  const opt = tables[OPTION_SHAPES]!;

  weaponViewFrame(ctx, s);

  ++s.weaponSimTime;
  s.weaponSimTime %= 150;

  if (s.leftPower || s.rightPower) {
    if (!s.leftPower) blitSprite(screen, 24, 149, opt, 13); // downgrade disabled
    if (!s.rightPower || !s.rightPowerAfford) blitSprite(screen, 119, 149, opt, 14); // upgrade disabled

    sc.temp = u8(p0.items.weapon[s.curSel[MENU_UPGRADES]! - 3]!.power);

    if (s.curMenu === MENU_UPGRADE_SUB && s.curSel[MENU_UPGRADES] === 4 &&
        g.items.weaponPort[p0.items.weapon[REAR_WEAPON]!.id]!.opnum === 2 && s.weaponSimTime >= 75) {
      // [/] Rear Weapon Mode
      outText(screen, tables, 28, 137, miscText[70]!, 1, 4);
    } else {
      if (s.leftPower) outText(screen, tables, 26, 137, String(g.varz.downgradeCost), 1, 4);
      if (s.rightPower) outText(screen, tables, 108, 137, String(g.varz.upgradeCost), s.rightPowerAfford ? 1 : 7, 4);

      outText(screen, tables, 58, 137, `${ctx.assets.helpText.miscTextB[5]!} ${sc.temp}`, 15, 4);
    }

    for (let x = 1; x <= sc.temp; x++) {
      fillRectangleXY(screen, 39 + x * 6, 151, 39 + x * 6 + 4, 151, 251);
      pix(screen, 39 + x * 6, 151, 252);
      fillRectangleXY(screen, 39 + x * 6, 152, 39 + x * 6 + 4, 164, 250);
      fillRectangleXY(screen, 39 + x * 6, 165, 39 + x * 6 + 4, 165, 249);
    }
  } else {
    blitSprite(screen, 20, 146, opt, 17); // hide power level interface
  }

  drawItem(ctx, 1, p0.items.ship, p0.x - 5, p0.y - 7);
}

// ---------------------------------------------------------------------------------------------------------------------
// ship specs

// port of JE_drawLines (game_menu.c:2070)
function drawLines(surface: Surface, dark: boolean): void {
  const tempX2 = -10;
  const tempY2 = 0;

  let tempW = 0;
  for (let x = 0; x < 20; x++) {
    tempW += 15;
    const tempX = tempW - tempX2;
    if (tempX > 18 && tempX < 135) {
      if (dark) rectangle(surface, tempX + 1, 0, tempX + 1, 199, 32 + 3);
      else rectangle(surface, tempX, 0, tempX, 199, 32 + 5);
    }
  }

  tempW = 0;
  for (let y = 0; y < 20; y++) {
    tempW += 15;
    const tempY = tempW - tempY2;
    if (tempY > 15 && tempY < 169) {
      if (dark) rectangle(surface, 0, tempY + 1, 319, tempY + 1, 32 + 3);
      else rectangle(surface, 0, tempY, 319, tempY, 32 + 5);

      let tempW2 = 0;
      for (let x = 0; x < 20; x++) {
        tempW2 += 15;
        const tempX = tempW2 - tempX2;
        if (tempX > 18 && tempX < 135) pix3(surface, tempX, tempY, 32 + 6);
      }
    }
  }
}

// port of JE_scaleBitmap (game_menu.c:2210)
function scaleBitmap(dst: Surface, src: Surface, x1: number, y1: number, x2: number, y2: number): void {
  const w = x2 - x1 + 1, h = y2 - y1 + 1;
  const baseSkipW = f32(src.pitch / w), baseSkipH = f32(src.h / h);
  let cumH = 0;
  let d = y1 * dst.pitch + x1;

  for (let i = 0; i < h; i++) {
    const srcW = src.w * (cumH >>> 0);
    let sp = srcW;
    cumH = f32(cumH + baseSkipH);
    let cumW = 0;

    for (let j = 0; j < w; j++) {
      dst.pixels[d++] = src.pixels[sp]!;
      cumW = f32(cumW + baseSkipW);
      sp = srcW + (cumW >>> 0); // value is floored
    }

    d += dst.pitch - w;
  }
}

// port of JE_drawShipSpecs (game_menu.c:3129)
function drawShipSpecs(ctx: Ctx, s: ShopState, screen: Surface, tempScreen: Surface): void {
  const g = ctx.game;
  const tables = ctx.assets.shapes.tables;
  const help = ctx.assets.helpText;
  const ship = g.players[0].items.ship;
  const ts = g.text;

  clearSurface(screen);
  drawLines(screen, true);
  drawLines(screen, false);
  rectangle(screen, 0, 0, 319, 199, 37);
  rectangle(screen, 1, 1, 318, 198, 35);

  ts.verticalHeight = 9;
  outText(screen, tables, 10, 2, g.items.ships[ship]!.name, 12, 3);
  helpBox(ctx, screen, 100, 20, help.shipInfo[ship - 1]![0], 40);
  helpBox(ctx, screen, 100, 100, help.shipInfo[ship - 1]![1], 40);
  ts.verticalHeight = 7;

  outText(screen, tables, fontCenter(help.miscText[4]!, tables, TINY_FONT), 190, help.miscText[4]!, 12, 2);

  //now draw the green ship over that.
  let tempIndex: number;
  if (ship > 90) tempIndex = 32;
  else if (ship > 0) tempIndex = g.items.ships[ship]!.bigshipgraphic;
  else tempIndex = g.items.ships[s.oldItems[0].ship]!.bigshipgraphic;

  let tempX = 0, tempY = 0;
  switch (tempIndex) {
    case 32: tempX = 35; tempY = 33; break;
    case 28: tempX = 31; tempY = 36; break;
    case 33: tempX = 31; tempY = 35; break;
    case 45: tempX = 36; tempY = 33; break;
    case 46: tempX = 30; tempY = 30; break;
    default: throw new Error(`JE_drawShipSpecs: assert(0) failed (bigshipgraphic ${tempIndex})`);
  }
  tempX -= 30;

  //draw the ship into our temp buffer.
  clearSurface(tempScreen);
  blitSprite(tempScreen, tempX, tempY, tables[OPTION_SHAPES]!, tempIndex - 1); // ship illustration

  // greenify: one line at a time
  const pitch = screen.pitch;
  const dst = screen.pixels, src = tempScreen.pixels;
  let i = 0;
  for (let y = 0; y < screen.h; y++) {
    for (let x = 0; x < pitch; x++, i++) {
      let avg = 0;
      if (y > 0) avg += src[i - pitch]! & 0x0f;
      if (y < screen.h - 1) avg += src[i + pitch]! & 0x0f;
      if (x > 0) avg += src[i - 1]! & 0x0f;
      if (x < pitch - 1) avg += src[i + 1]! & 0x0f;
      avg = Math.trunc(avg / 4);

      if ((src[i]! & 0x0f) > avg) dst[i] = (src[i]! & 0x0f) | 0xc0;
    }
  }
}

// port of JE_scaleInPicture (game_menu.c:2645)
async function scaleInPicture(ctx: Ctx, dst: Surface, src: Surface): Promise<void> {
  for (let i = 2; i <= 160; i += 2) {
    if (anyButton(ctx)) break;

    scaleBitmap(dst, src, 160 - i, 0, 160 + i - 1, 100 + roundf32(f32(i * 0.625)) - 1);
    showVGA(ctx);

    await ctx.clock.sleep(1); // SDL_Delay(1)
  }
}

// port of JE_doShipSpecs (game_menu.c:2318)
export async function doShipSpecs(ctx: Ctx, s: ShopState): Promise<void> {
  //create the image we want
  await waitNoInput(ctx, true, true, true);
  drawShipSpecs(ctx, s, ctx.vga.gameScreen, ctx.vga.screen2);

  //reset VGAScreen2, which we clobbered
  loadPic(ctx.assets.pics, ctx.palette, ctx.vga.screen2, 1, false);

  //draw it
  ctx.audio.playSample(S_SPRING);
  await scaleInPicture(ctx, ctx.vga.screen, ctx.vga.gameScreen);
  await waitInput(ctx, true, true, true);
}
