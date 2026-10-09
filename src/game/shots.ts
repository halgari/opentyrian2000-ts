// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/shots.c, src/varz.c (JE_getShipInfo, JE_portConfigs)
import { f32, roundf32, sinf, cosf } from '../core/cmath';
import { s16, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { OPTION_SHAPES, blitSpriteBlend } from '../video/sprite';
import { blitSprite2, blitSprite2Darken } from '../video/sprite2';
import { doSP, setupExplosion } from './explosions';
import { MAX_PWEAPON, PORT_NUM, WEAP_NUM } from './world';

const linkMultiGr = [77, 221, 183, 301, 1, 282, 164, 202, 58, 201, 163, 281, 39, 300, 182, 220, 77];
const linkSonicGr = [85, 242, 131, 303, 47, 284, 150, 223, 66, 224, 149, 283, 9, 302, 130, 243, 85];
const linkMult2Gr = [78, 299, 295, 297, 2, 278, 276, 280, 59, 279, 275, 277, 40, 296, 294, 298, 78];

// port of JE_getShipInfo (varz.c:330)
export function getShipInfo(ctx: Ctx): void {
  const g = ctx.game;
  const [p0, p1] = g.players;
  const { ships, powerSys } = g.items;
  const sh = ctx.assets.shapes;

  // TODO(sp4): varz.c:341-344,354-357 JE_SGr/extraShips (editship.c, needs newsh$.shp; demos never use ship > 90).
  // C reads ships[ship] (out of bounds for ship > 90) before this; checked first here so it cannot crash on undefined.
  if (p0.items.ship > 90) throw new Error('unported: varz.c:341 extraShips');
  if (p1.items.ship > 90) throw new Error('unported: varz.c:354 extraShips');

  g.varz.shipGrPtr = ships[p0.items.ship]!.shipgraphic > 500 ? sh.spriteSheetT2000 : sh.spriteSheet9;
  g.varz.shipGr2ptr = sh.spriteSheet9;

  g.config.powerAdd = powerSys[p0.items.generator]!.power;
  g.varz.shipGr = u16(ships[p0.items.ship]!.shipgraphic - (g.varz.shipGrPtr === sh.spriteSheetT2000 ? 500 : 0));
  p0.armor = ships[p0.items.ship]!.dmg;

  g.varz.shipGr2 = 0;
  p1.armor = 10;

  for (let i = 0; i < 2; i++) {
    const p = g.players[i]!;
    p.initialArmor = p.armor;
    const temp = ships[p.items.ship]!.ani; // local `uint temp` (extraShip cases throw above)
    if (temp === 0) {
      p.shotHitAreaX = 12;
      p.shotHitAreaY = 10;
    } else {
      p.shotHitAreaX = 11;
      p.shotHitAreaY = 14;
    }
  }
}

// port of JE_portConfigs (varz.c:1107); also writes the global tempW
export function portConfigs(ctx: Ctx): number {
  const g = ctx.game;
  const player = g.players[g.config.twoPlayerMode ? 1 : 0]!;
  g.scratch.tempW = u16(g.items.weaponPort[player.items.weapon[1].id]!.opnum); // REAR_WEAPON = 1
  return g.scratch.tempW;
}

// port of player_shot_set_direction (shots.c)
export function playerShotSetDirection(ctx: Ctx, shotId: number, weaponId: number, direction: number): void {
  const shot = ctx.game.playerShots.playerShotData[shotId]!;
  direction = f32(direction);

  shot.shotXM = s16(-roundf32(f32(sinf(direction) * shot.shotYM)));
  shot.shotYM = s16(-roundf32(f32(cosf(direction) * shot.shotYM)));

  // Some weapons have sprites for each direction, use those.
  const dir16 = (): number => roundf32(direction * (16 / (2 * Math.PI)));
  switch (weaponId) {
    case 27: case 32: case 10:
      shot.shotGr = linkMultiGr[dir16()]!;
      break;
    case 28: case 33: case 11:
      shot.shotGr = linkSonicGr[dir16()]!;
      break;
    case 30: case 35: case 14:
      if (direction > Math.PI / 2 && direction < Math.PI + Math.PI / 2) shot.shotYC = 1;
      break;
    case 38: case 22:
      shot.shotGr = linkMult2Gr[dir16()]!;
      break;
  }
}

/**
 * The C out-params of player_shot_move_and_draw. They live in the caller's locals in C, so values from a previous
 * call persist when a call leaves them unset (the z == MAX_PWEAPON-1 slot, or a shot that left the screen).
 */
export class ShotOut {
  isSpecial = false;
  shotX = 0; shotY = 0;
  shotDamage = 0;       // JE_integer
  blastFilter = 0;      // JE_byte
  chain = 0;            // JE_byte
  playerNum = 1;        // JE_byte (survey 5.13: initialise to 1)
  specialRadiusW = 0; specialRadiusH = 0; // JE_word
}

// port of player_shot_move_and_draw (shots.c). Returns false if the shot went off-screen.
export function playerShotMoveAndDraw(ctx: Ctx, shotId: number, out: ShotOut): boolean {
  const g = ctx.game;
  const ps = g.playerShots;
  const shot = ps.playerShotData[shotId]!;
  const screen = ctx.vga.cur; // VGAScreen is game_screen while the level runs

  ps.shotAvail[shotId] = ps.shotAvail[shotId]! - 1;
  if (shotId !== MAX_PWEAPON - 1) {
    const pl = g.players[shot.playerNumber - 1]!; // playerNumber 0 reads player[-1] in C; unreachable for created shots
    shot.shotXM = s16(shot.shotXM + shot.shotXC);
    shot.shotX = s16(shot.shotX + shot.shotXM);
    const tmpShotXM = shot.shotXM;

    if (shot.shotXM > 100) {
      if (shot.shotXM === 101) {
        shot.shotX = s16(shot.shotX - 101);
        shot.shotX = s16(shot.shotX + pl.deltaXShotMove);
        shot.shotY = s16(shot.shotY + pl.deltaYShotMove);
      } else {
        shot.shotX = s16(shot.shotX - 120);
        shot.shotX = s16(shot.shotX + pl.deltaXShotMove);
      }
    }

    shot.shotYM = s16(shot.shotYM + shot.shotYC);
    shot.shotY = s16(shot.shotY + shot.shotYM);

    if (shot.shotYM > 100) {
      shot.shotY = s16(shot.shotY - 120);
      shot.shotY = s16(shot.shotY + pl.deltaYShotMove);
    }

    if (shot.shotComplicated) {
      shot.shotDevX = s16(shot.shotDevX + shot.shotDirX);
      shot.shotX = s16(shot.shotX + shot.shotDevX);
      if (Math.abs(shot.shotDevX) === shot.shotCirSizeX) shot.shotDirX = s16(-shot.shotDirX);

      shot.shotDevY = s16(shot.shotDevY + shot.shotDirY);
      shot.shotY = s16(shot.shotY + shot.shotDevY);
      if (Math.abs(shot.shotDevY) === shot.shotCirSizeY) shot.shotDirY = s16(-shot.shotDirY);
    }

    out.shotX = shot.shotX;
    out.shotY = shot.shotY;

    if (shot.shotX < -34 || shot.shotX > 290 || shot.shotY < -15 || shot.shotY > 190) {
      ps.shotAvail[shotId] = 0;
      return false;
    }

    if (shot.shotTrail !== 255) {
      if (shot.shotTrail === 98 || shot.shotTrail === 198) {
        setupExplosion(ctx, shot.shotX - shot.shotXM, shot.shotY - shot.shotYM, 0, shot.shotTrail, false, false);
      } else {
        setupExplosion(ctx, shot.shotX, shot.shotY, 0, shot.shotTrail, false, false);
      }
    }

    if (shot.aimAtEnemy !== 0) {
      shot.aimDelay = u8(shot.aimDelay - 1);
      if (shot.aimDelay === 0) {
        shot.aimDelay = shot.aimDelayMax;
        const idx = shot.aimAtEnemy - 1;
        if (g.enemies.enemyAvail[idx] !== 1) {
          const en = g.enemies.enemy[idx]!;
          shot.shotXM = s16(shot.shotX < en.ex ? shot.shotXM + 1 : shot.shotXM - 1);
          shot.shotYM = s16(shot.shotY < en.ey ? shot.shotYM + 1 : shot.shotYM - 1);
        } else {
          shot.shotXM = s16(shot.shotXM > 0 ? shot.shotXM + 1 : shot.shotXM - 1);
        }
      }
    }

    let spriteFrame = u16(shot.shotGr + shot.shotAni);
    shot.shotAni = u16(shot.shotAni + 1);
    if (shot.shotAni === shot.shotAniMax) shot.shotAni = 0;

    out.shotDamage = shot.shotDmg; // JE_integer <- Uint8
    out.blastFilter = shot.shotBlastFilter;
    out.chain = shot.chainReaction;
    out.playerNum = shot.playerNumber;

    out.isSpecial = spriteFrame > 60000;

    if (out.isSpecial) {
      const table = ctx.assets.shapes.tables[OPTION_SHAPES]!;
      const spr = table.sprites[spriteFrame - 60001]!;
      blitSpriteBlend(screen, out.shotX + 1, out.shotY, table, spriteFrame - 60001);
      out.specialRadiusW = u16(spr.width >> 1);
      out.specialRadiusH = u16(spr.height >> 1);
    } else {
      if (spriteFrame > 1000) {
        doSP(ctx, out.shotX + 1 + 6, out.shotY + 6, 5, 3, ((spriteFrame / 1000) | 0) << 4);
        spriteFrame = spriteFrame % 1000;
      }
      const sh = spriteFrame > 500 ? ctx.assets.shapes.spriteSheet12 : ctx.assets.shapes.spriteSheet8;
      const idx = spriteFrame > 500 ? spriteFrame - 500 : spriteFrame;
      // shadowYDist is a C `uint`, so `shoty + shadowYDist < 190` is an unsigned compare: shoty < -10 fails
      if (g.config.background2 && ((out.shotY + g.varz.shadowYDist) >>> 0) < 190 && tmpShotXM < 100) {
        blitSprite2Darken(screen, out.shotX + 1, out.shotY + g.varz.shadowYDist, sh, idx);
      }
      blitSprite2(screen, out.shotX + 1, out.shotY, sh, idx);
    }
  }

  return true;
}

const soundChannel = [0, 2, 4, 4, 2, 2, 5, 5, 1, 4, 1];

// port of player_shot_create (shots.c). Returns MAX_PWEAPON on failure, else the last slot written.
export function playerShotCreate(
  ctx: Ctx, portNum: number, bayI: number, px: number, py: number, mouseX: number, mouseY: number,
  wpNum: number, playerNum: number,
): number {
  const g = ctx.game;
  const c = g.config;
  const ps = g.playerShots;
  px = u16(px); py = u16(py); mouseX = u16(mouseX); mouseY = u16(mouseY);
  wpNum = u16(wpNum); portNum = u16(portNum); playerNum = u8(playerNum);

  // Bounds check
  if (portNum > PORT_NUM || wpNum <= 0 || wpNum > WEAP_NUM) return MAX_PWEAPON;

  const weapon = g.items.weapons[wpNum]!;

  const poweruse = g.items.weaponPort[portNum]!.poweruse;
  if (c.power < poweruse) return MAX_PWEAPON;
  c.power = (c.power - poweruse) >>> 0;

  if (weapon.sound > 0) g.varz.soundQueue[soundChannel[bayI]!] = weapon.sound;

  let shotId = MAX_PWEAPON;
  /*Rot*/
  for (let multiI = 1; multiI <= weapon.multi; multiI++) {
    for (shotId = 0; shotId < MAX_PWEAPON; shotId++) {
      if (ps.shotAvail[shotId] === 0) break;
    }
    if (shotId === MAX_PWEAPON) return MAX_PWEAPON;

    if (c.shotMultiPos[bayI] === weapon.max || c.shotMultiPos[bayI]! > 8) c.shotMultiPos[bayI] = 1;
    else c.shotMultiPos[bayI] = c.shotMultiPos[bayI]! + 1;
    const mp = c.shotMultiPos[bayI]! - 1;

    const shot = ps.playerShotData[shotId]!;
    shot.chainReaction = 0;
    shot.playerNumber = playerNum;
    shot.shotAni = 0;
    shot.shotComplicated = weapon.circlesize !== 0;

    if (weapon.circlesize === 0) {
      shot.shotDevX = 0; shot.shotDirX = 0; shot.shotDevY = 0; shot.shotDirY = 0;
      shot.shotCirSizeX = 0; shot.shotCirSizeY = 0;
    } else {
      let circsize = weapon.circlesize;
      if (circsize > 19) {
        const mod20 = circsize % 20;
        shot.shotCirSizeX = mod20;
        shot.shotDevX = mod20 >> 1;
        circsize = (circsize / 20) | 0;
        shot.shotCirSizeY = circsize;
        shot.shotDevY = circsize >> 1;
      } else {
        shot.shotCirSizeX = circsize;
        shot.shotCirSizeY = circsize;
        shot.shotDevX = circsize >> 1;
        shot.shotDevY = circsize >> 1;
      }
      shot.shotDirX = 1;
      shot.shotDirY = -1;
    }

    shot.shotTrail = weapon.trail;

    // Tyrian 2000: trail 198 results in only the Flying Punch's center tile having a trail.
    if (shot.shotTrail === 198 && c.shotMultiPos[bayI]! > 1) shot.shotTrail = 255;

    const attack = weapon.attack[mp]!;
    if (attack > 99 && attack < 250) {
      shot.chainReaction = attack - 100;
      shot.shotDmg = 1;
    } else {
      shot.shotDmg = attack;
    }

    shot.shotBlastFilter = weapon.shipblastfilter;

    let tmpBy = s16(weapon.by[mp]!);

    /*Note: Only front selection used for player shots...*/
    shot.shotX = s16(px + weapon.bx[mp]!);
    shot.shotY = s16(py + tmpBy);
    shot.shotYC = s16(-weapon.acceleration);
    shot.shotXC = s16(weapon.accelerationx);

    shot.shotXM = s16(weapon.sx[mp]!);

    let del = weapon.del[mp]!;
    if (del === 121) {
      shot.shotTrail = 0;
      del = 255;
    }

    shot.shotGr = weapon.sg[mp]!;
    if (shot.shotGr === 0) ps.shotAvail[shotId] = 0;
    else ps.shotAvail[shotId] = del;

    if (del > 100 && del < 120) shot.shotAniMax = del - 100 + 1;
    else shot.shotAniMax = u16(weapon.weapani + 1);

    const pl = g.players[shot.playerNumber - 1]!;

    if (del === 99 || del === 98) {
      tmpBy = s16(px - mouseX);
      if (tmpBy < -5) tmpBy = -5;
      else if (tmpBy > 5) tmpBy = 5;
      shot.shotXM = s16(shot.shotXM + tmpBy);
    }

    if (del === 99 || del === 100) {
      tmpBy = s16(py - mouseY - weapon.sy[mp]!);
      if (tmpBy < -4) tmpBy = -4;
      else if (tmpBy > 4) tmpBy = 4;
      shot.shotYM = tmpBy;
    } else if (weapon.sy[mp] === 98) {
      shot.shotYM = 0;
      shot.shotYC = -1;
    } else if (weapon.sy[mp]! > 100) {
      shot.shotYM = s16(weapon.sy[mp]!);
      shot.shotY = s16(shot.shotY - pl.deltaYShotMove);
    } else {
      shot.shotYM = s16(-weapon.sy[mp]!);
    }

    if (weapon.sx[mp]! > 100) {
      shot.shotXM = s16(weapon.sx[mp]!);
      shot.shotX = s16(shot.shotX - pl.deltaXShotMove);
      if (shot.shotXM === 101) shot.shotY = s16(shot.shotY - pl.deltaYShotMove);
    }

    if (weapon.aim > 5) { /*Guided Shot*/
      let bestDist = 65000;
      let closestEnemy = 0;
      /*Find Closest Enemy*/
      for (g.scratch.x = 0; g.scratch.x < 100; g.scratch.x++) {
        const xi = g.scratch.x;
        if (g.enemies.enemyAvail[xi] !== 1 && !g.enemies.enemy[xi]!.scoreitem) {
          g.scratch.y = u16(Math.abs(g.enemies.enemy[xi]!.ex - shot.shotX) + Math.abs(g.enemies.enemy[xi]!.ey - shot.shotY));
          if (g.scratch.y < bestDist) {
            bestDist = g.scratch.y;
            closestEnemy = xi + 1;
          }
        }
      }
      shot.aimAtEnemy = closestEnemy;
      shot.aimDelay = 5;
      shot.aimDelayMax = u8(weapon.aim - 5);
    } else {
      shot.aimAtEnemy = 0;
    }

    c.shotRepeat[bayI] = weapon.shotrepeat;
  }

  return shotId;
}
