// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/game_menu.c (JE_itemScreen, JE_menuFunction, JE_quitRequest)
//
// The skeleton of JE_itemScreen: the outer draw step, the per-menu Enter handler (`menuFunction`, the C's
// JE_menuFunction switch), the mouse and key handlers, and the inner animation loop. Every C menu is ported;
// `PORTED_MENUS` guards against a corrupt curMenu.
import { S_CLICK, S_CURSOR, S_SPRING } from '../audio/ids';
import { idiv, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { loadCompShapes } from '../data/shapes';
import { getShipInfo } from '../game/shots';
import { SA_NONE } from '../game/world';
import { waitDelayPlain, waitNoInput } from '../platform/wait';
import { fadeBlack, fadePalette } from '../video/fade';
import { barDrawShadow } from '../video/glow-text';
import { DARKEN, FULL_SHADE, dString, outTextAdjust, textShade, textWidth } from '../video/fonthand';
import { MOUSE_POINTER_NORMAL, mouseReplace, mouseStart } from '../video/mouse';
import { FONT_SHAPES, OPTION_SHAPES, SMALL_FONT_SHAPES, blitSprite, blitSpriteDark } from '../video/sprite';
import { barShade } from '../video/vga256d';
import { copySurface } from '../video/surface';
import { showVGA } from '../video/video';
import { helpBox } from './help-box';
import {
  ITEM_AVAIL_MAP, MENU_1_PLAYER_ARCADE, MENU_2_PLAYER_ARCADE, MENU_CHOICES_DEFAULT, MENU_DATA_CUBES, MENU_DATA_CUBE_SUB,
  MENU_ESC, MENU_FULL_GAME, MENU_LIMITED_OPTIONS, MENU_LOAD_SAVE, MENU_OPTIONS, MENU_PLAY_NEXT_LEVEL, MENU_SUPER_TYRIAN,
  MENU_UPGRADES, MENU_UPGRADE_SUB, ShopState, drawMainMenuHelpText, drawMenuChoices, drawMenuHeader, drawScore,
  drawShipIllustration, drawSuperArcadePanel, getPlayerItem,
} from './shop-draw';
import { NavState, PLANET_X, PLANET_Y, computeDots, updateNavScreen } from './shop-nav';
import { Scancode } from '../platform/scancodes';
import {
  doShipSpecs, drawUpgradeSub, isWeaponSimMenu, menuFunctionUpgradeSub, menuFunctionUpgrades, resetTempWeaponPower,
  upgradeSubCursorMoved, upgradeSubDoneClick, upgradeSubEnter, upgradeSubEscape, upgradeSubLeftRight, upgradeSubPowerButtons,
  upgradeSubSelectClick, upgradeSubSlash, weaponSimUpdate,
} from './shop-weapon';

import { shopHelp } from './help-system';
import { drawTwoPlayerMenu, drawTwoPlayerScores, twoPlayerEnter, twoPlayerLeftRight } from './shop-twoplayer';
import { quickSaveLoad } from './save-ui';
import { cubeReaderFrame, cubeScrollInput, cubesHomeEnd, cubesMouse, drawCubePanel, drawCubeTitle, drawFlashyCube, loadCubes } from './shop-cubes';
import { drawConfigLists, drawVolumeBars, keyboardConfigLeftRight, menuFunctionC, optionsLeftRight, optionsMouse } from './shop-options';
export { ShopState } from './shop-draw';

const SC_SLASH = 56; // SDL_SCANCODE_SLASH

/** Menus 0..14 are all of the C's menus (MENU_MAX is 15); anything else is an internal error, never reachable. */
const PORTED_MENUS: ReadonlySet<number> = new Set([MENU_FULL_GAME, MENU_UPGRADES, MENU_PLAY_NEXT_LEVEL, MENU_UPGRADE_SUB, MENU_1_PLAYER_ARCADE,
  MENU_OPTIONS, 5 /* KEYBOARD_CONFIG */, MENU_LOAD_SAVE, MENU_DATA_CUBES, MENU_DATA_CUBE_SUB, MENU_LIMITED_OPTIONS,
  12 /* JOYSTICK_CONFIG */, 14 /* MOUSE_CONFIG */, MENU_SUPER_TYRIAN, MENU_2_PLAYER_ARCADE]);

function badMenu(menu: number): never {
  throw new Error(`shop menu ${menu} does not exist`);
}

// JE_mousePosition(&mouseX, &mouseY) into the mouse.c globals (varz.mouseX/Y, JE_word) and the shop's mouseButton
function mousePosition(ctx: Ctx, s: ShopState): number {
  const b = ctx.input.mousePosition();
  ctx.game.varz.mouseX = u16(ctx.input.mouseX);
  ctx.game.varz.mouseY = u16(ctx.input.mouseY);
  s.mouseButton = u16(b);
  return s.mouseButton;
}

// port of JE_quitRequest (game_menu.c:2487). Returns true when the player chose to quit.
export async function quitRequest(ctx: Ctx): Promise<boolean> {
  const { input, audio } = ctx;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const miscText = ctx.assets.helpText.miscText;
  let quitSelected = true;
  let done = false;

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
      textShade(screen, tables, 70, 60, miscText[28]!, 0, 5, FULL_SHADE);
      helpBox(ctx, screen, 70, 90, miscText[30]!, 30);

      col = u8(col + colC);
      if (col > 8 || col < 2) colC = -colC;

      let tempX = 54 + 45 - idiv(textWidth(miscText[9]!, tables, FONT_SHAPES), 2);
      let tempC = quitSelected ? col - 12 : -5;
      outTextAdjust(screen, tables, tempX, 128, miscText[9]!, 15, tempC, FONT_SHAPES, true);

      tempX = 149 + 45 - idiv(textWidth(miscText[10]!, tables, FONT_SHAPES), 2);
      tempC = !quitSelected ? col - 12 : -5;
      outTextAdjust(screen, tables, tempX, 128, miscText[10]!, 15, tempC, FONT_SHAPES, true);

      if (ctx.mouse.hasMouse) {
        mouseStart(ctx);
        showVGA(ctx);
        mouseReplace(ctx);
      } else {
        showVGA(ctx);
      }

      await waitDelayPlain(ctx);

      ctx.input.pushJoysticksAsKeyboard();
      input.serviceEvents(false);
    } while (!input.newkey && !input.mousedown);

    if (input.mousedown) {
      if (input.lastmouseY > 123 && input.lastmouseY < 149) {
        if (input.lastmouseX > 56 && input.lastmouseX < 142) {
          quitSelected = true;
          done = true;
        } else if (input.lastmouseX > 151 && input.lastmouseX < 237) {
          quitSelected = false;
          done = true;
        }
      }
      input.mousedown = false;
    } else if (input.newkey) {
      switch (input.lastkeyScan) {
        case Scancode.Left:
        case Scancode.Right:
        case Scancode.Tab:
          quitSelected = !quitSelected;
          audio.playSample(S_CURSOR);
          break;
        case Scancode.Return:
        case Scancode.Space:
          done = true;
          break;
        case Scancode.Escape:
          quitSelected = false;
          done = true;
          break;
      }
    }
  }

  audio.playSample(quitSelected ? S_SPRING : S_CLICK);

  // network games (isNetworkGame) are not part of the port
  return quitSelected;
}

