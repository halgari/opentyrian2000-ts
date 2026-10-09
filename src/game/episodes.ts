// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/episodes.c
import { BinaryReader } from '../core/binary-reader';
import type { Ctx } from '../ctx';
import { analyzeLevel } from '../data/level';
import { loadItemDat } from '../data/itemdat';

// port of JE_loadItemDat (episodes.c): reads tyrian.hdt into the item globals.
// Only the episode <= 3 path exists (episode 4 reads the level file; see loadItemDat).
export function loadItemDatIntoWorld(ctx: Ctx): void {
  const g = ctx.game;
  const hdt = ctx.assets.archive.get('tyrian.hdt');
  const d = loadItemDat(hdt, g.items.episodeNum);
  g.items.episode1DataLoc = new BinaryReader(hdt).s32();
  g.items.weapons = d.weapons;
  g.items.weaponPort = d.weaponPorts;
  g.items.special = d.specials;
  g.items.powerSys = d.powerSys;
  g.items.ships = d.ships;
  g.items.options = d.options;
  g.items.shields = d.shields;
  g.items.enemyDat = d.enemyDat;
}

/** The current episode's level file name (C: levelFile, set by JE_initEpisode). */
export const levelFileName = (episodeNum: number): string => `tyrian${episodeNum}.lvl`;

// port of JE_initEpisode (episodes.c)
export function initEpisode(ctx: Ctx, newEpisode: number): void {
  const items = ctx.game.items;
  if (newEpisode === items.episodeNum) return;

  items.episodeNum = newEpisode & 0xff;
  items.episodeFile = `levels${items.episodeNum}.dat`;
  items.cubeFile = `cubetxt${items.episodeNum}.dat`;

  // JE_analyzeLevel: lvlNum/lvlPos are derived from the file on demand (levelLoader), not cached globally.
  analyzeLevel(ctx.assets.archive.get(levelFileName(items.episodeNum)));
  loadItemDatIntoWorld(ctx);
}
