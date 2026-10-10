// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/game_menu.c (MENU_2_PLAYER_ARCADE: JE_itemScreen draw and input, JE_menuFunction)
import { S_CURSOR } from '../audio/ids';
import type { Ctx } from '../ctx';
import { joystickCount, nextInputDevice } from '../game/twoplayer';
import { FULL_SHADE, dString, textShade } from '../video/fonthand';
import { SMALL_FONT_SHAPES } from '../video/sprite';
import { quitRequest } from './shop';
import { MENU_2_PLAYER_ARCADE, MENU_OPTIONS, type ShopState } from './shop-draw';

export { nextInputDevice, normalizeInputDevices } from '../game/twoplayer';

/** The left panel of the two-player menus: the two cash lines (game_menu.c:645-657). */
// port of JE_itemScreen, left side (game_menu.c:645)
export function drawTwoPlayerScores(ctx: Ctx): void {
  const miscText = ctx.assets.helpText.miscText;
  for (let i = 0; i < 2; ++i) {
    textShade(ctx.vga.screen, ctx.assets.shapes.tables, 25, 50 + 10 * i, `${miscText[40 + i]!} ${ctx.game.players[i]!.cash}`, 15, 0, FULL_SHADE);
  }
}

/**
 * The input device names of MENU_2_PLAYER_ARCADE (game_menu.c:763-776). Like the C, an out-of-range device is repaired
 * here, when drawn.
 */
// port of JE_itemScreen, 2 player input devices (game_menu.c:763)
export function drawTwoPlayerMenu(ctx: Ctx, s: ShopState): void {
  if (s.curMenu !== MENU_2_PLAYER_ARCADE) return;
  const devices = ctx.game.config.inputDevice;
  const names = ctx.assets.helpText.inputDevices;
  const joysticks = joystickCount(ctx);
  for (let i = 0; i < 2; i++) {
    if (devices[i]! > 2 + joysticks) devices[i] = devices[i === 0 ? 1 : 0] === 1 ? 2 : 1;
    const text = joysticks > 1 && devices[i]! > 2 ? `${names[2]!} ${devices[i]! - 2}` : names[devices[i]! - 1]!;
    dString(ctx.vga.screen, ctx.assets.shapes.tables, 186, 38 + 2 * (i + 1) * 16, text, SMALL_FONT_SHAPES);
  }
}

/** Left/Right on rows 3 and 4 (game_menu.c:1451-1470, 1544-1565). */
export function twoPlayerLeftRight(ctx: Ctx, s: ShopState, dir: 1 | -1): void {
  if (s.curMenu !== MENU_2_PLAYER_ARCADE) return;
  const sel = s.curSel[MENU_2_PLAYER_ARCADE]!;
  if (sel !== 3 && sel !== 4) return;
  ctx.audio.playSample(S_CURSOR);
  nextInputDevice(ctx.game.config.inputDevice, (sel - 3) as 0 | 1, dir, joystickCount(ctx));
}

/** The Enter handler of MENU_2_PLAYER_ARCADE (game_menu.c:2925-2958); The mouse remap of the rows (game_menu.c:1154-1165) lives in handleMouse (shop.ts). */
// port of JE_menuFunction, case MENU_2_PLAYER_ARCADE
export async function twoPlayerEnter(ctx: Ctx, s: ShopState, selection: number): Promise<void> {
  const v = ctx.game.varz;
  switch (s.curSel[MENU_2_PLAYER_ARCADE]) {
    case 2:
      ctx.game.config.mainLevel = v.mapSection[v.mapPNum - 1]!;
      v.jumpSection = true;
      break;
    case 3:
    case 4:
      ctx.audio.playSample(S_CURSOR);
      nextInputDevice(ctx.game.config.inputDevice, (s.curSel[MENU_2_PLAYER_ARCADE]! - 3) as 0 | 1, 1, joystickCount(ctx));
      break;
    case 5:
      s.curMenu = MENU_OPTIONS;
      break;
    case 6:
      if (await quitRequest(ctx)) {
        v.gameLoaded = true;
        ctx.game.config.mainLevel = 0;
      }
      break;
  }
  void selection;
}