// port of JE_menuFunction (game_menu.c:2669), for the ported menus
async function menuFunction(ctx: Ctx, s: ShopState, select: number): Promise<void> {
  const g = ctx.game;
  const v = g.varz;
  const sc = g.scratch;
  const curSelect = s.curSel[s.curMenu]!;

  s.col = 0;
  s.colC = -1;
  ctx.audio.playSample(S_CLICK);

  switch (s.curMenu) {
    case MENU_FULL_GAME:
      switch (select) {
        case 2: // cubes
          s.curMenu = MENU_DATA_CUBES;
          s.curSel[MENU_DATA_CUBES] = 2;
          break;
        case 3: // shipspecs
          await doShipSpecs(ctx, s);
          break;
        case 4: // upgradeship
          s.curMenu = MENU_UPGRADES;
          break;
        case 5: // options
          s.curMenu = MENU_OPTIONS;
          break;
        case 6: { // nextlevel
          s.curMenu = MENU_PLAY_NEXT_LEVEL;
          s.newPal = 18;
          const nav = s.nav!;
          computeDots(ctx, nav);
          nav.navX = Math.fround(PLANET_X[v.mapOrigin - 1]!);
          nav.navY = Math.fround(PLANET_Y[v.mapOrigin - 1]!);
          nav.newNavX = nav.navX;
          nav.newNavY = nav.navY;
          s.menuChoices[MENU_PLAY_NEXT_LEVEL] = v.mapPNum + 2;
          s.curSel[MENU_PLAY_NEXT_LEVEL] = 2;
          s.menuInt[4]![0] = 'Next Level';
          let x = 0;
          for (; x < v.mapPNum; x++) {
            sc.temp = v.mapPlanet[x]!;
            s.menuInt[4]![x + 1] = ctx.assets.helpText.pName[sc.temp - 1]!;
          }
          s.menuInt[4]![x + 1] = ctx.assets.helpText.miscText[5]!;
          break;
        }
        case 7: // quit
          if (await quitRequest(ctx)) {
            v.gameLoaded = true;
            g.config.mainLevel = 0;
          }
          break;
      }
      break;

    case MENU_PLAY_NEXT_LEVEL:
      if (select === s.menuChoices[MENU_PLAY_NEXT_LEVEL]) { // exit
        s.curMenu = MENU_FULL_GAME;
        s.newPal = 1;
      } else {
        g.config.mainLevel = v.mapSection[curSelect - 2]!;
        v.jumpSection = true;
      }
      break;

    case MENU_1_PLAYER_ARCADE:
      switch (s.curSel[s.curMenu]) {
        case 2:
          g.config.mainLevel = v.mapSection[v.mapPNum - 1]!;
          v.jumpSection = true;
          break;
        case 3:
          s.curMenu = MENU_OPTIONS; // isNetworkGame ? MENU_LIMITED_OPTIONS : MENU_OPTIONS
          break;
        case 4:
          if (await quitRequest(ctx)) {
            v.gameLoaded = true;
            g.config.mainLevel = 0;
          }
          break;
      }
      break;

    case MENU_SUPER_TYRIAN:
      switch (s.curSel[s.curMenu]) {
        case 2:
          g.config.mainLevel = v.mapSection[v.mapPNum - 1]!;
          v.jumpSection = true;
          break;
        case 3:
          await doShipSpecs(ctx, s);
          break;
        case 4:
          s.curMenu = MENU_OPTIONS;
          break;
        case 5:
          if (await quitRequest(ctx)) {
            v.gameLoaded = true;
            g.config.mainLevel = 0;
          }
          break;
      }
      break;

    case MENU_UPGRADES:
      menuFunctionUpgrades(ctx, s, select);
      break;

    case MENU_UPGRADE_SUB:
      menuFunctionUpgradeSub(ctx, s);
      break;

    default:
      // OPTIONS, KEYBOARD_CONFIG, LOAD_SAVE, DATA_CUBES, DATA_CUBE_SUB, LIMITED_OPTIONS, JOYSTICK_CONFIG, MOUSE_CONFIG: shop-options.ts
      if (s.curMenu === MENU_2_PLAYER_ARCADE) {
        if (twoPlayerEnter(ctx, s) && await quitRequest(ctx)) {
          v.gameLoaded = true;
          g.config.mainLevel = 0;
        }
      }
      else if (!(await menuFunctionC(ctx, s, select, curSelect))) badMenu(s.curMenu);
  }

  s.oldItems[0].copyFrom(g.players[0].items);
}

