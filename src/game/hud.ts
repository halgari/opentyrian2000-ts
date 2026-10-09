// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c, src/varz.c, src/nortvars.c
import { u8 } from '../core/int';
import { f32, roundf32 } from '../core/cmath';
import type { Ctx } from '../ctx';
import { blitSprite, OPTION_SHAPES } from '../video/sprite';
import { outText } from '../video/fonthand';
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
const HUD_SIDEKICK_Y = [[64, 82], [108, 126]] as const;

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

// port of JE_drawShield (varz.c). `surface` is the global VGAScreen at the call site (survey 5.9).
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

// port of JE_drawArmor (varz.c). `surface` is the global VGAScreen at the call site (survey 5.9).
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
// Stub slots of the level loop (task 8 owns the bodies)
// ---------------------------------------------------------------------------------------------

// STUB(task 8): tyrian2.c:1143-1252 -- message-bar restore, shield regen (+drawShield), weapon-power pips,
// power bar. Runs only `if (!endLevel)`, on VGAScreenSeg, before the event system.
export function drawLevelTopBars(_ctx: Ctx, _loc: LevelLocals): void {}

// STUB(task 8): tyrian2.c:1989-2045 -- low-armor warning bars, "WARNING" text, warning enemy.
export function drawWarnings(_ctx: Ctx): void {}

// STUB(task 8): tyrian2.c:2086-2200 -- displayTime text, pentium speed toggle, level timer, GAME OVER.
// NOTE: the GAME OVER branch is what sets reallyEndLevel for a demo whose ship died.
export function drawTimers(_ctx: Ctx): void {}

// STUB(task 8): draw_boss_bar (tyrian2.c:5297)
export function drawBossBar(_ctx: Ctx): void {}

// STUB(task 8): JE_inGameDisplays (mainint.c:3072)
export function inGameDisplays(_ctx: Ctx): void {}
