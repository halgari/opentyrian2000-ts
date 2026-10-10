// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c, src/varz.c, src/nortvars.c
import { idiv, s16, s8, u16, u32, u8 } from '../core/int';
import { f32, roundf32 } from '../core/cmath';
import type { Ctx } from '../ctx';
import { blitSprite, FONT_SHAPES, OPTION_SHAPES, SMALL_FONT_SHAPES, TINY_FONT } from '../video/sprite';
import { blitSprite2, blitSprite2x2 } from '../video/sprite2';
import { dString, FULL_SHADE, outText, outTextAndDarken, textShade, textWidth } from '../video/fonthand';
import { S_CLICK, S_EXPLOSION_11, S_SOUL_OF_ZINGLON, S_WARNING, SONG_GAMEOVER } from '../audio/ids';
import { eventJump, newEnemy } from './enemies';
import { gameOverKeyWait } from './input-level';
import type { Surface } from '../video/surface';
import { drawSegmentedGauge, fillRectangleXY, rectangle } from '../video/vga256d';

/**
 * Locals of JE_main that the HUD slots need (the C keeps them on JE_main's stack).
 * `oldWeaponBar` is `uint old_weapon_bar[2]`: the weapon-power pips are only redrawn when they change.
 */
export interface LevelLocals {
  oldWeaponBar: [number, number];
}

/** varz.h hud_sidekick_y[twoPlayerMode ? 1 : 0][sidekick] */
export const HUD_SIDEKICK_Y = [[64, 82], [108, 126]] as const;

// port of JE_drawTextWindow (mainint.c)
export function drawTextWindow(ctx: Ctx, text: string): void {
  const g = ctx.game;
  const tables = ctx.assets.shapes.tables;
  const seg = ctx.vga.screen;
  if (g.varz.textErase > 0) // erase current text
    blitSprite(seg, 16, 189, tables[OPTION_SHAPES]!, 36); // in-game text area
  g.varz.textErase = 100;
  outText(seg, tables, 20, 190, text, 0, 4);
}

// port of JE_drawPortConfigButtons (mainint.c): rear weapon pattern indicator
export function drawPortConfigButtons(ctx: Ctx): void {
  const g = ctx.game;
  if (g.config.twoPlayerMode) return;
  const seg = ctx.vga.screen;
  const opt = ctx.assets.shapes.tables[OPTION_SHAPES]!;
  if (g.players[0].weaponMode === 1) {
    blitSprite(seg, 285, 44, opt, 18); // lit
    blitSprite(seg, 302, 44, opt, 19); // unlit
  } else { // == 2
    blitSprite(seg, 285, 44, opt, 19); // unlit
    blitSprite(seg, 302, 44, opt, 18); // lit
  }
}

// port of JE_gammaCorrect_func + JE_gammaCorrect (mainint.c); `colors` is the 768-byte palette
export function gammaCorrect(colors: Uint8Array, gamma: number): void {
  const r = f32(1 + f32(gamma / 10)); // JE_real r = 1 + (JE_real)gamma / 10
  for (let i = 0; i < 768; i++) {
    let t = roundf32(f32(colors[i]! * r));
    if (t > 255) t = 255;
    colors[i] = t;
  }
}

// port of JE_dBar3 (nortvars.c). `surface` is the C parameter (callers pass VGAScreen).
export function dBar3(surface: Surface, x: number, y: number, num: number, col: number): void {
  let zWait = 2;
  col += 2;
  for (let z = 0; z <= num; z = u8(z + 1)) { // JE_byte z
    rectangle(surface, x, y - 1, x + 8, y, col);
    if (zWait > 0) {
      zWait--;
    } else {
      col++;
      zWait = 1;
    }
    y -= 2;
  }
}

