// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_playerMovement two-player parts, JE_mainGamePlayerFunctions)
import { cosf, f32, roundf32, sinf } from '../core/cmath';
import { idiv, s16 } from '../core/int';
import type { Ctx } from '../ctx';
import { DEVICE_KEYBOARD_B } from '../platform/input';
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
  return c.twoPlayerMode && !c.galagaMode ? effectiveInputDevices(ctx)[playerNum - 1]! : 0;
}

/**
 * The device pair the game uses: the stored `inputDevice` made legal for the current joystick count.
 * The stored bytes are never rewritten (a 0/0 pair or a pad id must survive a save, as in the C), so every use goes through here.
 */
export function effectiveInputDevices(ctx: Ctx): Uint8Array {
  const d = Uint8Array.from(ctx.game.config.inputDevice);
  normalizeInputDevices(d, joystickCount(ctx), ctx.game.config.sharedKeyboard);
  return d;
}

/**
 * Number of joysticks (the C's `joysticks`): the connected gamepads, read live because a browser exposes a pad only after a
 * button press and a pad can vanish at any time. 0 without a gamepad layer (tests, the oracle).
 */
export function joystickCount(ctx: Ctx): number {
  return ctx.input.joysticks?.count ?? 0;
}

/**
 * port of the device cycling of JE_itemScreen (game_menu.c:1451-1470, 1544-1565) and JE_menuFunction (:2933-2947):
 * cycles `devices[which]` by `dir` (+1 = Right/Enter, -1 = Left) within 1..2 + joysticks until it differs from the other
 * player's. Mutates `devices` like the C, which, without joysticks, first copies the old device to the other player
 * (a swap). Returns the new device of `which`.
 */
export function nextInputDevice(devices: Uint8Array, which: 0 | 1, dir: 1 | -1, joysticks: number, extended = false): number {
  const other = which === 0 ? 1 : 0;
  const max = 2 + joysticks;
  // The ring of devices: 1..max, then (web extension) keyboard map B.
  const ring = extended ? [...Array.from({ length: max }, (_, i) => i + 1), DEVICE_KEYBOARD_B] : null;
  do {
    if (joysticks === 0) devices[other] = devices[which]!; // swap controllers
    if (ring) {
      const at = ring.indexOf(devices[which]!);
      devices[which] = at < 0 ? ring[0]! : ring[(at + dir + ring.length) % ring.length]!;
    } else if (dir === 1) {
      if (devices[which]! >= max) devices[which] = 1; else devices[which]!++;
    } else if (devices[which]! <= 1) devices[which] = max; else devices[which]!--;
  } while (devices[which] === devices[other]);
  return devices[which]!;
}

/**
 * Forces a legal pair of input devices (not in the C, whose menu clamps only when drawn, game_menu.c:765):
 * both in 1..2 + joysticks and different, defaulting to {1, 2}. A save or tyrian.cfg may hold anything.
 */
export function normalizeInputDevices(devices: Uint8Array, joysticks: number, sharedKeyboard = false): void {
  const max = 2 + joysticks;
  // keyboard map B (0x80) is a web extension: legal only while the shared keyboard is enabled
  const ok = (d: number): boolean => (d >= 1 && d <= max) || (sharedKeyboard && d === DEVICE_KEYBOARD_B);
  const a = devices[0]!, b = devices[1]!;
  if (ok(a) && ok(b) && a !== b) return;
  if (ok(a) && !ok(b)) devices[1] = a === 1 ? 2 : 1;
  else if (ok(b) && !ok(a)) devices[0] = b === 1 ? 2 : 1;
  else { devices[0] = 1; devices[1] = 2; }
}
