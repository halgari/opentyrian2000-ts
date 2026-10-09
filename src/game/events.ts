// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (JE_eventSystem)
import { rngMod, roundf32 } from '../core/cmath';
import { idiv, s16, s8, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { createNewEventEnemy, eventJump, newEnemy, searchFor, setEnemySpriteSheets } from './enemies';
import { drawTextWindow } from './hud';
import { DIFFICULTY_10, DIFFICULTY_EASY, DIFFICULTY_NORMAL, SA_NONE, SHOT_SPECIAL, SHOT_SPECIAL2 } from './world';

// port of JE_eventSystem (tyrian2.c:4308)
// `e` is the record at eventRec[eventLoc-1]; it is read live because several events mutate it in place.
export function eventSystem(ctx: Ctx): void {
  const g = ctx.game;
  const ev = g.events;
  const sc = g.scratch;
  const v = g.varz;
  const c = g.config;
  const bg = g.backgrounds;
  const en = g.enemies;
  const enemy = en.enemy;
  const e = ev.eventRec[ev.eventLoc - 1]!;

  switch (e.eventtype) {
    case 1:
      bg.starfieldSpeed = e.eventdat;
      break;

    case 2:
      bg.map1YDelay = 1;
      bg.map1YDelayMax = 1;
      bg.map2YDelay = 1;
      bg.map2YDelayMax = 1;

      bg.backMove = u16(e.eventdat);
      bg.backMove2 = u16(e.eventdat2);

      if (bg.backMove2 > 0) v.explodeMove = bg.backMove2;
      else v.explodeMove = bg.backMove;

      bg.backMove3 = u16(e.eventdat3);

      if (bg.backMove > 0) v.stopBackgroundNum = 0;
      break;

    case 3:
      bg.backMove = 1;
      bg.map1YDelay = 3;
      bg.map1YDelayMax = 3;
      bg.backMove2 = 1;
      bg.map2YDelay = 2;
      bg.map2YDelayMax = 2;
      bg.backMove3 = 1;
      break;

    case 4: // Map stop
    case 83: // T2000: Also a map stop
      v.stopBackgrounds = true;
      switch (e.eventdat) {
        case 0:
        case 1:
          v.stopBackgroundNum = 1;
          break;
        case 2:
          v.stopBackgroundNum = 2;
          break;
        case 3:
          v.stopBackgroundNum = 3;
          break;
      }
      break;

    case 5: // load enemy shape banks
      setEnemySpriteSheets(ctx, [
        e.eventdat > 0 ? e.eventdat : 0,
        e.eventdat2 > 0 ? e.eventdat2 : 0,
        e.eventdat3 > 0 ? e.eventdat3 : 0,
        e.eventdat4 > 0 ? e.eventdat4 : 0,
      ]);
      break;

    case 6: /* Ground Enemy */
      createNewEventEnemy(ctx, 0, 25, 0);
      break;

    case 7: /* Top Enemy */
      createNewEventEnemy(ctx, 0, 50, 0);
      break;

    case 8:
      c.starActive = false;
      break;

    case 9:
      c.starActive = true;
      break;

    case 10: /* Ground Enemy 2 */
      createNewEventEnemy(ctx, 0, 75, 0);
      break;

    case 11:
      if (v.allPlayersGone || e.eventdat === 1) {
        v.reallyEndLevel = true;
      } else if (!v.endLevel) {
        v.readyToEndLevel = false;
        v.endLevel = true;
        v.levelEnd = 40;
      }
      break;

    case 12: { /* Custom 4x4 Ground Enemy */
      let temp = 0; // local uint, shadows the global
      switch (e.eventdat6) {
        case 0:
        case 1:
          temp = 25;
          break;
        case 2:
          temp = 0;
          break;
        case 3:
          temp = 50;
          break;
        case 4:
          temp = 75;
          break;
      }
      e.eventdat6 = 0; /* We use EVENTDAT6 for the background */
      createNewEventEnemy(ctx, 0, temp, 0);
      createNewEventEnemy(ctx, 1, temp, 0);
      if (sc.b > 0) enemy[sc.b - 1]!.ex = s16(enemy[sc.b - 1]!.ex + 24);
      createNewEventEnemy(ctx, 2, temp, 0);
      if (sc.b > 0) enemy[sc.b - 1]!.ey = s16(enemy[sc.b - 1]!.ey - 28);
      createNewEventEnemy(ctx, 3, temp, 0);
      if (sc.b > 0) {
        enemy[sc.b - 1]!.ex = s16(enemy[sc.b - 1]!.ex + 24);
        enemy[sc.b - 1]!.ey = s16(enemy[sc.b - 1]!.ey - 28);
      }
      break;
    }

    case 13:
      v.enemiesActive = false;
      break;

    case 14:
      v.enemiesActive = true;
      break;

    case 15: /* Sky Enemy */
      createNewEventEnemy(ctx, 0, 0, 0);
      break;

    case 16:
      if (e.eventdat > 9) {
        console.warn('warning: event 16: bad event data');
      } else {
        // outputs[eventdat-1] with eventdat <= 0 reads outside the array in C
        if (e.eventdat < 1) throw new Error('unported: event 16 with eventdat < 1 (C reads outside outputs[])');
        drawTextWindow(ctx, ctx.assets.helpText.outputs[e.eventdat - 1] ?? '');
        v.soundQueue[3] = g.tables.windowTextSamples[e.eventdat - 1]!;
      }
      break;

    case 17: /* Ground Bottom */
      createNewEventEnemy(ctx, 0, 25, 0);
      if (sc.b > 0) enemy[sc.b - 1]!.ey = s16(190 + e.eventdat5);
      break;

    case 18: /* Sky Enemy on Bottom */
      createNewEventEnemy(ctx, 0, 0, 0);
      if (sc.b > 0) enemy[sc.b - 1]!.ey = s16(190 + e.eventdat5);
      break;

    case 19: { /* Enemy Global Move */
      let initialI = 0, maxI = 0;
      let allEnemies = false;

      if (e.eventdat3 > 79 && e.eventdat3 < 90) {
        initialI = 0;
        maxI = 100;
        allEnemies = false;
        e.eventdat4 = ev.newPL[e.eventdat3 - 80]!;
      } else {
        switch (e.eventdat3) {
          case 0:
            initialI = 0;
            maxI = 100;
            allEnemies = false;
            break;
          case 2:
            initialI = 0;
            maxI = 25;
            allEnemies = true;
            break;
          case 1:
            initialI = 25;
            maxI = 50;
            allEnemies = true;
            break;
          case 3:
            initialI = 50;
            maxI = 75;
            allEnemies = true;
            break;
          case 99:
            initialI = 0;
            maxI = 100;
            allEnemies = true;
            break;
        }
      }

      for (let i = initialI; i < maxI; i++) {
        const t = enemy[i]!;
        if (allEnemies || t.linknum === e.eventdat4) {
          if (e.eventdat !== -99) t.exc = s8(e.eventdat);
          if (e.eventdat2 !== -99) t.eyc = s8(e.eventdat2);
          if (e.eventdat6 !== 0) t.fixedmovey = e.eventdat6;
          if (e.eventdat6 === -99) t.fixedmovey = 0;
          if (e.eventdat5 > 0) t.enemycycle = u8(e.eventdat5);
        }
      }
      break;
    }

    case 20: /* Enemy Global Accel */
      if (e.eventdat3 > 79 && e.eventdat3 < 90) e.eventdat4 = ev.newPL[e.eventdat3 - 80]!;

      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        const t = enemy[sc.temp]!;
        if (en.enemyAvail[sc.temp] !== 1 && (t.linknum === e.eventdat4 || e.eventdat4 === 0)) {
          if (e.eventdat !== -99) {
            t.excc = s8(e.eventdat);
            t.exccw = s8(Math.abs(e.eventdat));
            t.exccwmax = u8(Math.abs(e.eventdat));
            if (e.eventdat > 0) t.exccadd = 1;
            else t.exccadd = -1;
          }

          if (e.eventdat2 !== -99) {
            t.eycc = s8(e.eventdat2);
            t.eyccw = s8(Math.abs(e.eventdat2));
            t.eyccwmax = u8(Math.abs(e.eventdat2));
            if (e.eventdat2 > 0) t.eyccadd = 1;
            else t.eyccadd = -1;
          }

          if (e.eventdat5 > 0) t.enemycycle = u8(e.eventdat5);
          if (e.eventdat6 > 0) {
            t.ani = u8(e.eventdat6);
            t.animin = u8(e.eventdat5);
            t.animax = 0;
            t.aniactive = 1;
          }
        }
      }
      break;

    case 21:
      c.background3over = 1;
      break;

    case 22:
      c.background3over = 0;
      break;

    case 23: /* Sky Enemy on Bottom */
      createNewEventEnemy(ctx, 0, 50, 0);
      if (sc.b > 0) enemy[sc.b - 1]!.ey = s16(180 + e.eventdat5);
      break;

    case 24: /* Enemy Global Animate */
      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        const t = enemy[sc.temp]!;
        if (t.linknum === e.eventdat4) {
          t.aniactive = 1;
          t.aniwhenfire = 0;
          if (e.eventdat2 > 0) {
            t.enemycycle = u8(e.eventdat2);
            t.animin = t.enemycycle;
          } else {
            t.enemycycle = 0;
          }

          if (e.eventdat > 0) t.ani = u8(e.eventdat);

          if (e.eventdat3 === 1) {
            t.animax = t.ani;
          } else if (e.eventdat3 === 2) {
            t.aniactive = 2;
            t.animax = t.ani;
            t.aniwhenfire = 2;
          }
        }
      }
      break;

    case 25: /* Enemy Global Damage change */
      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        if (e.eventdat4 === 0 || enemy[sc.temp]!.linknum === e.eventdat4) {
          if (c.galagaMode) {
            // roundf(int * (difficultyLevel / 2)): integer division and product, then converted to float
            enemy[sc.temp]!.armorleft = u8(roundf32(e.eventdat * idiv(c.difficultyLevel, 2)));
          } else {
            enemy[sc.temp]!.armorleft = u8(e.eventdat);
          }
        }
      }
      break;

    case 26:
      v.smallEnemyAdjust = e.eventdat !== 0;
      break;

    case 27: /* Enemy Global AccelRev */
      if (e.eventdat3 > 79 && e.eventdat3 < 90) e.eventdat4 = ev.newPL[e.eventdat3 - 80]!;

      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        const t = enemy[sc.temp]!;
        if (e.eventdat4 === 0 || t.linknum === e.eventdat4) {
          if (e.eventdat !== -99) t.exrev = s8(e.eventdat);
          if (e.eventdat2 !== -99) t.eyrev = s8(e.eventdat2);
          if (e.eventdat3 !== 0 && e.eventdat3 < 17) t.filter = u8(e.eventdat3);
        }
      }
      break;

    case 28:
      c.topEnemyOver = false;
      break;

    case 29:
      c.topEnemyOver = true;
      break;

    case 30:
      bg.map1YDelay = 1;
      bg.map1YDelayMax = 1;
      bg.map2YDelay = 1;
      bg.map2YDelayMax = 1;

      bg.backMove = u16(e.eventdat);
      bg.backMove2 = u16(e.eventdat2);
      v.explodeMove = bg.backMove2;
      bg.backMove3 = u16(e.eventdat3);
      break;

    case 31: /* Enemy Fire Override */
      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        const t = enemy[sc.temp]!;
        if (e.eventdat4 === 99 || t.linknum === e.eventdat4) {
          t.freq[0] = e.eventdat;
          t.freq[1] = e.eventdat2;
          t.freq[2] = e.eventdat3;
          for (sc.temp2 = 0; sc.temp2 < 3; sc.temp2++) t.eshotwait[sc.temp2] = 1;
          if (t.launchtype > 0) {
            t.launchfreq = u8(e.eventdat5);
            t.launchwait = 1;
          }
        }
      }
      break;

    case 32: // create enemy
      createNewEventEnemy(ctx, 0, 50, 0);
      if (sc.b > 0) enemy[sc.b - 1]!.ey = 190;
      break;

    case 33: /* Enemy From other Enemies */
      if (!((e.eventdat === 512 || e.eventdat === 513) && (c.twoPlayerMode || c.onePlayerAction || c.superTyrian))) {
        if (c.superArcadeMode !== SA_NONE) {
          if (e.eventdat === 534) e.eventdat = 827;
        } else if (!c.superTyrian) {
          const lives = g.players[0].lives; // alias of items.weapon[0].power (survey 5.2)

          if (e.eventdat === 533 && (lives === 11 || (ctx.rng.rand() % 15) < lives)) {
            // enemy will drop random special weapon
            e.eventdat = s16(829 + (ctx.rng.rand() % 6));
          }
        }
        if (e.eventdat === 534 && c.superTyrian) {
          e.eventdat = s16(828 + g.tables.superTyrianSpecials[ctx.rng.rand() % 4]!);
        }

        for (sc.temp = 0; sc.temp < 100; sc.temp++) {
          if (enemy[sc.temp]!.linknum === e.eventdat4) enemy[sc.temp]!.enemydie = u16(e.eventdat);
        }
      }
      break;

    case 34: /* Start Music Fade */
      if (v.firstGameOver) {
        v.musicFade = true;
        c.tempVolume = c.tyrMusicVolume;
      }
      break;

    case 35: /* Play new song */
      if (v.firstGameOver) {
        ctx.audio.playSong(e.eventdat - 1);
        ctx.audio.setVolume(c.tyrMusicVolume, c.fxVolume);
      }
      v.musicFade = false;
      break;

    case 36:
      v.readyToEndLevel = true;
      break;

    case 37:
      ev.levelEnemyFrequency = u16(e.eventdat);
      break;

    case 38: {
      ev.curLoc = u16(e.eventdat);
      let newEventLoc = 1;
      for (sc.tempW = 0; sc.tempW < ev.maxEvent; sc.tempW++) {
        if (ev.eventRec[sc.tempW]!.eventtime <= ev.curLoc) newEventLoc = sc.tempW + 1 - 1;
      }
      ev.eventLoc = newEventLoc;
      break;
    }

    case 39: /* Enemy Global Linknum Change */
      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        if (enemy[sc.temp]!.linknum === e.eventdat) enemy[sc.temp]!.linknum = u8(e.eventdat2);
      }
      break;

    case 40: /* Enemy Continual Damage */
      v.enemyContinualDamage = true;
      break;

    case 41:
      if (e.eventdat === 0) {
        en.enemyAvail.fill(1);
      } else {
        for (sc.x = 0; sc.x <= 24; sc.x++) en.enemyAvail[sc.x] = 1;
      }
      break;

    case 42:
      c.background3over = 2;
      break;

    case 43:
      c.background2over = u8(e.eventdat);
      break;

    case 44:
      c.filterActive = e.eventdat > 0;
      c.filterFade = e.eventdat === 2;
      c.levelFilter = s8(e.eventdat2);
      c.levelBrightness = s8(e.eventdat3);
      c.levelFilterNew = s8(e.eventdat4);
      c.levelBrightnessChg = s8(e.eventdat5);
      c.filterFadeStart = e.eventdat6 === 0;
      break;

    case 45: /* arcade-only enemy from other enemies */
      if (!c.superTyrian) {
        const lives = g.players[0].lives;

        if (e.eventdat === 533 && (lives === 11 || (ctx.rng.rand() % 15) < lives)) {
          e.eventdat = s16(829 + (ctx.rng.rand() % 6));
        }
        if (c.twoPlayerMode || c.onePlayerAction) {
          for (sc.temp = 0; sc.temp < 100; sc.temp++) {
            if (enemy[sc.temp]!.linknum === e.eventdat4) enemy[sc.temp]!.enemydie = u16(e.eventdat);
          }
        }
      }
      break;

    case 46: // change difficulty
      if (e.eventdat3 !== 0) v.damageRate = u8(e.eventdat3);

      if (e.eventdat2 === 0 || c.twoPlayerMode || c.onePlayerAction) {
        c.difficultyLevel = s8(c.difficultyLevel + e.eventdat);
        if (c.difficultyLevel < DIFFICULTY_EASY) c.difficultyLevel = DIFFICULTY_EASY;
        if (c.difficultyLevel > DIFFICULTY_10) c.difficultyLevel = DIFFICULTY_10;
      }
      break;

    case 47: /* Enemy Global AccelRev */
      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        if (e.eventdat4 === 0 || enemy[sc.temp]!.linknum === e.eventdat4) enemy[sc.temp]!.armorleft = u8(e.eventdat);
      }
      break;

    case 48: /* Background 2 Cannot be Transparent */
      c.background2notTransparent = true;
      break;

    case 49:
    case 50:
    case 51:
    case 52:
      sc.tempDat2 = e.eventdat;
      e.eventdat = 0;
      sc.tempDat = e.eventdat3;
      e.eventdat3 = 0;
      sc.tempDat3 = e.eventdat6;
      e.eventdat6 = 0;
      g.items.enemyDat[0]!.armor = u8(sc.tempDat3);
      g.items.enemyDat[0]!.egraphic[0] = u16(sc.tempDat2);
      switch (e.eventtype - 48) {
        case 1:
          sc.temp = 25;
          break;
        case 2:
          sc.temp = 0;
          break;
        case 3:
          sc.temp = 50;
          break;
        case 4:
          sc.temp = 75;
          break;
      }
      createNewEventEnemy(ctx, 0, sc.temp, sc.tempDat);
      e.eventdat = sc.tempDat2;
      e.eventdat3 = sc.tempDat;
      e.eventdat6 = sc.tempDat3;
      break;

    case 53:
      v.forceEvents = e.eventdat !== 99;
      break;

    case 54:
      eventJump(ctx, e.eventdat);
      break;

    case 55: /* Enemy Global AccelRev */
      if (e.eventdat3 > 79 && e.eventdat3 < 90) e.eventdat4 = ev.newPL[e.eventdat3 - 80]!;

      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        const t = enemy[sc.temp]!;
        if (e.eventdat4 === 0 || t.linknum === e.eventdat4) {
          if (e.eventdat !== -99) t.xaccel = u8(e.eventdat);
          if (e.eventdat2 !== -99) t.yaccel = u8(e.eventdat2);
        }
      }
      break;

    case 56: /* Ground2 Bottom */
      createNewEventEnemy(ctx, 0, 75, 0);
      if (sc.b > 0) enemy[sc.b - 1]!.ey = 190;
      break;

    case 57:
      en.superEnemy254Jump = u16(e.eventdat);
      break;

    case 58: // Set enemy launch
      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        if (e.eventdat4 === 99 || enemy[sc.temp]!.linknum === e.eventdat4) enemy[sc.temp]!.launchtype = u16(e.eventdat);
      }
      break;

    case 59: // Replace enemy
    case 68: { // Note: random explosions got moved to event 99 in T2000
      const eDatI = u16(e.eventdat);

      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        if (!(e.eventdat4 === 0 || enemy[sc.temp]!.linknum === e.eventdat4)) continue;

        const enemyOffset = sc.temp - (sc.temp % 25);
        sc.b = s16(newEnemy(ctx, enemyOffset, eDatI, 0));
        if (sc.b !== 0) {
          enemy[sc.b - 1]!.ex = enemy[sc.temp]!.ex;
          enemy[sc.b - 1]!.ey = enemy[sc.temp]!.ey;
        }

        en.enemyAvail[sc.temp] = 1;
      }
      break;
    }

    case 60: /*Assign Special Enemy*/
      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        const t = enemy[sc.temp]!;
        if (t.linknum === e.eventdat4) {
          t.special = true;
          t.flagnum = u8(e.eventdat);
          t.setto = e.eventdat2 === 1;
        }
      }
      break;

    case 61: { // if specific flag set to specific value, skip events
      const flag = v.globalFlags[e.eventdat - 1];
      if (flag === undefined) throw new Error('unported: event 61 with eventdat out of range of globalFlags[]');
      if (Number(flag) === e.eventdat2) ev.eventLoc = u16(ev.eventLoc + e.eventdat3);
      break;
    }

    case 62: /*Play sound effect*/
      v.soundQueue[3] = e.eventdat;
      break;

    case 63: // skip events if not in 2-player mode
      if (!c.twoPlayerMode && !c.onePlayerAction) ev.eventLoc = u16(ev.eventLoc + e.eventdat);
      break;

    case 64:
      if (!(e.eventdat === 6 && c.twoPlayerMode && c.difficultyLevel > DIFFICULTY_NORMAL)) {
        c.smoothies[e.eventdat - 1] = e.eventdat2 !== 0; // JE_boolean
        sc.temp = e.eventdat;
        if (sc.temp === 5) sc.temp = 3;
        g.backgrounds.smoothieData[sc.temp - 1] = e.eventdat3;
      }

    case 65:
      v.background3x1 = e.eventdat === 0;
      break;

    case 66: /*If not on this difficulty level or higher then...*/
      if (c.initialDifficulty <= e.eventdat) ev.eventLoc = u16(ev.eventLoc + e.eventdat2);
      break;

    case 67:
      v.levelTimer = e.eventdat === 1;
      v.levelTimerCountdown = u16(e.eventdat3 * 100);
      v.levelTimerJumpTo = u16(e.eventdat2);
      break;

    case 69:
      for (const p of g.players) p.invulnerableTicks = e.eventdat >>> 0;
      break;

    case 70:
      if (e.eventdat2 === 0) { /*1-10*/
        let found = false;

        for (sc.temp = 1; sc.temp <= 19; sc.temp++) found = found || searchFor(ctx, sc.temp) !== -1;

        if (!found) eventJump(ctx, e.eventdat);
      } else if (searchFor(ctx, e.eventdat2) === -1 &&
                 (e.eventdat3 === 0 || searchFor(ctx, u8(e.eventdat3)) === -1) &&
                 (e.eventdat4 === 0 || searchFor(ctx, e.eventdat4) === -1)) {
        eventJump(ctx, e.eventdat);
      }
      break;

    case 71: {
      // ((mapYPos - mainmap) / sizeof(ptr)) * 2 <= (unsigned)eventdat2. The division is size_t, so a negative
      // slot index (mapYPos = row 0 pointer - 1) becomes astronomically large and the compare is false.
      const slot = bg.mapYPos;
      if (slot >= 0 && slot * 2 <= (e.eventdat2 >>> 0)) eventJump(ctx, e.eventdat);
      break;
    }

    case 72:
      v.background3x1b = e.eventdat === 1;
      break;

    case 73:
      c.skyEnemyOverAll = e.eventdat === 1;
      break;

    case 74: /* Enemy Global BounceParams */
      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        const t = enemy[sc.temp]!;
        if (e.eventdat4 === 0 || t.linknum === e.eventdat4) {
          if (e.eventdat5 !== -99) t.xminbounce = e.eventdat5;
          if (e.eventdat6 !== -99) t.yminbounce = e.eventdat6;
          if (e.eventdat !== -99) t.xmaxbounce = e.eventdat;
          if (e.eventdat2 !== -99) t.ymaxbounce = e.eventdat2;
        }
      }
      break;

    case 75: {
      let tempNoClue = false;

      for (sc.temp = 0; sc.temp < 100; sc.temp++) {
        const t = enemy[sc.temp]!;
        if (en.enemyAvail[sc.temp] === 0 && t.eyc === 0 && t.linknum >= e.eventdat && t.linknum <= e.eventdat2) {
          tempNoClue = true;
        }
      }

      if (tempNoClue) {
        let enemyI: number;
        do {
          sc.temp = u8(rngMod(ctx.rng.rand(), e.eventdat2 + 1 - e.eventdat) + e.eventdat);
          enemyI = searchFor(ctx, sc.temp);
        } while (!(enemyI !== -1 && enemy[enemyI]!.eyc === 0));

        ev.newPL[e.eventdat3 - 80] = sc.temp;
      } else {
        ev.newPL[e.eventdat3 - 80] = 255;
        if (e.eventdat4 > 0) { /*Skip*/
          ev.curLoc = u16(ev.eventRec[ev.eventLoc - 1 + e.eventdat4]!.eventtime - 1);
          ev.eventLoc = u16(ev.eventLoc + e.eventdat4 - 1);
        }
      }
      break;
    }

    case 76:
      ev.returnActive = true;
      break;

    case 77:
      // pointers are flat slot indexes (spec 2.5): &mainmap[0][0] + n == n
      bg.mapYPos = idiv(e.eventdat, 2);
      if (e.eventdat2 > 0) bg.mapY2Pos = idiv(e.eventdat2, 2);
      else bg.mapY2Pos = idiv(e.eventdat, 2);
      break;

    case 78:
      if (v.galagaShotFreq < 10) v.galagaShotFreq++;
      break;

    case 79:
      en.bossBar[0]!.linkNum = u8(e.eventdat);
      en.bossBar[1]!.linkNum = u8(e.eventdat2);
      break;

    case 80: // skip events if in 2-player mode
      if (c.twoPlayerMode) ev.eventLoc = u16(ev.eventLoc + e.eventdat);
      break;

    case 81: /*WRAP2*/
      g.map.BKwrap2 = idiv(e.eventdat, 2);
      g.map.BKwrap2to = idiv(e.eventdat2, 2);
      break;

    case 82: /*Give SPECIAL WEAPON*/
      g.players[0].items.special = u8(e.eventdat);
      c.shotMultiPos[SHOT_SPECIAL] = 0;
      c.shotRepeat[SHOT_SPECIAL] = 0;
      c.shotMultiPos[SHOT_SPECIAL2] = 0;
      c.shotRepeat[SHOT_SPECIAL2] = 0;
      break;

    case 84: // timed battle level timer
      if (!c.timedBattleMode) break;

      // note: a copy of event 67
      v.levelTimer = e.eventdat === 1;
      v.levelTimerCountdown = u16(e.eventdat3 * 100);
      v.levelTimerJumpTo = u16(e.eventdat2);
      break;

    case 85: // timed battle enemy from other enemies
      if (c.timedBattleMode) {
        for (sc.temp = 0; sc.temp < 100; sc.temp++) {
          if (enemy[sc.temp]!.linknum === e.eventdat4) enemy[sc.temp]!.enemydie = u16(e.eventdat);
        }
      }
      break;

    case 99:
      v.randomExplosions = e.eventdat === 1;
      break;

    default:
      console.warn(`warning: ignoring unknown event ${e.eventtype}`);
      break;
  }

  ev.eventLoc = u16(ev.eventLoc + 1);
}
