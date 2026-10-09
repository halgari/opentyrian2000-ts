// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/game_menu.c (load_cubes, load_cube, the DATA_CUBES / DATA_CUBE_SUB parts of JE_itemScreen and
//   JE_menuFunction), src/mainint.c (JE_drawCube)
//
// Shop C, data cubes: the cube list (MENU_DATA_CUBES) and the scrolling reader (MENU_DATA_CUBE_SUB).
import { S_SPRING } from '../audio/ids';
import { idiv, s8, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { readCube } from '../data/script-file';
import { MOUSE_POINTER_DOWN, MOUSE_POINTER_NORMAL, MOUSE_POINTER_UP, mouseReplace, mouseStart } from '../video/mouse';
import { fadePalette } from '../video/fade';
import { DARKEN, outTextAndDarken, textShade, textWidth, dString } from '../video/fonthand';
import { FACE_SHAPES, OPTION_SHAPES, SMALL_FONT_SHAPES, TINY_FONT, blitSprite, blitSpriteDark, blitSpriteHv, blitSpriteHvBlend, spriteHeight, spriteWidth } from '../video/sprite';
import { fillRectangleXY } from '../video/vga256d';
import { showVGA } from '../video/video';
import { textState } from '../video/glow-text';
import { Scancode } from '../platform/scancodes';
import { helpBox } from './help-box';
import { MENU_DATA_CUBES, MENU_DATA_CUBE_SUB, MENU_FULL_GAME, type Cube, type ShopState } from './shop-draw';

const CUBE_LINES = 90;        // sizeof(cube->text) / sizeof(*cube->text)
const CUBE_LINE_CHARS = 35;   // cube_line_chars = sizeof(*cube->text) - 1
const CUBE_LINE_WIDTH = 150;  // cube_line_width
// pcxmast.c facepal[12]
const FACEPAL = [1, 2, 3, 4, 6, 9, 11, 12, 16, 13, 14, 15];

// port of load_cube (game_menu.c:1763): reads the cube's text from cubetxtN.dat and word-wraps it into 36-char lines
export function loadCube(ctx: Ctx, cubeIndex: number): Cube {
  const tables = ctx.assets.shapes.tables;
  const raw = readCube(ctx.assets.archive.get(ctx.game.items.cubeFile), cubeIndex);
  const cube: Cube = {
    title: raw.title.slice(0, 80), header: raw.header.slice(0, 12), faceSprite: raw.faceSprite,
    text: new Array<string>(CUBE_LINES).fill(''), lastLine: 0,
  };

  let line = 0, lineChars = 0, lineWidth = 0;

  // for each line of decrypted text, split the line into words and add them individually to the lines of wrapped text
  for (const buf of raw.body) {
    // new paragraph
    if (buf.length === 0) {
      if (lineChars === 0) line += 4; // subsequent new paragaphs indicate 4-line break
      else ++line;
      lineChars = 0;
      lineWidth = 0;
      continue;
    }

    let wordStart = 0;
    for (let i = 0; ; ++i) {
      const endOfLine = i >= buf.length;
      const endOfWord = endOfLine || buf[i] === ' ';

      if (endOfWord) {
        const word = buf.slice(wordStart, i);
        wordStart = i + 1;

        const wordChars = word.length;
        const wordWidth = textWidth(word, tables, TINY_FONT);

        // word won't fit; no can do
        if (wordChars > CUBE_LINE_CHARS || wordWidth > CUBE_LINE_WIDTH) break;

        let prependSpace = true;

        lineChars += wordChars + 1;
        lineWidth += wordWidth + 6;

        // word won't fit on current line; use next
        if (lineChars > CUBE_LINE_CHARS || lineWidth > CUBE_LINE_WIDTH) {
          ++line;
          lineChars = wordChars;
          lineWidth = wordWidth;
          prependSpace = false;
        }

        // append word
        if (line < CUBE_LINES) {
          cube.text[line] += (prependSpace ? ' ' : '') + word;
          cube.lastLine = line + 1; // track last line with text
        }
      }

      if (endOfLine) break;
    }
  }
  return cube;
}

// port of load_cubes (game_menu.c:1757)
export function loadCubes(ctx: Ctx, s: ShopState): void {
  const c = ctx.game.config;
  s.cubes = [];
  for (let slot = 0; slot < c.cubeMax; ++slot) s.cubes[slot] = loadCube(ctx, c.cubeList[slot]!);
}

// port of JE_drawCube (mainint.c:2905)
export function drawCube(ctx: Ctx, x: number, y: number, filter: number, brightness: number): void {
  const screen = ctx.vga.screen;
  const opt = ctx.assets.shapes.tables[OPTION_SHAPES]!;
  blitSpriteDark(screen, x + 4, y + 4, opt, 25, false);
  blitSpriteDark(screen, x + 3, y + 3, opt, 25, false);
  blitSpriteHv(screen, x, y, opt, 25, filter, brightness);
}

/** The "firstMenu9" block of JE_itemScreen's draw step (game_menu.c:597-672), also the cube list's own drawing. */
export function drawCubePanel(ctx: Ctx, s: ShopState): void {
  const g = ctx.game;
  const c = g.config;
  const sc = g.scratch;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const miscText = ctx.assets.helpText.miscText;
  const ts = textState(ctx);

  if (!(s.curMenu === MENU_DATA_CUBES || (s.curMenu === MENU_DATA_CUBE_SUB && (s.firstMenu9 || s.backFromHelp)))) return;

  s.firstMenu9 = false;
  s.menuChoices[MENU_DATA_CUBES] = c.cubeMax + 2;
  fillRectangleXY(screen, 1, 1, 145, 170, 0);

  blitSprite(screen, 1, 1, tables[OPTION_SHAPES]!, 20); /* Portrait area background */

  if (s.curMenu === MENU_DATA_CUBES) {
    if (c.cubeMax === 0) {
      helpBox(ctx, screen, 166, 80, miscText[16 - 1]!, 30);
      sc.tempW = 160;
      sc.temp2 = 252;
    } else {
      for (let x = 1; x <= c.cubeMax; x++) {
        drawCube(ctx, 166, 38 + (x - 1) * 28, 13, 0);
        sc.temp2 = x + 1 === s.curSel[s.curMenu] ? 252 : 250;

        ts.helpBoxColor = idiv(sc.temp2, 16);
        ts.helpBoxBrightness = (sc.temp2 % 16) - 8;
        ts.helpBoxShadeType = DARKEN;
        helpBox(ctx, screen, 192, 44 + (x - 1) * 28, s.cubes[x - 1]!.title, 24);
      }
      const x = c.cubeMax + 1;
      sc.temp2 = x + 1 === s.curSel[s.curMenu] ? 252 : 250;
      sc.tempW = 44 + (x - 1) * 28;
    }

    textShade(screen, tables, 172, sc.tempW, miscText[6 - 1]!, idiv(sc.temp2, 16), (sc.temp2 % 16) - 8, DARKEN);
  }

  if (s.curSel[MENU_DATA_CUBES]! < s.menuChoices[MENU_DATA_CUBES]!) {
    const faceSprite = s.cubes[s.curSel[MENU_DATA_CUBES]! - 2]!.faceSprite;

    if (faceSprite !== -1) {
      const face = tables[FACE_SHAPES]!;
      const faceX = 77 - idiv(spriteWidth(face, faceSprite), 2);
      const faceY = 92 - idiv(spriteHeight(face, faceSprite), 2);

      blitSprite(screen, faceX, faceY, face, faceSprite); // datacube face

      // modify palette for face
      s.paletteChanged = true;
      sc.temp2 = faceSprite < 12 ? FACEPAL[faceSprite]! : 0;
      s.newPal = 0;

      const pal = ctx.palette;
      for (sc.temp = 1; sc.temp <= 255 - 3 * 16; sc.temp = u8(sc.temp + 1)) {
        pal.colors.set(pal.palettes[sc.temp2]!.subarray(sc.temp * 3, sc.temp * 3 + 3), sc.temp * 3);
      }
    }
  }
}

/** "datacube title under face" (game_menu.c:793) */
export function drawCubeTitle(ctx: Ctx, s: ShopState): void {
  if ((s.curMenu === MENU_DATA_CUBES || s.curMenu === MENU_DATA_CUBE_SUB) && s.curSel[MENU_DATA_CUBES]! < s.menuChoices[MENU_DATA_CUBES]!) {
    const tables = ctx.assets.shapes.tables;
    const header = s.cubes[s.curSel[MENU_DATA_CUBES]! - 2]!.header;
    textShade(ctx.vga.screen, tables, 75 - idiv(textWidth(header, tables, TINY_FONT), 2), 173, header, 14, 3, DARKEN);
  }
}

/**
 * The MENU_DATA_CUBE_SUB branch of the inner animation loop (game_menu.c:831-889), including its own draw and the
 * `setDelay(1)`; the wait_delay() that follows is the loop's common one.
 */
export async function cubeReaderFrame(ctx: Ctx, s: ShopState): Promise<void> {
  const g = ctx.game;
  const v = g.varz;
  const sc = g.scratch;
  const screen = ctx.vga.screen;
  const tables = ctx.assets.shapes.tables;
  const miscText = ctx.assets.helpText.miscText;
  const cur = s.cubes[s.curSel[MENU_DATA_CUBES]! - 2]!;

  // data cube reading
  if (v.mouseX > 164 && v.mouseX < 299 && v.mouseY > 47 && v.mouseY < 153) {
    ctx.mouse.cursor = v.mouseY > 100 ? MOUSE_POINTER_DOWN : MOUSE_POINTER_UP;
  }

  fillRectangleXY(screen, 160, 49, 310, 158, 228);
  if (s.yLoc + s.yChg < 0) {
    s.yChg = 0;
    s.yLoc = 0;
  }

  s.yLoc = u16(s.yLoc + s.yChg);
  sc.temp = u8(idiv(s.yLoc, 12));
  sc.temp2 = u8(s.yLoc % 12);
  sc.tempW = u16(38 + 12 - sc.temp2);
  sc.temp3 = u8(cur.lastLine);

  for (let x = sc.temp + 1; x <= sc.temp + 10; x++) {
    if (x <= sc.temp3) {
      outTextAndDarken(screen, tables, 161, sc.tempW, cur.text[x - 1]!, 14, 3, TINY_FONT);
      sc.tempW = u16(sc.tempW + 12);
    }
  }

  fillRectangleXY(screen, 160, 39, 310, 48, 228);
  fillRectangleXY(screen, 160, 157, 310, 166, 228);

  const last = s.cubes[s.currentCube]!.lastLine;
  const percentRead = last <= 9 ? 100 : idiv(s.yLoc * 100, (last - 9) * 12);

  outTextAndDarken(screen, tables, 176, 160, `${miscText[11]!} ${percentRead}%`, 14, 1, TINY_FONT);

  dString(screen, tables, 260, 160, miscText[12]!, SMALL_FONT_SHAPES);

  if (sc.temp2 === 0) s.yChg = 0;

  mouseStart(ctx);

  showVGA(ctx);

  if (s.backFromHelp) {
    await fadePalette(ctx, ctx.palette.colors, 10, 0, 255);
    s.backFromHelp = false;
  }
  mouseReplace(ctx);

  ctx.delay.setDelay(1);
}

/**
 * The MENU_DATA_CUBE_SUB scroll keys / mouse arrows after the poll (game_menu.c:1032-1083). Returns the new
 * `inputDetected` (they clear it while a scroll input is active).
 */
export function cubeScrollInput(ctx: Ctx, s: ShopState, inputDetected: boolean): boolean {
  const { input } = ctx;
  if (s.mouseButton > 0 && ctx.mouse.cursor !== MOUSE_POINTER_NORMAL) {
    inputDetected = false;
    s.yChg = ctx.mouse.cursor === MOUSE_POINTER_UP ? -1 : 1;
  }

  if (input.keysactive[Scancode.PageUp]) {
    s.yChg = -2;
    inputDetected = false;
  }
  if (input.keysactive[Scancode.PageDown]) {
    s.yChg = 2;
    inputDetected = false;
  }

  // joysticks: none in the port
  if (input.keysactive[Scancode.Up]) {
    s.yChg = -1;
    inputDetected = false;
  }

  if (input.keysactive[Scancode.Down]) {
    s.yChg = 1;
    inputDetected = false;
  }

  if (s.yChg < 0 && s.yLoc === 0) s.yChg = 0;
  if (s.yChg > 0 && idiv(s.yLoc, 12) > s.cubes[s.currentCube]!.lastLine - 10) s.yChg = 0;
  s.yChg = s8(s.yChg);
  return inputDetected;
}

/** MENU_DATA_CUBES, flashing cube (game_menu.c:891-897) */
export function drawFlashyCube(ctx: Ctx, s: ShopState): void {
  if (s.curMenu === MENU_DATA_CUBES && s.curSel[MENU_DATA_CUBES]! < s.menuChoices[MENU_DATA_CUBES]!) {
    blitSpriteHvBlend(ctx.vga.screen, 166, 38 + (s.curSel[MENU_DATA_CUBES]! - 2) * 28, ctx.assets.shapes.tables[OPTION_SHAPES]!, 25, 13, s.col);
  }
}

/** The DATA_CUBES / DATA_CUBE_SUB case of JE_menuFunction (game_menu.c:2866-2900). Returns false for other menus. */
export function cubesMenuFunction(ctx: Ctx, s: ShopState, curSelect: number): boolean {
  const c = ctx.game.config;
  switch (s.curMenu) {
    case MENU_DATA_CUBES:
      if (curSelect === s.menuChoices[s.curMenu]) {
        s.curMenu = MENU_FULL_GAME;
        s.newPal = 1;
      } else if (c.cubeMax > 0) {
        s.firstMenu9 = true;
        s.curMenu = MENU_DATA_CUBE_SUB;
        s.yLoc = 0;
        s.yChg = 0;
        s.currentCube = u8(s.curSel[MENU_DATA_CUBES]! - 2);
      } else {
        s.curMenu = MENU_FULL_GAME;
        s.newPal = 1;
      }
      return true;
    case MENU_DATA_CUBE_SUB:
      s.curMenu = MENU_DATA_CUBES;
      return true;
  }
  return false;
}

/** The cube parts of the mouse handler (game_menu.c:1094-1111). */
export function cubesMouse(ctx: Ctx, s: ShopState): void {
  const v = ctx.game.varz;
  if (s.curMenu === MENU_DATA_CUBES && ctx.game.config.cubeMax === 0) {
    s.curMenu = MENU_FULL_GAME;
    ctx.audio.playSample(S_SPRING);
    s.newPal = 1;
    // JE_wipeKey(): no-op
  }

  if (s.curMenu === MENU_DATA_CUBE_SUB) {
    if (v.mouseX > 258 && v.mouseX < 290 && v.mouseY > 159 && v.mouseY < 171) {
      s.curMenu = MENU_DATA_CUBES;
      ctx.audio.playSample(S_SPRING);
    }
  }
}

/** Home / End in the reader (game_menu.c:1517-1525). */
export function cubesHomeEnd(s: ShopState, end: boolean): void {
  if (s.curMenu !== MENU_DATA_CUBE_SUB) return;
  s.yLoc = end ? u16((s.cubes[s.currentCube]!.lastLine - 9) * 12) : 0;
}
