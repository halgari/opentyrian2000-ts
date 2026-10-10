// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/ts-save.ts
// Writes test-data/ts-save/tyrian.sav: a save file produced by the TS port (three used slots on the one-player page, one on the
// two-player page is left empty), the HOME seed of the `ts-save-load` oracle scenario (the C loads a TS-written save).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAssets } from '../../src/assets';
import { createCtx, type Ctx } from '../../src/ctx';
import { DataArchive } from '../../src/data/archive';
import { initPlayerData, loadConfigurationDefaults, sortHighScores } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { saveGame, serializeSav } from '../../src/game/save';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const TS_SAVE_REL = 'test-data/ts-save/tyrian.sav';

/** A fresh context with default configuration and player data (deterministic: seed 1, no storage), the base of every seed save. */
export function seedCtx(): Ctx {
  const dir = join(ROOT, 'data/tyrian2000');
  const files = new Map<string, Uint8Array>();
  for (const name of readdirSync(dir)) files.set(name, new Uint8Array(readFileSync(join(dir, name))));
  const ctx = createCtx({ assets: loadAssets(new DataArchive(files)), clock: new VirtualClock(), presenter: new NullPresenter(), versionString: 'oracle', seed: 1 });
  loadConfigurationDefaults(ctx);
  initPlayerData(ctx);
  sortHighScores(ctx);
  return ctx;
}

/** The bytes the TS port writes for the three saves below (deterministic: seed 1, no storage). */
export function buildTsSave(): Uint8Array {
  const ctx = seedCtx();
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

export const EPISODE_END_SAVE_REL = 'test-data/ts-save/episode-end.sav';

/**
 * A save with the player standing at the last script section of an episode (the `]Q` section): slot 1 is episode 1 (section 26,
 * started there, so the episode-end high score applies), slot 2 is episode 5 (section 19) of a game started in episode 1 (no high
 * score check; the next episode wraps to 1: credits and the SuperCarrot roll), slot 3 is episode 2 (section 13).
 */
export function buildEpisodeEndSave(): Uint8Array {
  const ctx = seedCtx();
  const g = ctx.game, c = g.config;
  const slot = (n: number, name: string, episode: number, initial: number, level: number, cash: number): void => {
    initEpisode(ctx, episode);
    g.items.initialEpisodeNum = initial;
    g.players[0].cash = cash;
    c.difficultyLevel = 2; c.initialDifficulty = 2;
    c.saveLevel = level; c.lastLevelName = 'GAME END'; c.lastCubeMax = 2;
    saveGame(ctx, n, name);
  };
  slot(1, 'EPISODE ONE END', 1, 1, 26, 54321);
  slot(2, 'EPISODE FIVE END', 5, 1, 19, 98765);
  slot(3, 'EPISODE TWO END', 2, 2, 13, 4321);
  return serializeSav(c);
}

export type SeedMode = 'normal' | 'superTyrian' | { arcade: number } | 'twoPlayer' | 'galaga';
export interface SeedSlot {
  slot: number; name: string; episode: number; initialEpisode?: number; level: number; levelName?: string;
  cash?: number; difficulty?: number; mode?: SeedMode; mutate?: (ctx: Ctx) => void;
}
/** One tyrian.sav holding `slots`; every other slot stays empty. */
export function buildSeedSave(slots: SeedSlot[]): Uint8Array {
  const ctx = seedCtx();
  const g = ctx.game, c = g.config;
  for (const s of slots) {
    initPlayerData(ctx); // every slot starts from the new-game items; `mutate` changes them
    initEpisode(ctx, s.episode);
    g.items.initialEpisodeNum = s.initialEpisode ?? s.episode;
    g.players[0].cash = s.cash ?? 0;
    c.difficultyLevel = s.difficulty ?? 2; c.initialDifficulty = c.difficultyLevel;
    c.saveLevel = s.level; c.lastLevelName = s.levelName ?? 'SEED'; c.lastCubeMax = 2;
    c.superTyrian = s.mode === 'superTyrian';
    c.onePlayerAction = s.mode === 'superTyrian' || typeof s.mode === 'object';
    c.superArcadeMode = typeof s.mode === 'object' ? s.mode.arcade : 0;
    c.twoPlayerMode = s.mode === 'twoPlayer';
    s.mutate?.(ctx);
    saveGame(ctx, s.slot, s.name);
  }
  return serializeSav(c);
}
/** Seeds by repo-relative path: the scenario's `homeSeed` is the key, and the golden test reads the same builder. */
export const SEEDS: Record<string, () => Uint8Array> = {};
export const seedRel = (name: string): string => `test-data/ts-save/${name}.sav`;
export const defineSeed = (name: string, slots: SeedSlot[]): void => { SEEDS[seedRel(name)] = () => buildSeedSave(slots); };
SEEDS[TS_SAVE_REL] = buildTsSave;
SEEDS[EPISODE_END_SAVE_REL] = buildEpisodeEndSave;

if (process.argv[1]?.endsWith('ts-save.ts')) {
  mkdirSync(join(ROOT, 'test-data/ts-save'), { recursive: true });
  writeFileSync(join(ROOT, EPISODE_END_SAVE_REL), buildEpisodeEndSave());
  const out = join(ROOT, TS_SAVE_REL);
  writeFileSync(out, buildTsSave());
  console.log(`wrote ${out} and ${EPISODE_END_SAVE_REL}`);
}
