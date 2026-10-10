// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/config.c (JE_loadConfiguration defaults, JE_initProcessorType, JE_setNewGameSpeed),
//   src/mainint.c (JE_initPlayerData)
import type { Ctx } from '../ctx';
import { u8 } from '../core/int';
import { STORAGE_KEYS } from '../platform/storage';
import {
  backupCorruptSav, parseCfg, parseOpentyrianConfig, parseSav, readStoredCfg, readStoredSav,
} from './save';
import { plainSav, snapshotPlain } from './save-sync';
import {
  defaultDosKeySettings, FIRST_LEVEL, FRONT_WEAPON, initialItemAvail, REAR_WEAPON, SA_NONE, SAVE_FILES_SIZE,
  type ConfigGroup,
} from './world';

// port of JE_initProcessorType (config.c:511)
export function initProcessorType(ctx: Ctx): void {
  const c = ctx.game.config;
  /* SYN: Originally this proc looked at your hardware specs and chose appropriate options. We don't care, so I'll just set
     decent defaults here. */
  c.wild = false;
  c.superWild = false;
  c.smoothScroll = true;
  c.explosionTransparent = true;
  c.filtrationAvail = false;
  c.background2 = true;
  c.displayScore = true;

  switch (c.processorType) {
    case 1: /* 386 */
      c.background2 = false;
      c.displayScore = false;
      c.explosionTransparent = false;
      break;
    case 2: /* 486 - Default */
      break;
    case 3: /* High Detail */
      c.smoothScroll = false;
      break;
    case 4: /* Pentium */
      c.wild = true;
      c.filtrationAvail = true;
      break;
    case 5: /* Nonstandard VGA */
      c.smoothScroll = false;
      break;
    case 6: /* SuperWild */
      c.wild = true;
      c.superWild = true;
      c.filtrationAvail = true;
      break;
  }

  switch (c.gameSpeed) {
    case 1: c.fastPlay = 3; break; /* Slug Mode */
    case 2: c.fastPlay = 4; break; /* Slower */
    case 3: c.fastPlay = 5; break; /* Slow */
    case 4: c.fastPlay = 0; break; /* Normal */
    case 5: c.fastPlay = 1; break; /* Pentium Hyper */
  }
}

// port of JE_setNewGameSpeed (config.c:571)
export function setNewGameSpeed(ctx: Ctx): void {
  const c = ctx.game.config;
  c.pentiumMode = false;

  let speed: number;
  switch (c.fastPlay) {
    default:
      throw new Error(`setNewGameSpeed: invalid fastPlay ${c.fastPlay} (C: assert(false))`);
    case 0: /* Normal */
      speed = 0x4300; c.smoothScroll = true; c.frameCountMax = 2;
      break;
    case 1: /* Pentium Hyper */
      speed = 0x3000; c.smoothScroll = true; c.frameCountMax = 2;
      break;
    case 2:
      speed = 0x2000; c.smoothScroll = false; c.frameCountMax = 2;
      break;
    case 3: /* Slug mode */
      speed = 0x5300; c.smoothScroll = true; c.frameCountMax = 4;
      break;
    case 4: /* Slower */
      speed = 0x4300; c.smoothScroll = true; c.frameCountMax = 3;
      break;
    case 5: /* Slow */
      speed = 0x4300; c.smoothScroll = true; c.frameCountMax = 2; c.pentiumMode = true;
      break;
  }

  ctx.delay.setDelaySpeed(speed);
  ctx.delay.setDelay(c.frameCountMax);
}

function applyCfgDefaults(c: ConfigGroup): void {
  c.soundEffects = 1;
  c.dosKeySettings.set(defaultDosKeySettings);
  c.background2 = true;
  c.tyrMusicVolume = 191;
  c.fxVolume = 191;
  c.gammaCorrection = 0;
  c.processorType = 3;
  c.gameSpeed = 4;
  c.versionNum = 3;
}