// the mouse branch of the C's input handler (game_menu.c:1088-1250), for the ported menus
async function handleMouse(ctx: Ctx, s: ShopState): Promise<void> {
  const { audio } = ctx;
  const g = ctx.game;
  const p0 = g.players[0];

  s.lastDirection = 1;
  mousePosition(ctx, s);
  const mouseX = g.varz.mouseX, mouseY = g.varz.mouseY;

  cubesMouse(ctx, s); // DATA_CUBES with cubeMax == 0 (back out), DATA_CUBE_SUB "Done" button
  optionsMouse(ctx, s); // OPTIONS / LIMITED_OPTIONS volume sliders (end with set_volume + S_CURSOR)

  if (mouseY > 20 && mouseX > 170 && mouseX < 308 && s.curMenu !== MENU_DATA_CUBE_SUB) {
    const mouseSelectionY = [16, 16, 16, 16, 26, 12, 11, 28, 0, 16, 16, 16, 8, 16, 24];
    let selection = idiv(mouseY - 38, mouseSelectionY[s.curMenu]!) + 2;

    if (s.curMenu === MENU_2_PLAYER_ARCADE) {
      if (selection > 5) selection--;
      if (selection > 3) selection--;
    }

    if (s.curMenu === MENU_FULL_GAME) {
      if (selection > 7) selection = 7;
    }

    // is play next level screen?
    if (s.curMenu === MENU_PLAY_NEXT_LEVEL) {
      if (selection === s.menuChoices[s.curMenu]! + 1) selection = s.menuChoices[s.curMenu]!;
    }

    if (selection <= s.menuChoices[s.curMenu]!) {
      if (s.curMenu === MENU_UPGRADE_SUB && selection === s.menuChoices[MENU_UPGRADE_SUB]) {
        upgradeSubDoneClick(ctx, s);
      } else {
        audio.playSample(S_CLICK);
        if (s.curSel[s.curMenu] === selection) {
          await menuFunction(ctx, s, s.curSel[s.curMenu]!);
        } else if (s.curMenu === MENU_UPGRADE_SUB) {
          upgradeSubSelectClick(ctx, s, selection); // unaffordable: S_CLINK; front/rear power from temp_weapon_power
        } else {
          if (s.curSel[MENU_UPGRADES] === 4) p0.weaponMode = 1;
          s.curSel[s.curMenu] = selection;
        }
      }
    }

    await waitNoInput(ctx, false, true, false);
  }

  await upgradeSubPowerButtons(ctx, s); // UPGRADE_SUB power -/+ buttons (x 23..36 / 119..131, y 149..168)
}

