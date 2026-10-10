// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (JE_loadMap, the non-demo episode-script parser, tyrian2.c:2429-3034)
import { u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { loadPCX } from '../data/pcx';
import { PCX_PAL } from '../data/pcxmast';
import { loadPic } from '../data/pic';
import { atoiAt, cstr, cstrlen, ScriptReader, strPopInt } from '../data/script-file';
import { nextEpisode } from '../screens/episode-end';
import { playAnim } from '../screens/anim';
import { highScoreCheck } from '../screens/highscores';
import { itemScreen } from '../screens/shop';
import { waitDelay, waitInput } from '../platform/wait';
import { fadeBlack, fadePalette, fadeWhite } from '../video/fade';
import { dString, fontCenter } from '../video/fonthand';
import { FONT_SHAPES, SMALL_FONT_SHAPES } from '../video/sprite';
import { blitSprite2x2 } from '../video/sprite2';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';
import { displayText } from '../video/glow-text';
import { totalScore } from './economy';
import { saveGame } from './save';
import { UnavailableModeError } from './unported';
import { DIFFICULTY_HARD, DIFFICULTY_NORMAL, DIFFICULTY_ZINGLON } from './world';

const SA_NORTSHIPZ = 7;  // varz.h
const SA_DESTRUCT = 10;
const SA_ENGAGE = 11;
const LEVEL_WARNING_ROWS = 12; // char levelWarningText[12][61]
const LEVEL_WARNING_COLS = 61;

/**
 * How one pass of the script ended.
 *  - `level`: an `]L` line was read (loadLevelOk); JE_loadMap goes on to read the level file.
 *  - `restart`: `goto new_game` (the shop or `]Q` loaded a game / changed episode).
 *  - `return`: JE_loadMap returns with mainLevel == 0 (shop quit, `]Q` after SuperTyrian, timed battle end).
 */
export type ScriptResult = 'level' | 'restart' | 'return';

function setWarningRow(ctx: Ctx, row: number, text: string): void {
  if (row >= LEVEL_WARNING_ROWS) throw new RangeError('unported: levelWarningText[12] overflow (tyrian2.c)');
  // strcpy into char[61]: one byte of overflow is harmless for the shipped data (the following row rewrites it);
  // anything longer would corrupt the next rows.
  if (text.length > LEVEL_WARNING_COLS) throw new RangeError('unported: levelWarningText row overflow (tyrian2.c)');
  ctx.game.text.levelWarningText[row] = text;
}

// port of the `]e` command of JE_loadMap (tyrian2.c:2523-2542): the ENGAGE loadout, used for mini-games.
// constantDie is only set by the command line (params.c) and is always false, so the TS has no such field.
export function engageLoadout(ctx: Ctx): void {
  const g = ctx.game;
  const c = g.config;
  const p0 = g.players[0];
  g.varz.doNotSaveBackup = true;
  c.onePlayerAction = true;
  c.superTyrian = true;
  c.twoPlayerMode = false;

  p0.cash = 0;

  p0.items.ship = 13;                    // The Stalker 21.126
  p0.items.weapon[0].id = 39;            // Atomic RailGun
  p0.items.weapon[1].id = 0;             // None
  p0.items.sidekick[0] = 0;              // None
  p0.items.sidekick[1] = 0;
  p0.items.generator = 2;                // Advanced MR-12
  p0.items.shield = 4;                   // Advanced Integrity Field
  p0.items.special = 0;                  // None

  p0.items.weapon[0].power = 3;
  p0.items.weapon[1].power = 1;
}

// port of the episode-script loop of JE_loadMap (tyrian2.c:2429-3034). `s` is JE_loadMap's `char s[256]`; the
// caller owns it because it keeps its stale contents across `goto new_game`.
export async function runEpisodeScript(ctx: Ctx, s: Uint8Array): Promise<ScriptResult> {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const sc = g.scratch;
  const it = g.items;
  const ts = g.text;
  const [p0] = g.players;
  const help = ctx.assets.helpText;
  const tables = ctx.assets.shapes.tables;

  const atoi = (off: number): number => atoiAt(s, off);
  const readLine = (r: ScriptReader): void => r.readInto(s);
  const isHash = (): boolean => s[0] === 0x23; // s[0] == '#'

  do {
    const r = new ScriptReader(ctx.assets.archive.get(it.episodeFile));

    v.jumpSection = false;
    v.loadLevelOk = false;

    /* Seek Section # Mainlevel */
    for (let x = 0; x < c.mainLevel;) {
      readLine(r);
      if (s[0] === 0x2a /* '*' */) {
        x++;
        s[0] = 0x20;
      }
    }

    do {
      if (v.gameLoaded) {
        if (c.mainLevel === 0) return 'return'; // if quit itemscreen: back to title screen
        return 'restart';                       // goto new_game
      }

      s[0] = 0x20; s[1] = 0; // strcpy(s, " "): the rest of s keeps its stale bytes
      readLine(r);
      if (s[0] === 0x5d /* ']' */) {
        switch (String.fromCharCode(s[1]!)) {
          case 'A':
            await playAnim(ctx, 'tyrend.anm', 0, 7);
            break;

          case 'G':
            v.mapOrigin = u16(atoi(4));
            v.mapPNum = u16(atoi(7));
            if (v.mapPNum > v.mapPlanet.length) throw new RangeError('unported: ]G mapPNum > 5 overflows mapPlanet[5] (tyrian2.c:2484)');
            for (let i = 0; i < v.mapPNum; i++) {
              v.mapPlanet[i] = atoi(1 + (i + 1) * 8);
              v.mapSection[i] = atoi(4 + (i + 1) * 8);
            }
            break;

          case '?':
            sc.temp = u8(atoi(4));
            if (sc.temp > c.cubeList.length) throw new RangeError('unported: ]? count > 4 overflows cubeList[4] (tyrian2.c:2494)');
            for (let i = 0; i < sc.temp; i++) c.cubeList[i] = atoi(3 + (i + 1) * 4);
            if (c.cubeMax > sc.temp) c.cubeMax = sc.temp;
            break;

          case '!':
            c.cubeMax = u16(atoi(4)); /*Auto set CubeMax*/
            break;

          case '+':
            sc.temp = u8(atoi(4));
            c.cubeMax = u16(c.cubeMax + sc.temp);
            if (c.cubeMax > 4) c.cubeMax = 4;
            break;

          case 'g':
            // TODO(sp5): tyrian2.c:2510 galagaMode (GALAGA mini-game)
            throw new UnavailableModeError(']g galagaMode (tyrian2.c:2510)');

          case 'x':
            c.extraGame = true;
            break;

          case 'e': // ENGAGE mode, used for mini-games
            engageLoadout(ctx);
            break;

          case 'J': /* section jump */
            sc.temp = u8(atoi(3));
            c.mainLevel = sc.temp;
            v.jumpSection = true;
            break;

          case '2': /* two-player section jump */
            sc.temp = u8(atoi(3));
            if (c.twoPlayerMode || c.onePlayerAction) {
              c.mainLevel = sc.temp;
              v.jumpSection = true;
            }
            break;

          case 'w': /* Stalker 21.126 section jump */
            sc.temp = u8(atoi(3)); /*Allowed to go to Time War?*/
            if (p0.items.ship === 13) {
              c.mainLevel = sc.temp;
              v.jumpSection = true;
            }
            break;

          case 't':
            sc.temp = u8(atoi(3));
            if (v.levelTimer && v.levelTimerCountdown === 0) {
              c.mainLevel = sc.temp;
              v.jumpSection = true;
            }
            break;

          case 'l':
            sc.temp = u8(atoi(3));
            if (!(g.players[0].isAlive && (!c.twoPlayerMode || g.players[1].isAlive))) { // !all_players_alive()
              c.mainLevel = sc.temp;
              v.jumpSection = true;
            }
            break;

          case 's':
            c.saveLevel = c.mainLevel;
            break; /*store savepoint*/

          case 'b': {
            // `temp` is dead for the C's logic but it is a global: the store is visible to later code.
            sc.temp = c.twoPlayerMode ? 22 : 11;
            saveGame(ctx, 11, 'LAST LEVEL    '); // always slot 11
            break;
          }

          case 'i':
            sc.temp = u8(atoi(3));
            v.songBuy = u8(sc.temp - 1);
            break;

          case 'I': { /*Load Items Available Information*/
            for (const row of it.itemAvail) row.fill(0);

            for (let i = 0; i < 9; ++i) {
              readLine(r);

              let buf = cstrlen(s) > 8 ? cstr(s, 8) : '';
              let j = 0;
              for (let pop = strPopInt(buf); pop !== null; pop = strPopInt(buf)) {
                if (j >= it.itemAvail[i]!.length) throw new RangeError('unported: ]I row longer than itemAvail[9][10] (tyrian2.c:2615)');
                it.itemAvail[i]![j++] = pop.value;
                buf = pop.rest;
              }
              it.itemAvailMax[i] = j;
            }

            await itemScreen(ctx);
            break;
          }

          case 'L':
            c.nextLevel = u8(atoi(9));
            c.levelName = cstr(s, 13).slice(0, 9); // SDL_strlcpy(levelName, s + 13, 10)
            v.levelSong = u8(atoi(22));
            if (c.nextLevel === 0) c.nextLevel = u8(c.mainLevel + 1);
            v.lvlFileNum = u8(atoi(25));
            v.loadLevelOk = true;
            v.bonusLevelCurrent = cstrlen(s) > 28 && s[28] === 0x24 /* '$' */;
            v.normalBonusLevelCurrent = cstrlen(s) > 27 && s[27] === 0x24;
            c.gameJustLoaded = false;
            break;

          case '@':
            v.useLastBank = !v.useLastBank;
            break;

          case 'Q': {
            sc.temp = u8(c.secretHint + (ctx.rng.rand() % 3) * 3);

            if (c.twoPlayerMode) {
              for (let i = 0; i < 2; ++i) setWarningRow(ctx, i, `${help.miscText[40 + i]} ${g.players[i]!.cash}`.slice(0, LEVEL_WARNING_COLS - 1));
              setWarningRow(ctx, 2, '');
              ts.levelWarningLines = 3;
            } else {
              setWarningRow(ctx, 0, `${help.miscText[37]} ${totalScore(ctx, p0)}`);
              setWarningRow(ctx, 1, '');
              ts.levelWarningLines = 2;
            }

            for (let x = 0; x < sc.temp - 1; x++) {
              do {
                readLine(r);
              } while (!isHash());
            }

            do {
              readLine(r);
              setWarningRow(ctx, ts.levelWarningLines, cstr(s));
              ts.levelWarningLines++;
            } while (!isHash());
            ts.levelWarningLines--;

            // JE_wipeKey() is a no-op
            c.frameCountMax = 4;
            await displayText(ctx); // (constantPlay is never set)

            await fadeBlack(ctx, 15);

            await nextEpisode(ctx);

            if (it.jumpBackToEpisode1 && !c.twoPlayerMode) {
              const screen = ctx.vga.screen;
              loadPic(ctx.assets.pics, ctx.palette, screen, 1, false); // huh?
              clearSurface(screen);

              if (c.superTyrian) {
                // if completed Zinglon's Revenge, show SuperTyrian and Destruct codes
                // if completed SuperTyrian, show Nort-Ship Z code
                c.superArcadeMode = (c.initialDifficulty === DIFFICULTY_ZINGLON) ? 8 : 1;
              }

              if (c.superArcadeMode < SA_ENGAGE) {
                const next = g.tables.SANextShip[c.superArcadeMode]!;
                if (next === SA_ENGAGE) {
                  let buffer = `${help.miscTextB[4]} ${help.pName[0]}`;
                  dString(screen, tables, fontCenter(buffer, tables, FONT_SHAPES), 100, buffer, FONT_SHAPES);
                  buffer = `Or play... ${help.specialName[SA_DESTRUCT - 1]}`;
                  dString(screen, tables, 80, 180, buffer, SMALL_FONT_SHAPES);
                } else {
                  const top = help.superShips[0]!;
                  dString(screen, tables, fontCenter(top, tables, FONT_SHAPES), 30, top, FONT_SHAPES);
                  const name = help.superShips[next]!;
                  dString(screen, tables, fontCenter(name, tables, SMALL_FONT_SHAPES), 100, name, SMALL_FONT_SHAPES);
                }

                if (next < SA_NORTSHIPZ) {
                  blitSprite2x2(screen, 148, 70, ctx.assets.shapes.spriteSheet9, it.ships[g.tables.SAShip[next - 1]!]!.shipgraphic);
                } else if (next === SA_NORTSHIPZ) {
                  c.trentWin = true;
                }

                const buffer = `Type ${help.specialName[next - 1]} at Title`;
                dString(screen, tables, fontCenter(buffer, tables, SMALL_FONT_SHAPES), 160, buffer, SMALL_FONT_SHAPES);
                showVGA(ctx);

                await fadePalette(ctx, ctx.palette.colors, 50, 0, 255);

                await waitInput(ctx, true, true, false);
              }

              v.jumpSection = true;

              if (c.superTyrian) {
                await fadeBlack(ctx, 10);

                // back to titlescreen
                c.mainLevel = 0;
                return 'return';
              }
            }
            break;
          }

          case 'P': {
            const tempX = u16(atoi(3));
            const screen = ctx.vga.screen;
            const pal = ctx.palette;
            if (tempX > 900) {
              pal.colors.set(ctx.assets.palettes[PCX_PAL[tempX - 1 - 900]!]!);
              clearSurface(screen);
              showVGA(ctx);
              await fadePalette(ctx, pal.colors, 1, 0, 255);
            } else {
              if (tempX === 0) loadPCX(ctx.assets.archive.get('tshp2.pcx'), screen, pal.colors);
              else loadPic(ctx.assets.pics, pal, screen, tempX, false);

              showVGA(ctx);
              await fadePalette(ctx, pal.colors, 10, 0, 255);
            }
            break;
          }

          case 'U': {
            const screen = ctx.vga.screen;
            const screen2 = ctx.vga.screen2;
            screen2.pixels.set(screen.pixels);

            const tempX = u16(atoi(3));
            loadPic(ctx.assets.pics, ctx.palette, screen, tempX, false);
            const picBuffer = screen.pixels.slice(0, 320 * 200);

            ctx.input.serviceEvents(true);

            for (let z = 0; z <= 199; z++) {
              if (!ctx.input.newkey) {
                let vga = 0;
                let vga2 = 0;
                let pic = (199 - z) * 320;

                ctx.delay.setDelay(1);

                for (let y = 0; y <= 199; y++) {
                  if (y <= z) {
                    screen.pixels.set(picBuffer.subarray(pic, pic + 320), vga);
                    pic += 320;
                  } else {
                    screen.pixels.set(screen2.pixels.subarray(vga2, vga2 + screen.pitch), vga);
                    vga2 += screen.pitch;
                  }
                  vga += screen.pitch;
                }

                showVGA(ctx);

                await waitDelay(ctx); // service_wait_delay
              }
            }

            screen.pixels.set(picBuffer);
            break;
          }

          case 'V':
            // TODO(sp5): tyrian2.c:2819 scroll-down reveal (no shipped script uses ]V)
            throw new Error('unported: ]V scroll-down reveal (tyrian2.c:2819)');

          case 'R':
            // TODO(sp5): tyrian2.c:2870 scroll-left reveal (no shipped script uses ]R)
            throw new Error('unported: ]R scroll-left reveal (tyrian2.c:2870)');

          case 'C':
            await fadeBlack(ctx, 10);
            clearSurface(ctx.vga.screen);
            showVGA(ctx);
            ctx.palette.colors.set(ctx.assets.palettes[7]!);
            ctx.palette.setPalette(ctx.palette.colors, 0, 255);
            break;

          case 'B':
            await fadeBlack(ctx, 10);
            break;

          case 'F':
            await fadeWhite(ctx, 100);
            await fadeBlack(ctx, 30);
            clearSurface(ctx.vga.screen);
            showVGA(ctx);
            break;

          case 'W': {
            // JE_wipeKey() is a no-op
            v.warningCol = 14 * 16 + 5;
            v.warningColChange = 1;
            v.warningSoundDelay = 0;
            ts.levelWarningDisplay = s[2] === 0x79; // 'y'
            ts.levelWarningLines = 0;
            c.frameCountMax = u16(atoi(4));
            ctx.delay.setDelay2(6);
            ts.warningRed = Math.trunc(c.frameCountMax / 10) !== 0;
            c.frameCountMax = c.frameCountMax % 10;

            do {
              readLine(r);

              if (!isHash()) {
                setWarningRow(ctx, ts.levelWarningLines, cstr(s));
                ts.levelWarningLines++;
              }
            } while (!isHash());

            await displayText(ctx);
            ctx.input.newkey = false;
            break;
          }

          case 'H':
            if (c.initialDifficulty < DIFFICULTY_HARD) {
              c.mainLevel = u8(atoi(4));
              v.jumpSection = true;
            }
            break;

          case 'h':
            if (c.initialDifficulty > DIFFICULTY_NORMAL) readLine(r);
            break;

          case 'S': // network sync: isNetworkGame is never true
          case 'n': // ESCPressed = false (dead variable)
            break;

          case 'M':
            sc.temp = u8(atoi(3));
            ctx.audio.playSong(sc.temp - 1);
            break;

          case 'T':
            // port of ]T (tyrian2.c:3004)
            if (c.timedBattleMode) {
              // ]T[ 43 44 45 46 47 -- Episode 1
              // ]T[ 03 03 04 05 06 -- Episode 5
              c.mainLevel = u8(atoi(c.timeBattleSelection * 3));
              v.jumpSection = true;
            }
            break;

          case 'q':
            // port of ]q (tyrian2.c:3015)
            if (c.timedBattleMode) {
              await highScoreCheck(ctx);
              c.mainLevel = 0;
              return 'return';
            }
            break;
        }
      }
    } while (!(v.loadLevelOk || v.jumpSection));
  } while (!v.loadLevelOk);

  return 'level';
}
