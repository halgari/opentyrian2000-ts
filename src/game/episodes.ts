// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/episodes.c
import { BinaryReader } from '../core/binary-reader';
import type { Ctx } from '../ctx';
import { analyzeLevel } from '../data/level';
import { loadItemDat, type ItemDat } from '../data/itemdat';
import { EPISODE_MAX } from './world';

// port of JE_loadItemDat (episodes.c): reads the item tables for g.items.episodeNum.
// Episodes <= 3 read tyrian.hdt at episode1DataLoc; episode 4/5 read tyrianN.lvl at lvlPos[lvlNum-1].
export function loadItemDatIntoWorld(ctx: Ctx): void {
  const g = ctx.game;
  const it = g.items;
  let d: ItemDat;
  if (it.episodeNum <= 3) {
    const hdt = ctx.assets.archive.get('tyrian.hdt');
    it.episode1DataLoc = new BinaryReader(hdt).s32();
    d = loadItemDat(hdt, it.episode1DataLoc);
  } else {
    // episode 4 stores item data in the level file
    d = loadItemDat(ctx.assets.archive.get(levelFileName(it.episodeNum)), it.lvlPos[it.lvlNum - 1]!);
  }
  it.weapons = d.weapons;
  it.weaponPort = d.weaponPorts;
  it.special = d.specials;
  it.powerSys = d.powerSys;
  it.ships = d.ships;
  it.options = d.options;
  it.shields = d.shields;
  it.enemyDat = d.enemyDat;
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

  // JE_analyzeLevel: lvlNum/lvlPos live on the world (episode 4/5 item data needs them)
  const { lvlNum, lvlPos } = analyzeLevel(ctx.assets.archive.get(levelFileName(items.episodeNum)));
  items.lvlNum = lvlNum;
  items.lvlPos = lvlPos;
  loadItemDatIntoWorld(ctx);
}

// port of JE_scanForEpisodes (episodes.c)
export function scanForEpisodes(ctx: Ctx): void {
  const avail = ctx.game.items.episodeAvail;
  for (let i = 0; i < EPISODE_MAX; i++) avail[i] = ctx.assets.archive.has(levelFileName(i + 1));
}

// port of JE_findNextEpisode (episodes.c)
export function findNextEpisode(ctx: Ctx): number {
  const g = ctx.game;
  const items = g.items;
  let newEpisode = items.episodeNum;
  items.jumpBackToEpisode1 = false;
  for (;;) {
    newEpisode++;
    if (newEpisode > EPISODE_MAX) {
      newEpisode = 1;
      items.jumpBackToEpisode1 = true;
      g.config.gameHasRepeated = true;
    }
    if (items.episodeAvail[newEpisode - 1] || newEpisode === items.episodeNum) break;
  }
  return newEpisode;
}
