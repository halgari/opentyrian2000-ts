// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_playerMovement two-player parts, JE_mainGamePlayerFunctions)
import { cosf, f32, roundf32, sinf } from '../core/cmath';
import { idiv, s16 } from '../core/int';
import type { Ctx } from '../ctx';
import { playerShotCreate, playerShotSetDirection } from './shots';
import { linkGunWeapons, REAR_WEAPON, SHOT_MISC, SHOT_REAR, type GameWorld, type Player } from './world';

const M_PI = Math.PI;
const M_PI_2 = Math.PI / 2;
const TWO_PI = 2 * Math.PI;

/** The analog link-gun angle a joystick reports (`link_gun_analog` / `link_gun_angle`, mainint.c:3535); none without a pad. */
export interface LinkGunAnalog { on: boolean; angle: number }

/**
 * port of the `twoPlayerMode` linking routines of JE_playerMovement (mainint.c:3868-3948): link detection and the
 * link-gun direction update. The unlink on player 1's sidekick buttons (mainint.c:3896) stays in playerMovement.
 * `playerNum` is 1-based; player 1 uses mouseX/Y, player 2 mouseXB/YB (the C's `mouseX_`/`mouseY_`).
 */
export function playerLinking(ctx: Ctx, p: Player, playerNum: number, button: boolean[], analog?: LinkGunAnalog): void {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const p0 = g.players[0];
  const p1 = g.players[1];
  const mx = playerNum === 2 ? v.mouseXB : v.mouseX;
  const my = playerNum === 2 ? v.mouseYB : v.mouseY;

  if (c.twoPlayerMode && !c.twoPlayerLinked && p.x === mx && p.y === my &&
      Math.abs(p0.x - p1.x) < 8 && Math.abs(p0.y - p1.y) < 8 &&
      p0.isAlive && p1.isAlive && !c.galagaMode) {
    c.twoPlayerLinked = true;
  }

  // (mainint.c:3896, `playerNum_ == 1 && (button[2] || button[1])` unlink, is applied by the caller between these parts)
  if (c.twoPlayerMode && c.twoPlayerLinked && playerNum === 2 && (p.x !== mx || p.y !== my)) {
    if (button[0]) {
      if (analog?.on) {
        c.linkGunDirec = f32(analog.angle);
      } else {
        let tempR: number; // JE_real
        if (Math.abs(p.x - mx) > Math.abs(p.y - my)) tempR = f32((p.x - mx > 0) ? M_PI_2 : (M_PI + M_PI_2));
        else tempR = f32((p.y - my > 0) ? 0 : M_PI);

        const d = c.linkGunDirec;
        if (Math.abs(f32(d - tempR)) < f32(0.3)) c.linkGunDirec = tempR;
        else if (d < tempR && f32(d - tempR) > f32(-3.24)) c.linkGunDirec = f32(d + f32(0.2));
        else if (f32(d - tempR) < M_PI) c.linkGunDirec = f32(d - f32(0.2));
        else c.linkGunDirec = f32(d + f32(0.2));
      }

      if (c.linkGunDirec >= TWO_PI) c.linkGunDirec = f32(c.linkGunDirec - TWO_PI);
      else if (c.linkGunDirec < 0) c.linkGunDirec = f32(c.linkGunDirec + TWO_PI);
    } else if (!c.galagaMode) {
      c.twoPlayerLinked = false;
    }
  }
}

/**
 * port of the `else` (twoPlayerLinked) branch of JE_playerMovement (mainint.c:4047-4105). Only player 2 reaches it
 * (`!twoPlayerLinked || playerNum_ < 2`), so `shipGr_` is `shipGr2` and the mouse pair is mouseXB/YB.
 */
export function linkedShip(ctx: Ctx, p: Player, playerNum: number): void {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const sc = g.scratch;
  const p0 = g.players[0];
  const mx = playerNum === 2 ? v.mouseXB : v.mouseX;
  const my = playerNum === 2 ? v.mouseYB : v.mouseY;
  const shipGr = playerNum === 2 ? v.shipGr2 : v.shipGr;

  if (shipGr === 0) p.x = p0.x - 1;
  else p.x = p0.x;
  p.y = p0.y + 8;

  p.xVelocity = p0.xVelocity;
  p.yVelocity = 4;

  // turret direction marker/shield
  const d = c.linkGunDirec;
  const marker = (ang: number, len: number, gr: number): void => {
    c.shotMultiPos[SHOT_MISC] = 0;
    sc.b = s16(playerShotCreate(
      ctx, 0, SHOT_MISC,
      p.x + 1 + roundf32(f32(sinf(ang) * len)), p.y + roundf32(f32(cosf(ang) * len)), mx, my, gr, playerNum));
  };
  marker(f32(d + f32(0.2)), 26, 148);
  marker(f32(d - f32(0.2)), 26, 148);
  marker(d, 26, 147);

  if (c.shotRepeat[SHOT_REAR]! > 0) {
    --c.shotRepeat[SHOT_REAR]!;
  } else if (v.button[0]) {
    c.shotMultiPos[SHOT_REAR] = 0;
    const rearId = p.items.weapon[REAR_WEAPON]!.id;
    sc.b = s16(playerShotCreate(
      ctx, 0, SHOT_REAR,
      p.x + 1 + roundf32(f32(sinf(d) * 20)), p.y + roundf32(f32(cosf(d) * 20)), mx, my,
      linkGunWeapons[rearId - 1]!, playerNum));
    playerShotSetDirection(ctx, sc.b, rearId, d);
  }
}

/** The x the parallax map scroll keys on (mainint.c:4695-4699): the ships' average in two-player mode, else player 1. */
export function scrollAnchorX(g: GameWorld): number {
  return g.config.twoPlayerMode ? idiv(g.players[0].x + g.players[1].x, 2) : g.players[0].x;
}

/** `twoPlayerMode ? inputDevice[playerNum - 1] : 0` (mainint.c:4677-4687; galaga passes 0, handled by the caller). */
export function inputDeviceOf(ctx: Ctx, playerNum: 1 | 2): number {
  const c = ctx.game.config;
  return c.twoPlayerMode && !c.galagaMode ? c.inputDevice[playerNum - 1]! : 0;
}
