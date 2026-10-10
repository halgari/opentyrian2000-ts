// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (enemies, enemy shots)
import { S_WEAPON_7 } from '../audio/ids';
import { f32, rngMod, roundf32 } from '../core/cmath';
import { idiv, s16, s8, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadCompShapes } from '../data/shapes';
import { blitSprite2, blitSprite2Filter, type Sprite2Sheet } from '../video/sprite2';
import type { Surface } from '../video/surface';
import { playerDamage } from './damage';
import { setupExplosion } from './explosions';
import {
  DIFFICULTY_10, DIFFICULTY_EASY, DIFFICULTY_HARD, DIFFICULTY_IMPOSSIBLE, DIFFICULTY_INSANITY, DIFFICULTY_MANIACAL,
  DIFFICULTY_NORMAL, DIFFICULTY_NORTANEOUS, DIFFICULTY_SUICIDE, DIFFICULTY_WIMP, DIFFICULTY_ZINGLON,
  ENEMY_COUNT, ENEMY_SHOT_MAX, type Enemy, type GameWorld,
} from './world';

// ---------------------------------------------------------------------------------------------
// Enemy sprite sheet slots (sprite.c enemySpriteSheets[4] / enemySpriteSheetIds[4])
// ---------------------------------------------------------------------------------------------

/**
 * `&enemySpriteSheets[i]`. The C stores a pointer to the slot, so an enemy keeps seeing whatever is later loaded into
 * the slot (survey 5.16). The slot object is therefore created once and (re)loaded / freed by mutating `data`.
 */
export function enemySheetSlot(g: GameWorld, i: number): Sprite2Sheet {
  let s = g.sprites.enemySpriteSheets[i];
  if (s === null || s === undefined) {
    s = { data: new Uint8Array(0) };
    g.sprites.enemySpriteSheets[i] = s;
  }
  return s;
}

/**
 * The shape-table loop of event 5 (tyrian2.c:4366-4390). `tables` is newEnemyShapeTables[4] (already clamped to >= 0).
 * Loads `JE_loadCompShapes(&enemySpriteSheets[i], shapeFile[table-1])` or frees the slot.
 */
