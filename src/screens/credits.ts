// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_playCredits)
import { BinaryReader } from '../core/binary-reader';
import { s16, s8, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { ScriptReader, cstr } from '../data/script-file';
import { waitDelayPlain } from '../platform/wait';
import { fadeBlack, fadePalette } from '../video/fade';
import { outTextAdjust, textWidth } from '../video/fonthand';
import { anyButton } from '../video/glow-text';
import { SMALL_FONT_SHAPES, blitSpriteHv, loadSpriteTable } from '../video/sprite';
import { blitSprite2x2 } from '../video/sprite2';
import { clearSurface, fillRect } from '../video/surface';
import { showVGA } from '../video/video';

const LINES_MAX = 126;
const LINE_MAX_LENGTH = 65;

// port of JE_playCredits (mainint.c:2521)
export async function playCredits(ctx: Ctx): Promise<void> {
  const { vga, palette, assets, audio } = ctx;
  const g = ctx.game;
  const tables = assets.shapes.tables;
  const screen = vga.screen;
  const miscText = assets.helpText.miscText;

  const credstr: string[] = [];

  let currentpic = 0, fade = 0;
  let fadechg = 1;
  let currentship = 0;
  let shipx = 0, shipxwait = 0;
  let shipxc = 0, shipxca = 0;

  // load_sprites_file(EXTRA_SHAPES, "estsc.shp") (kept local: the table is freed again at the end)
  const extra = loadSpriteTable(new BinaryReader(assets.archive.get('estsc.shp')));

  ctx.delay.setDelay2(1000);

  audio.playSong(8);

  // load credits text
  const f = new ScriptReader(assets.archive.get('tyrian.cdt'));
  for (let lines = 0; lines < LINES_MAX; ++lines) {
    const buf = new Uint8Array(LINE_MAX_LENGTH + 1);
    f.readInto(buf);
    credstr.push(cstr(buf));
  }
  const lines = LINES_MAX;

  palette.colors.set(palette.palettes[6 - 1]!);
  clearSurface(screen);
  showVGA(ctx);
  await fadePalette(ctx, palette.colors, 2, 0, 255);

  const ticksMax = lines * 20 * 3;
  for (let ticks = 0; ticks < ticksMax; ++ticks) {
    ctx.delay.setDelay(1);
    clearSurface(screen);

    const pic = extra.sprites[currentpic]!;
    blitSpriteHv(screen, 319 - pic.width, 100 - (pic.height >> 1), extra, currentpic, 0x0, fade - 15);

    fade = u8(fade + fadechg);
    if (fade === 0 && fadechg === -1) {
      fadechg = 1;
      ++currentpic;
      if (currentpic >= extra.count) currentpic = 0;
    }
    if (fade === 15) fadechg = 0;

    if (ctx.delay.getDelayTicks2() === 0) {
      fadechg = -1;
      ctx.delay.setDelay2(900);
    }

    if (ticks % 200 === 0) {
      currentship = (ctx.rng.rand() % 11) + 1;
      shipxwait = (ctx.rng.rand() % 80) + 10;
      if (ctx.rng.rand() % 2 === 1) {
        shipx = 1;
        shipxc = 0;
        shipxca = 1;
      } else {
        shipx = 900;
        shipxc = 0;
        shipxca = -1;
      }
    }

    shipxwait = s16(shipxwait - 1);
    if (shipxwait === 0) {
      if (shipx === 1 || shipx === 900) shipxc = 0;
      shipxca = s8(-shipxca);
      shipxwait = (ctx.rng.rand() % 40) + 15;
    }
    shipxc = s8(shipxc + shipxca);
    shipx = s16(shipx + shipxc);
    if (shipx < 1) {
      shipx = 1;
      shipxwait = 1;
    }
    if (shipx > 900) {
      shipx = 900;
      shipxwait = 1;
    }
    const tmpUnknown = shipxc * shipxc;
    if (450 + tmpUnknown < 0 || 450 + tmpUnknown > 900) {
      if (shipxca < 0 && shipxc < 0) shipxwait = 1;
      if (shipxca > 0 && shipxc > 0) shipxwait = 1;
    }

    let shipSprite = g.items.ships[currentship]!.shipgraphic;
    if (shipxc < -10) shipSprite -= shipxc < -20 ? 4 : 2;
    else if (shipxc > 10) shipSprite += shipxc > 20 ? 4 : 2;

    blitSprite2x2(screen, Math.trunc(shipx / 40), 184 - (ticks % 200), assets.shapes.spriteSheet9, shipSprite);

    const bottomLine = Math.trunc(ticks / 3 / 20);
    let y = 20 - (Math.trunc(ticks / 3) % 20);

    for (let line = bottomLine - 10; line < bottomLine; ++line) {
      if (line >= 0 && line < LINES_MAX) {
        const cs = credstr[line]!;
        if (cs !== '.' && cs.length) {
          const color = u8(cs.charCodeAt(0) - 65);
          const text = cs.slice(1);

          const x = 110 - (textWidth(text, tables, SMALL_FONT_SHAPES) >> 1);

          outTextAdjust(screen, tables, x + Math.abs((Math.trunc(y / 18) % 4) - 2) - 1, y - 1, text, color, -8, SMALL_FONT_SHAPES, false);
          outTextAdjust(screen, tables, x, y, text, color, -2, SMALL_FONT_SHAPES, false);
        }
      }
      y += 20;
    }

    fillRect(screen, 0, 0, 320, 11, 0);
    fillRect(screen, 0, 190, 320, 10, 0);

    if (currentpic === extra.count - 1) outTextAdjust(screen, tables, 5, 180, miscText[54]!, 2, -2, SMALL_FONT_SHAPES, false); // levels-in-episode

    if (bottomLine === LINES_MAX - 8) audio.fadeSong();

    if (ticks === ticksMax - 1) {
      --ticks;
      audio.playSong(9);
    }

    showVGA(ctx);

    await waitDelayPlain(ctx);

    if (anyButton(ctx)) break;
  }

  await fadeBlack(ctx, 10);
}
