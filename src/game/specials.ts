// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_SFCodes), src/varz.c (JE_specialComplete, JE_doSpecialShot)
import { S_POWERUP, S_SOUL_OF_ZINGLON } from '../audio/ids';
import { s16, s8, u16, u32, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { blitSprite2 } from '../video/sprite2';
import { barBright } from '../video/vga256d';
import { drawArmor, drawOptions, drawShield, wipeShieldArmorBars } from './hud';
import { playerShotCreate } from './shots';
import {
  FRONT_WEAPON, LEFT_SIDEKICK, MAX_PWEAPON, RIGHT_SIDEKICK, SA, SHOT_SPECIAL, SHOT_SPECIAL2, SPECIAL_NUM, type Player,
} from './world';

// port of JE_SFCodes (mainint.c:2432); playerNum is 1-based like the C. Parameters are JE_integer.
export function sfCodes(ctx: Ctx, playerNum: number, px: number, py: number, mouseX: number, mouseY: number): void {
  const g = ctx.game;
  const v = g.varz;
  const t = g.tables;
  px = s16(px); py = s16(py); mouseX = s16(mouseX); mouseY = s16(mouseY);

  let ship = g.players[playerNum - 1]!.items.ship;

  /*Get direction*/
  if (playerNum === 2 && ship < 15) ship = 0;

  if (ship < 15) {
    const btn0 = v.button[0]! ? 1 : 0;
    let temp2 = u8(
      (mouseY > py ? 1 : 0) + (mouseY < py ? 1 : 0) + (px < mouseX ? 1 : 0) + (px > mouseX ? 1 : 0));
    let temp = u8(
      (mouseY > py ? 1 : 0) * 1 + (mouseY < py ? 1 : 0) * 2 + (px < mouseX ? 1 : 0) * 3 + (px > mouseX ? 1 : 0) * 4);

    if (temp === 0) { // no direction being pressed
      if (!v.button[0]) { // if fire button is released
        temp = 9;
        temp2 = 1;
      } else {
        temp2 = 0;
        temp = 99;
      }
    }

    if (temp2 === 1) { // if exactly one direction pressed or fire button is released
      temp = u8(temp + btn0 * 4);

      const code = v.SFCurrentCode[playerNum - 1]!;
      const temp3 = g.config.superTyrian ? 21 : 3;
      for (temp2 = 0; temp2 < temp3; temp2++) {
        /*Use SuperTyrian ShipCombos or not?*/
        const temp5 = g.config.superTyrian ? t.shipCombosB[temp2]! : t.shipCombos[ship]![temp2]!;

        // temp5 == selected combo in ship
        if (temp5 === 0) { /* combo doesn't exists */
          // mark twiddles as cancelled/finished
          code[temp2] = 0;
        } else {
          const combo = t.keyboardCombos[temp5 - 1]!;
          // get next combo key
          let temp4 = combo[code[temp2]!] ?? 0;

          // correct key
          if (temp4 === temp) {
            code[temp2] = code[temp2]! + 1;

            temp4 = combo[code[temp2]!] ?? 0;
            if (temp4 > 100 && temp4 <= 100 + SPECIAL_NUM) {
              code[temp2] = 0;
              v.SFExecuted[playerNum - 1] = temp4 - 100;
            }
          } else if (
            temp !== 9 &&
            (temp4 - 1) % 4 !== (temp - 1) % 4 &&
            (code[temp2] === 0 || combo[code[temp2]! - 1] !== temp)
          ) {
            code[temp2] = 0;
          }
        }
      }
    }
  }
}

// port of JE_specialComplete (varz.c:507). Reads/writes the C globals temp, temp2 and b through g.scratch.
export function specialComplete(ctx: Ctx, playerNum: number, specialType: number): void {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const sc = g.scratch;
  const ps = g.playerShots;
  const sp = g.items.special[specialType]!;
  const p0 = g.players[0];

  ps.nextSpecialWait = 0;
  switch (sp.stype) {
    /*Weapon*/
    case 1: {
      const pl = g.players[playerNum === 1 ? 0 : 1];
      sc.b = s16(playerShotCreate(ctx, 0, SHOT_SPECIAL2, pl.x, pl.y, v.mouseX, v.mouseY, sp.wpn, playerNum));
      c.shotRepeat[SHOT_SPECIAL] = c.shotRepeat[SHOT_SPECIAL2]!;
      break;
    }
    /*Repulsor*/
    case 2:
      for (sc.temp = 0; sc.temp < 60; sc.temp = u8(sc.temp + 1)) {
        const i = sc.temp;
        if (!g.enemyShots.enemyShotAvail[i]) {
          const s = g.enemyShots.enemyShot[i]!;
          if (p0.x > s.sx) s.sxm = s16(s.sxm - 1);
          else if (p0.x < s.sx) s.sxm = s16(s.sxm + 1);

          if (p0.y > s.sy) s.sym = s16(s.sym - 1);
          else if (p0.y < s.sy) s.sym = s16(s.sym + 1);
        }
      }
      break;
    /*Zinglon Blast*/
    case 3:
      ps.zinglonDuration = 50;
      c.shotRepeat[SHOT_SPECIAL] = 100;
      v.soundQueue[7] = S_SOUL_OF_ZINGLON;
      break;
    /*Attractor*/
    case 4:
      for (sc.temp = 0; sc.temp < 100; sc.temp = u8(sc.temp + 1)) {
        const e = g.enemies.enemy[sc.temp]!;
        if (g.enemies.enemyAvail[sc.temp] !== 1 && e.scoreitem && e.evalue !== 0) {
          if (p0.x > e.ex) e.exc = s8(e.exc + 1);
          else if (p0.x < e.ex) e.exc = s8(e.exc - 1);

          if (p0.y > e.ey) e.eyc = s8(e.eyc + 1);
          else if (p0.y < e.ey) e.eyc = s8(e.eyc - 1);
        }
      }
      break;
    /*Flare*/
    case 5: case 6: case 7: case 8: case 9: case 10: case 11: case 16: {
      if (ps.flareDuration === 0) ps.flareStart = true;

      const power = p0.items.weapon[FRONT_WEAPON]!.power;
      v.specialWeaponWpn = u16(sp.wpn);
      v.linkToPlayer = false;
      ps.spraySpecial = false;
      switch (sp.stype) {
        case 5:
          v.specialWeaponFilter = 7;
          v.specialWeaponFreq = 2;
          ps.flareDuration = 50;
          break;
        case 6:
          v.specialWeaponFilter = 1;
          v.specialWeaponFreq = 7;
          ps.flareDuration = u16(200 + 25 * power);
          break;
        case 7:
          v.specialWeaponFilter = 3;
          v.specialWeaponFreq = 3;
          ps.flareDuration = u16(50 + 10 * power);
          ps.zinglonDuration = 50;
          c.shotRepeat[SHOT_SPECIAL] = 100;
          v.soundQueue[7] = S_SOUL_OF_ZINGLON;
          break;
        case 8:
          v.specialWeaponFilter = -99;
          v.specialWeaponFreq = 7;
          ps.flareDuration = u16(10 + power);
          break;
        case 9:
          v.specialWeaponFilter = -99;
          v.specialWeaponFreq = 8;
          ps.flareDuration = u16(8 + 2 * power);
          v.linkToPlayer = true;
          ps.nextSpecialWait = u8(sp.pwr);
          break;
        case 10:
          v.specialWeaponFilter = -99;
          v.specialWeaponFreq = 8;
          ps.flareDuration = u16(14 + 4 * power);
          v.linkToPlayer = true;
          break;
        case 11:
          v.specialWeaponFilter = -99;
          v.specialWeaponFreq = s8(sp.pwr);
          ps.flareDuration = u16(10 + 10 * power);
          ps.astralDuration = u8(20 + 10 * power);
          break;
        case 16:
          v.specialWeaponFilter = -99;
          v.specialWeaponFreq = 8;
          ps.flareDuration = u16(sc.temp2 * 16 + 8);
          v.linkToPlayer = true;
          ps.spraySpecial = true;
          break;
      }
      break;
    }
    case 12:
      g.players[playerNum - 1]!.invulnerableTicks = u32(sc.temp2 * 10);

      if (c.superArcadeMode > 0 && c.superArcadeMode <= SA) {
        c.shotRepeat[SHOT_SPECIAL] = 250;
        sc.b = s16(playerShotCreate(ctx, 0, SHOT_SPECIAL2, p0.x, p0.y, v.mouseX, v.mouseY, 707, 1));
        p0.invulnerableTicks = 100;
      }
      break;
    case 13:
      p0.armor = u32(p0.armor + (sc.temp2 >> 2) + 1);

      v.soundQueue[3] = S_POWERUP;
      break;
    case 14:
      g.players[1].armor = u32(g.players[1].armor + (sc.temp2 >> 2) + 1);

      v.soundQueue[3] = S_POWERUP;
      break;

    case 17: // spawn left or right sidekick
      v.soundQueue[3] = S_POWERUP;

      if (p0.items.sidekick[LEFT_SIDEKICK] === sp.wpn) {
        p0.items.sidekick[RIGHT_SIDEKICK] = u8(sp.wpn);
        c.shotMultiPos[RIGHT_SIDEKICK] = 0; // sic: the C indexes shotMultiPos with the sidekick enum
      } else {
        p0.items.sidekick[LEFT_SIDEKICK] = u8(sp.wpn);
        c.shotMultiPos[LEFT_SIDEKICK] = 0;
      }

      drawOptions(ctx);
      break;

    case 18: // spawn right sidekick
      p0.items.sidekick[RIGHT_SIDEKICK] = u8(sp.wpn);

      drawOptions(ctx);

      v.soundQueue[4] = S_POWERUP;

      c.shotMultiPos[RIGHT_SIDEKICK] = 0;
      break;
  }
}

// port of JE_doSpecialShot (varz.c:682). The C takes `uint *armor, uint *shield`; both are members of `player`.
export function doSpecialShot(ctx: Ctx, playerNum: number, player: Player): void {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const sc = g.scratch;
  const ps = g.playerShots;
  const p0 = g.players[0];
  const gs = ctx.vga.gameScreen; // VGAScreen == game_screen while the level runs
  const seg = ctx.vga.screen;
  const sheet9 = ctx.assets.shapes.spriteSheet9;

  if (p0.items.special > 0) {
    if (c.shotRepeat[SHOT_SPECIAL] === 0 && ps.specialWait === 0 && ps.flareDuration < 2 && ps.zinglonDuration < 2)
      blitSprite2(gs, 47, 4, sheet9, 94);
    else
      blitSprite2(gs, 47, 4, sheet9, 93);
  }

  if (c.shotRepeat[SHOT_SPECIAL]! > 0) c.shotRepeat[SHOT_SPECIAL] = c.shotRepeat[SHOT_SPECIAL]! - 1;
  if (ps.specialWait > 0) ps.specialWait--;

  sc.temp = v.SFExecuted[playerNum - 1]!;
  if (sc.temp > 0 && c.shotRepeat[SHOT_SPECIAL] === 0 && ps.flareDuration === 0) {
    sc.temp2 = u8(g.items.special[sc.temp]!.pwr);

    let canAfford = true;

    if (sc.temp2 > 0) {
      if (sc.temp2 < 98) { // costs some shield
        if (player.shield >= sc.temp2) player.shield = u32(player.shield - sc.temp2);
        else canAfford = false;
      } else if (sc.temp2 === 98) { // costs all shield
        if (player.shield < 4) canAfford = false;
        sc.temp2 = u8(player.shield);
        player.shield = 0;
      } else if (sc.temp2 === 99) { // costs half shield
        sc.temp2 = u8(Math.floor(player.shield / 2));
        player.shield = sc.temp2;
      } else { // costs some armor
        sc.temp2 = u8(sc.temp2 - 100);
        if (player.armor > sc.temp2) player.armor = u32(player.armor - sc.temp2);
        else canAfford = false;
      }
    }

    c.shotMultiPos[SHOT_SPECIAL] = 0;
    c.shotMultiPos[SHOT_SPECIAL2] = 0;

    if (canAfford) specialComplete(ctx, playerNum, sc.temp);

    v.SFExecuted[playerNum - 1] = 0;

    wipeShieldArmorBars(ctx);
    drawShield(ctx, seg); // VGAScreen = VGAScreenSeg
    drawArmor(ctx, seg);
  }

  if (playerNum === 1 && p0.items.special > 0) { /*Main Begin*/
    const b2 = v.button[1]!, b3 = v.button[2]!;
    if (c.superArcadeMode > 0 && (b2 || b3)) v.fireButtonHeld = false;
    if (!v.button[0] && !(c.superArcadeMode !== 0 && (b2 || b3))) {
      v.fireButtonHeld = false;
    } else if (c.shotRepeat[SHOT_SPECIAL] === 0 && !v.fireButtonHeld && !(ps.flareDuration > 0) && ps.specialWait === 0) {
      v.fireButtonHeld = true;
      specialComplete(ctx, playerNum, p0.items.special);
    }
  } /*Main End*/

  if (ps.astralDuration > 0) ps.astralDuration--;

  ps.shotAvail[MAX_PWEAPON - 1] = 0;
  if (ps.flareDuration > 1) {
    if (v.specialWeaponFilter !== -99) {
      if (c.levelFilter === -99 && c.levelBrightness === -99) c.filterActive = false;
      if (!c.filterActive) {
        c.levelFilter = v.specialWeaponFilter;
        if (c.levelFilter === 7) c.levelBrightness = 0;
        c.filterActive = true;
      }

      if (ctx.rng.rand() % 2 === 0) ps.flareColChg = -1;
      else ps.flareColChg = 1;

      if (c.levelFilter === 7) {
        if (c.levelBrightness < -6) ps.flareColChg = 1;
        if (c.levelBrightness > 6) ps.flareColChg = -1;
        c.levelBrightness = s8(c.levelBrightness + ps.flareColChg);
      }
    }

    if (ctx.rng.rand() % 6 < v.specialWeaponFreq) {
      sc.b = MAX_PWEAPON;

      if (v.linkToPlayer) {
        if (c.shotRepeat[SHOT_SPECIAL] === 0) {
          sc.b = s16(playerShotCreate(ctx, 0, SHOT_SPECIAL, p0.x, p0.y, v.mouseX, v.mouseY, v.specialWeaponWpn, playerNum));
        }
      } else {
        // C argument evaluation order is unspecified; GCC/x86-64 evaluates right to left (y first). Unverified (no demo takes this).
        const ry = ctx.rng.rand() % 180;
        const rx = ctx.rng.rand() % 280;
        sc.b = s16(playerShotCreate(ctx, 0, SHOT_SPECIAL, rx, ry, v.mouseX, v.mouseY, v.specialWeaponWpn, playerNum));
      }

      if (ps.spraySpecial && sc.b !== MAX_PWEAPON) {
        const shot = ps.playerShotData[sc.b]!;
        shot.shotXM = s16((ctx.rng.rand() % 5) - 2);
        shot.shotYM = s16((ctx.rng.rand() % 5) - 2);
        if (shot.shotYM === 0) shot.shotYM++;
      }
    }

    ps.flareDuration--;
    if (ps.flareDuration === 1) ps.specialWait = ps.nextSpecialWait;
  } else if (ps.flareStart) {
    ps.flareStart = false;
    c.shotRepeat[SHOT_SPECIAL] = v.linkToPlayer ? 15 : 200;
    ps.flareDuration = 0;
    if (c.levelFilter === v.specialWeaponFilter) {
      c.levelFilter = -99;
      c.levelBrightness = -99;
      c.filterActive = false;
    }
  }

  if (ps.zinglonDuration > 1) {
    sc.temp = u8(25 - Math.abs(ps.zinglonDuration - 25));

    barBright(gs, p0.x + 7 - sc.temp, 0, p0.x + 7 + sc.temp, 184);
    barBright(gs, p0.x + 7 - sc.temp - 2, 0, p0.x + 7 + sc.temp + 2, 184);

    ps.zinglonDuration--;
    if (ps.zinglonDuration % 5 === 0) ps.shotAvail[MAX_PWEAPON - 1] = 1;
  }
}
