// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (player shots vs enemies)
import { S_ENEMY_HIT, S_EXPLOSION_8, S_EXPLOSION_9 } from '../audio/ids';
import { idiv, s16, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { eventJump, newEnemy } from './enemies';
import { doSP, setupExplosion, setupExplosionLarge } from './explosions';
import { playerCollide } from './player';
import { playerShotCreate, playerShotMoveAndDraw } from './shots';
import { MAX_PWEAPON, SA_NONE, SHOT_MISC } from './world';

const abs = Math.abs;

// port of the "Player Shot Images" pass, last_x/y_shot_move update and JE_playerCollide calls of JE_main (tyrian2.c:1449-1772).
// The C out-params are locals of JE_main's loop body; `chain`, `playerNum`, `tempX2`, `tempY2` and `damage` are
// uninitialised there, so they live in a persistent ShotOut (stale values survive between slots). `temp2` is the
// global scratch, passed as &temp2. The scratch globals temp/temp2/temp3/b are used directly (doSP clobbers temp).
export function playerShotsPass(ctx: Ctx): void {
  const g = ctx.game;
  const sc = g.scratch;
  const ps = g.playerShots;
  const en = g.enemies;
  const v = g.varz;
  const enemy = en.enemy;
  const enemyAvail = en.enemyAvail;
  const out = ps.shotOut;

  for (let z = 0; z < MAX_PWEAPON; z++) {
    if (ps.shotAvail[z] === 0) continue;

    // bool is_special = false; int tempShotX = 0, tempShotY = 0; (initialised each iteration)
    out.isSpecial = false;
    out.shotX = 0;
    out.shotY = 0;
    out.blastFilter = sc.temp2; // &temp2
    const moved = playerShotMoveAndDraw(ctx, z, out);
    sc.temp2 = out.blastFilter;
    if (!moved) continue; // goto draw_player_shot_loop_end

    shotLoop:
    for (sc.b = 0; sc.b < 100; sc.b = u8(sc.b + 1)) {
      if (enemyAvail[sc.b] !== 0) continue;
      const e = enemy[sc.b]!;
      const tempShotX = out.shotX, tempShotY = out.shotY;
      let collided: boolean;

      if (z === MAX_PWEAPON - 1) {
        sc.temp = u8(25 - abs(ps.zinglonDuration - 25));
        collided = abs(e.ex + e.mapoffset - (g.players[0].x + 7)) < sc.temp;
        sc.temp2 = 9;
        out.chain = 0;
        out.shotDamage = 10;
      } else if (out.isSpecial) {
        const w = out.specialRadiusW, h = out.specialRadiusH;
        collided = ((e.enemycycle === 0) &&
                    (abs(e.ex + e.mapoffset - tempShotX - w) < (25 + w)) &&
                    (abs(e.ey - tempShotY - 12 - h) < (29 + h))) ||
                   ((e.enemycycle > 0) &&
                    (abs(e.ex + e.mapoffset - tempShotX - w) < (13 + w)) &&
                    (abs(e.ey - tempShotY - 6 - h) < (15 + h)));
      } else {
        collided = ((e.enemycycle === 0) &&
                    (abs(e.ex + e.mapoffset - tempShotX) < 25) && (abs(e.ey - tempShotY - 12) < 29)) ||
                   ((e.enemycycle > 0) &&
                    (abs(e.ex + e.mapoffset - tempShotX) < 13) && (abs(e.ey - tempShotY - 6) < 15));
      }

      if (!collided) continue;

      if (out.chain > 0) {
        g.config.shotMultiPos[SHOT_MISC] = 0;
        sc.b = u8(playerShotCreate(ctx, 0, SHOT_MISC, tempShotX, tempShotY, v.mouseX, v.mouseY, out.chain, out.playerNum));
        ps.shotAvail[z] = 0;
        break shotLoop;
      }

      ps.infiniteShot = false;

      if (out.shotDamage === 99) {
        out.shotDamage = 0;
        ps.doIced = 40;
        e.iced = 40;
      } else {
        ps.doIced = 0;
        if (out.shotDamage >= 250) {
          out.shotDamage = s16(out.shotDamage - 250);
          ps.infiniteShot = true;
        }
      }

      const armorleft = e.armorleft;

      sc.temp = e.linknum;
      if (sc.temp === 0) sc.temp = 255;

      if (e.armorleft < 255) {
        for (const bar of en.bossBar) if (sc.temp === bar.linkNum) bar.color = 6;

        if (e.enemyground) e.filter = sc.temp2;

        for (let k = 0; k < enemy.length; k++) {
          const o = enemy[k]!;
          if (o.linknum === sc.temp && enemyAvail[k] !== 1 && o.enemyground) {
            if (ps.doIced) o.iced = ps.doIced;
            o.filter = sc.temp2;
          }
        }
      }

      if (armorleft > out.shotDamage) {
        if (z !== MAX_PWEAPON - 1) {
          if (e.armorleft !== 255) {
            e.armorleft = u8(e.armorleft - out.shotDamage);
            setupExplosion(ctx, tempShotX, tempShotY, 0, 0, false, false);
          } else {
            doSP(ctx, tempShotX + 6, tempShotY + 6, idiv(out.shotDamage, 2) + 3, idiv(out.shotDamage, 4) + 2, sc.temp2);
          }
        }

        v.soundQueue[5] = S_ENEMY_HIT;

        if ((armorleft - out.shotDamage <= e.edlevel) && ((!e.edamaged) !== (e.edani < 0))) {
          for (sc.temp3 = 0; sc.temp3 < 100; sc.temp3 = u8(sc.temp3 + 1)) {
            if (enemyAvail[sc.temp3] === 1) continue;
            const t3 = enemy[sc.temp3]!;
            const linknum = t3.linknum;
            if ((sc.temp3 === sc.b) ||
                ((sc.temp !== 255) &&
                 (((t3.edlevel > 0) && (linknum === sc.temp)) ||
                  ((v.enemyContinualDamage && (sc.temp - 100 === linknum)) ||
                   ((linknum > 40) && (idiv(linknum, 20) === idiv(sc.temp, 20)) && (linknum <= sc.temp)))))) {
              t3.enemycycle = 1;
              t3.edamaged = !t3.edamaged;

              if (t3.edani !== 0) {
                t3.ani = u8(abs(t3.edani));
                t3.aniactive = 1;
                t3.animax = 0;
                t3.animin = u8(t3.edgr);
                t3.enemycycle = u8(t3.animin - 1);
              } else if (t3.edgr > 0) {
                t3.egr[0] = t3.edgr;
                t3.ani = 1;
                t3.aniactive = 0;
                t3.animax = 0;
                t3.animin = 1;
              } else {
                enemyAvail[sc.temp3] = 1;
                en.enemyKilled = u16(en.enemyKilled + 1);
              }

              t3.aniwhenfire = 0;

              if (t3.armorleft > u8(t3.edlevel)) t3.armorleft = u8(t3.edlevel);

              const tempX = s16(t3.ex + t3.mapoffset);
              const tempY = s16(t3.ey);

              if (g.items.enemyDat[t3.enemytype]!.esize !== 1) {
                setupExplosion(ctx, tempX, tempY - 6, 0, 1, false, false);
              } else {
                setupExplosionLarge(ctx, t3.enemyground, idiv(t3.explonum, 2), tempX, tempY);
              }
            }
          }
        }
      } else {
        if ((sc.temp === 254) && (en.superEnemy254Jump > 0)) eventJump(ctx, en.superEnemy254Jump);

        for (sc.temp2 = 0; sc.temp2 < 100; sc.temp2 = u8(sc.temp2 + 1)) {
          if (enemyAvail[sc.temp2] === 1) continue;
          const t2 = enemy[sc.temp2]!;
          sc.temp3 = t2.linknum;
          if ((sc.temp2 === sc.b) || (sc.temp === 254) ||
              ((sc.temp !== 255) && ((sc.temp === sc.temp3) || (sc.temp - 100 === sc.temp3) ||
                                    ((sc.temp3 > 40) && (idiv(sc.temp3, 20) === idiv(sc.temp, 20)) && (sc.temp3 <= sc.temp))))) {
            const enemyScreenX = t2.ex + t2.mapoffset;

            if (t2.special) g.varz.globalFlags[t2.flagnum - 1] = t2.setto;

            if ((t2.enemydie > 0) &&
                !((g.config.superArcadeMode !== SA_NONE) && (g.items.enemyDat[t2.enemydie]!.value === 30000))) {
              if (g.config.superArcadeMode !== SA_NONE) throw new Error('unported: tyrian2.c:1629 super arcade');
              const tempB = sc.b;
              sc.tempW = t2.enemydie;
              let enemyOffset = sc.temp2 - (sc.temp2 % 25);
              if (g.items.enemyDat[sc.tempW]!.value > 30000) enemyOffset = 0;
              sc.b = s16(newEnemy(ctx, enemyOffset, sc.tempW, 0));
              if (sc.b !== 0) {
                const nb = enemy[sc.b - 1]!;
                nb.scoreitem = nb.evalue !== 0;
                nb.ex = t2.ex;
                nb.ey = t2.ey;
              }
              sc.b = tempB;
            }

            if (t2.evalue > 0 && t2.evalue < 10000) {
              if (t2.evalue === 1) {
                g.config.cubeMax = u16(g.config.cubeMax + 1);
              } else {
                // in galaga mode player 2 is sidekick, so give cash to player 1
                g.players[g.config.galagaMode ? 0 : out.playerNum - 1]!.cash += t2.evalue;
              }
            }

            if ((t2.edlevel === -1) && (sc.temp === sc.temp3)) {
              t2.edlevel = 0;
              enemyAvail[sc.temp2] = 2;
              t2.egr[0] = t2.edgr;
              t2.ani = 1;
              t2.aniactive = 0;
              t2.animax = 0;
              t2.animin = 1;
              t2.edamaged = true;
              t2.enemycycle = 1;
            } else {
              enemyAvail[sc.temp2] = 1;
              en.enemyKilled = u16(en.enemyKilled + 1);
            }

            if (g.items.enemyDat[t2.enemytype]!.esize === 1) {
              setupExplosionLarge(ctx, t2.enemyground, t2.explonum, enemyScreenX, t2.ey);
              v.soundQueue[6] = S_EXPLOSION_9;
            } else {
              setupExplosion(ctx, enemyScreenX, t2.ey, 0, 1, false, false);
              v.soundQueue[6] = S_EXPLOSION_8;
            }
          }
        }
      }

      if (ps.infiniteShot) {
        out.shotDamage = s16(out.shotDamage + 250);
      } else if (z !== MAX_PWEAPON - 1) {
        if (out.shotDamage <= armorleft) {
          ps.shotAvail[z] = 0;
          break shotLoop;
        } else {
          const sd = ps.playerShotData[z]!;
          sd.shotDmg = u8(sd.shotDmg - armorleft);
        }
      }
    }
  }

  /* Player movement indicators for shots that track your ship */
  for (const p of g.players) {
    p.lastXShotMove = p.x;
    p.lastYShotMove = p.y;
  }

  /*=======Collisions Detection======*/
  for (let i = 0; i < (g.config.twoPlayerMode ? 2 : 1); ++i) {
    if (g.players[i]!.isAlive && !g.varz.endLevel) playerCollide(ctx, g.players[i]!, i + 1);
  }
}
