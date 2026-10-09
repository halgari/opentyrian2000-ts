// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c
import { DemoReader, parseDemo } from '../data/demo-file';
import type { Ctx } from '../ctx';
import { initEpisode } from './episodes';
import { DIFFICULTY_NORMAL, FRONT_WEAPON, REAR_WEAPON } from './world';

/** Bytes up to the first NUL, as a string (a C char[] read by JE_outText). */
function cString(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    if (b === 0) break;
    s += String.fromCharCode(b);
  }
  return s;
}

// port of load_next_demo (mainint.c): picks demo.N (cycling 1..5) and applies its header to the world.
export function loadNextDemo(ctx: Ctx): boolean {
  const g = ctx.game;
  if (++g.demo.demoNum > 5) g.demo.demoNum = 1; // Uint8 demo_num
  const d = parseDemo(ctx.assets.archive.get(`demo.${g.demo.demoNum}`));

  g.config.difficultyLevel = DIFFICULTY_NORMAL;
  g.varz.bonusLevelCurrent = false;

  initEpisode(ctx, d.episode);

  g.config.levelName = cString(d.levelName); // fread 10 bytes, levelName[10] = '\0'
  g.varz.lvlFileNum = d.lvlFileNum;

  const items = g.players[0].items;
  items.weapon[FRONT_WEAPON].id = d.frontWeaponId;
  items.weapon[REAR_WEAPON].id = d.rearWeaponId;
  items.superArcadeMode = d.superArcadeMode;
  items.sidekick[0] = d.leftSidekick;
  items.sidekick[1] = d.rightSidekick;
  items.generator = d.generator;
  items.sidekickLevel = d.sidekickLevel;
  items.sidekickSeries = d.sidekickSeries;
  g.items.initialEpisodeNum = d.initialEpisodeNum;
  items.shield = d.shield;
  items.special = d.special;
  items.ship = d.ship;
  items.weapon[FRONT_WEAPON].power = d.frontWeaponPower;
  items.weapon[REAR_WEAPON].power = d.rearWeaponPower;
  g.varz.levelSong = d.levelSong;

  g.demo.demoKeys = 0;
  g.demo.demoKeysWait = d.initialWait;
  g.demo.demoFile = new DemoReader(d);
  return true;
}

// port of replay_demo_keys (mainint.c): one call per frame. Returns false at the end of the demo.
// The demo_keys_wait countdown lives inside the DemoReader; demoKeys is mirrored into the world.
export function replayDemoKeys(ctx: Ctx): boolean {
  const g = ctx.game;
  const reader = g.demo.demoFile as DemoReader;
  const r = reader.next();
  if (!r) {
    g.demo.demoKeys = 0;
    return false;
  }
  const keys = g.demo.demoKeys = r.keys;
  const p = g.players[0];
  if (keys & (1 << 0)) p.y -= 1; // CURRENT_KEY_SPEED
  if (keys & (1 << 1)) p.y += 1;
  if (keys & (1 << 2)) p.x -= 1;
  if (keys & (1 << 3)) p.x += 1;
  const b = g.varz.button;
  b[0] = (keys & (1 << 4)) !== 0;
  b[3] = (keys & (1 << 5)) !== 0;
  b[1] = (keys & (1 << 6)) !== 0;
  b[2] = (keys & (1 << 7)) !== 0;
  return true;
}