// the key branch of the C's input handler (game_menu.c:1253-1612), for the ported menus
async function handleKey(ctx: Ctx, s: ShopState): Promise<void> {
  const { audio, input } = ctx;
  const g = ctx.game;

  switch (input.lastkeyScan) {
    case SC_SLASH:
      upgradeSubSlash(ctx, s); // UPGRADE_SUB with curSel[UPGRADES] == 4 cycles player[0].weapon_mode
      break;

    case Scancode.Space:
    case Scancode.Return:
      s.keyboardUsed = true;
      upgradeSubEnter(ctx, s); // UPGRADE_SUB front/rear: temp_weapon_power["Done"] = current power
      await menuFunction(ctx, s, s.curSel[s.curMenu]!);
      break;

    case Scancode.Escape:
      s.keyboardUsed = true;
      audio.playSample(S_SPRING);
      if (s.curMenu === MENU_LOAD_SAVE && s.quikSave) {
        s.curMenu = s.oldMenu;
        s.newPal = s.oldPal;
      } else if (MENU_ESC[s.curMenu] === 0) {
        if (await quitRequest(ctx)) {
          g.varz.gameLoaded = true;
          g.config.mainLevel = 0;
        }
      } else {
        upgradeSubEscape(ctx, s); // leaving UPGRADE_SUB without buying restores old_items[0], curSel[UPGRADE_SUB] and the cash
        if (s.curMenu !== MENU_DATA_CUBE_SUB) s.newPal = 1;
        s.curMenu = MENU_ESC[s.curMenu]! - 1;
      }
      break;

    case Scancode.F1:
      await shopHelp(ctx, s); // isNetworkGame is never set: fade_black(10); JE_helpSystem(2); reload the shop picture and palette
      break;

    case Scancode.Up:
      s.keyboardUsed = true;
      s.lastDirection = -1;
      if (s.curMenu !== MENU_DATA_CUBE_SUB) audio.playSample(S_CURSOR);
      s.curSel[s.curMenu] = u8(s.curSel[s.curMenu]! - 1);
      if (s.curSel[s.curMenu]! < 2) s.curSel[s.curMenu] = s.menuChoices[s.curMenu]!;
      upgradeSubCursorMoved(ctx, s); // UPGRADE_SUB front/rear weapon power + weapon_mode; TASK 11: joystick config skips disabled rows
      break;

    case Scancode.Down:
      s.keyboardUsed = true;
      s.lastDirection = 1;
      if (s.curMenu !== MENU_DATA_CUBE_SUB) audio.playSample(S_CURSOR);
      s.curSel[s.curMenu] = u8(s.curSel[s.curMenu]! + 1);
      if (s.curSel[s.curMenu]! > s.menuChoices[s.curMenu]!) s.curSel[s.curMenu] = 2;
      upgradeSubCursorMoved(ctx, s);
      break;

    case Scancode.Home:
    case Scancode.End:
      cubesHomeEnd(s, input.lastkeyScan === Scancode.End); // DATA_CUBE_SUB scroll to top / bottom
      break;

    case Scancode.Left:
    case Scancode.Right:
      // For FULL_GAME, PLAY_NEXT_LEVEL and 1_PLAYER_ARCADE the C does nothing.
      twoPlayerLeftRight(ctx, s, input.lastkeyScan === Scancode.Left ? -1 : 1); // MENU_2_PLAYER_ARCADE rows 3/4
      if (s.curMenu === MENU_UPGRADE_SUB) upgradeSubLeftRight(ctx, s, input.lastkeyScan === Scancode.Left ? -1 : 1);
      keyboardConfigLeftRight(ctx, s); // web extension: keyboard map B page
      optionsLeftRight(ctx, s, input.lastkeyScan === Scancode.Left ? -1 : 1); // OPTIONS / LIMITED_OPTIONS volume
      break;

    default:
      break;
  }
}