/** The "We didn't have a save file! Let's make up random stuff!" branch (config.c:955-996): 174 mt_rand draws. */
function makeUpSaveDefaults(ctx: Ctx): void {
  const c = ctx.game.config;
  const rng = ctx.rng;
  const names = ctx.assets.helpText.defaultHighScoreNames;
  const teams = ctx.assets.helpText.defaultTeamNames;

  c.editorLevel = 800;
  for (let z = 0; z < 100; z++) c.saveTemp[SAVE_FILES_SIZE + z] = initialItemAvail[z]!;

  for (let z = 0; z < c.saveFiles.length; z++) {
    const sf = c.saveFiles[z]!;
    sf.level = 0;
    sf.name.fill(0, 0, 15);
    sf.name.fill(0x20, 0, 14); // 14 spaces, NUL at [14]
    sf.highScore1 = ((rng.rand() % 20) + 1) * 1000;
    if (z % 6 > 2) {
      sf.highScore2 = ((rng.rand() % 20) + 1) * 1000;
      sf.highScoreName = teams[rng.rand() % 10] ?? '';
    } else {
      sf.highScoreName = names[rng.rand() % 39] ?? '';
    }
  }

  for (let z = 0; z < 10; ++z) {
    for (let y = 0; y < 3; ++y) {
      // Timed Battle scores
      const e = c.t2kHighScores[z]![y]!;
      e.score = ((rng.rand() % 50) + 1) * 100;
      e.playerName = names[rng.rand() % 39] ?? '';
    }
  }
  for (let z = 10; z < 20; ++z) {
    for (let y = 0; y < 3; ++y) {
      // Main Game scores
      const e = c.t2kHighScores[z]![y]!;
      e.score = ((rng.rand() % 20) + 1) * 1000;
      if (z & 1) e.playerName = teams[rng.rand() % 10] ?? '';
      else e.playerName = names[rng.rand() % 39] ?? '';
    }
  }
}

/** Clamp volumes and push them to the mixer (config.c:821-827). */
function applyVolumes(ctx: Ctx): void {
  const c = ctx.game.config;
  if (c.tyrMusicVolume > 255) c.tyrMusicVolume = 255;
  if (c.fxVolume > 255) c.fxVolume = 255;
  ctx.audio.setVolume(c.tyrMusicVolume, c.fxVolume); // set_volume()
}

/** Web only: the stored scaling mode reaches the live display state and the page. */
function syncDisplay(ctx: Ctx): void {
  ctx.display.scalingMode = ctx.game.config.scalingMode;
  ctx.display.onScalingChange?.(ctx.display.scalingMode);
}

/**
 * The no-tyrian.cfg / no-opentyrian.cfg / no-tyrian.sav path of JE_loadConfiguration (config.c:777),
 * ignoring storage. Reproduces the 174 mt_rand() draws of the made-up high-score tables.
 */
export function loadConfigurationDefaults(ctx: Ctx): void {
  const c = ctx.game.config;
  applyCfgDefaults(c);
  parseOpentyrianConfig(c, null); // load_opentyrian_config defaults
  syncDisplay(ctx);
  applyVolumes(ctx);
  makeUpSaveDefaults(ctx);
  initProcessorType(ctx);
  c.configurationLoaded = true;
}

/**
 * port of JE_loadConfiguration (config.c:777): tyrian.cfg, opentyrian.cfg and tyrian.sav from
 * ctx.storage. The 174 RNG draws happen only when no usable save is stored. A corrupt or foreign
 * save (the C exit(255)s) is kept under a backup key, a warning is logged and the defaults are used.
 */
