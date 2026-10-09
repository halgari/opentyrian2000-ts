// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_mainGamePlayerFunctions, JE_playerMovement, JE_playerCollide), src/player.c
import { cosf, f32, roundf32, sinf } from '../core/cmath';
import { idiv, s16, s8, u16, u32, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { S_CLINK, S_EXPLOSION_11, S_EXPLOSION_9, S_WEAPON_26 } from '../audio/ids';
import { SMALL_FONT_SHAPES } from '../video/sprite';
import { dString } from '../video/fonthand';
import {
  blitSprite2, blitSprite2x2, blitSprite2x2Blend, blitSprite2x2Darken, type Sprite2Sheet,
} from '../video/sprite2';
import { drawSegmentedGauge, fillRectangleXY } from '../video/vga256d';
import { replayDemoKeys } from './demo';
import { setupExplosion, setupExplosionLarge } from './explosions';
import { drawArmor, drawPortConfigButtons, drawShield, HUD_SIDEKICK_Y, wipeShieldArmorBars } from './hud';
import { playerShotCreate, portConfigs } from './shots';
import { doSpecialShot, sfCodes } from './specials';
import {
  FRONT_WEAPON, REAR_WEAPON, SHOT_LEFT_SIDEKICK, SHOT_NORTSPARKS, SHOT_P1_SUPERBOMB,
  SHOT_P2_CHARGE, SHOT_REAR, SHOT_RIGHT_SIDEKICK, SHOT_SPECIAL, SHOT_SPECIAL2, type Player,
} from './world';

const SA_LASTSHIP = 9; // varz.h

// port of calc_purple_balls_needed (player.c:23)
const PURPLE_BALLS_REQUIRED = [1, 1, 2, 4, 8, 12, 16, 20, 25, 30, 40, 50];
export function calcPurpleBallsNeeded(p: Player): void {
  p.purpleBallsNeeded = PURPLE_BALLS_REQUIRED[p.lives]!;
}

// port of power_up_weapon (player.c). `shotMultiPos` is global in the C, hence ctx.
export function powerUpWeapon(ctx: Ctx, p: Player, port: number): boolean {
  const w = p.items.weapon[port]!;
  const canPowerUp = w.id !== 0 && w.power < 11;
  if (canPowerUp) {
    w.power++;
    ctx.game.config.shotMultiPos[port] = 0;
    calcPurpleBallsNeeded(p);
  } else {
    p.cash += 1000; // cash consolation prize
  }
  return canPowerUp;
}

// port of handle_got_purple_ball (player.c)
export function handleGotPurpleBall(ctx: Ctx, p: Player): void {
  if (p.purpleBallsNeeded > 1) p.purpleBallsNeeded--;
  else powerUpWeapon(ctx, p, p.isDragonwing ? REAR_WEAPON : FRONT_WEAPON);
}

type MouseKeys = readonly ['mouseX', 'mouseY'] | readonly ['mouseXB', 'mouseYB'];

// port of JE_playerMovement (mainint.c:3497). playerNum is 1-based like the C.
// TODO(sp4): two-player/linked branches (mainint.c:3868-3925, 4047-4105, 4215-4230, 4355-4388) and the
// non-demo input paths (keyboard/mouse/joystick, mainint.c:3601-3830) throw when reached.
export function playerMovement(
  ctx: Ctx, p: Player, _inputDevice: number, playerNum: number, shipGr: number, shipGrPtr: Sprite2Sheet | null,
  mouse: MouseKeys,
): void {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const sc = g.scratch;
  const gs = ctx.vga.gameScreen; // VGAScreen == game_screen while the level runs
  const seg = ctx.vga.screen;
  const sh = ctx.assets.shapes;
  const tables = sh.tables;
  const button = v.button;
  const mx = mouse[0], my = mouse[1];

  if (playerNum === 2 || !c.twoPlayerMode) {
    sc.tempW = u16(g.items.weaponPort[p.items.weapon[REAR_WEAPON].id]!.opnum);
    if (p.weaponMode > sc.tempW) p.weaponMode = 1;
  }

  // `redo:` label (survey 5.7): only the respawn path loops back
  for (;;) {
    /* Draw Player */
    if (!p.isAlive) {
      if (p.explodingTicks > 0) {
        --p.explodingTicks;

        if (v.levelEndFxWait > 0) {
          v.levelEndFxWait--;
        } else {
          v.levelEndFxWait = u16(ctx.rng.rand() % 6 + 3);
          if (ctx.rng.rand() % 3 === 1) v.soundQueue[6] = S_EXPLOSION_9;
          else v.soundQueue[5] = S_EXPLOSION_11;
        }

        const explosionX = p.x + (ctx.rng.rand() % 32) - 16;
        const explosionY = p.y + (ctx.rng.rand() % 32) - 16;
        setupExplosionLarge(ctx, false, 0, explosionX, explosionY + 7);
        setupExplosionLarge(ctx, false, 0, p.x, p.y + 7);

        if (v.levelEnd > 0) v.levelEnd--;
      } else if (c.twoPlayerMode || c.onePlayerAction) { // if arcade mode
        if (p.lives > 1) { // respawn if any extra lives
          p.lives = p.lives - 1;

          v.reallyEndLevel = false;
          c.shotMultiPos[playerNum - 1] = 0;
          calcPurpleBallsNeeded(p);
          c.twoPlayerLinked = false;
          if (c.galagaMode) c.twoPlayerMode = false;
          p.y = 160;
          p.invulnerableTicks = 100;
          p.isAlive = true;
          v.endLevel = false;

          if (c.galagaMode || g.items.episodeNum === 4) p.armor = p.initialArmor;
          else p.armor = idiv(p.initialArmor, 2);

          if (c.galagaMode) p.shield = 0;
          else p.shield = idiv(p.shieldMax, 2);

          drawArmor(ctx, seg); // VGAScreen = VGAScreenSeg
          drawShield(ctx, seg);
          continue; // goto redo
        } else {
          if (c.galagaMode) c.twoPlayerMode = false;
          // `allPlayersGone && isNetworkGame` is never true (no network)
        }
      }
    }
    // `else if (constantDie)`: constantDie is a command-line cheat flag, always false here.

    if (!p.isAlive) {
      g.explosions.explosionFollowAmountX = g.explosions.explosionFollowAmountY = 0;
      return;
    }
    break;
  }

  let accelXC = 0, accelYC = 0;
  // mouseXC/mouseYC only change in the joystick/mouse branches, which throw: always 0.

  if (!v.endLevel) {
    v[mx] = u16(p.x);
    v[my] = u16(p.y);
    button[0] = button[1] = button[2] = button[3] = false;

    /* --- Movement Routine Beginning --- */
    // `if (endLevel) y -= 2` inside this !endLevel block is dead code in the C.
    if (!ctx.state.playDemo) {
      // TODO(sp4): mainint.c:3620-3830 keyboard/mouse/joystick input
      throw new Error('unported: mainint.c:3620 non-demo player input');
    }
    // record_demo || play_demo => inputDevice = 1; the joystick and mouse blocks need inputDevice 0/2/3+.
    if (!replayDemoKeys(ctx)) {
      v.endLevel = true;
      v.levelEnd = 40;
    }

    if (c.smoothies[9 - 1]) v[my] = u16(p.y - (v[my] - p.y));

    accelXC += p.x - v[mx];
    accelYC += p.y - v[my];

    /* --- Movement Routine Ending --- */

    /*Street-Fighter codes*/
    sfCodes(ctx, playerNum, p.x, p.y, v[mx], v[my]);

    /*Linking Routines*/
    if (c.twoPlayerMode) throw new Error('unported: mainint.c:3868 two-player linking');
    if (playerNum === 1 && (button[3 - 1] || button[2 - 1]) && !c.galagaMode) c.twoPlayerLinked = false;
  }

  if (v.levelEnd > 0 && !g.players[0].isAlive && (!c.twoPlayerMode || !g.players[1].isAlive)) v.reallyEndLevel = true;

  /* End Level Fade-Out */
  if (p.isAlive && v.endLevel) {
    if (v.levelEnd === 0) {
      v.reallyEndLevel = true;
    } else {
      p.y -= v.levelEndWarp;
      if (p.y < -200) v.reallyEndLevel = true;

      let trailSpacing = 1;
      let trailY = p.y;
      let numTrails = Math.abs(41 - v.levelEnd);
      if (numTrails > 20) numTrails = 20;

      for (let i = 0; i < numTrails; i++) {
        trailY += trailSpacing;
        trailSpacing++;
      }

      for (let i = 1; i < numTrails; i++) {
        trailY -= trailSpacing;
        trailSpacing--;

        if (trailY > 0 && trailY < 170) {
          if (shipGr === 0) {
            blitSprite2x2(gs, p.x - 17, trailY - 7, shipGrPtr!, 13);
            blitSprite2x2(gs, p.x + 7, trailY - 7, shipGrPtr!, 51);
          } else if (shipGr === 1) {
            blitSprite2x2(gs, p.x - 17, trailY - 7, shipGrPtr!, 220);
            blitSprite2x2(gs, p.x + 7, trailY - 7, shipGrPtr!, 222);
          } else {
            blitSprite2x2(gs, p.x - 5, trailY - 7, shipGrPtr!, shipGr);
          }
        }
      }
    }
  }

  if (ctx.state.playDemo) dString(gs, tables, 115, 10, ctx.assets.helpText.miscText[7] ?? '', SMALL_FONT_SHAPES); // insert coin

  if (p.isAlive && !v.endLevel) {
    if (!c.twoPlayerLinked || playerNum < 2) {
      if (!c.twoPlayerMode || v.shipGr2 !== 0) { // if not dragonwing
        if (p.sidekick[0].style === 0) {
          p.sidekick[0].x = v[mx] - 14;
          p.sidekick[0].y = v[my];
        }
        if (p.sidekick[1].style === 0) {
          p.sidekick[1].x = v[mx] + 16;
          p.sidekick[1].y = v[my];
        }
      }

      if (p.xFrictionTicks > 0) {
        --p.xFrictionTicks;
      } else {
        p.xFrictionTicks = 1;
        if (p.xVelocity < 0) ++p.xVelocity;
        else if (p.xVelocity > 0) --p.xVelocity;
      }

      if (p.yFrictionTicks > 0) {
        --p.yFrictionTicks;
      } else {
        p.yFrictionTicks = 2;
        if (p.yVelocity < 0) ++p.yVelocity;
        else if (p.yVelocity > 0) --p.yVelocity;
      }

      p.xVelocity += accelXC;
      p.yVelocity += accelYC;

      p.xVelocity = Math.min(Math.max(-4, p.xVelocity), 4);
      p.yVelocity = Math.min(Math.max(-4, p.yVelocity), 4);

      p.x += p.xVelocity;
      p.y += p.yVelocity;

      // if player moved, add new ship x, y history entry
      if (p.x - v[mx] !== 0 || p.y - v[my] !== 0) {
        for (let i = 1; i < 20; ++i) {
          p.oldX[i - 1] = p.oldX[i]!;
          p.oldY[i - 1] = p.oldY[i]!;
        }
        p.oldX[19] = p.x;
        p.oldY[19] = p.y;
      }
    } else { /*twoPlayerLinked*/
      throw new Error('unported: mainint.c:4047 linked two-player ship');
    }
  }

  if (!v.endLevel) {
    if (p.x > 256) {
      p.x = 256;
      v.constantLastX = s8(-v.constantLastX);
    }
    if (p.x < 40) {
      p.x = 40;
      v.constantLastX = s8(-v.constantLastX);
    }

    if (p.y > 160) p.y = 160; // (the isNetworkGame && playerNum == 1 variant clamps at 154)
    if (p.y < 10) p.y = 10;

    // Determines the ship banking sprite to display, depending on horizontal velocity and acceleration
    let shipBanking = idiv(p.xVelocity, 2) + idiv(p.x - v[mx], 6);
    shipBanking = Math.max(-2, Math.min(shipBanking, 2));

    const shipSprite = shipBanking * 2 + shipGr;

    const ex = g.explosions;
    ex.explosionFollowAmountX = s16(p.x - p.lastXExplosionFollow);
    ex.explosionFollowAmountY = s16(p.y - p.lastYExplosionFollow);
    if (ex.explosionFollowAmountY < 0) ex.explosionFollowAmountY = 0;
    p.lastXExplosionFollow = p.x;
    p.lastYExplosionFollow = p.y;

    const mapX2Ofs = g.backgrounds.mapX2Ofs;
    const sy = p.y - 7 + v.shadowYDist;
    if (shipGr === 0) {
      if (c.background2) {
        blitSprite2x2Darken(gs, p.x - 17 - mapX2Ofs + 30, sy, shipGrPtr!, shipSprite + 13);
        blitSprite2x2Darken(gs, p.x + 7 - mapX2Ofs + 30, sy, shipGrPtr!, shipSprite + 51);
        if (c.superWild) {
          blitSprite2x2Darken(gs, p.x - 16 - mapX2Ofs + 30, sy, shipGrPtr!, shipSprite + 13);
          blitSprite2x2Darken(gs, p.x + 6 - mapX2Ofs + 30, sy, shipGrPtr!, shipSprite + 51);
        }
      }
    } else if (shipGr === 1) {
      if (c.background2) {
        blitSprite2x2Darken(gs, p.x - 17 - mapX2Ofs + 30, sy, shipGrPtr!, 220);
        blitSprite2x2Darken(gs, p.x + 7 - mapX2Ofs + 30, sy, shipGrPtr!, 222);
      }
    } else if (c.background2) {
      blitSprite2x2Darken(gs, p.x - 5 - mapX2Ofs + 30, sy, shipGrPtr!, shipSprite);
      if (c.superWild) blitSprite2x2Darken(gs, p.x - 4 - mapX2Ofs + 30, sy, shipGrPtr!, shipSprite);
    }

    if (p.invulnerableTicks > 0) {
      --p.invulnerableTicks;

      if (shipGr === 0) {
        blitSprite2x2Blend(gs, p.x - 17, p.y - 7, shipGrPtr!, shipSprite + 13);
        blitSprite2x2Blend(gs, p.x + 7, p.y - 7, shipGrPtr!, shipSprite + 51);
      } else if (shipGr === 1) {
        blitSprite2x2Blend(gs, p.x - 17, p.y - 7, shipGrPtr!, 220);
        blitSprite2x2Blend(gs, p.x + 7, p.y - 7, shipGrPtr!, 222);
      } else {
        blitSprite2x2Blend(gs, p.x - 5, p.y - 7, shipGrPtr!, shipSprite);
      }
    } else if (shipGr === 0) {
      blitSprite2x2(gs, p.x - 17, p.y - 7, shipGrPtr!, shipSprite + 13);
      blitSprite2x2(gs, p.x + 7, p.y - 7, shipGrPtr!, shipSprite + 51);
    } else if (shipGr === 1) {
      blitSprite2x2(gs, p.x - 17, p.y - 7, shipGrPtr!, 220);
      blitSprite2x2(gs, p.x + 7, p.y - 7, shipGrPtr!, 222);

      let banking = 0; // inner `int ship_banking` shadows the outer one
      switch (shipSprite) {
        case 5:
          blitSprite2(gs, p.x - 17, p.y + 7, shipGrPtr!, 40);
          sc.tempW = u16(p.x - 7);
          banking = -2;
          break;
        case 3:
          blitSprite2(gs, p.x - 17, p.y + 7, shipGrPtr!, 39);
          sc.tempW = u16(p.x - 7);
          banking = -1;
          break;
        case 1:
          banking = 0;
          break;
        case -1:
          blitSprite2(gs, p.x + 19, p.y + 7, shipGrPtr!, 58);
          sc.tempW = u16(p.x + 9);
          banking = 1;
          break;
        case -3:
          blitSprite2(gs, p.x + 19, p.y + 7, shipGrPtr!, 59);
          sc.tempW = u16(p.x + 9);
          banking = 2;
          break;
      }
      if (banking !== 0) { // NortSparks
        if (c.shotRepeat[SHOT_NORTSPARKS]! > 0) {
          --c.shotRepeat[SHOT_NORTSPARKS]!;
        } else {
          const sx = sc.tempW + (ctx.rng.rand() % 8) - 4;
          const syy = p.y + (ctx.rng.rand() % 8) - 4;
          sc.b = s16(playerShotCreate(ctx, 0, SHOT_NORTSPARKS, sx, syy, v[mx], v[my], 671, 1));
          c.shotRepeat[SHOT_NORTSPARKS] = Math.abs(banking) - 1;
        }
      }
    } else {
      blitSprite2x2(gs, p.x - 5, p.y - 7, shipGrPtr!, shipSprite);
    }

    /*Options Location*/
    if (playerNum === 2 && shipGr === 0) { // if dragonwing
      if (p.sidekick[0].style === 0) {
        p.sidekick[0].x = p.x - 14 + shipBanking * 2;
        p.sidekick[0].y = p.y;
      }
      if (p.sidekick[1].style === 0) {
        p.sidekick[1].x = p.x + 17 + shipBanking * 2;
        p.sidekick[1].y = p.y;
      }
    }
  } // !endLevel

  // moveOk is always true
  if (p.isAlive) {
    if (!v.endLevel) {
      p.deltaXShotMove = p.x - p.lastXShotMove;
      p.deltaYShotMove = p.y - p.lastYShotMove;

      /* PLAYER SHOT Change */
      if (button[4 - 1]) {
        c.portConfigChange = true;
        if (c.portConfigDone) {
          c.shotMultiPos[SHOT_REAR] = 0;

          if (c.superArcadeMode !== 0 && c.superArcadeMode <= SA_LASTSHIP) {
            c.shotMultiPos[SHOT_SPECIAL] = 0;
            c.shotMultiPos[SHOT_SPECIAL2] = 0;
            const t = g.tables;
            if (g.players[0].items.special === t.SASpecialWeapon[c.superArcadeMode - 1]) {
              g.players[0].items.special = t.SASpecialWeaponB[c.superArcadeMode - 1]!;
              p.weaponMode = 2;
            } else {
              g.players[0].items.special = t.SASpecialWeapon[c.superArcadeMode - 1]!;
              p.weaponMode = 1;
            }
          } else if (++p.weaponMode > portConfigs(ctx)) {
            p.weaponMode = 1;
          }

          drawPortConfigButtons(ctx);
          c.portConfigDone = false;
        }
      }

      /* PLAYER SHOT Creation */

      /*SpecialShot*/
      if (!c.galagaMode) doSpecialShot(ctx, playerNum, p);

      /*Normal Main Weapons*/
      if (!(c.twoPlayerLinked && playerNum === 2)) {
        let min: number, max: number;
        if (!c.twoPlayerMode) { min = 1; max = 2; } else { min = max = playerNum; }

        for (sc.temp = min - 1; sc.temp < max; sc.temp = u8(sc.temp + 1)) {
          const temp = sc.temp;
          const item = p.items.weapon[temp]!.id;

          if (item > 0) {
            if (c.shotRepeat[temp]! > 0) {
              --c.shotRepeat[temp]!;
            } else if (button[0]) {
              const itemPower = c.galagaMode ? 0 : u32(p.items.weapon[temp]!.power - 1);
              const itemMode = (temp === REAR_WEAPON) ? u32(p.weaponMode - 1) : 0;

              sc.b = s16(playerShotCreate(
                ctx, item, temp, p.x, p.y, v[mx], v[my], g.items.weaponPort[item]!.op[itemMode]![itemPower]!, playerNum));
            }
          }
        }
      }

      /*Super Charge Weapons*/
      if (playerNum === 2) {
        if (!c.twoPlayerLinked) {
          blitSprite2(gs, p.x + (shipGr === 0 ? 1 : 0) + 1, p.y - 13, sh.spriteSheet10, 77 + v.chargeLevel + v.chargeGr * 19);
        }

        if (v.chargeGrWait > 0) {
          v.chargeGrWait--;
        } else {
          v.chargeGr++;
          if (v.chargeGr === 4) v.chargeGr = 0;
          v.chargeGrWait = 3;
        }

        if (v.chargeLevel > 0) fillRectangleXY(seg, 269, 107 + (v.chargeLevel - 1) * 3, 275, 108 + (v.chargeLevel - 1) * 3, 193);

        if (v.chargeWait > 0) {
          v.chargeWait--;
        } else {
          if (v.chargeLevel < v.chargeMax) v.chargeLevel++;

          v.chargeWait = u8(28 - p.items.weapon[REAR_WEAPON].power * 2);
          if (c.difficultyLevel > 3 /* DIFFICULTY_HARD */) v.chargeWait = u8(v.chargeWait - 5);
        }

        if (v.chargeLevel > 0) fillRectangleXY(seg, 269, 107 + (v.chargeLevel - 1) * 3, 275, 108 + (v.chargeLevel - 1) * 3, 204);

        if (c.shotRepeat[SHOT_P2_CHARGE]! > 0) {
          --c.shotRepeat[SHOT_P2_CHARGE]!;
        } else if (button[0] && (!c.twoPlayerLinked || v.chargeLevel > 0)) {
          c.shotMultiPos[SHOT_P2_CHARGE] = 0;
          sc.b = s16(playerShotCreate(
            ctx, 16, SHOT_P2_CHARGE, p.x, p.y, v[mx], v[my],
            g.tables.chargeGunWeapons[g.players[1].items.weapon[REAR_WEAPON].id - 1]! + v.chargeLevel, playerNum));

          if (v.chargeLevel > 0) fillRectangleXY(seg, 269, 107 + (v.chargeLevel - 1) * 3, 275, 108 + (v.chargeLevel - 1) * 3, 193);

          v.chargeLevel = 0;
          v.chargeWait = u8(30 - p.items.weapon[REAR_WEAPON].power * 2);
        }
      }

      /*SUPER BOMB*/
      sc.temp = playerNum;
      if (sc.temp === 0) sc.temp = 1; /*Get whether player 1 or 2*/

      if (g.players[sc.temp - 1]!.superbombs > 0) {
        const slot = SHOT_P1_SUPERBOMB + sc.temp - 1;
        if (c.shotRepeat[slot]! > 0) {
          --c.shotRepeat[slot]!;
        } else if (button[3 - 1] || button[2 - 1]) {
          --g.players[sc.temp - 1]!.superbombs;
          c.shotMultiPos[slot] = 0;
          sc.b = s16(playerShotCreate(ctx, 16, slot, p.x, p.y, v[mx], v[my], 535, playerNum));
        }
      }

      // sidekicks
      const L = p.sidekick[0], R = p.sidekick[1];
      if (L.style === 4 && R.style === 4) v.optionSatelliteRotate = f32(v.optionSatelliteRotate + f32(0.2));
      else if (L.style === 4 || R.style === 4) v.optionSatelliteRotate = f32(v.optionSatelliteRotate + f32(0.15));

      switch (L.style) {
        case 1: // trailing
        case 3:
          L.x = p.oldX[20 / 2 - 1]!;
          L.y = p.oldY[20 / 2 - 1]!;
          break;
        case 2: // front-mounted
          L.x = p.x;
          L.y = Math.max(10, p.y - 20);
          break;
        case 4: // orbiting
          L.x = p.x + roundf32(f32(sinf(v.optionSatelliteRotate) * 20));
          L.y = p.y + roundf32(f32(cosf(v.optionSatelliteRotate) * 20));
          break;
      }

      switch (R.style) {
        case 4: // orbiting
          R.x = p.x - roundf32(f32(sinf(v.optionSatelliteRotate) * 20));
          R.y = p.y - roundf32(f32(cosf(v.optionSatelliteRotate) * 20));
          break;
        case 1: // trailing
        case 3:
          R.x = p.oldX[0]!;
          R.y = p.oldY[0]!;
          break;
        case 2: // front-mounted
          if (!v.optionAttachmentLinked) {
            R.y += idiv(v.optionAttachmentMove, 2);
            if (v.optionAttachmentMove >= -2) {
              if (v.optionAttachmentReturn) sc.temp = 2;
              else sc.temp = 0;

              if (R.y > (p.y - 20) + 5) {
                sc.temp = 2;
                v.optionAttachmentMove = s16(v.optionAttachmentMove - (1 + Number(v.optionAttachmentReturn)));
              } else if (R.y > (p.y - 20) - 0) {
                sc.temp = 3;
                if (v.optionAttachmentMove > 0) v.optionAttachmentMove--;
                else v.optionAttachmentMove++;
              } else if (R.y > (p.y - 20) - 5) {
                sc.temp = 2;
                v.optionAttachmentMove++;
              } else if (v.optionAttachmentMove < 2 + Number(v.optionAttachmentReturn) * 4) {
                v.optionAttachmentMove = s16(v.optionAttachmentMove + 1 + Number(v.optionAttachmentReturn));
              }

              if (v.optionAttachmentReturn) sc.temp = u8(sc.temp * 2);
              if (Math.abs(R.x - p.x) < sc.temp) sc.temp = 1;

              if (R.x > p.x) R.x -= sc.temp;
              else if (R.x < p.x) R.x += sc.temp;

              if (Math.abs(R.y - (p.y - 20)) + Math.abs(R.x - p.x) < 8) {
                v.optionAttachmentLinked = true;
                v.soundQueue[2] = S_CLINK;
              }

              if (button[3 - 1]) v.optionAttachmentReturn = true;
            } else { // sidekick needs to catch up to player
              v.optionAttachmentMove = s16(v.optionAttachmentMove + 1 + Number(v.optionAttachmentReturn));
              setupExplosion(ctx, R.x + 1, R.y + 10, 0, 0, false, false);
            }
          } else {
            R.x = p.x;
            R.y = p.y - 20;
            if (button[3 - 1]) {
              v.optionAttachmentLinked = false;
              v.optionAttachmentReturn = false;
              v.optionAttachmentMove = -20;
              v.soundQueue[3] = S_WEAPON_26;
            }
          }

          if (R.y < 10) R.y = 10;
          break;
      }

      if (playerNum === 2 || !c.twoPlayerMode) { // if player has sidekicks
        for (let i = 0; i < 2; ++i) {
          const shotI = (i === 0) ? SHOT_LEFT_SIDEKICK : SHOT_RIGHT_SIDEKICK;
          const thisOption = g.items.options[p.items.sidekick[i]!]!;
          const sk = p.sidekick[i]!;

          // fire/refill sidekick
          if (thisOption.wport > 0) {
            if (c.shotRepeat[shotI]! > 0) {
              --c.shotRepeat[shotI]!;
            } else {
              const ammoMax = sk.ammoMax;

              if (ammoMax > 0) { // sidekick has limited ammo
                if (sk.ammoRefillTicks > 0) {
                  --sk.ammoRefillTicks;
                } else { // refill one ammo
                  sk.ammoRefillTicks = sk.ammoRefillTicksMax;

                  if (sk.ammo < ammoMax) ++sk.ammo;

                  // draw sidekick refill ammo gauge
                  const y = HUD_SIDEKICK_Y[c.twoPlayerMode ? 1 : 0]![i]! + 13;
                  drawSegmentedGauge(seg, 284, y, 112, 2, 2, Math.max(1, idiv(ammoMax, 10)), sk.ammo);
                }

                if (button[1 + i] && sk.ammo > 0) {
                  sc.b = s16(playerShotCreate(
                    ctx, thisOption.wport, shotI, sk.x, sk.y, v[mx], v[my], thisOption.wpnum + sk.charge, playerNum));

                  --sk.ammo;
                  if (sk.charge > 0) {
                    c.shotMultiPos[shotI] = 0;
                    sk.charge = 0;
                  }
                  sk.chargeTicks = 20;
                  sk.animationEnabled = true;

                  // draw sidekick discharge ammo gauge
                  const y = HUD_SIDEKICK_Y[c.twoPlayerMode ? 1 : 0]![i]! + 13;
                  fillRectangleXY(seg, 284, y, 312, y + 2, 0);
                  drawSegmentedGauge(seg, 284, y, 112, 2, 2, Math.max(1, idiv(ammoMax, 10)), sk.ammo);
                }
              } else { // has infinite ammo
                // Tyrian 2000: weapons with charge stages do not auto-fire
                if ((button[0] && !thisOption.pwr) || button[1 + i]) {
                  sc.b = s16(playerShotCreate(
                    ctx, thisOption.wport, shotI, sk.x, sk.y, v[mx], v[my], thisOption.wpnum + sk.charge, playerNum));

                  if (sk.charge > 0) {
                    c.shotMultiPos[shotI] = 0;
                    sk.charge = 0;
                  }
                  sk.chargeTicks = 20;
                  sk.animationEnabled = true;
                }
              }
            }
          }
        }
      } // end of if player has sidekicks
    } // !endLevel
  } // is_alive

  // draw sidekicks
  if ((playerNum === 2 || !c.twoPlayerMode) && !v.endLevel) {
    for (let i = 0; i < 2; ++i) {
      const thisOption = g.items.options[p.items.sidekick[i]!]!;
      const sk = p.sidekick[i]!;

      if (thisOption.option > 0) {
        if (sk.animationEnabled) {
          if (++sk.animationFrame >= thisOption.ani) {
            sk.animationFrame = 0;
            sk.animationEnabled = (thisOption.option === 1);
          }
        }

        const x = sk.x, y = sk.y;
        const sprite = thisOption.gr[sk.animationFrame]! + sk.charge;

        if (sk.style === 1 || sk.style === 2) blitSprite2x2(gs, x - 6, y, sh.spriteSheet10, sprite);
        else blitSprite2(gs, x, y, sh.spriteSheet9, sprite);
      }

      sk.chargeTicks = u32(sk.chargeTicks - 1);
      if (sk.chargeTicks === 0) {
        if (sk.charge < thisOption.pwr) ++sk.charge;
        sk.chargeTicks = 20;
      }
    }
  }
}

// port of JE_mainGamePlayerFunctions (mainint.c:4662)
export function mainGamePlayerFunctions(ctx: Ctx): void {
  const g = ctx.game;
  const v = g.varz;

  /*PLAYER MOVEMENT/MOUSE ROUTINES*/
  if (v.endLevel && v.levelEnd > 0) {
    v.levelEnd--;
    v.levelEndWarp = s8(v.levelEndWarp + 1);
  }

  /*Reset Street-Fighter commands*/
  v.SFExecuted.fill(0);

  g.config.portConfigChange = false;

  if (g.config.twoPlayerMode) throw new Error('unported: mainint.c:4676 two-player movement');
  playerMovement(ctx, g.players[0], 0, 1, v.shipGr, v.shipGrPtr, ['mouseX', 'mouseY']);

  /* == Parallax Map Scrolling == */
  const b = g.backgrounds;
  const tempX = u16(g.players[0].x);

  g.scratch.tempW = u16(Math.floor(f32(f32(f32(f32(260 - (tempX - 36)) / (260 - 36)) * (24 * 3)) - 1)));
  const tempW = g.scratch.tempW;
  b.mapX3Ofs = tempW;
  b.mapX3Pos = b.mapX3Ofs % 24;
  b.mapX3bpPos = 1 - idiv(b.mapX3Ofs, 24);

  b.mapX2Ofs = u16(idiv(tempW * 2, 3));
  b.mapX2Pos = b.mapX2Ofs % 24;
  b.mapX2bpPos = 1 - idiv(b.mapX2Ofs, 24);

  b.oldMapXOfs = b.mapXOfs;
  b.mapXOfs = idiv(b.mapX2Ofs, 2);
  b.mapXPos = b.mapXOfs % 24;
  b.mapXbpPos = 1 - idiv(b.mapXOfs, 24);

  if (v.background3x1) {
    b.mapX3Ofs = b.mapXOfs;
    b.mapX3Pos = b.mapXPos;
    b.mapX3bpPos = b.mapXbpPos - 1;
  }
}

// STUB(task 12): JE_playerCollide (mainint.c:4732); playerNum is 1-based like the C
export function playerCollide(_ctx: Ctx, _player: Player, _playerNum: number): void {}
