// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/ts-save.ts
// Writes test-data/ts-save/tyrian.sav: a save file produced by the TS port (three used slots on the one-player page, one on the
// two-player page is left empty), the HOME seed of the `ts-save-load` oracle scenario (the C loads a TS-written save).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAssets } from '../../src/assets';
import { createCtx } from '../../src/ctx';
import { DataArchive } from '../../src/data/archive';
import { initPlayerData, loadConfigurationDefaults, sortHighScores } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { saveGame, serializeSav } from '../../src/game/save';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const TS_SAVE_REL = 'test-data/ts-save/tyrian.sav';

/** The bytes the TS port writes for the three saves below (deterministic: seed 1, no storage). */
export function buildTsSave(): Uint8Array {
  const dir = join(ROOT, 'data/tyrian2000');
  const files = new Map<string, Uint8Array>();
  for (const name of readdirSync(dir)) files.set(name, new Uint8Array(readFileSync(join(dir, name))));
  const ctx = createCtx({ assets: loadAssets(new DataArchive(files)), clock: new VirtualClock(), presenter: new NullPresenter(), versionString: 'oracle', seed: 1 });
  loadConfigurationDefaults(ctx);
  initPlayerData(ctx);
  sortHighScores(ctx);
  const g = ctx.game, c = g.config;

  const slot = (n: number, name: string, episode: number, level: number, levelName: string, cash: number, diff: number): void => {
    initEpisode(ctx, episode);
    g.items.initialEpisodeNum = episode;
    g.players[0].cash = cash;
    c.difficultyLevel = diff; c.initialDifficulty = diff;
    c.saveLevel = level; c.lastLevelName = levelName; c.lastCubeMax = 2;
    saveGame(ctx, n, name);
  };
  slot(1, 'TS SAVE ONE', 1, 3, 'TYRIAN', 12345, 2);
  slot(2, 'SECOND SLOT', 2, 5, 'SAVARA', 23456, 3);
  slot(3, 'THIRD ONE', 3, 9, 'DELIANI', 34567, 1);
  return serializeSav(c);
}

if (process.argv[1]?.endsWith('ts-save.ts')) {
  const out = join(ROOT, TS_SAVE_REL);
  mkdirSync(join(ROOT, 'test-data/ts-save'), { recursive: true });
  writeFileSync(out, buildTsSave());
  console.log(`wrote ${out}`);
}
