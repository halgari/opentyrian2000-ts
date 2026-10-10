// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (newSuperArcadeGame, newSuperTyrianGame, JE_whoa)
import { SONG_TITLE, V_GOOD_LUCK } from '../audio/ids';
import { u16 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadPic } from '../data/pic';
import { DIFFICULTY_SUICIDE, DIFFICULTY_ZINGLON } from '../game/world';
import { waitDelayPlain, waitInput, waitNoInput } from '../platform/wait';
import { Scancode } from '../platform/scancodes';
import { fadeBlack, fadePalette } from '../video/fade';
import { dString, fontCenter, outText } from '../video/fonthand';
import { anyButton } from '../video/glow-text';
import { FONT_SHAPES, SMALL_FONT_SHAPES } from '../video/sprite';
import { blitSprite2x2 } from '../video/sprite2';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';
import { episodeSelect, difficultySelect } from './select';

// port of newSuperArcadeGame (tyrian2.c:3676)
export async function newSuperArcadeGame(ctx: Ctx, i: number): Promise<boolean> {
  const g = ctx.game;
  const c = g.config;
  const sc = g.scratch;
  const p0 = g.players[0];
  const { vga, palette, assets } = ctx;
  const tables = assets.shapes.tables;
  const screen = vga.screen;

  p0.items.ship = g.tables.SAShip[i]!;

  if (await episodeSelect(ctx) && await difficultySelect(ctx)) {
    /* Start special mode! */
    loadPic(assets.pics, palette, screen, 1, false);
    clearSurface(screen);
    const superShips = assets.helpText.superShips;
    dString(screen, tables, fontCenter(superShips[0]!, tables, FONT_SHAPES), 30, superShips[0]!, FONT_SHAPES);
    dString(screen, tables, fontCenter(superShips[i + 1]!, tables, SMALL_FONT_SHAPES), 100, superShips[i + 1]!, SMALL_FONT_SHAPES);
    sc.tempW = u16(g.items.ships[p0.items.ship]!.shipgraphic); // tempW is a global scratch: STATE2 records it
    if (sc.tempW > 500) blitSprite2x2(screen, 148, 70, assets.shapes.spriteSheetT2000, sc.tempW - 500);
    else if (sc.tempW !== 1) blitSprite2x2(screen, 148, 70, assets.shapes.spriteSheet9, sc.tempW);

    showVGA(ctx);
    await fadePalette(ctx, palette.colors, 50, 0, 255);

    await waitInput(ctx, true, true, true);

    c.twoPlayerMode = false;
    c.onePlayerAction = true;
    c.superArcadeMode = i + 1;
    c.timedBattleMode = false;
    g.varz.gameLoaded = true;
    c.difficultyLevel += 1; // initialDifficulty = ++difficultyLevel (the game is one level harder than selected)
    c.initialDifficulty = c.difficultyLevel;

    p0.cash = 0;

    p0.items.weapon[0].id = g.tables.SAWeapon[i]![0]!;
    p0.items.special = g.tables.SASpecialWeapon[i]!;
    if (c.superArcadeMode === SA_NORTSHIPZ) {
      for (let k = 0; k < p0.items.sidekick.length; ++k) p0.items.sidekick[k] = 24; // Companion Ship Quicksilver
    }

    await fadeBlack(ctx, 10);
  }

  return g.varz.gameLoaded;
}

const SA_NORTSHIPZ = 7;

// port of newSuperTyrianGame (tyrian2.c:3719)
export async function newSuperTyrianGame(ctx: Ctx): Promise<boolean> {
  const g = ctx.game;
  const c = g.config;
  const p0 = g.players[0];
  const { palette, assets, audio } = ctx;
  const tables = assets.shapes.tables;
  const screen = ctx.vga.screen;
  const ht = assets.helpText;

  c.initialDifficulty = ctx.input.keysactive[Scancode.ScrollLock] ? DIFFICULTY_SUICIDE : DIFFICULTY_ZINGLON;

  clearSurface(screen);
  outText(screen, tables, 10, 10, ht.superTyrianText[0]!, 15, 4);
  if (c.initialDifficulty === DIFFICULTY_ZINGLON) outText(screen, tables, 10, 20, ht.superTyrianText[1]!, 15, 4);
  else outText(screen, tables, 10, 20, ht.superTyrianText[2]!, 15, 4);
  outText(screen, tables, 10, 30, ht.superTyrianText[3]!, 15, 4);
  if (c.initialDifficulty === DIFFICULTY_ZINGLON) outText(screen, tables, 10, 40, ht.superTyrianText[4]!, 15, 4);
  outText(screen, tables, 10, 60, ht.superTyrianText[5]!, 15, 4);

  // snprintf into a 26 byte buffer: at most 25 characters
  const buf = `${ht.miscTextB[4]!} ${ht.pName[0]!}`.slice(0, 25);
  dString(screen, tables, fontCenter(buf, tables, FONT_SHAPES), 110, buf, FONT_SHAPES);

  audio.playSong(16);
  audio.playSample(V_GOOD_LUCK);

  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 10, 0, 255);

  await waitNoInput(ctx, true, true, true);
  await waitInput(ctx, true, true, true);

  await fadeBlack(ctx, 1);
  if (await episodeSelect(ctx)) { // T2000 let you choose the starting episode
    // constantDie = false has no TS field (always false)
    c.superTyrian = true;
    c.onePlayerAction = true;
    c.timedBattleMode = false;
    g.varz.gameLoaded = true;
    c.difficultyLevel = c.initialDifficulty;

    p0.cash = 0;

    p0.items.ship = 13; // The Stalker 21.126
    p0.items.weapon[0].id = 39; // Atomic RailGun

    await fadeBlack(ctx, 10);
    return true;
  }
  audio.playSong(SONG_TITLE);
  return false;
}

// port of JE_whoa (tyrian2.c:5221): the pixel-bleeding fade used by 'engage'
export async function whoa(ctx: Ctx): Promise<void> {
  const { vga } = ctx;
  const vgaPix = vga.screen.pixels;
  let t1 = vga.gameScreen.pixels; // TempScreen1
  let t2 = vga.screen2.pixels; // TempScreen2

  const pitch = vga.screen.pitch;
  const screenSize = vga.screen.h * pitch;
  const topBorder = pitch * 4;
  const bottomBorder = pitch * 7;

  // clear the top and bottom borders of the visible screen
  vgaPix.fill(0, 0, topBorder);
  vgaPix.fill(0, screenSize - bottomBorder, screenSize);

  // copy the test subject to one temporary buffer, blank the other
  t1.fill(0, 0, screenSize);
  t2.set(vgaPix.subarray(0, vga.screen.h * pitch), 0);

  ctx.input.serviceEvents(true);
  let timer = 300;

  do {
    ctx.delay.setDelay(1);

    for (let i = screenSize - bottomBorder, j = topBorder >> 1; i > 0; i--, j++) {
      const offset = j + (i >>> 13) - 4; // i / 8192
      const color = (t2[offset]! * 12 + t1[offset - pitch]! + t1[offset - 1]! + t1[offset + 1]! + t1[offset + pitch]!) >>> 4;
      t1[j] = color;
    }

    vgaPix.set(t1.subarray(topBorder, topBorder + screenSize - bottomBorder), topBorder);

    showVGA(ctx);

    timer--;
    await waitDelayPlain(ctx);

    const swap = t1; t1 = t2; t2 = swap;
  } while (!(timer === 0 || anyButton(ctx)));

  ctx.game.text.levelWarningLines = 4;
}
