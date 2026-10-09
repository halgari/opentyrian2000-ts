// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/config.c (JE_loadConfiguration defaults, JE_initProcessorType, JE_setNewGameSpeed),
//   src/mainint.c (JE_initPlayerData)
import type { Ctx } from '../ctx';
import { u8 } from '../core/int';
import { defaultDosKeySettings, defaultKeySettings, defaultMouseSettings, FIRST_LEVEL, FRONT_WEAPON, REAR_WEAPON, SA_NONE } from './world';

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

/**
 * port of JE_loadConfiguration (config.c:777), the "no tyrian.cfg / no tyrian.sav" branch only.
 * Browser builds have no user directory, so the file branches are never taken. This reproduces
 * the 174 mt_rand() draws that make up the made-up high-score tables (config.c:965-996).
 * Also folds in load_opentyrian_config's defaults (config.c:213) that touch gameplay-visible state.
 */
export function loadConfigurationDefaults(ctx: Ctx): void {
  const g = ctx.game;
  const c = g.config;
  const rng = ctx.rng;
  const names = ctx.assets.helpText.defaultHighScoreNames;
  const teams = ctx.assets.helpText.defaultTeamNames;

  c.soundEffects = 1;
  c.dosKeySettings.set(defaultDosKeySettings);
  c.background2 = true;
  c.tyrMusicVolume = 191;
  c.fxVolume = 191;
  c.gammaCorrection = 0;
  c.processorType = 3;
  c.gameSpeed = 4;
  c.versionNum = 3;

  // load_opentyrian_config: defaults (opentyrian.cfg is absent)
  c.keySettings.set(defaultKeySettings);
  c.mouseSettings.set(defaultMouseSettings);

  if (c.tyrMusicVolume > 255) c.tyrMusicVolume = 255;
  if (c.fxVolume > 255) c.fxVolume = 255;
  ctx.audio.setVolume(c.tyrMusicVolume, c.fxVolume); // set_volume()

  // No save file: make up random stuff
  c.editorLevel = 800;
  // (saveTemp[SAVE_FILES_SIZE + z] = initialItemAvail[z] seeds the shop item table; the shop is sub-project 4.)

  for (let z = 0; z < c.saveFiles.length; z++) {
    const sf = c.saveFiles[z]!;
    sf.level = 0;
    sf.name = ' '.repeat(14);
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

  initProcessorType(ctx);
}

// JE_sortHighScores (mainint.c:1092) is not ported: it only reorders the made-up high-score
// tables, draws no RNG, and nothing in the demo path reads them (SP4: high-score screens).

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