export function setEnemySpriteSheets(ctx: Ctx, tables: readonly number[]): void {
  const g = ctx.game;
  for (let i = 0; i < 4; i++) {
    const t = u8(tables[i]!);
    if (g.sprites.enemySpriteSheetIds[i] !== t) {
      const slot = enemySheetSlot(g, i);
      if (t > 0) {
        if (t > g.tables.shapeFile.length) throw new Error(`setEnemySpriteSheets: shape table ${t} out of range`);
        slot.data = loadCompShapes(ctx.assets.archive, g.tables.shapeFile[t - 1]!).data;
      } else {
        slot.data = new Uint8Array(0); // free_sprite2s
      }
      g.sprites.enemySpriteSheetIds[i] = t;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// blit_enemy / JE_drawEnemy
// ---------------------------------------------------------------------------------------------

/** `enemy[i].egr[idx]`; idx -1 reads the struct bytes before egr, i.e. `ani` with a zero pad byte (C UB, see survey 5.4). */
function egrAt(e: Enemy, idx: number): number {
  if (idx === -1) return e.ani;
  const v = e.egr[idx];
  if (v === undefined) throw new Error(`enemy egr index ${idx} out of range`);
  return v;
}

// port of blit_enemy (tyrian2.c:157)
function blitEnemy(ctx: Ctx, surface: Surface, e: Enemy, xOffset: number, yOffset: number, spriteOffset: number): void {
  if (e.sprite2s === null) return; // fprintf(stderr, "warning: enemy %d sprite missing\n")
  const x = e.ex + xOffset + ctx.game.backgrounds.tempMapXOfs;
  const y = e.ey + yOffset;
  const index = (egrAt(e, e.enemycycle - 1) + spriteOffset) >>> 0;
  if (e.sprite2s.data.length === 0) throw new Error('blit_enemy: sprite sheet slot has no data (C: NULL deref)');
  if (e.filter !== 0) blitSprite2Filter(surface, x, y, e.sprite2s, index, e.filter);
  else blitSprite2(surface, x, y, e.sprite2s, index);
}

// C: unsigned long % int for the aim vector: roundf((float)a / m * k)
const aimComponent = (a: number, maxMag: number, k: number): number => roundf32(f32(f32(a / maxMag) * k));

// port of JE_drawEnemy (tyrian2.c:175); enemyOffset is 25 (sky), 50 / 100 (ground), 75 (top)
export function drawEnemy(ctx: Ctx, enemyOffset: number): void {
  const g = ctx.game;
  const sc = g.scratch;
  const c = g.config;
  const v = g.varz;
  const en = g.enemies;
  const player0 = g.players[0];
  const weapons = g.items.weapons;
  const screen = ctx.vga.cur; // VGAScreen is game_screen during the level loop
  const tempMapXOfs = g.backgrounds.tempMapXOfs;
  const tempBackMove = v.tempBackMove;

  player0.x -= 25;

  for (let i = enemyOffset - 25; i < enemyOffset; i++) {
    if (en.enemyAvail[i] === 1) continue;
    const e = en.enemy[i]!;

    e.mapoffset = tempMapXOfs;

    if (e.xaccel && (e.xaccel - 89) >>> 0 > ctx.rng.rand() % 11) {
      if (player0.x > e.ex) {
        if (e.exc < e.xaccel - 89) e.exc = s8(e.exc + 1);
      } else {
        if (e.exc >= 0 || -e.exc < e.xaccel - 89) e.exc = s8(e.exc - 1);
      }
    }

    if (e.yaccel && (e.yaccel - 89) >>> 0 > ctx.rng.rand() % 11) {
      if (player0.y > e.ey) {
        if (e.eyc < e.yaccel - 89) e.eyc = s8(e.eyc + 1);
      } else {
        if (e.eyc >= 0 || -e.eyc < e.yaccel - 89) e.eyc = s8(e.eyc - 1);
      }
    }

    let gone = false;
    if (e.ex + tempMapXOfs > -29 && e.ex + tempMapXOfs < 300) {
      if (e.aniactive === 1) {
        e.enemycycle = u8(e.enemycycle + 1);

        if (e.enemycycle === e.animax) e.aniactive = e.aniwhenfire;
        else if (e.enemycycle > e.ani) e.enemycycle = e.animin;
      }

      if (egrAt(e, e.enemycycle - 1) === 999) {
        gone = true; // goto enemy_gone
      } else {
        if (e.size === 1) { // 2x2 enemy
          if (e.ey > -13) {
            blitEnemy(ctx, screen, e, -6, -7, 0);
            blitEnemy(ctx, screen, e, 6, -7, 1);
          }
          if (e.ey > -26 && e.ey < 182) {
            blitEnemy(ctx, screen, e, -6, 7, 19);
            blitEnemy(ctx, screen, e, 6, 7, 20);
          }
        } else {
          if (e.ey > -13) blitEnemy(ctx, screen, e, 0, 0, 0);
        }

        e.filter = 0;
      }
    }

    if (!gone) {
      if (e.excc) {
        e.exccw = s8(e.exccw - 1);
        if (e.exccw <= 0) {
          if (e.exc === e.exrev) {
            e.excc = s8(-e.excc);
            e.exrev = s8(-e.exrev);
            e.exccadd = s16(-e.exccadd);
          } else {
            e.exc = s8(e.exc + e.exccadd);
            e.exccw = s8(e.exccwmax);
            if (e.exc === e.exrev) {
              e.excc = s8(-e.excc);
              e.exrev = s8(-e.exrev);
              e.exccadd = s16(-e.exccadd);
            }
          }
        }
      }

      if (e.eycc) {
        e.eyccw = s8(e.eyccw - 1);
        if (e.eyccw <= 0) {
          if (e.eyc === e.eyrev) {
            e.eycc = s8(-e.eycc);
            e.eyrev = s8(-e.eyrev);
            e.eyccadd = s16(-e.eyccadd);
          } else {
            e.eyc = s8(e.eyc + e.eyccadd);
            e.eyccw = s8(e.eyccwmax);
            if (e.eyc === e.eyrev) {
              e.eycc = s8(-e.eycc);
              e.eyrev = s8(-e.eyrev);
              e.eyccadd = s16(-e.eyccadd);
            }
          }
        }
      }

      e.ey = s16(e.ey + e.fixedmovey);

      e.ex = s16(e.ex + e.exc);
      if (e.ex < -80 || e.ex > 340) {
        gone = true;
      } else {
        e.ey = s16(e.ey + e.eyc);
        if (e.ey < -112 || e.ey > 190) gone = true;
      }
    }

    if (gone) {
      // enemy_gone
      en.enemyAvail[i] = 1;
      continue; // draw_enemy_end
    }

    // enemy_still_exists:
    /*X bounce*/
    if (e.ex <= e.xminbounce || e.ex >= e.xmaxbounce) e.exc = s8(-e.exc);

    /*Y bounce*/
    if (e.ey <= e.yminbounce || e.ey >= e.ymaxbounce) e.eyc = s8(-e.eyc);

    /* Evalue != 0 - score item at boundary */
    if (e.scoreitem) {
      if (e.ex < -5) e.ex = s16(e.ex + 1);
      if (e.ex > 245) e.ex = s16(e.ex - 1);
    }

    e.ey = s16(e.ey + tempBackMove);

    if (e.ex <= -24 || e.ex >= 296) continue;

    const tempX = e.ex;
    const tempY = e.ey;

    sc.temp = u8(e.enemytype);

    /* Enemy Shots */
    if (e.edamaged === true) continue;

    en.enemyOnScreen = u16(en.enemyOnScreen + 1);

    if (e.iced) {
      e.iced = u8(e.iced - 1);
      if (e.enemyground !== false) e.filter = 0x09;
      continue;
    }

    let skipLaunch = false;
    for (let j = 3; j > 0; j--) {
      if (!e.freq[j - 1]) continue;
      sc.temp3 = e.tur[j - 1]!;

      e.eshotwait[j - 1] = u8(e.eshotwait[j - 1]! - 1);
      if (e.eshotwait[j - 1] === 0 && sc.temp3) {
        e.eshotwait[j - 1] = e.freq[j - 1]!;
        if (c.difficultyLevel > DIFFICULTY_NORMAL) {
          e.eshotwait[j - 1] = u8(idiv(e.eshotwait[j - 1]!, 2) + 1);
          if (c.difficultyLevel > DIFFICULTY_MANIACAL) e.eshotwait[j - 1] = u8(idiv(e.eshotwait[j - 1]!, 2) + 1);
        }

        // tyrian2.c:376 (`||` short-circuit: the rand draw happens only when eyc != 0)
        if (c.galagaMode && (e.eyc === 0 || (ctx.rng.rand() % 400) >= g.varz.galagaShotFreq)) { skipLaunch = true; break; } // goto draw_enemy_end

        switch (sc.temp3) {
          case 252: /* Savara Boss DualMissile */
            if (e.ey > 20) {
              setupExplosion(ctx, tempX - 8 + tempMapXOfs, tempY - 20 - g.backgrounds.backMove * 8, -2, 6, false, false);
              setupExplosion(ctx, tempX + 4 + tempMapXOfs, tempY - 20 - g.backgrounds.backMove * 8, -2, 6, false, false);
            }
            break;
          case 251: { /* Suck-O-Magnet */
            const attraction = s16(4 - idiv(Math.abs(player0.x - tempX) + Math.abs(player0.y - tempY), 100));
            if (attraction > 0) player0.xVelocity += (player0.x > tempX) ? -attraction : attraction;
            break;
          }
          case 253: /* Left ShortRange Magnet */
            if (Math.abs(player0.x + 25 - 14 - tempX) < 24 && Math.abs(player0.y - tempY) < 28) player0.xVelocity += 2;
            if (c.twoPlayerMode && (Math.abs(g.players[1].x - 14 - tempX) < 24 && Math.abs(g.players[1].y - tempY) < 28))
              g.players[1].xVelocity += 2;
            break;
          case 254: /* Left ShortRange Magnet */
            if (Math.abs(player0.x + 25 - 14 - tempX) < 24 && Math.abs(player0.y - tempY) < 28) player0.xVelocity -= 2;
            if (c.twoPlayerMode && (Math.abs(g.players[1].x - 14 - tempX) < 24 && Math.abs(g.players[1].y - tempY) < 28))
              g.players[1].xVelocity -= 2;
            break;
          case 255: /* Magneto RePulse!! */
            if (c.difficultyLevel !== DIFFICULTY_EASY) {
              if (j === 3) {
                e.filter = 0x70;
              } else {
                const repulsion = s16(4 - idiv(Math.abs(player0.x - tempX) + Math.abs(player0.y - tempY), 20));
                if (repulsion > 0) player0.xVelocity += (player0.x > tempX) ? repulsion : -repulsion;
              }
            }
            break;
          default: {
            /*Rot*/
            const w = weapons[sc.temp3]!;
            for (let tempCount = w.multi; tempCount > 0; tempCount--) {
              for (sc.b = 0; sc.b < ENEMY_SHOT_MAX; sc.b++) {
                if (g.enemyShots.enemyShotAvail[sc.b] === true) break;
              }
              if (sc.b === ENEMY_SHOT_MAX) { skipLaunch = true; break; } // goto draw_enemy_end
              const b = sc.b;

              g.enemyShots.enemyShotAvail[b] = !g.enemyShots.enemyShotAvail[b];

              if (w.sound > 0) {
                do {
                  sc.temp = ctx.rng.rand() % 8;
                } while (sc.temp === 3);
                v.soundQueue[sc.temp] = w.sound;
              }

              if (e.aniactive === 2) e.aniactive = 1;

              e.eshotmultipos[j - 1] = u8(e.eshotmultipos[j - 1]! + 1);
              if (e.eshotmultipos[j - 1]! > w.max) e.eshotmultipos[j - 1] = 1;

              const tempPos = e.eshotmultipos[j - 1]! - 1;

              if (j === 1) sc.temp2 = 4;

              const s = g.enemyShots.enemyShot[b]!;
              s.sx = s16(tempX + w.bx[tempPos]! + tempMapXOfs);
              s.sy = s16(tempY + w.by[tempPos]!);
              s.sdmg = u8(w.attack[tempPos]!);
              s.tx = u8(w.tx);
              s.ty = u8(w.ty);
              s.duration = u8(w.del[tempPos]!);
              s.animate = 0;
              s.animax = u16(w.weapani);

              s.sgr = u16(w.sg[tempPos]!);
              switch (j) {
                case 1:
                  s.syc = s8(w.acceleration);
                  s.sxc = s8(w.accelerationx);

                  s.sxm = s16(w.sx[tempPos]!);
                  s.sym = s16(w.sy[tempPos]!);
                  break;
                case 3:
                  s.sxc = s8(-w.acceleration);
                  s.syc = s8(w.accelerationx);

                  s.sxm = s16(-w.sy[tempPos]!);
                  s.sym = s16(-w.sx[tempPos]!);
                  break;
                case 2:
                  s.sxc = s8(w.acceleration);
                  s.syc = s8(-w.acceleration);

                  s.sxm = s16(w.sy[tempPos]!);
                  s.sym = s16(-w.sx[tempPos]!);
                  break;
              }

              if (w.aim > 0) {
                let aim = u8(w.aim);

                /*DIF*/
                if (c.difficultyLevel > DIFFICULTY_NORMAL) aim = u8(aim + c.difficultyLevel - 2);

                let targetX = u16(player0.x);
                let targetY = u16(player0.y);

                if (c.twoPlayerMode) {
                  const p1 = g.players[1];
                  // fire at live player(s)
                  if (player0.isAlive && !p1.isAlive) sc.temp = 0;
                  else if (p1.isAlive && !player0.isAlive) sc.temp = 1;
                  else sc.temp = ctx.rng.rand() % 2;

                  if (sc.temp === 1) {
                    targetX = u16(p1.x - 25);
                    targetY = u16(p1.y);
                  }
                }

                let aimX = s16((targetX + 25) - tempX - tempMapXOfs - 4);
                if (aimX === 0) aimX = 1;
                let aimY = s16(targetY - tempY);
                if (aimY === 0) aimY = 1;
                const maxMagAim = Math.max(Math.abs(aimX), Math.abs(aimY));
                s.sxm = s16(aimComponent(aimX, maxMagAim, aim));
                s.sym = s16(aimComponent(aimY, maxMagAim, aim));
              }
            }
            break;
          }
        }
        if (skipLaunch) break; // goto draw_enemy_end out of the j loop
      }
    }
    if (skipLaunch) continue;

    /* Enemy Launch Routine */
    if (e.launchfreq) {
      e.launchwait = u8(e.launchwait - 1);
      if (e.launchwait === 0) {
        e.launchwait = e.launchfreq;

        if (e.launchspecial !== 0) {
          /*Type  1 : Must be inline with player*/
          if (Math.abs(e.ey - player0.y) > 5) continue;
        }

        if (e.aniactive === 2) e.aniactive = 1;

        if (e.launchtype === 0) continue;

        sc.tempW = e.launchtype;
        sc.b = s16(newEnemy(ctx, enemyOffset === 50 ? 75 : enemyOffset - 25, sc.tempW, 0));

        /*Launch Enemy Placement*/
        if (sc.b > 0) {
          const ne = en.enemy[sc.b - 1]!;

          ne.ex = tempX;
          ne.ey = s16(tempY + g.items.enemyDat[ne.enemytype]!.startyc);
          if (ne.size === 0) ne.ey = s16(ne.ey - 7);

          if (ne.launchtype > 0 && ne.launchfreq === 0) {
            if (ne.launchtype > 90) {
              ne.ex = s16(ne.ex + (ctx.rng.rand() % ((ne.launchtype - 90) * 4)) - (ne.launchtype - 90) * 2);
            } else {
              let aimX = s16((player0.x + 25) - tempX - tempMapXOfs - 4);
              if (aimX === 0) aimX = 1;
              let aimY = s16(player0.y - tempY);
              if (aimY === 0) aimY = 1;
              const maxMagAim = Math.max(Math.abs(aimX), Math.abs(aimY));
              ne.exc = s8(aimComponent(aimX, maxMagAim, ne.launchtype));
              ne.eyc = s8(aimComponent(aimY, maxMagAim, ne.launchtype));
            }
          }

          do {
            sc.temp = ctx.rng.rand() % 8;
          } while (sc.temp === 3);
          v.soundQueue[sc.temp] = g.tables.randomEnemyLaunchSounds[ctx.rng.rand() % 3]!;

          if (e.launchspecial === 1 && e.linknum < 100) ne.linknum = e.linknum;
        }
      }
    }
  }

  player0.x += 25;
}

// ---------------------------------------------------------------------------------------------
// JE_newEnemy / JE_makeEnemy / JE_createNewEventEnemy
// ---------------------------------------------------------------------------------------------

// port of JE_newEnemy (tyrian2.c:3885): returns the 1-based enemy index or 0
export function newEnemy(ctx: Ctx, enemyOffset: number, eDatI: number, uniqueShapeTableI: number): number {
  const en = ctx.game.enemies;
  for (let i = enemyOffset; i < enemyOffset + 25; ++i) {
    if (en.enemyAvail[i] === 1) {
      en.enemyAvail[i] = makeEnemy(ctx, en.enemy[i]!, eDatI, uniqueShapeTableI);
      return i + 1;
    }
  }
  return 0;
}

// port of JE_makeEnemy (tyrian2.c:3898); returns what enemyAvail must be set to
export function makeEnemy(ctx: Ctx, enemy: Enemy, eDatI: number, uniqueShapeTableI: number): number {
  const g = ctx.game;
  const items = g.items;
  eDatI = u16(eDatI);
  uniqueShapeTableI = s16(uniqueShapeTableI);

  if (g.config.superArcadeMode !== 0 && eDatI === 534) eDatI = 533;

  const dat = items.enemyDat[eDatI];
  if (dat === undefined) throw new Error(`makeEnemy: enemyDat[${eDatI}] out of range`);

  const shapeTableI = uniqueShapeTableI > 0 ? u8(uniqueShapeTableI) : u8(dat.shapebank);

  let sprite2s: Sprite2Sheet | null = null;
  if (shapeTableI === 21) {
    sprite2s = ctx.assets.shapes.spriteSheet11; // Coins&Gems
  } else if (shapeTableI === 26) {
    sprite2s = ctx.assets.shapes.spriteSheet10; // Two-Player Stuff
  } else {
    for (let i = 0; i < 4; ++i) {
      if (shapeTableI === g.sprites.enemySpriteSheetIds[i]) sprite2s = enemySheetSlot(g, i);
    }
  }

  if (sprite2s !== null) enemy.sprite2s = sprite2s;
  // else: keep the sprite sheet of the previous enemy that occupied the slot (warning: ignoring sprite from unloaded shape table)

  enemy.enemydatofs = eDatI;

  enemy.mapoffset = 0;

  for (let i = 0; i < 3; ++i) enemy.eshotmultipos[i] = 0;

  enemy.enemyground = (dat.explosiontype & 1) === 0;
  enemy.explonum = u8(dat.explosiontype >> 1);

  enemy.launchfreq = u8(dat.elaunchfreq);
  enemy.launchwait = u8(dat.elaunchfreq);

  // T2000 ... Account for the second enemy bank only if we're creating something from it
  if (eDatI > 1000) {
    enemy.launchtype = u16(dat.elaunchtype);
    enemy.launchspecial = 0;
  } else {
    enemy.launchtype = u16(dat.elaunchtype % 1000);
    enemy.launchspecial = u8(idiv(dat.elaunchtype, 1000));
  }

  enemy.xaccel = u8(dat.xaccel);
  enemy.yaccel = u8(dat.yaccel);

  enemy.xminbounce = -10000;
  enemy.xmaxbounce = 10000;
  enemy.yminbounce = -10000;
  enemy.ymaxbounce = 10000;
  /*Far enough away to be impossible to reach*/

  for (let i = 0; i < 3; ++i) enemy.tur[i] = dat.tur[i]!;

  enemy.ani = u8(dat.ani);
  enemy.animin = 1;

  switch (dat.animate) {
    case 0:
      enemy.enemycycle = 1;
      enemy.aniactive = 0;
      enemy.animax = 0;
      enemy.aniwhenfire = 0;
      break;
    case 1:
      enemy.enemycycle = 0;
      enemy.aniactive = 1;
      enemy.animax = 0;
      enemy.aniwhenfire = 0;
      break;
    case 2:
      enemy.enemycycle = 1;
      enemy.aniactive = 2;
      enemy.animax = enemy.ani;
      enemy.aniwhenfire = 2;
      break;
  }

  // mt_rand() is a 64-bit unsigned long: a negative startxc/startyc*2 converts to a huge divisor (rngMod)
  if (dat.startxc !== 0)
    enemy.ex = s16(dat.startx + rngMod(ctx.rng.rand(), dat.startxc * 2) - dat.startxc + 1);
  else
    enemy.ex = s16(dat.startx + 1);

  if (dat.startyc !== 0)
    enemy.ey = s16(dat.starty + rngMod(ctx.rng.rand(), dat.startyc * 2) - dat.startyc + 1);
  else
    enemy.ey = s16(dat.starty + 1);

  enemy.exc = s8(dat.xmove);
  enemy.eyc = s8(dat.ymove);
  enemy.excc = s8(dat.xcaccel);
  enemy.eycc = s8(dat.ycaccel);
  enemy.exccw = s8(Math.abs(enemy.excc));
  enemy.exccwmax = u8(enemy.exccw);
  enemy.eyccw = s8(Math.abs(enemy.eycc));
  enemy.eyccwmax = u8(enemy.eyccw);
  enemy.exccadd = (enemy.excc > 0) ? 1 : -1;
  enemy.eyccadd = (enemy.eycc > 0) ? 1 : -1;
  enemy.special = false;
  enemy.iced = 0;

  if (dat.xrev === 0) enemy.exrev = 100;
  else if (dat.xrev === -99) enemy.exrev = 0;
  else enemy.exrev = s8(dat.xrev);

  if (dat.yrev === 0) enemy.eyrev = 100;
  else if (dat.yrev === -99) enemy.eyrev = 0;
  else enemy.eyrev = s8(dat.yrev);

  enemy.exca = (enemy.xaccel > 0) ? 1 : -1;
  enemy.eyca = (enemy.yaccel > 0) ? 1 : -1;

  enemy.enemytype = eDatI;

  for (let i = 0; i < 3; ++i) {
    if (enemy.tur[i] === 252) enemy.eshotwait[i] = 1;
    else if (enemy.tur[i]! > 0) enemy.eshotwait[i] = 20;
    else enemy.eshotwait[i] = 255;
  }
  for (let i = 0; i < 20; ++i) enemy.egr[i] = dat.egraphic[i]!;
  enemy.size = u8(dat.esize);
  enemy.linknum = 0;
  enemy.edamaged = dat.dani < 0;
  enemy.enemydie = u16(dat.eenemydie);

  enemy.freq[0] = dat.freq[0]!;
  enemy.freq[1] = dat.freq[1]!;
  enemy.freq[2] = dat.freq[2]!;

  enemy.edani = s8(dat.dani);
  enemy.edgr = u16(dat.dgr);
  enemy.edlevel = s8(dat.dlevel);

  enemy.fixedmovey = 0;

  enemy.filter = 0x00;

  const dl = g.config.difficultyLevel;
  let tempValue = 0;
  if (dat.value > 1 && dat.value < 10000) {
    switch (dl) {
      case -1:
      case DIFFICULTY_WIMP:
        tempValue = Math.trunc(f32(dat.value * 0.75));
        break;
      case DIFFICULTY_EASY:
      case DIFFICULTY_NORMAL:
        tempValue = dat.value;
        break;
      case DIFFICULTY_HARD:
        tempValue = Math.trunc(f32(dat.value * 1.125));
        break;
      case DIFFICULTY_IMPOSSIBLE:
        tempValue = Math.trunc(f32(dat.value * 1.5));
        break;
      case DIFFICULTY_INSANITY:
        tempValue = dat.value * 2;
        break;
      case DIFFICULTY_SUICIDE:
        tempValue = Math.trunc(f32(dat.value * 2.5));
        break;
      case DIFFICULTY_MANIACAL:
      case DIFFICULTY_ZINGLON:
        tempValue = dat.value * 4;
        break;
      case DIFFICULTY_NORTANEOUS:
      case DIFFICULTY_10:
        tempValue = dat.value * 8;
        break;
    }
    if (tempValue > 10000) tempValue = 10000;
    enemy.evalue = s16(tempValue);
  } else {
    enemy.evalue = s16(dat.value);
  }

  let avail: number;
  let tempArmor = 1;
  if (dat.armor > 0) {
    if (dat.armor !== 255) {
      const a = dat.armor;
      switch (dl) {
        case -1:
        case DIFFICULTY_WIMP:
          tempArmor = Math.trunc(f32(f32(a * 0.5) + 1));
          break;
        case DIFFICULTY_EASY:
          tempArmor = Math.trunc(f32(f32(a * 0.75) + 1));
          break;
        case DIFFICULTY_NORMAL:
          tempArmor = a;
          break;
        case DIFFICULTY_HARD:
          tempArmor = Math.trunc(f32(a * f32(1.2)));
          break;
        case DIFFICULTY_IMPOSSIBLE:
          tempArmor = Math.trunc(f32(a * 1.5));
          break;
        case DIFFICULTY_INSANITY:
          tempArmor = Math.trunc(f32(a * f32(1.8)));
          break;
        case DIFFICULTY_SUICIDE:
          tempArmor = a * 2;
          break;
        case DIFFICULTY_MANIACAL:
          tempArmor = a * 3;
          break;
        case DIFFICULTY_ZINGLON:
          tempArmor = a * 4;
          break;
        case DIFFICULTY_NORTANEOUS:
        case DIFFICULTY_10:
          tempArmor = a * 8;
          break;
      }

      if (tempArmor > 254) tempArmor = 254;
    } else {
      tempArmor = 255;
    }

    enemy.armorleft = u8(tempArmor);

    avail = 0;
    enemy.scoreitem = false;
  } else {
    avail = 2;
    enemy.armorleft = 255;
    if (enemy.evalue !== 0) enemy.scoreitem = true;
  }

  if (!enemy.scoreitem) g.enemies.totalEnemy = u16(g.enemies.totalEnemy + 1); /*Destruction ratio*/

  /* indicates what to set ENEMYAVAIL to */
  return avail;
}

// port of JE_createNewEventEnemy (tyrian2.c:4191)
export function createNewEventEnemy(ctx: Ctx, enemyTypeOfs: number, enemyOffset: number, uniqueShapeTableI: number): void {
  const g = ctx.game;
  const sc = g.scratch;
  const en = g.enemies;
  const bg = g.backgrounds;
  const rec = g.events.eventRec[g.events.eventLoc - 1]!;
  enemyTypeOfs = u8(enemyTypeOfs);
  enemyOffset = u16(enemyOffset);

  sc.b = 0;

  for (let i = enemyOffset; i < enemyOffset + 25; i++) {
    if (en.enemyAvail[i] === 1) {
      sc.b = s16(i + 1);
      break;
    }
  }

  if (sc.b === 0) return;

  sc.tempW = u16(rec.eventdat + enemyTypeOfs);

  en.enemyAvail[sc.b - 1] = makeEnemy(ctx, en.enemy[sc.b - 1]!, sc.tempW, uniqueShapeTableI);
  const e = en.enemy[sc.b - 1]!;

  // When T2000 gives an X position of -200, what it actually wants is a random X position...
  if (rec.eventdat2 === -200) {
    // Ranged 24 - 231
    rec.eventdat2 = s16((ctx.rng.rand() % 208) + 24);
  }

  if (rec.eventdat2 !== -99) {
    switch (enemyOffset) {
      case 0:
        e.ex = s16(rec.eventdat2 - (bg.mapX - 1) * 24);
        e.ey = s16(e.ey - bg.backMove2);
        break;
      case 25:
      case 75:
        e.ex = s16(rec.eventdat2 - (bg.mapX - 1) * 24 - 12);
        e.ey = s16(e.ey - bg.backMove);
        break;
      case 50:
        if (g.varz.background3x1) e.ex = s16(rec.eventdat2 - (bg.mapX - 1) * 24 - 12);
        else e.ex = s16(rec.eventdat2 - bg.mapX3 * 24 - 24 * 2 + 6);
        e.ey = s16(e.ey - bg.backMove3);

        if (g.varz.background3x1b) e.ex = s16(e.ex - 6);
        break;
    }
    e.ey = -28;
    if (g.varz.background3x1b && enemyOffset === 50) e.ey = s16(e.ey + 4);
  }

  if (g.varz.smallEnemyAdjust && e.size === 0) {
    e.ex = s16(e.ex - 10);
    e.ey = s16(e.ey - 7);
  }

  e.ey = s16(e.ey + rec.eventdat5);
  e.eyc = s8(e.eyc + rec.eventdat3);
  e.linknum = u8(rec.eventdat4);
  e.fixedmovey = s16(rec.eventdat6);
}

// port of JE_eventJump (tyrian2.c:4261)
export function eventJump(ctx: Ctx, jump: number): void {
  const ev = ctx.game.events;
  jump = u16(jump);

  if (jump === 65535) {
    ev.curLoc = ev.returnLoc;
  } else {
    ev.returnLoc = u16(ev.curLoc + 1);
    ev.curLoc = jump;
  }
  let tempW = 0; // local JE_word (shadows the global)
  do {
    tempW = u16(tempW + 1);
    if (tempW > ev.eventRec.length) throw new Error('eventJump: ran off the end of eventRec (missing sentinel)');
  } while (!(ev.eventRec[tempW - 1]!.eventtime >= ev.curLoc));
  ev.eventLoc = u16(tempW - 1);
}

/** port of JE_searchFor (tyrian2.c:4282): returns the (last matching) enemy index, or -1 when none is found */
export function searchFor(ctx: Ctx, plType: number): number {
  const g = ctx.game;
  let foundId = -1;

  for (let i = 0; i < ENEMY_COUNT; i++) {
    if (g.enemies.enemyAvail[i] === 0 && g.enemies.enemy[i]!.linknum === plType) {
      foundId = i;
      if (g.config.galagaMode) {
        const e = g.enemies.enemy[i]!;
        e.evalue = s16(e.evalue + e.evalue);
      }
    }
  }

  return foundId;
}

// ---------------------------------------------------------------------------------------------
// JE_main passes
// ---------------------------------------------------------------------------------------------

/** the "New Enemy" block of JE_main (tyrian2.c:1393-1398); draws from the RNG every frame while enemiesActive */
export function randomEnemySpawn(ctx: Ctx): void {
  const g = ctx.game;
  const sc = g.scratch;
  const ev = g.events;
  if (g.varz.enemiesActive && ctx.rng.rand() % 100 > ev.levelEnemyFrequency) {
    const idx = rngMod(ctx.rng.rand(), ev.levelEnemyMax);
    const t = ev.levelEnemy[idx];
    if (t === undefined) throw new Error(`randomEnemySpawn: levelEnemy[${idx}] out of range (C reads neighbouring memory)`);
    sc.tempW = t;
    if (sc.tempW === 2) g.varz.soundQueue[3] = S_WEAPON_7;
    sc.b = s16(newEnemy(ctx, 0, sc.tempW, 0));
  }
}

/** the "Draw Enemy Shots" pass of JE_main (tyrian2.c:1778-1860); the caller applies the `if (!endLevel)` guard */
export function updateEnemyShots(ctx: Ctx): void {
  const g = ctx.game;
  const sc = g.scratch;
  const shots = g.enemyShots;
  const player0 = g.players[0];
  const screen = ctx.vga.cur;
  const sh = ctx.assets.shapes;

  /* Draw Enemy Shots */
  for (let z = 0; z < ENEMY_SHOT_MAX; z++) {
    if (shots.enemyShotAvail[z] !== false) continue;
    const s = shots.enemyShot[z]!;

    s.sxm = s16(s.sxm + s.sxc);
    s.sx = s16(s.sx + s.sxm);

    if (s.tx !== 0) {
      if (s.sx > player0.x) {
        if (s.sxm > -s.tx) s.sxm = s16(s.sxm - 1);
      } else {
        if (s.sxm < s.tx) s.sxm = s16(s.sxm + 1);
      }
    }

    s.sym = s16(s.sym + s.syc);
    s.sy = s16(s.sy + s.sym);

    if (s.ty !== 0) {
      if (s.sy > player0.y) {
        if (s.sym > -s.ty) s.sym = s16(s.sym - 1);
      } else {
        if (s.sym < s.ty) s.sym = s16(s.sym + 1);
      }
    }

    const oldDuration = s.duration;
    s.duration = u8(s.duration - 1);
    if (oldDuration === 0 || s.sy > 190 || s.sy <= -14 || s.sx > 275 || s.sx <= 0) {
      shots.enemyShotAvail[z] = true;
    } else { // check if shot collided with player
      for (let i = 0; i < (g.config.twoPlayerMode ? 2 : 1); ++i) {
        const p = g.players[i]!;
        if (p.isAlive &&
            s.sx > p.x - p.shotHitAreaX &&
            s.sx < p.x + p.shotHitAreaX &&
            s.sy > p.y - p.shotHitAreaY &&
            s.sy < p.y + p.shotHitAreaY) {
          const tempX = s.sx;
          const tempY = s.sy;
          sc.temp = s.sdmg;

          shots.enemyShotAvail[z] = true;

          setupExplosion(ctx, tempX, tempY, 0, 0, false, false);

          if (p.invulnerableTicks === 0) {
            sc.temp = playerDamage(ctx, sc.temp, p);
            if (sc.temp > 0) {
              p.xVelocity += idiv(s.sxm * sc.temp, 2);
              p.yVelocity += idiv(s.sym * sc.temp, 2);
            }
          }

          break;
        }
      }

      if (shots.enemyShotAvail[z] === false) {
        if (s.animax !== 0) {
          s.animate = u16(s.animate + 1);
          if (s.animate >= s.animax) s.animate = 0;
        }

        if (s.sgr >= 500) blitSprite2(screen, s.sx, s.sy, sh.spriteSheet12, s.sgr + s.animate - 500);
        else blitSprite2(screen, s.sx, s.sy, sh.spriteSheet8, s.sgr + s.animate);
      }
    }
  }
}