/**
 * One visit to the shop (JE_itemScreen). `state` is the game_menu.c statics; pass one in to inspect curMenu afterwards
 * (the oracle's STATE2 `curMenu`).
 */
// port of JE_itemScreen (game_menu.c:157)
export async function itemScreen(ctx: Ctx, state: ShopState = new ShopState()): Promise<void> {
  const g = ctx.game;
  const v = g.varz;
  const c = g.config;
  const sc = g.scratch;
  const { input, audio, vga, palette, assets } = ctx;
  vga.cur = vga.screen; // VGAScreen = VGAScreenSeg (game_menu.c:166)
  const screen = vga.screen;
  const tables = assets.shapes.tables;
  const s = state;

  if (!ctx.shopSpriteSheet) ctx.shopSpriteSheet = loadCompShapes(assets.archive, '1');

  loadCubes(ctx, s); // load_cubes(): reads cubeFile into s.cubes; no side effects on the globals

  s.menuChoices.set(MENU_CHOICES_DEFAULT);
  s.menuInt = assets.helpText.menuInt.map((row) => row.slice()); // strcpy targets (rows 4 and 5) are per game
  s.nav = new NavState();

  audio.playSong(v.songBuy);

  loadPic(assets.pics, palette, screen, 1, false);

  s.curPal = 1;
  s.newPal = 0;

  showVGA(ctx);

  palette.setPalette(palette.colors, 0, 255);

  s.col = 1;
  v.gameLoaded = false;
  s.curSel.fill(2);
  s.curMenu = MENU_FULL_GAME;

  const p0 = g.players[0];
  const it = g.items;

  /* JE: (* Check for where Pitems and Select match up - if no match then add to the itemavail list *) */
  for (let i = 0; i < 7; i++) {
    const item = getPlayerItem(p0.lastItems, i);
    const row = ITEM_AVAIL_MAP[i]! - 1;

    let slot = 0;
    for (; slot < it.itemAvailMax[row]!; ++slot) {
      if (it.itemAvail[row]![slot] === item) break;
    }

    if (slot === it.itemAvailMax[row]) {
      if (slot >= it.itemAvail[row]!.length) throw new RangeError('unported: itemAvail[][10] overflow (game_menu.c:196)');
      it.itemAvail[row]![slot] = item;
      it.itemAvailMax[row]++;
    }
  }

  copySurface(vga.screen2, screen);

  s.keyboardUsed = false;
  s.firstMenu9 = false;
  s.backFromHelp = false;

  /* JE: Sort items in merchant inventory (temp/temp2/temp3 are the shared scratch globals) */
  for (let x = 0; x < 9; x++) {
    const avail = it.itemAvail[x]!;
    const max = it.itemAvailMax[x]!;
    if (max > 1) {
      for (sc.temp = 0; sc.temp < max - 1; sc.temp = u8(sc.temp + 1)) {
        for (sc.temp2 = sc.temp; sc.temp2 < max; sc.temp2 = u8(sc.temp2 + 1)) {
          if (avail[sc.temp] === 0 || (avail[sc.temp]! > avail[sc.temp2]! && avail[sc.temp2] !== 0)) {
            sc.temp3 = avail[sc.temp]!;
            avail[sc.temp] = avail[sc.temp2]!;
            avail[sc.temp2] = sc.temp3;
          }
        }
      }
    }
  }

  do {
    getShipInfo(ctx);

    if (s.curMenu === MENU_FULL_GAME) {
      if (c.twoPlayerMode) s.curMenu = MENU_2_PLAYER_ARCADE;
      if (/* isNetworkGame || */ c.onePlayerAction) s.curMenu = MENU_1_PLAYER_ARCADE;
      if (c.superTyrian) s.curMenu = MENU_SUPER_TYRIAN;
    }

    if (!PORTED_MENUS.has(s.curMenu)) badMenu(s.curMenu);

    s.paletteChanged = false;
    s.leftPower = false;
    s.rightPower = false;

    /* SYN: note reindexing... "firstMenu9" refers to Menu 8 here :( */
    if (s.curMenu !== MENU_DATA_CUBE_SUB || s.firstMenu9) copySurface(screen, vga.screen2);

    resetTempWeaponPower(ctx, s); // UPGRADES (front/rear selected): reset temp_weapon_power[]

    const nav = s.nav;
    if (s.curMenu === MENU_PLAY_NEXT_LEVEL) {
      nav.planetAni = 0;
      s.keyboardUsed = false;
      nav.currentDotNum = 0;
      nav.currentDotWait = 8;
      nav.planetAniWait = 3;
      updateNavScreen(ctx, s, nav);
    }

    /* Draw menu title for everything but upgrade ship submenus */
    if (s.curMenu !== MENU_UPGRADE_SUB) drawMenuHeader(ctx, s);

    /* Draw menu choices for simple menus */
    if ((s.curMenu >= MENU_FULL_GAME && s.curMenu <= MENU_PLAY_NEXT_LEVEL) ||
        (s.curMenu >= MENU_2_PLAYER_ARCADE && s.curMenu <= MENU_LIMITED_OPTIONS) || s.curMenu >= MENU_SUPER_TYRIAN) {
      drawMenuChoices(ctx, s);
    }

    /* Data cube icons */
    if (s.curMenu === MENU_FULL_GAME) {
      const opt = tables[OPTION_SHAPES]!;
      for (let i = 1; i <= c.cubeMax; i++) {
        blitSpriteDark(screen, 190 + i * 18 + 2, 37 + 1, opt, 34, false);
        blitSprite(screen, 190 + i * 18, 37, opt, 34); // data cube
      }
    }

    drawConfigLists(ctx, s); // MOUSE_CONFIG / LOAD_SAVE / KEYBOARD_CONFIG / JOYSTICK_CONFIG lists
    if (s.curMenu === MENU_UPGRADE_SUB) drawUpgradeSub(ctx, s);

    /* Draw current money and shield/armor bars, when appropriate */
    if (((s.curMenu <= MENU_OPTIONS || s.curMenu === 5 || s.curMenu === MENU_LOAD_SAVE || s.curMenu >= MENU_1_PLAYER_ARCADE) &&
         !c.twoPlayerMode) || (s.curMenu === MENU_UPGRADE_SUB && s.curSel[MENU_UPGRADES]! >= 1 && s.curSel[MENU_UPGRADES]! <= 6)) {
      if (s.curMenu !== MENU_UPGRADE_SUB) textShade(screen, tables, 65, 173, String(p0.cash), 1, 6, DARKEN);
      barDrawShadow(screen, 42, 152, 3, 14, p0.armor, 2, 13);
      barDrawShadow(screen, 104, 152, 2, 14, it.shields[p0.items.shield]!.mpwr * 2, 2, 13);
    }

    /* Draw crap on the left side of the screen, i.e. two player scores, ship graphic, etc. */
    if ((s.curMenu >= MENU_FULL_GAME && s.curMenu <= MENU_OPTIONS) || s.curMenu === 5 || s.curMenu === MENU_LOAD_SAVE ||
        s.curMenu >= MENU_2_PLAYER_ARCADE ||
        (s.curMenu === MENU_UPGRADE_SUB && (s.curSel[MENU_UPGRADES] === 2 || s.curSel[MENU_UPGRADES] === 5))) {
      if (c.twoPlayerMode) {
        drawTwoPlayerScores(ctx);
      } else if (c.superArcadeMode !== SA_NONE || c.superTyrian) {
        drawSuperArcadePanel(ctx, s);
      } else {
        drawShipIllustration(ctx);
      }
    }

    drawVolumeBars(ctx, s);
    drawCubePanel(ctx, s); // DATA_CUBES / DATA_CUBE_SUB panel
    drawTwoPlayerMenu(ctx, s); // MENU_2_PLAYER_ARCADE input devices (game_menu.c:763)

    /* JE: { - Step VI - Help text for current cursor location } */
    v.flash = 0;

    /* JE: {Reset player weapons} */
    c.shotMultiPos.fill(0);

    drawScore(ctx, s);
    drawMainMenuHelpText(ctx, s);

    if (s.newPal > 0) { /* can't reindex this :( */
      s.curPal = s.newPal;
      palette.colors.set(palette.palettes[s.newPal - 1]!);
      palette.setPalette(palette.palettes[s.newPal - 1]!, 0, 255);
      s.newPal = 0;
    }

    drawCubeTitle(ctx, s);

    /* SYN: Everything above was just drawing the screen. In the rest of it, we process
       any user input (and do a few other things) */
    input.serviceEvents(true);

    // constantPlay is always false in the port
    let inputDetected: boolean;
    do {
      ctx.mouse.cursor = MOUSE_POINTER_NORMAL;

      s.col += s.colC;
      if (s.col < -2 || s.col > 6) s.colC = -1 * s.colC;

      drawFlashyCube(ctx, s); // MENU_DATA_CUBES flashing cube

      if (s.curMenu === MENU_PLAY_NEXT_LEVEL) {
        updateNavScreen(ctx, s, nav);
        drawMainMenuHelpText(ctx, s);
        drawMenuHeader(ctx, s);
        drawMenuChoices(ctx, s);
        if (c.extraGame) dString(screen, tables, 170, 140, assets.helpText.miscText[68 - 1]!, FONT_SHAPES);
      }

      if (s.curMenu === MENU_DATA_CUBE_SUB) { // data cube reading (its own draw; setDelay(1))
        await cubeReaderFrame(ctx, s);
      } else if (isWeaponSimMenu(s)) { // IF (curmenu = 5) AND (cursel [2] IN [3, 4, 6, 7, 8])
        ctx.delay.setDelay(3);
        weaponSimUpdate(ctx, s);
        drawScore(ctx, s);
        input.serviceEvents(false);

        if (s.newPal > 0) {
          s.curPal = s.newPal;
          palette.setPalette(palette.palettes[s.newPal - 1]!, 0, 255);
          s.newPal = 0;
        }

        mouseStart(ctx);

        if (s.paletteChanged) {
          palette.setPalette(palette.colors, 0, 255);
          s.paletteChanged = false;
        }

        showVGA(ctx); /* SYN: This is where it updates the screen for the weapon sim */

        if (s.backFromHelp) {
          await fadePalette(ctx, palette.colors, 10, 0, 255);
          s.backFromHelp = false;
        }

        mouseReplace(ctx);
      } else {
        /* current menu is anything but weapon sim or datacube */
        ctx.delay.setDelay(2);

        drawScore(ctx, s);

        if (s.newPal > 0) {
          s.curPal = s.newPal;
          palette.setPalette(palette.palettes[s.newPal - 1]!, 0, 255);
          s.newPal = 0;
        }

        mouseStart(ctx);

        if (s.paletteChanged) {
          palette.setPalette(palette.colors, 0, 255);
          s.paletteChanged = false;
        }

        showVGA(ctx); /* SYN: This is the where the screen updates for most menus */

        mouseReplace(ctx);

      }

      if (s.backFromHelp) { // the other branches clear it themselves
        await fadePalette(ctx, palette.colors, 10, 0, 255);
        s.backFromHelp = false;
      }

      await waitDelayPlain(ctx);

      ctx.input.pushJoysticksAsKeyboard();
      input.serviceEvents(false);
      const mouseButton = mousePosition(ctx, s);
      inputDetected = input.newkey || mouseButton > 0;

      quickSaveLoad(ctx, s); // Alt+S / Alt+L

      if (s.curMenu === MENU_DATA_CUBE_SUB) inputDetected = cubeScrollInput(ctx, s, inputDetected); // scroll keys / mouse arrows
    } while (!inputDetected);

    s.keyboardUsed = false;

    /* The rest of this just grabs input events, handles them, then proceeds on. */
    if (s.mouseButton > 0) await handleMouse(ctx, s);
    else if (input.newkey) await handleKey(ctx, s);
  } while (!(/* quit || */ v.gameLoaded || v.jumpSection));

  // network games: not part of the port

  if (v.gameLoaded) await fadeBlack(ctx, 10);
}