// port of JE_drawShield (varz.c). `surface` is the global VGAScreen at the call site.
export function drawShield(ctx: Ctx, surface: Surface): void {
  const g = ctx.game;
  const [p0, p1] = g.players;
  if (g.config.twoPlayerMode && !g.config.galagaMode) {
    dBar3(surface, 270, 60 + 134 * 0, roundf32(f32(p0.shield * f32(0.8))), 144);
    dBar3(surface, 270, 60 + 134 * 1, roundf32(f32(p1.shield * f32(0.8))), 144);
  } else {
    dBar3(surface, 270, 194, p0.shield, 144);
    if (p0.shield !== p0.shieldMax) {
      const y = 193 - (p0.shieldMax * 2);
      rectangle(surface, 270, y, 278, y, 68);
    }
  }
}

// port of JE_drawArmor (varz.c). `surface` is the global VGAScreen at the call site.
export function drawArmor(ctx: Ctx, surface: Surface): void {
  const g = ctx.game;
  const [p0, p1] = g.players;
  for (const p of g.players) if (p.armor > 28) p.armor = 28;
  if (g.config.twoPlayerMode && !g.config.galagaMode) {
    dBar3(surface, 307, 60 + 134 * 0, roundf32(f32(p0.armor * f32(0.8))), 224);
    dBar3(surface, 307, 60 + 134 * 1, roundf32(f32(p1.armor * f32(0.8))), 224);
  } else {
    dBar3(surface, 307, 194, p0.armor, 224);
  }
}

// port of JE_wipeShieldArmorBars (varz.c): always VGAScreenSeg
export function wipeShieldArmorBars(ctx: Ctx): void {
  const g = ctx.game;
  const seg = ctx.vga.screen;
  const solo = !g.config.twoPlayerMode || g.config.galagaMode;
  if (solo) {
    fillRectangleXY(seg, 270, 137, 278, 194 - g.players[0].shield * 2, 0);
  } else {
    fillRectangleXY(seg, 270, 60 - 44, 278, 60, 0);
    fillRectangleXY(seg, 270, 194 - 44, 278, 194, 0);
  }
  if (solo) {
    fillRectangleXY(seg, 307, 137, 315, 194 - g.players[0].armor * 2, 0);
  } else {
    fillRectangleXY(seg, 307, 60 - 44, 315, 60, 0);
    fillRectangleXY(seg, 307, 194 - 44, 315, 194, 0);
  }
}

// port of JE_drawOptions (varz.c): sidekick state + initial sidekick HUD (always VGAScreenSeg)
export function drawOptions(ctx: Ctx): void {
  const g = ctx.game;
  const seg = ctx.vga.screen;
  const opt = ctx.assets.shapes.tables[OPTION_SHAPES]!;
  const two = g.config.twoPlayerMode ? 1 : 0;
  const thisPlayer = g.players[two];

  for (let i = 0; i < 2; ++i) {
    const o = g.items.options[thisPlayer.items.sidekick[i]!]!;
    const sk = thisPlayer.sidekick[i]!;

    sk.ammo = sk.ammoMax = o.ammo;
    sk.ammoRefillTicks = sk.ammoRefillTicksMax = (105 - sk.ammo) * 4;
    sk.style = o.tr;
    sk.animationEnabled = o.option === 1;
    sk.animationFrame = 0;
    sk.charge = 0;
    sk.chargeTicks = 20;

    // draw initial sidekick HUD
    const y = HUD_SIDEKICK_Y[two]![i]!;
    fillRectangleXY(seg, 284, y, 284 + 28, y + 15, 0);
    if (o.icongr > 0) blitSprite(seg, 284, y, opt, o.icongr - 1); // sidekick HUD icon
    drawSegmentedGauge(seg, 284, y + 13, 112, 2, 2, Math.max(1, Math.trunc(sk.ammoMax / 10)), sk.ammo);
  }

  drawOptionLevel(ctx);
}

