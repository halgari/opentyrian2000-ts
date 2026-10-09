// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/helptext.c (JE_helpBox, JE_HBox)
import { u32, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { FULL_SHADE, textShade } from '../video/fonthand';
import type { Surface } from '../video/surface';
import { textState } from '../video/glow-text';

// port of JE_helpBox (helptext.c:128): word-wraps `message` to `boxwidth` characters and draws it with textShade
// using helpBoxColor / helpBoxBrightness / helpBoxShadeType, then resets the colour and shade type.
// C: startpos, endpos and pos are JE_byte.
export function helpBox(ctx: Ctx, screen: Surface, x: number, y: number, message: string, boxwidth: number): void {
  const ts = textState(ctx);
  const tables = ctx.assets.shapes.tables;
  const len = message.length;
  if (len === 0) return;

  const at = (i: number): string => message[i] ?? '\0';
  let pos = 1;
  let endpos = 0;
  let endstring = false;
  let startpos: number;

  do {
    startpos = u8(endpos + 1);

    do {
      endpos = pos;
      do {
        pos = u8(pos + 1);
        if (pos === len) {
          endstring = true;
          if (u32(pos - startpos) < boxwidth) endpos = u8(pos + 1);
        }
      } while (!(at(pos - 1) === ' ' || endstring));
    } while (!(u32(pos - startpos) > boxwidth || endstring));

    // strlcpy(substring, message + startpos - 1, endpos - startpos + 1) -> endpos - startpos characters
    const n = Math.max(0, Math.min(endpos - startpos, 255));
    textShade(screen, tables, x, y, message.substring(startpos - 1, startpos - 1 + n), ts.helpBoxColor, ts.helpBoxBrightness, ts.helpBoxShadeType);

    y += ts.verticalHeight;
  } while (!endstring);

  if (endpos !== pos + 1) {
    textShade(screen, tables, x, y, message.substring(endpos), ts.helpBoxColor, ts.helpBoxBrightness, ts.helpBoxShadeType);
  }

  ts.helpBoxColor = 12;
  ts.helpBoxShadeType = FULL_SHADE;
}

// port of JE_HBox (helptext.c)
export function hBox(ctx: Ctx, screen: Surface, x: number, y: number, messageNum: number, boxwidth: number): void {
  helpBox(ctx, screen, x, y, ctx.assets.helpText.helpTxt[messageNum - 1]!, boxwidth);
}
