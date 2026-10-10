// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_endLevelAni, JE_drawCube)
import { S_ITEM, V_LEVEL_END } from '../audio/ids';
import { idiv, s8, u16, u32, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { waitDelayPlain, waitNoInput } from '../platform/wait';
import { adjustDifficulty } from '../game/economy';
import { SAVE_FILES_SIZE } from '../game/world';
import { fadeBlack } from '../video/fade';
import { anyButton, outTextGlow, textState } from '../video/glow-text';
import { OPTION_SHAPES, SMALL_FONT_SHAPES, blitSpriteDark, blitSpriteHv } from '../video/sprite';
import { clearSurface, type Surface } from '../video/surface';
import { showVGA } from '../video/video';

// port of JE_drawCube (mainint.c:2905)
export function drawCube(ctx: Ctx, screen: Surface, x: number, y: number, filter: number, brightness: number): void {
  const t = ctx.assets.shapes.tables[OPTION_SHAPES]!;
  blitSpriteDark(screen, x + 4, y + 4, t, 25, false);
  blitSpriteDark(screen, x + 3, y + 3, t, 25, false);
  blitSpriteHv(screen, x, y, t, 25, filter, brightness);
}

/**
 * port of JE_endLevelAni (mainint.c:2689): the level-complete tally.
 * Grants the ship-editor privileges (`saveTemp[SAVE_FILES_SIZE + offset] = 1`, saved into tyrian.sav).
 * constantPlay is always false in the port.
 */
export async function endLevelAni(ctx: Ctx): Promise<void> {
  const g = ctx.game;
  const c = g.config;
  const sc = g.scratch;
  const ts = textState(ctx);
  const screen = ctx.vga.screen;
  const miscText = ctx.assets.helpText.miscText;
  const [p0] = g.players;

  // TODO(sp5): twoPlayerMode branches (mainint.c:2753-2763, 2824), Task 6
  if (c.twoPlayerMode) throw new Error('unported: JE_endLevelAni twoPlayerMode (mainint.c:2753)');
  const miscTextB = ctx.assets.helpText.miscTextB;

  // grant shipedit privileges
  const grantShipEdit = (offset: number): void => { c.saveTemp[SAVE_FILES_SIZE + offset] = 1; };
  if (p0.items.special < 21) grantShipEdit(81 + p0.items.special); // special
  for (const p of g.players) {
    for (let i = 0; i < 2; ++i) grantShipEdit(p.items.weapon[i]!.id); // front, rear
    for (let i = 0; i < 2; ++i) grantShipEdit(51 + p.items.sidekick[i]!); // options
  }

  adjustDifficulty(ctx);

  p0.lastItems.copyFrom(p0.items);
  c.lastLevelName = c.levelName;

  // JE_wipeKey() is a no-op
  c.frameCountMax = 4;
  ts.textGlowFont = SMALL_FONT_SHAPES;

  ctx.palette.setColors(255, 255, 255, 254, 254);

  if (!g.varz.levelTimer || g.varz.levelTimerCountdown > 0 || g.items.episodeNum !== 4) ctx.audio.playSample(V_LEVEL_END);
  else ctx.audio.playSong(21);

  if (g.items.bonusLevel) {
    await outTextGlow(ctx, screen, 20, 20, miscText[17 - 1]!);
  } else if (p0.isAlive) { // all_players_alive() with !twoPlayerMode
    await outTextGlow(ctx, screen, 20, 20, `${miscText[27 - 1]} ${c.levelName}`); // "Completed"
  } else {
    await outTextGlow(ctx, screen, 20, 20, `${miscText[62 - 1]} ${c.levelName}`); // "Exiting"
  }

  await outTextGlow(ctx, screen, 30, 50, `${miscText[28 - 1]} ${p0.cash}`);

  if (c.timedBattleMode) {
    const x = idiv(g.varz.levelTimerCountdown, 10) * 100;
    await outTextGlow(ctx, screen, 40, 75, `${miscTextB[6]} ${x}`);
    p0.cash = u32(p0.cash + x);
  }

  // temp = roundf(enemyKilled * 100 / totalEnemy): int division first, then stored in a JE_byte
  let temp = g.enemies.totalEnemy === 0 ? 0 : u8(idiv(g.enemies.enemyKilled * 100, g.enemies.totalEnemy));
  await outTextGlow(ctx, screen, 40, 90, `${miscText[63 - 1]} ${temp}%`);

  c.editorLevel = u16(c.editorLevel + idiv(temp, 5));

  if (c.timedBattleMode) {
    const optTable = ctx.assets.shapes.tables[OPTION_SHAPES]!;
    for (temp = 1; temp <= p0.lives; temp++) {
      ctx.audio.playSample(S_ITEM);
      const x = 20 + 15 * temp;
      const y = 115;
      const frame = async (i: number): Promise<void> => {
        ctx.delay.setDelay(c.frameCountMax);
        blitSpriteHv(screen, x, y, optTable, 46, 0x9, i);
        if (anyButton(ctx)) c.frameCountMax = 0;
        showVGA(ctx);
        await waitDelayPlain(ctx);
      };
      for (let i = -15; i <= 10; i++) await frame(s8(i));
      for (let i = 10; i >= 0; i--) await frame(s8(i));
    }
    const x = p0.lives * 1000;
    await outTextGlow(ctx, screen, 120, 120, `${miscTextB[7]} ${x}`);
    p0.cash = u32(p0.cash + x);
  } else if (!c.onePlayerAction) { // && !twoPlayerMode
    await outTextGlow(ctx, screen, 30, 120, miscText[4 - 1]!); // Cubes

    if (c.cubeMax > 0) {
      if (c.cubeMax > 4) c.cubeMax = 4;
      if (c.frameCountMax !== 0) c.frameCountMax = 1;

      const optTable = ctx.assets.shapes.tables[OPTION_SHAPES]!;
      for (temp = 1; temp <= c.cubeMax; temp++) {
        ctx.audio.playSample(S_ITEM);
        const x = 20 + 30 * temp;
        const y = 135;
        drawCube(ctx, screen, x, y, 9, 0);
        showVGA(ctx);

        const frame = async (i: number): Promise<void> => {
          ctx.delay.setDelay(c.frameCountMax);
          blitSpriteHv(screen, x, y, optTable, 25, 0x9, i);
          if (anyButton(ctx)) c.frameCountMax = 0;
          showVGA(ctx);
          await waitDelayPlain(ctx);
        };
        for (let i = -15; i <= 10; i++) await frame(s8(i));
        for (let i = 10; i >= 0; i--) await frame(s8(i));
      }
    } else {
      await outTextGlow(ctx, screen, 50, 135, miscText[15 - 1]!);
    }
  }

  if (c.frameCountMax !== 0) {
    c.frameCountMax = 6;
    temp = 1;
  } else {
    temp = 0;
  }
  sc.temp2 = 160; // twoPlayerMode ? 150 : 160
  await outTextGlow(ctx, screen, 90, sc.temp2, miscText[5 - 1]!);

  do {
    ctx.delay.setDelay(1);
    await waitDelayPlain(ctx);
  } while (!(anyButton(ctx) || (c.frameCountMax === 0 && temp === 1)));

  await waitNoInput(ctx, false, false, true); // joystick only
  await fadeBlack(ctx, 15);
  clearSurface(screen);
}