export function loadConfiguration(ctx: Ctx): void {
  const c = ctx.game.config;

  const cfg = readStoredCfg(ctx);
  if (!(cfg && parseCfg(c, cfg))) {
    if (cfg) console.warn('opentyrian: invalid tyrian.cfg in storage; continuing using defaults');
    applyCfgDefaults(c);
  }

  parseOpentyrianConfig(c, ctx.storage.get(STORAGE_KEYS.opentyrianCfg));
  syncDisplay(ctx);
  applyVolumes(ctx);

  const sav = readStoredSav(ctx);
  let loaded = false;
  if (sav) {
    const errs = parseSav(c, sav);
    if (errs.length === 0) { loaded = true; ctx.saveSync.baseline = plainSav(sav); }
    else {
      const backup = backupCorruptSav(ctx, ctx.storage.get(STORAGE_KEYS.sav) ?? '');
      console.warn(`opentyrian: stored tyrian.sav is invalid (${errs.join('; ')}); kept a copy as "${backup}" and using defaults`);
    }
  }
  if (!loaded) {
    makeUpSaveDefaults(ctx);
    // boot sorts the high scores right after loading (idempotent, no RNG); the baseline must be the sorted
    // state or the tail would look locally edited and never take another tab's scores
    sortHighScores(ctx);
    const keep = c.saveTemp.slice(); // the snapshot packs saveTemp; a fresh load must not show that yet
    ctx.saveSync.baseline = snapshotPlain(c);
    c.saveTemp.set(keep);
  }

  initProcessorType(ctx);
  c.configurationLoaded = true;
}

// port of JE_sortHighScores (mainint.c:1092): bubble the 3 entries of each table into descending order
export function sortHighScores(ctx: Ctx): void {
  const t = ctx.game.config.t2kHighScores;
  for (let table = 0; table < 20; ++table) {
    const e = t[table]!;
    if (e[1]!.score > e[0]!.score) { const x = e[0]!; e[0] = e[1]!; e[1] = x; }
    if (e[2]!.score > e[1]!.score) { const x = e[1]!; e[1] = e[2]!; e[2] = x; }
    if (e[1]!.score > e[0]!.score) { const x = e[0]!; e[0] = e[1]!; e[1] = x; }
  }
}

// port of JE_initPlayerData (mainint.c:1042)
export function initPlayerData(ctx: Ctx): void {
  const g = ctx.game;
  const c = g.config;
  const [p0, p1] = g.players;

  /* JE: New Game Items/Data */
  p0.items.ship = 1;                              // USP Talon
  p0.items.weapon[FRONT_WEAPON].id = 1;           // Pulse Cannon
  p0.items.weapon[REAR_WEAPON].id = 0;            // None
  p0.items.shield = 4;                            // Gencore High Energy Shield
  p0.items.generator = 2;                         // Advanced MR-12
  for (let i = 0; i < 2; ++i) p0.items.sidekick[i] = 0; // None
  p0.items.special = 0;                           // None

  p0.lastItems.copyFrom(p0.items);

  p1.items.copyFrom(p0.items);
  p1.items.weapon[REAR_WEAPON].id = 15;           // Vulcan Cannon
  p1.items.sidekickLevel = 101;                   // 101, 102, 103
  p1.items.sidekickSeries = 0;                    // None

  c.gameHasRepeated = false;
  c.onePlayerAction = false;
  c.superArcadeMode = SA_NONE;
  c.superTyrian = false;
  c.twoPlayerMode = false;
  c.timedBattleMode = false;

  c.secretHint = u8((ctx.rng.rand() % 3) + 1);

  for (let p = 0; p < 2; ++p) {
    const pl = g.players[p]!;
    for (let i = 0; i < 2; ++i) pl.items.weapon[i]!.power = 1;

    pl.weaponMode = 1;
    pl.armor = g.items.ships[pl.items.ship]!.dmg;

    pl.isDragonwing = p === 1;
    pl.livesIndex = p; // player[p].lives = &player[p].items.weapon[p].power (mainint.c:1082)
  }

  c.mainLevel = FIRST_LEVEL;
  c.saveLevel = FIRST_LEVEL;

  c.lastLevelName = ctx.assets.helpText.miscText[19] ?? '';
}
