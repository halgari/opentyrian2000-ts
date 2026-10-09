// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (JE_main, JE_starShowVGA, JE_loadMap)
import { DEFAULT_SONG_BUY, S_NONE, V_GOOD_LUCK } from '../audio/ids';
import { f32 } from '../core/cmath';
import { idiv, s8, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { analyzeLevel, buildShapeRefs, loadLevelRecord, REF_NULL, REF_UNINIT, SHAPE_SIZE, type LevelData, type ShapeRefs } from '../data/level';
import { loadPic } from '../data/pic';
import { SCRIPT_LINE_SIZE } from '../data/script-file';
import { loadCompShapes } from '../data/shapes';
import { waitDelayPlain, waitNoInput } from '../platform/wait';
import { fadeBlack, fadePalette } from '../video/fade';
import { outText } from '../video/fonthand';
import { clearSurface } from '../video/surface';
import { showVGA } from '../video/video';
import {
  advanceBackgrounds, checkSmoothies, darkenBackground, drawBackground1, drawBackground2, drawBackground2Blend,
  drawBackground3, filterScreen, initializeStarfield, updateAndDrawStarfield,
} from './backgrounds';
import { playerShotsPass } from './collide';
import { setNewGameSpeed } from './config';
import { loadNextDemo } from './demo';
import { drawEnemy, eventJump, randomEnemySpawn, updateEnemyShots } from './enemies';
import { levelFileName } from './episodes';
import { eventSystem } from './events';
import { drawExplosions, drawSP, updateRepeatingExplosions } from './explosions';
import {
  drawArmor, drawBossBar, drawLevelTopBars, drawOptionLevel, drawOptions, drawPortConfigButtons, drawShield,
  drawTextWindow, drawTimers, drawWarnings, gammaCorrect, inGameDisplays, type LevelLocals,
} from './hud';
import { calcPurpleBallsNeeded, mainGamePlayerFunctions } from './player';
import { runEpisodeScript } from './script';
import { getShipInfo } from './shots';
import {
  DIFFICULTY_EASY, DIFFICULTY_NORMAL, EPISODE_AVAILABLE, Explosion, MAP1_COLS, MAP2_COLS, MAP3_COLS, PlayerShot, RepExplosion, SuperPixel,
  type GameWorld, type MegaData,
} from './world';

// port of all_players_dead (player.h)
export function allPlayersDead(g: GameWorld): boolean {
  return !g.players[0].isAlive && (!g.config.twoPlayerMode || !g.players[1].isAlive);
}

// port of the "Match 1/2/3" loops and the map reads of JE_loadMap (tyrian2.c:3069-3200), demo path.
function installMaps(g: GameWorld, level: LevelData, refs: ShapeRefs): void {
  const { shapes } = level;

  // megaData1.shapes[x].sh (stride 672); megaData2/3.shapes[x] = { nothing[3], fill, sh } (stride 676)
  const installShapes = (md: MegaData, layer: number, stride: number, shOffset: number): void => {
    for (let x = 0; x < 128; x++) {
      const z = refs.shapeIndex[layer]![x]!;
      if (z < 0) continue;
      md.shapes.set(shapes.pixels.subarray(z * SHAPE_SIZE, (z + 1) * SHAPE_SIZE), x * stride + shOffset);
      if (layer > 0) md.shapes[x * stride + 3] = refs.fill[layer]![x]!;
    }
  };
  installShapes(g.map.megaData1, 0, SHAPE_SIZE, 0);
  installShapes(g.map.megaData2, 1, 4 + SHAPE_SIZE, 4);
  installShapes(g.map.megaData3, 2, 4 + SHAPE_SIZE, 4);

  // mainmap[y][x] = ref[layer][mapBuf[...]]. ref[] is a 128-entry C array indexed by a map byte; the demo
  // levels never use a byte >= 128 or an unassigned ref (test/game/level.test.ts asserts it), so fail loudly
  // if some other level does.
  const fillMap = (md: MegaData, layer: number, map: Uint8Array): void => {
    for (let i = 0; i < map.length; i++) {
      const byte = map[i]!;
      if (byte >= 128) throw new Error('unported: map byte >= 128 reads past ref[] (tyrian2.c:3171)');
      const r = refs.ref[layer]![byte]!;
      if (r === REF_UNINIT) throw new Error('unported: map byte with unassigned ref[] (uninitialised stack, tyrian2.c:2406)');
      md.mainmap[i] = r === REF_NULL ? -1 : r;
    }
  };
  fillMap(g.map.megaData1, 0, level.map1);
  fillMap(g.map.megaData2, 1, level.map2);
  fillMap(g.map.megaData3, 2, level.map3);
}

// port of JE_loadMap (tyrian2.c:2399). The demo path takes the next demo; the normal path runs the episode script
// (src/game/script.ts), which may show the shop and text screens, before reading the level file.
export async function loadMap(ctx: Ctx): Promise<void> {
  const g = ctx.game;
  const c = g.config;

  c.lastCubeMax = c.cubeMax;

  /*Defaults*/
  g.varz.songBuy = DEFAULT_SONG_BUY; /*Item Screen default song*/

  /* Load LEVELS.DAT - Section = MAINLEVEL */
  c.saveLevel = c.mainLevel;

  const s = new Uint8Array(SCRIPT_LINE_SIZE); // char s[256]: keeps its stale bytes across new_game restarts
  for (;;) { // new_game:
    c.galagaMode = false;
    g.varz.useLastBank = false;
    c.extraGame = false;
    // haltGame = false (network only)
    g.varz.gameLoaded = false;

    if (ctx.state.playDemo) break;
    const result = await runEpisodeScript(ctx, s);
    if (result === 'return') return; // mainLevel == 0: back to the title screen
    if (result === 'level') break;
  }

  if (ctx.state.playDemo) loadNextDemo(ctx);
  else await fadeBlack(ctx, 50);

  const archive = ctx.assets.archive;
  const lvl = archive.get(levelFileName(g.items.episodeNum));
  const { lvlPos } = analyzeLevel(lvl); // JE_analyzeLevel's result is only needed here: derived on demand
  const level = loadLevelRecord(lvl, lvlPos, g.varz.lvlFileNum, archive);

  g.backgrounds.mapX = level.mapX;
  g.backgrounds.mapX2 = level.mapX2;
  g.backgrounds.mapX3 = level.mapX3;

  const e = g.events;
  e.levelEnemyMax = level.levelEnemy.length;
  e.levelEnemy.set(level.levelEnemy); // the rest of levelEnemy[40] keeps its stale contents, like the C
  e.maxEvent = level.maxEvent;
  for (let x = 0; x < level.maxEvent; x++) Object.assign(e.eventRec[x]!, level.events[x]!);
  e.eventRec[level.maxEvent]!.eventtime = 65500; // sentinel: only eventtime is written, as in the C

  installMaps(g, level, buildShapeRefs(level));

  // the global loop counters of the mapSh loop (for (temp...) { for (temp2...) }) end at these values
  g.scratch.temp = 3;
  g.scratch.temp2 = 128;
}

// port of JE_starShowVGA (tyrian2.c:75): present the 264x184 play window. Codes 1 and 2 are smoothie-only.
export async function starShowVGA(ctx: Ctx): Promise<void> {
  const g = ctx.game;
  const v = g.varz;
  if (!v.playerEndLevel && !v.skipStarShowVGA) {
    const dst = ctx.vga.screen;
    const src = ctx.vga.gameScreen;

    if (g.config.smoothScroll) {
      await waitDelayPlain(ctx);
      ctx.delay.setDelay(g.config.frameCountMax);
    }

    const code = g.config.starShowVGASpecialCode;
    if (code === 1) throw new Error('unported: tyrian2.c:96 starShowVGASpecialCode 1 (flip smoothie)'); // TODO(sp4)
    if (code === 2 && g.config.processorType >= 2) throw new Error('unported: tyrian2.c:107 starShowVGASpecialCode 2 (lighting smoothie)'); // TODO(sp4)
    for (let y = 0; y < 184; y++) { // memmove(s, src, 264) per row, src = game_screen + 24
      dst.pixels.set(src.pixels.subarray(y * src.pitch + 24, y * src.pitch + 24 + 264), y * dst.pitch);
    }
    showVGA(ctx);
  }
  v.quitRequested = false;
  v.skipStarShowVGA = false;
}

/** The `memset(x, 0, ...)` / `= 1` block of JE_main (tyrian2.c:1019-1087). */
function resetLevelArrays(g: GameWorld): void {
  const c = g.config;
  g.enemies.enemyAvail.fill(1);
  g.enemyShots.enemyShotAvail.fill(true);

  /* Initialize Shots */
  const ps = g.playerShots;
  for (let i = 0; i < ps.playerShotData.length; i++) ps.playerShotData[i] = new PlayerShot();
  ps.shotAvail.fill(0);
  c.shotMultiPos.fill(0);
  c.shotRepeat.fill(1);

  g.varz.button.fill(false);
  g.varz.globalFlags.fill(false);

  const ex = g.explosions;
  for (let i = 0; i < ex.explosions.length; i++) ex.explosions[i] = new Explosion();
  for (let i = 0; i < ex.repExplosions.length; i++) ex.repExplosions[i] = new RepExplosion();

  /* --- Clear Sound Queue --- */
  g.varz.soundQueue.fill(0);
  g.varz.soundQueue[3] = V_GOOD_LUCK;

  g.sprites.enemySpriteSheetIds.fill(0);
  for (const en of g.enemies.enemy) en.reset();

  for (const code of g.varz.SFCurrentCode) code.fill(0);
  g.varz.SFExecuted.fill(0);

  ps.zinglonDuration = 0;
  ps.specialWait = 0;
  ps.nextSpecialWait = 0;
  g.varz.optionAttachmentMove = 0; /* Launch the Attachments! */
  g.varz.optionAttachmentLinked = true;

  g.varz.editShip1 = false;
  g.varz.editShip2 = false;

  c.smoothies.fill(false);

  g.varz.levelTimer = false;
  g.varz.randomExplosions = false;

  ex.lastSuperpixel = 0;
  for (let i = 0; i < ex.superpixels.length; i++) ex.superpixels[i] = new SuperPixel();

  g.events.returnActive = false;

  g.varz.galagaShotFreq = 0;
}

// start_level_first .. just before level_loop (tyrian2.c:721-1087). Returns the JE_main locals, or null
// when JE_loadMap left mainLevel == 0 (JE_main returns immediately).
async function levelSetup(ctx: Ctx): Promise<LevelLocals | null> {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const b = g.backgrounds;
  const sc = g.scratch;
  const [p0, p1] = g.players;
  const tables = ctx.assets.shapes.tables;

  ctx.audio.setVolume(c.tyrMusicVolume, c.fxVolume); // set_volume

  v.endLevel = false;
  v.reallyEndLevel = false;
  v.playerEndLevel = false;
  c.extraGame = false;

  v.doNotSaveBackup = false;
  await loadMap(ctx);

  if (c.mainLevel === 0) return null; // if quit itemscreen: back to titlescreen

  // (mouseSetRelative(true) is for !play_demo)
  ctx.audio.fadeSong();

  for (const p of g.players) p.isAlive = true;

  c.oldDifficultyLevel = c.difficultyLevel;
  if (g.items.episodeNum === EPISODE_AVAILABLE) c.difficultyLevel = s8(c.difficultyLevel - 1);
  if (c.difficultyLevel < DIFFICULTY_EASY) c.difficultyLevel = DIFFICULTY_EASY;

  p0.x = 100;
  p0.y = 180;
  p1.x = 190;
  p1.y = 180;

  for (const p of g.players) {
    for (let j = 0; j < p.oldX.length; ++j) {
      p.oldX[j] = p.x - (19 - j);
      p.oldY[j] = p.y - 18;
    }
    p.lastXShotMove = p.x;
    p.lastYShotMove = p.y;
  }

  // VGAScreen is VGAScreenSeg for everything up to the level loop
  const seg = ctx.vga.screen;
  loadPic(ctx.assets.pics, ctx.palette, seg, c.twoPlayerMode ? 6 : 3, false);

  drawOptions(ctx);

  outText(seg, tables, 268, c.twoPlayerMode ? 76 : 118, c.levelName, 12, 4);

  showVGA(ctx);
  gammaCorrect(ctx.palette.colors, c.gammaCorrection);
  await fadePalette(ctx, ctx.palette.colors, 50, 0, 255);

  if (g.sprites.explosionSpriteSheet === null) g.sprites.explosionSpriteSheet = loadCompShapes(ctx.assets.archive, '6');

  /* MAPX will already be set correctly */
  b.mapY = 300 - 8;
  b.mapY2 = 600 - 8;
  b.mapY3 = 600 - 8;
  // mapYPos = &megaData1.mainmap[mapY][0] - 1 (pointers are flat slot indexes, spec 2.5)
  b.mapYPos = b.mapY * MAP1_COLS - 1;
  b.mapY2Pos = b.mapY2 * MAP2_COLS - 1;
  b.mapY3Pos = b.mapY3 * MAP3_COLS - 1;
  b.mapXPos = 0;
  b.mapXOfs = 0;
  b.mapX2Pos = 0;
  b.mapX3Pos = 0;
  b.mapX3Ofs = 0;
  b.mapXbpPos = 0;
  b.mapX2bpPos = 0;
  b.mapX3bpPos = 0;

  b.map1YDelay = 1;
  b.map1YDelayMax = 1;
  b.map2YDelay = 1;
  b.map2YDelayMax = 1;

  v.musicFade = false;

  b.backPos = 0;
  b.backPos2 = 0;
  b.backPos3 = 0;
  c.power = 0;
  b.starfieldSpeed = 1;

  /* Setup player ship graphics */
  getShipInfo(ctx);

  for (const p of g.players) {
    p.xVelocity = 0;
    p.yVelocity = 0;
    p.invulnerableTicks = 100;
  }

  ctx.input.newkey = false;
  ctx.input.newmouse = false;

  /* Initialize Level Data and Debug Mode */
  v.levelEnd = 255;
  v.levelEndWarp = -4;
  v.levelEndFxWait = 0;
  v.warningCol = 120;
  v.warningColChange = 1;
  v.warningSoundDelay = 0;
  v.armorShipDelay = 50;

  g.items.bonusLevel = false;
  v.readyToEndLevel = false;
  v.firstGameOver = true;
  g.events.eventLoc = 1;
  g.events.curLoc = 0;
  b.backMove = 1;
  b.backMove2 = 2;
  b.backMove3 = 3;
  v.explodeMove = 2;
  v.enemiesActive = true;
  for (sc.temp = 0; sc.temp < 3; sc.temp++) v.button[sc.temp] = false;
  v.stopBackgrounds = false;
  v.stopBackgroundNum = 0;
  v.background3x1 = false;
  v.background3x1b = false;
  c.background3over = 0;
  c.background2over = 1;
  c.topEnemyOver = false;
  c.skyEnemyOverAll = false;
  v.smallEnemyAdjust = false;
  c.starActive = true;
  v.enemyContinualDamage = false;
  g.events.levelEnemyFrequency = 96;
  v.quitRequested = false;

  for (const bar of g.enemies.bossBar) bar.linkNum = 0;

  v.forceEvents = false; /* Force events to continue if background movement = 0 */

  g.enemies.superEnemy254Jump = 0; /* When Enemy with PL 254 dies */

  /* Filter Status */
  c.filterActive = true;
  c.filterFade = true;
  c.filterFadeStart = false;
  c.levelFilter = -99;
  c.levelBrightness = -14;
  c.levelBrightnessChg = 1;

  c.background2notTransparent = false;

  const loc: LevelLocals = { oldWeaponBar: [0, 0] }; // only redrawn when they change

  /* Initially erase power bars */
  c.lastPower = Math.trunc(c.power / 10);

  /* Initial Text */
  drawTextWindow(ctx, ctx.assets.helpText.miscText[20] ?? '');

  /* Setup Armor/Shield Data */
  c.shieldWait = 1;
  c.shieldT = u8(g.items.shields[p0.items.shield]!.tpwr * 20);

  for (const p of g.players) {
    p.shield = g.items.shields[p.items.shield]!.mpwr;
    p.shieldMax = p.shield * 2;
  }

  drawShield(ctx, seg);
  drawArmor(ctx, seg);

  for (const p of g.players) p.superbombs = 0;

  /* Set cubes to 0 */
  c.cubeMax = 0;

  /* Secret Level Display */
  v.flash = 0;
  v.flashChange = 1;
  v.displayTime = 0;

  ctx.audio.playSong(v.levelSong - 1);

  drawPortConfigButtons(ctx);

  /* --- MAIN LOOP --- */
  ctx.input.newkey = false;

  initializeStarfield(ctx);

  setNewGameSpeed(ctx);

  ctx.audio.setVolume(c.tyrMusicVolume, c.fxVolume);

  // (backup save and record_demo branches are !play_demo only)

  c.twoPlayerLinked = false;
  c.linkGunDirec = f32(Math.PI);

  for (const p of g.players) calcPurpleBallsNeeded(p);

  v.damageRate = 2; /* Normal Rate for Collision Damage */

  v.chargeWait = 5;
  v.chargeLevel = 0;
  v.chargeMax = 5;
  v.chargeGr = 0;
  v.chargeGrWait = 3;

  c.portConfigChange = false;

  /* Destruction Ratio */
  g.enemies.totalEnemy = 0;
  g.enemies.enemyKilled = 0;

  g.playerShots.astralDuration = 0;

  c.superArcadePowerUp = 1;

  v.yourInGameMenuRequest = false;

  v.constantLastX = -1;

  for (const p of g.players) p.explodingTicks = 0;

  resetLevelArrays(g);

  if (c.galagaMode) c.difficultyLevel = DIFFICULTY_NORMAL;
  v.galagaLife = 10000;

  drawOptionLevel(ctx);

  // keeps map from scrolling past the top: BKwrapN = BKwrapNto = &megaDataN.mainmap[1][0]
  g.map.BKwrap1 = g.map.BKwrap1to = MAP1_COLS;
  g.map.BKwrap2 = g.map.BKwrap2to = MAP2_COLS;
  g.map.BKwrap3 = g.map.BKwrap3to = MAP3_COLS;

  return loc;
}

/**
 * Background-2 pass of the level loop (tyrian2.c:1313-1340). `background2over` 0, 1 and 2 pick
 * `if (wild && !background2notTransparent) draw_background_2_blend(...) else draw_background_2(...)`;
 * 3 always draws the plain layer.
 */
export function drawBackground2Layer(ctx: Ctx, over: number): void {
  const c = ctx.game.config;
  if (over !== 3 && c.wild && !c.background2notTransparent) drawBackground2Blend(ctx, ctx.vga.gameScreen);
  else drawBackground2(ctx, ctx.vga.gameScreen);
}

// The sound routine of JE_main (tyrian2.c:2058-2078); clobbers temp/temp2/temp3 like the C
function playSoundQueue(ctx: Ctx): void {
  const g = ctx.game;
  const sc = g.scratch;
  const q = g.varz.soundQueue;
  sc.temp = 0;
  for (sc.temp2 = 0; sc.temp2 < q.length; sc.temp2++) {
    if (q[sc.temp2] !== S_NONE) {
      sc.temp = q[sc.temp2]!;
      if (sc.temp2 === 3) sc.temp3 = g.config.fxPlayVol;
      else if (sc.temp === 15) sc.temp3 = u8(idiv(g.config.fxPlayVol, 4));
      else /* Lightning */ sc.temp3 = u8(idiv(g.config.fxPlayVol, 2));

      ctx.audio.multiSamplePlay(sc.temp - 1, sc.temp2, sc.temp3);
      q[sc.temp2] = S_NONE;
    }
  }
}

/**
 * One iteration of level_loop (tyrian2.c:1088-2396). Returns true for `goto start_level` (reallyEndLevel).
 * Slot order follows survey 6.2; every slot is wired (the demo goldens pin the order).
 */
async function levelFrame(ctx: Ctx, loc: LevelLocals): Promise<boolean> {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const b = g.backgrounds;
  const e = g.events;
  const en = g.enemies;
  const sc = g.scratch;
  const [p0, p1] = g.players;
  const gs = ctx.vga.gameScreen; // VGAScreen = game_screen while drawing (anySmoothies is rejected below)

  // network games: starShowVGASpecialCode = 0 instead (isNetworkGame is never set)
  c.starShowVGASpecialCode = (c.smoothies[9 - 1] ? 1 : 0) + ((c.smoothies[6 - 1] ? 1 : 0) << 1);

  /* Background Wrapping */
  if (b.mapYPos <= g.map.BKwrap1) b.mapYPos = g.map.BKwrap1to;
  if (b.mapY2Pos <= g.map.BKwrap2) b.mapY2Pos = g.map.BKwrap2to;
  if (b.mapY3Pos <= g.map.BKwrap3) b.mapY3Pos = g.map.BKwrap3to;

  v.allPlayersGone = allPlayersDead(g) &&
    ((p0.lives === 1 && p0.explodingTicks === 0) || (!c.onePlayerAction && !c.twoPlayerMode)) &&
    ((p1.lives === 1 && p1.explodingTicks === 0) || !c.twoPlayerMode);

  /*-----MUSIC FADE------*/
  if (v.musicFade) {
    if (c.tempVolume > 10) {
      c.tempVolume--;
      ctx.audio.setVolume(c.tempVolume, c.fxVolume);
    } else {
      v.musicFade = false;
    }
  }

  if (!v.allPlayersGone && v.levelEnd > 0 && v.endLevel) {
    ctx.audio.playSong(9);
    v.musicFade = false;
  } else if (!ctx.audio.playing && v.firstGameOver) {
    ctx.audio.playSong(v.levelSong - 1);
  }

  if (!v.endLevel) { // draw HUD (VGAScreen = VGAScreenSeg)
    drawLevelTopBars(ctx, loc);

    b.oldMapX3Ofs = b.mapX3Ofs;

    en.enemyOnScreen = 0;
  }

  /*---------------------------EVENTS-------------------------*/
  while (e.eventRec[e.eventLoc - 1]!.eventtime <= e.curLoc && e.eventLoc <= e.maxEvent) eventSystem(ctx);

  /* SMOOTHIES! */
  checkSmoothies(ctx);
  if (b.anySmoothies || c.smoothies.some(Boolean)) {
    // VGAScreen = VGAScreen2 and the lava/water/ice/blur filters (tyrian2.c:1275, 1316-1347, 1400-1410)
    throw new Error('unported: smoothie filters (tyrian2.c:1275)'); // TODO(sp4)
  }

  /* --- BACKGROUNDS --- */
  /* --- BACKGROUND 1 --- */
  if (v.forceEvents && !b.backMove) e.curLoc = u16(e.curLoc + 1);

  if (b.map1YDelayMax > 1 && b.backMove < 2) b.backMove = (b.map1YDelay === 1) ? 1 : 0;

  /*Draw background*/
  if (g.playerShots.astralDuration === 0) drawBackground1(ctx, gs);
  else clearSurface(gs);

  /*Set Movement of background 1*/
  advanceBackgrounds(ctx); // tyrian2.c:1286-1303

  if (c.starActive || g.playerShots.astralDuration > 0) updateAndDrawStarfield(ctx, gs, b.starfieldSpeed);

  /*-----------------------BACKGROUND 2------------------------*/
  if (c.background2over === 3) {
    drawBackground2Layer(ctx, 3); // tyrian2.c:1313-1317: always the plain layer, even when `wild`
    c.background2 = true;
  }
  if (c.background2over === 0) drawBackground2Layer(ctx, 0);

  /*-----------------------Ground Enemy------------------------*/
  let lastEnemyOnScreen = en.enemyOnScreen;

  b.tempMapXOfs = b.mapXOfs;
  v.tempBackMove = b.backMove;
  drawEnemy(ctx, 50);
  drawEnemy(ctx, 100);

  if (en.enemyOnScreen === 0 || en.enemyOnScreen === lastEnemyOnScreen) {
    if (v.stopBackgroundNum === 1) v.stopBackgroundNum = 9;
  }

  if (c.superWild) {
    v.neat = u16(v.neat + 3);
    darkenBackground(ctx, v.neat);
  }

  /*-----------------------BACKGROUND 2------------------------*/
  if (c.background2over === 1) drawBackground2Layer(ctx, 1);

  if (c.superWild) {
    v.neat = u16(v.neat + 1);
    darkenBackground(ctx, v.neat);
  }

  if (c.background3over === 2) drawBackground3(ctx, gs);

  /* New Enemy */
  randomEnemySpawn(ctx);

  /* Draw Sky Enemy */
  if (!c.skyEnemyOverAll) {
    lastEnemyOnScreen = en.enemyOnScreen;

    b.tempMapXOfs = b.mapX2Ofs;
    v.tempBackMove = 0;
    drawEnemy(ctx, 25);

    if (en.enemyOnScreen === lastEnemyOnScreen) {
      if (v.stopBackgroundNum === 2) v.stopBackgroundNum = 9;
    }
  }

  if (c.background3over === 0) drawBackground3(ctx, gs);

  /* Draw Top Enemy */
  if (!c.topEnemyOver) {
    b.tempMapXOfs = (!v.background3x1) ? b.oldMapX3Ofs : b.mapXOfs;
    v.tempBackMove = b.backMove3;
    drawEnemy(ctx, 75);
  }

  /* Player Shot Images, enemy collision, last_x/y_shot_move, JE_playerCollide */
  playerShotsPass(ctx);

  if (v.firstGameOver) mainGamePlayerFunctions(ctx);

  if (!v.endLevel) { /* MAIN DRAWING IS STOPPED STARTING HERE */
    updateEnemyShots(ctx);
  }

  if (c.background3over === 1) drawBackground3(ctx, gs);

  /* Draw Top Enemy */
  if (c.topEnemyOver) {
    b.tempMapXOfs = (!v.background3x1) ? b.oldMapX3Ofs : b.oldMapXOfs;
    v.tempBackMove = b.backMove3;
    drawEnemy(ctx, 75);
  }

  /* Draw Sky Enemy */
  if (c.skyEnemyOverAll) {
    lastEnemyOnScreen = en.enemyOnScreen;

    b.tempMapXOfs = b.mapX2Ofs;
    v.tempBackMove = 0;
    drawEnemy(ctx, 25);

    if (en.enemyOnScreen === lastEnemyOnScreen) {
      if (v.stopBackgroundNum === 2) v.stopBackgroundNum = 9;
    }
  }

  /*-------------------------- Sequenced Explosions -------------------------*/
  v.enemyStillExploding = false;
  updateRepeatingExplosions(ctx);

  /*---------------------------- Draw Explosions ----------------------------*/
  drawExplosions(ctx);

  if (!c.portConfigChange) c.portConfigDone = true;

  /*-----------------------BACKGROUND 2------------------------*/
  if (c.background2over === 2) drawBackground2Layer(ctx, 2);

  /*-------------------------Warning---------------------------*/
  drawWarnings(ctx);

  /*------- Random Explosions --------*/
  if (v.randomExplosions) throw new Error('unported: tyrian2.c:2049 random explosions (event 99)'); // TODO(sp4)

  /*=======The Sound Routine=========*/
  if (v.firstGameOver) playSoundQueue(ctx);

  if (e.returnActive && en.enemyOnScreen === 0) {
    eventJump(ctx, 65535);
    e.returnActive = false;
  }

  /*-------      DEbug      ---------*/
  // debugTime = SDL_GetTicks() is debug-only state; `tempW = lastmouse_but` clobbers the scratch global every frame
  sc.tempW = u16(ctx.input.lastmouseBut);
  // (the `if (debug)` text block is never taken)

  drawTimers(ctx);

  if (ctx.state.playDemo) { // input kills demo
    ctx.input.serviceEvents(false);
    if (ctx.input.newkey || ctx.input.newmouse) {
      v.reallyEndLevel = true;
      g.demo.stoppedDemo = true;
    }
  } else {
    throw new Error('unported: tyrian2.c:2213 in-level keyboard/pause/menu input (non-demo)'); // TODO(sp4)
  }

  /** Test **/
  drawSP(ctx);

  /*Filtration*/
  if (c.filterActive) filterScreen(ctx, c.levelFilter, c.levelBrightness);

  drawBossBar(ctx);

  inGameDisplays(ctx);

  // VGAScreen = VGAScreenSeg
  await starShowVGA(ctx);

  /*Start backgrounds if no enemies on screen
    End level if number of enemies left to kill equals 0.*/
  if (v.stopBackgroundNum === 9 && b.backMove === 0 && !v.enemyStillExploding) {
    b.backMove = 1;
    b.backMove2 = 2;
    b.backMove3 = 3;
    v.explodeMove = 2;
    v.stopBackgroundNum = 0;
    v.stopBackgrounds = false;
    if (v.waitToEndLevel) {
      v.endLevel = true;
      v.levelEnd = 40;
    }
    if (v.allPlayersGone) v.reallyEndLevel = true;
  }

  if (!v.endLevel && en.enemyOnScreen === 0) {
    if (v.readyToEndLevel && !v.enemyStillExploding) {
      if (v.levelTimerCountdown > 0) v.levelTimer = false;
      v.readyToEndLevel = false;
      v.endLevel = true;
      v.levelEnd = 40;
      if (v.allPlayersGone) v.reallyEndLevel = true;
    }
    if (v.stopBackgrounds) {
      v.stopBackgrounds = false;
      b.backMove = 1;
      b.backMove2 = 2;
      b.backMove3 = 3;
      v.explodeMove = 2;
    }
  }

  // (JE_handleChat: network only)
  return v.reallyEndLevel;
}

// port of JE_main (tyrian2.c:621), demo path: start_level_first -> level_loop -> start_level -> return.
// The non-demo paths (episode scripts, saves, menus, keyboard/mouse control) are sub-project 4.
export async function runLevel(ctx: Ctx): Promise<void> {
  const g = ctx.game;
  if (!ctx.state.playDemo) throw new Error('unported: tyrian2.c JE_main non-demo path'); // TODO(sp4)
  if (g.config.twoPlayerMode || g.config.galagaMode) throw new Error('unported: two-player/galaga level'); // TODO(sp4)

  const loc = await levelSetup(ctx);
  if (loc === null) return;

  while (!(await levelFrame(ctx, loc))) { /* level_loop */ }

  // start_level:
  const c = g.config;
  // (mouseSetRelative(false); `if (galagaMode) twoPlayerMode = false` cannot apply: galaga is rejected above)
  // JE_clearKeyboard() is a no-op in the C
  g.sprites.enemySpriteSheets.fill(null); // free_sprite2s(&enemySpriteSheets[0..3])

  /* Normal speed */
  if (c.fastPlay !== 0) {
    c.smoothScroll = true;
    ctx.delay.setDelaySpeed(0x4300);
  }

  // play_demo: demo_file closed
  g.demo.demoFile = null;
  ctx.state.moveTyrianLogoUp = true;
  ctx.audio.stopSong();
  await fadeBlack(ctx, 10);

  await waitNoInput(ctx, true, true, true);

  c.difficultyLevel = c.oldDifficultyLevel; /* Return difficulty to normal */

  // if (play_demo) return;
}