// port of JE_drawOptionLevel (varz.c): clobbers the scratch global `temp` like the C
export function drawOptionLevel(ctx: Ctx): void {
  const g = ctx.game;
  if (g.config.twoPlayerMode) {
    const seg = ctx.vga.screen;
    for (g.scratch.temp = 1; g.scratch.temp <= 3; g.scratch.temp++) {
      const t = g.scratch.temp;
      fillRectangleXY(seg, 268, 127 + (t - 1) * 6, 269, 127 + 3 + (t - 1) * 6,
        193 + (((g.players[1].items.sidekickLevel - 100) === t) ? 11 : 0));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Level-loop HUD slots (tyrian2.c, mainint.c)
// ---------------------------------------------------------------------------------------------

// port of the `if (!endLevel) // draw HUD` block of JE_main (tyrian2.c:1143-1252, excluding oldMapX3Ofs/enemyOnScreen):
// message bar, shield regen, weapon-power pips, power bar. All on VGAScreenSeg (`VGAScreen = VGAScreenSeg`).
export function drawLevelTopBars(ctx: Ctx, loc: LevelLocals): void {
  const g = ctx.game;
  const seg = ctx.vga.screen;
  const v = g.varz;
  const c = g.config;
  const sc = g.scratch;
  const [p0, p1] = g.players;

  /*-----------------------Message Bar------------------------*/
  if (v.textErase > 0 && --v.textErase === 0)
    blitSprite(seg, 16, 189, ctx.assets.shapes.tables[OPTION_SHAPES]!, 36); // in-game message area

  /*------------------------Shield Gen-------------------------*/
  if (c.galagaMode) {
    for (const p of g.players) p.shield = 0;

    // spawned dragonwing died :(
    if (p1.lives === 0 || p1.armor === 0) c.twoPlayerMode = false;

    if (p0.cash >= v.galagaLife) {
      v.soundQueue[6] = S_EXPLOSION_11;
      v.soundQueue[7] = S_SOUL_OF_ZINGLON;

      if (p0.lives < 11) ++p0.lives;
      else p0.cash += 1000;

      if (v.galagaLife === 10000) v.galagaLife = 20000;
      else v.galagaLife += 25000;
    }
  } else if (c.twoPlayerMode) {
    c.shieldWait = u8(c.shieldWait - 1); // JE_byte
    if (c.shieldWait === 0) {
      c.shieldWait = 15;
      for (const p of g.players) if (p.shield < p.shieldMax && p.isAlive) ++p.shield;
      drawShield(ctx, seg);
    }
  } else if (p0.isAlive && p0.shield < p0.shieldMax && c.power > c.shieldT) {
    c.shieldWait = u8(c.shieldWait - 1);
    if (c.shieldWait === 0) {
      c.shieldWait = 15;
      c.power = u32(c.power - c.shieldT);
      ++p0.shield;
      if (p1.shield < p0.shieldMax) ++p1.shield;
      drawShield(ctx, seg);
    }
  }

  /*---------------------Weapon Display-------------------------*/
  for (let i = 0; i < 2; ++i) {
    const itemPower = g.players[c.twoPlayerMode ? i : 0]!.items.weapon[i]!.power;
    if (loc.oldWeaponBar[i] !== itemPower) {
      loc.oldWeaponBar[i] = itemPower;
      let x = c.twoPlayerMode ? 286 : 289;
      const y = (i === 0) ? (c.twoPlayerMode ? 6 : 17) : (c.twoPlayerMode ? 100 : 38);
      fillRectangleXY(seg, x, y, x + 1 + 10 * 2, y + 2, 0);
      for (let j = 1; j <= itemPower; ++j) {
        rectangle(seg, x, y, x + 1, y + 2, 115 + j);
        x += 2;
      }
    }
  }

  /*------------------------Power Bar-------------------------*/
  if (c.twoPlayerMode || c.onePlayerAction) {
    c.power = 900;
  } else {
    c.power = u32(c.power + c.powerAdd);
    if (c.power > 900) c.power = 900;

    sc.temp = u8(idiv(c.power, 10));
    const temp = sc.temp;
    if (temp !== c.lastPower) {
      if (temp > c.lastPower)
        fillRectangleXY(seg, 269, 113 - 11 - temp, 276, 114 - 11 - c.lastPower, 113 + idiv(temp, 7));
      else
        fillRectangleXY(seg, 269, 113 - 11 - c.lastPower, 276, 114 - 11 - temp, 0);
      c.lastPower = temp;
    }
  }
}

// port of the Warning block of JE_main (tyrian2.c:1989-2045). `VGAScreen` is game_screen here.
export function drawWarnings(ctx: Ctx): void {
  const g = ctx.game;
  const v = g.varz;
  const sc = g.scratch;
  const gs = ctx.vga.cur;
  const [p0, p1] = g.players;
  const twoNotGalaga = g.config.twoPlayerMode && !g.config.galagaMode;

  if ((p0.isAlive && p0.armor < 6) || (twoNotGalaga && p1.isAlive && p1.armor < 6)) {
    const armorAmount = (p0.isAlive && p0.armor < 6) ? p0.armor : p1.armor;

    if (v.armorShipDelay > 0) {
      v.armorShipDelay--;
    } else {
      sc.tempW = 560;
      sc.b = s16(newEnemy(ctx, 50, sc.tempW, 0));
      if (sc.b > 0) {
        const we = g.enemies.enemy[sc.b - 1]!;
        we.enemydie = u16(560 + (ctx.rng.rand() % 3) + 1);
        we.eyc = s8(we.eyc - g.backgrounds.backMove3);
        we.armorleft = 4;
      }
      v.armorShipDelay = 500;
    }

    if ((p0.isAlive && p0.armor < 6) || (g.config.twoPlayerMode && p1.isAlive && p1.armor < 6)) {
      sc.tempW = u16(armorAmount * 4 + 8);
      if (v.warningSoundDelay > sc.tempW) v.warningSoundDelay = sc.tempW;

      if (v.warningSoundDelay > 1) {
        v.warningSoundDelay--;
      } else {
        v.soundQueue[7] = S_WARNING;
        v.warningSoundDelay = sc.tempW;
      }

      v.warningCol = u8(v.warningCol + v.warningColChange);
      if (v.warningCol > 113 + (14 - (armorAmount * 2))) {
        v.warningColChange = s8(-v.warningColChange);
        v.warningCol = 113 + (14 - (armorAmount * 2));
      } else if (v.warningCol < 113) {
        v.warningColChange = s8(-v.warningColChange);
      }
      fillRectangleXY(gs, 24, 181, 138, 183, v.warningCol);
      fillRectangleXY(gs, 175, 181, 287, 183, v.warningCol);
      fillRectangleXY(gs, 24, 0, 287, 3, v.warningCol);

      outText(gs, ctx.assets.shapes.tables, 140, 178, 'WARNING', 7, idiv(v.warningCol % 16, 2));
    }
  }
}

// port of the displayTime / pentium / level-timer / GAME OVER blocks of JE_main (tyrian2.c:2086-2200).
// The `if (debug)` block is never taken. `VGAScreen` is game_screen here.
export function drawTimers(ctx: Ctx): void {
  const g = ctx.game;
  const v = g.varz;
  const gs = ctx.vga.cur;
  const tables = ctx.assets.shapes.tables;
  const miscText = ctx.assets.helpText.miscText;

  if (v.displayTime > 0) {
    v.displayTime--;
    outTextAndDarken(gs, tables, 90, 10, miscText[59] ?? '', 15, u8(v.flash) - 8, FONT_SHAPES);
    v.flash = u8(v.flash + v.flashChange);
    if (v.flash > 4 || v.flash === 0) v.flashChange = s8(-v.flashChange);
  }

  /*Pentium Speed Mode?*/
  if (g.config.pentiumMode) g.config.frameCountMax = (g.config.frameCountMax === 2) ? 3 : 2;

  /*--------  Level Timer    ---------*/
  if (v.levelTimer && v.levelTimerCountdown > 0) {
    v.levelTimerCountdown--;
    if (v.levelTimerCountdown === 0) eventJump(ctx, v.levelTimerJumpTo);

    if (g.config.timedBattleMode) {
      // No-op; play no sound effects
    } else if (v.levelTimerCountdown > 200) {
      if (v.levelTimerCountdown % 100 === 0) v.soundQueue[7] = S_WARNING;
      if (v.levelTimerCountdown % 10 === 0) v.soundQueue[6] = S_CLICK;
    } else if (v.levelTimerCountdown % 20 === 0) {
      v.soundQueue[7] = S_WARNING;
    }

    textShade(gs, tables, 140, 6, miscText[66] ?? '', 7, idiv(v.levelTimerCountdown % 20, 3), FULL_SHADE);
    // Don't use floats due to rounding.
    dString(gs, tables, 100, 2,
      `${idiv(v.levelTimerCountdown, 100)}.${idiv(v.levelTimerCountdown, 10) % 10}`, SMALL_FONT_SHAPES);
  }

  /*GAME OVER*/ // constantPlay / constantDie are never set in a normal build
  if (v.allPlayersGone) {
    if (g.players[0].explodingTicks > 0 || g.players[1].explodingTicks > 0) {
      if (g.config.galagaMode) g.players[1].explodingTicks = 0;
      v.musicFade = true;
    } else {
      if (ctx.state.playDemo || v.normalBonusLevelCurrent || v.bonusLevelCurrent)
        v.reallyEndLevel = true;
      else
        dString(gs, tables, 120, 60, miscText[21] ?? '', FONT_SHAPES); // game over

      if (v.firstGameOver) {
        if (!ctx.state.playDemo) {
          ctx.audio.playSong(SONG_GAMEOVER);
          ctx.audio.setVolume(g.config.tyrMusicVolume, g.config.fxVolume);
        }
        v.firstGameOver = false;
      }

      if (!ctx.state.playDemo) gameOverKeyWait(ctx);
    }
  }
}

/** port of JE_barX (tyrian2.c:5297): three-band bar on VGAScreen (game_screen) */
export function barX(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, col: number): void {
  const gs = ctx.vga.cur;
  fillRectangleXY(gs, x1, y1, x2, y1, col + 1);
  fillRectangleXY(gs, x1, y1 + 1, x2, y2 - 1, col);
  fillRectangleXY(gs, x1, y2, x2, y2, col - 1);
}

// port of draw_boss_bar (tyrian2.c:5303). `VGAScreen` is game_screen here.
export function drawBossBar(ctx: Ctx): void {
  const e = ctx.game.enemies;
  const bars = e.bossBar;

  for (const bar of bars) {
    if (bar.linkNum === 0) continue;

    let armor = 256; // higher than armor max
    for (let i = 0; i < e.enemy.length; i++) { // find most damaged
      if (e.enemyAvail[i] !== 1 && e.enemy[i]!.linknum === bar.linkNum)
        if (e.enemy[i]!.armorleft < armor) armor = e.enemy[i]!.armorleft;
    }

    if (armor > 255 || armor === 0) // boss dead?
      bar.linkNum = 0;
    else
      bar.armor = (armor === 255) ? 254 : armor; // 255 would make the bar too long
  }

  const count = (bars[0]!.linkNum !== 0 ? 1 : 0) + (bars[1]!.linkNum !== 0 ? 1 : 0);

  // if only one bar left, make it the first one
  if (count === 1 && bars[0]!.linkNum === 0) {
    Object.assign(bars[0]!, bars[1]!);
    bars[1]!.linkNum = 0;
  }

  const timer = ctx.game.varz.levelTimer;
  for (let b = 0; b < count; b++) {
    const bar = bars[b]!;
    const x = (count === 2) ? ((b === 0) ? 125 : 185) : (timer ? 250 : 155); // level timer and boss bar would overlap
    const y = timer ? 15 : 7;

    barX(ctx, x - 25, y, x + 25, y + 5, 115);
    barX(ctx, x - idiv(bar.armor, 10), y, x + idiv(bar.armor + 5, 10), y + 5, 118 + bar.color);

    if (bar.color > 0) bar.color--;
  }
}

// port of JE_inGameDisplays (mainint.c:3072). `VGAScreen` is game_screen here.
export function inGameDisplays(ctx: Ctx): void {
  const g = ctx.game;
  const gs = ctx.vga.cur;
  const sc = g.scratch;
  const tables = ctx.assets.shapes.tables;
  const sheet9 = ctx.assets.shapes.spriteSheet9;
  const sheet10 = ctx.assets.shapes.spriteSheet10;
  const miscText = ctx.assets.helpText.miscText;
  const two = g.config.twoPlayerMode;

  for (let i = 0; i < ((two && !g.config.galagaMode) ? 2 : 1); ++i) {
    const cash = String(g.players[i]!.cash);
    if (g.config.smoothies[6 - 1]) textShade(gs, tables, 30 + 200 * i, 175, cash, 8, 8, FULL_SHADE);
    else textShade(gs, tables, 30 + 200 * i, 175, cash, 2, 4, FULL_SHADE);
  }

  /*Special Weapon?*/
  if (g.players[0].items.special > 0)
    blitSprite2x2(gs, 25, 1, sheet10, g.items.special[g.players[0].items.special]!.itemgraphic);

  /*Lives Left*/
  if (g.config.onePlayerAction || two) {
    for (let temp = 0; temp < (g.config.onePlayerAction ? 1 : 2); temp++) {
      const extraLives = u32(g.players[temp]!.lives - 1);

      const y = (temp === 0 && g.players[0].items.special > 0) ? 35 : 15;
      sc.tempW = (temp === 0) ? 30 : 270;

      if (extraLives >= 5) {
        blitSprite2(gs, sc.tempW, y, sheet9, 285);
        sc.tempW = (temp === 0) ? 45 : 250;
        outTextShadeLives(ctx, gs, sc.tempW, y + 3, String(extraLives | 0));
      } else if (extraLives >= 1) {
        for (let i = 0; i < extraLives; ++i) {
          blitSprite2(gs, sc.tempW, y, sheet9, 285);
          sc.tempW = u16(sc.tempW + ((temp === 0) ? 12 : -12));
        }
      }

      const stemp = (temp === 0) ? (miscText[49 - 1] ?? '') : (miscText[50 - 1] ?? '');
      sc.tempW = u16((temp === 0) ? 28 : (285 - textWidth(stemp, tables, TINY_FONT)));
      textShade(gs, tables, sc.tempW, y - 7, stemp, 2, 6, FULL_SHADE);
    }
  }

  /*Super Bombs!!*/
  for (let i = 0; i < g.players.length; ++i) {
    let x = (i === 0) ? 30 : 270;
    for (let j = g.players[i]!.superbombs; j > 0; --j) {
      blitSprite2(gs, x, 160, sheet9, 304);
      x += (i === 0) ? 12 : -12;
    }
  }

  if (g.config.youAreCheating) outText(gs, tables, 90, 170, 'Cheaters always prosper.', 3, 4);
}

// Draws the extra-lives count. The caller passes `extraLives | 0`, so lives 0 (unsigned wrap to 4294967295) prints as -1, like sprintf("%d").
function outTextShadeLives(ctx: Ctx, gs: Surface, x: number, y: number, text: string): void {
  textShade(gs, ctx.assets.shapes.tables, x, y, text, 15, 1, FULL_SHADE);
}
