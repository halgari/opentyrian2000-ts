// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initPlayerData, loadConfiguration, sortHighScores } from '../../src/game/config';
import {
  CFG_FILE_SIZE, SAV_FILE_SIZE, backupCorruptSav, decryptSaveTemp, encryptSaveTemp, loadGame, parseCfg,
  parseOpentyrianConfig, parseSav, saveConfiguration, saveGame, saveName, serializeCfg, serializeSav,
} from '../../src/game/save';
import { SIZEOF_SAVEGAMETEMP, createGameWorld } from '../../src/game/world';
import {
  STORAGE_KEYS, base64ToBytes, bytesToBase64, localStorageAdapter, memoryAdapter, type StorageLike,
} from '../../src/platform/storage';
import { createCtx } from '../../src/ctx';
import { loadAssets } from '../../src/assets';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import { describeData, testArchive } from '../helpers/data';

afterEach(() => vi.restoreAllMocks());

const mkCtx = (storage = memoryAdapter(), seed = 1) =>
  createCtx({ assets: loadAssets(testArchive!), clock: new VirtualClock(), presenter: new NullPresenter(), versionString: 'oracle', seed, storage });

function randomSaveTemp(): Uint8Array {
  const b = new Uint8Array(SIZEOF_SAVEGAMETEMP);
  let s = 12345;
  for (let i = 0; i < 2498; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; b[i] = s >>> 24; }
  return b;
}

describe('save encryption (config.c:618-737)', () => {
  it('round-trips', () => {
    const plain = randomSaveTemp();
    const b = plain.slice();
    encryptSaveTemp(b);
    expect(b.subarray(0, 2498)).not.toEqual(plain.subarray(0, 2498));
    expect(decryptSaveTemp(b)).toEqual([]);
    expect(b.subarray(0, 2498)).toEqual(plain.subarray(0, 2498));
  });

  it('reports every failing checksum and leaves the buffer untouched on corruption', () => {
    const b = randomSaveTemp();
    encryptSaveTemp(b);
    b[100] ^= 0x55;
    const before = b.slice();
    const errs = decryptSaveTemp(b);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join()).toMatch(/additive/);
    expect(b).toEqual(before);
  });

  it('detects a tampered checksum byte', () => {
    const b = randomSaveTemp();
    encryptSaveTemp(b);
    b[2498] ^= 1;
    expect(decryptSaveTemp(b).length).toBe(1);
  });
});

describe('tyrian.cfg (28 bytes)', () => {
  it('round-trips', () => {
    const c = createGameWorld().config;
    c.background2 = true; c.gameSpeed = 4; c.versionNum = 3; c.processorType = 3; c.soundEffects = 1;
    c.difficultyLevel = -2; c.tyrMusicVolume = 300; c.fxVolume = 191; c.inputDevice[1] = 7;
    c.dosKeySettings.set([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = serializeCfg(c);
    expect(b.length).toBe(CFG_FILE_SIZE);
    expect(b[9]).toBe(0xfe);
    const c2 = createGameWorld().config;
    expect(parseCfg(c2, b)).toBe(true);
    expect(serializeCfg(c2)).toEqual(b);
    expect(c2.difficultyLevel).toBe(-2);
    expect(c2.tyrMusicVolume).toBe(300);
  });
  it('rejects wrong size or a non-bool first byte', () => {
    const c = createGameWorld().config;
    expect(parseCfg(c, new Uint8Array(27))).toBe(false);
    const b = new Uint8Array(28); b[0] = 2;
    expect(parseCfg(c, b)).toBe(false);
  });
});

describe('opentyrian.cfg JSON', () => {
  it('overrides valid entries only; garbage falls back to defaults', () => {
    const c = createGameWorld().config;
    parseOpentyrianConfig(c, JSON.stringify({ keySettings: [4, 'x', 0, 7, 8, 9, 10, 11], mouseSettings: [2, 9, 3] }));
    expect(Array.from(c.keySettings)).toEqual([4, 81, 80, 7, 8, 9, 10, 11]);
    expect(Array.from(c.mouseSettings)).toEqual([2, 4, 3]);
    parseOpentyrianConfig(c, '{not json');
    expect(Array.from(c.keySettings)).toEqual([82, 81, 80, 79, 44, 40, 224, 226]);
  });
});

describe('storage adapters (Review Focus 5)', () => {
  it('base64 helpers', () => {
    const b = Uint8Array.of(0, 255, 7, 128);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
    expect(base64ToBytes('***')).toBeNull();
  });

  it('localStorage that throws on access falls back to memory with one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = localStorageAdapter(() => { throw new Error('SecurityError'); });
    expect(a.persistent).toBe(false);
    expect(a.set('k', 'v')).toBe(false);
    expect(a.get('k')).toBe('v');
    a.remove('k');
    expect(a.get('k')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a quota error on write keeps the value in memory and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new Map<string, string>();
    let full = false;
    const ls: StorageLike = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); store.set(k, v); },
      removeItem: (k) => { store.delete(k); },
    };
    const a = localStorageAdapter(ls);
    expect(a.persistent).toBe(true);
    expect(a.set('a', '1')).toBe(true);
    expect(store.get('a')).toBe('1');
    full = true;
    expect(a.set('a', '2')).toBe(false);
    expect(a.set('b', '3')).toBe(false);
    expect(a.get('a')).toBe('2');
    expect(a.get('b')).toBe('3');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describeData('persistence hooks', () => {
  it('no stored save: exactly 174 draws, item-avail seeded, editorLevel 800', () => {
    const ctx = mkCtx();
    loadConfiguration(ctx);
    expect(ctx.rng.calls).toBe(174);
    const c = ctx.game.config;
    expect(c.editorLevel).toBe(800);
    expect(c.saveTemp[2398]).toBe(1);
    expect(c.saveTemp[2398 + 98]).toBe(0);
    expect(c.configurationLoaded).toBe(true);
    expect(saveName(c.saveFiles[3]!)).toBe(' '.repeat(14));
  });

  it('a stored save is loaded with no RNG draws and restores the tables', () => {
    const a = mkCtx();
    loadConfiguration(a);
    sortHighScores(a);
    a.game.config.editorLevel = 1234;
    a.game.config.tyrMusicVolume = 100;
    saveConfiguration(a);

    const b = mkCtx(a.storage, 99);
    loadConfiguration(b);
    expect(b.rng.calls).toBe(0);
    expect(b.game.config.saveFiles.map((f) => f.highScore1)).toEqual(a.game.config.saveFiles.map((f) => f.highScore1));
    expect(b.game.config.t2kHighScores).toEqual(a.game.config.t2kHighScores);
    expect(b.game.config.tyrMusicVolume).toBe(100);
    expect(b.game.config.saveTemp.subarray(2398, 2496)).toEqual(a.game.config.saveTemp.subarray(2398, 2496));
    // the C editorLevel asymmetry: loaded as (lo<<8 | hi) of what was stored
    expect(b.game.config.editorLevel).toBe(((1234 & 0xff) << 8) | (1234 >> 8));
  });

  it('a corrupt save warns, is kept under a backup key, and the defaults (174 draws) are used (Review Focus 2)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = mkCtx();
    loadConfiguration(a);
    saveConfiguration(a);
    const good = a.storage.get(STORAGE_KEYS.sav)!;
    const bytes = base64ToBytes(good)!;
    bytes[500] ^= 0xff;
    const bad = bytesToBase64(bytes);
    a.storage.set(STORAGE_KEYS.sav, bad);

    const b = mkCtx(a.storage);
    loadConfiguration(b);
    expect(warn).toHaveBeenCalled();
    expect(b.rng.calls).toBe(174);
    expect(a.storage.get(STORAGE_KEYS.corruptSavPrefix + '1')).toBe(bad);
    expect(b.game.config.configurationLoaded).toBe(true);
    // a second corrupt blob goes to a fresh key
    expect(backupCorruptSav(b, 'x')).toBe(STORAGE_KEYS.corruptSavPrefix + '2');
    // saving afterwards replaces the primary but never the backup
    saveConfiguration(b);
    expect(a.storage.get(STORAGE_KEYS.corruptSavPrefix + '1')).toBe(bad);
    expect(parseSav(mkCtx().game.config, base64ToBytes(a.storage.get(STORAGE_KEYS.sav)!)!)).toEqual([]);
  });

  it('a foreign or truncated blob is treated the same way', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = memoryAdapter();
    s.set(STORAGE_KEYS.sav, 'bm90IGEgc2F2ZQ==');
    const ctx = mkCtx(s);
    loadConfiguration(ctx);
    expect(ctx.rng.calls).toBe(174);
    expect(s.get(STORAGE_KEYS.corruptSavPrefix + '1')).toBe('bm90IGEgc2F2ZQ==');
  });

  it('blocked localStorage: the game saves and reloads in memory with a warning (Review Focus 5)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = mkCtx(localStorageAdapter(() => { throw new Error('blocked'); }));
    loadConfiguration(ctx);
    initPlayerData(ctx);
    saveGame(ctx, 11, 'LAST LEVEL');
    expect(ctx.storage.get(STORAGE_KEYS.sav)).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('saveConfiguration does nothing before the configuration is loaded', () => {
    const ctx = mkCtx();
    saveConfiguration(ctx);
    expect(ctx.storage.get(STORAGE_KEYS.sav)).toBeNull();
  });

  it('saveGame / loadGame round-trip through the byte image', () => {
    const a = mkCtx();
    loadConfiguration(a);
    initPlayerData(a);
    const g = a.game, c = g.config;
    g.players[0].cash = 123456; g.players[1].cash = 77;
    g.players[0].items.ship = 5; g.players[0].items.weapon[0]!.id = 7; g.players[0].items.weapon[0]!.power = 9;
    g.players[0].items.weapon[1]!.id = 12; g.players[0].items.weapon[1]!.power = 4;
    g.players[0].items.sidekick = [3, 4]; g.players[0].items.sidekickLevel = 102; g.players[0].items.sidekickSeries = 6;
    g.players[0].lastItems.copyFrom(g.players[0].items);
    c.difficultyLevel = 4; c.initialDifficulty = 3; c.saveLevel = 17; c.lastCubeMax = 2;
    c.lastLevelName = 'GRYPHON'; c.secretHint = 2; c.gameHasRepeated = true;
    g.items.initialEpisodeNum = 2; g.items.episodeNum = 2;
    saveGame(a, 3, 'Abc');
    expect(saveName(c.saveFiles[2]!)).toBe('Abc');

    const b = mkCtx(a.storage);
    loadConfiguration(b);
    loadGame(b, 3);
    const h = b.game, d = h.config;
    expect(h.players[0].cash).toBe(123456);
    expect(h.players[0].items.ship).toBe(5);
    expect(h.players[0].items.weapon[0]!.power).toBe(9);
    expect(h.players[0].items.weapon[1]!.power).toBe(4);
    expect(h.players[0].items.sidekickLevel).toBe(102);
    expect(h.items.initialEpisodeNum).toBe(2);
    expect(h.items.episodeNum).toBe(2);
    expect(d.mainLevel).toBe(17);
    expect(d.saveLevel).toBe(17);
    expect(d.difficultyLevel).toBe(4);
    expect(d.initialDifficulty).toBe(3);
    expect(d.gameHasRepeated).toBe(true);
    expect(d.cubeMax).toBe(2);
    expect(d.lastLevelName).toBe('GRYPHON');
    expect(d.twoPlayerMode).toBe(false);
  });

  it('a "Completed" save stores episode-1 (0 -> 5) and loads as the next episode', () => {
    const a = mkCtx();
    loadConfiguration(a);
    initPlayerData(a);
    a.game.config.lastLevelName = 'Completed';
    a.game.items.episodeNum = 2;
    saveGame(a, 1, 'x');
    expect(a.game.config.saveFiles[0]!.episode).toBe(1);
    expect(a.game.scratch.temp).toBe(1);
    a.game.items.episodeNum = 1;
    saveGame(a, 1, 'x');
    expect(a.game.config.saveFiles[0]!.episode).toBe(5); // temp = 0 < 1 -> EPISODE_AVAILABLE
    // loading: episode 5 + Completed -> 1; episode 1 + Completed -> 2
    loadGame(a, 1);
    expect(a.game.items.episodeNum).toBe(1);
    a.game.config.saveFiles[0]!.episode = 1;
    loadGame(a, 1);
    expect(a.game.items.episodeNum).toBe(2);
  });

  it('sortHighScores orders each table descending', () => {
    const ctx = mkCtx();
    const t = ctx.game.config.t2kHighScores;
    [10, 30, 20].forEach((s, i) => { t[0]![i]!.score = s; });
    [1, 2, 3].forEach((s, i) => { t[5]![i]!.score = s; });
    sortHighScores(ctx);
    expect(t[0]!.map((e) => e.score)).toEqual([30, 20, 10]);
    expect(t[5]!.map((e) => e.score)).toEqual([3, 2, 1]);
  });
});

// ---- oracle files (skipped when absent) ----------------------------------------------------------------
const FIX = new URL('../../test-data/oracle/save-fixtures/', import.meta.url);
const fixture = (d: string, f: string): Uint8Array | null => {
  const u = new URL(`${d}/${f}`, FIX);
  return existsSync(u) ? new Uint8Array(readFileSync(u)) : null;
};
const swapEditor = (e: number): number => ((e & 0xff) << 8) | (e >> 8); // C load/save byte-order asymmetry

describeData('oracle tyrian.sav bytes', () => {
  const ref = fixture('d', 'tyrian.sav');
  const refCfg = fixture('d', 'tyrian.cfg');

  it.skipIf(!ref)('is 4722 bytes and decrypts, parsing a level-start backup in slot 11', () => {
    const ctx = mkCtx();
    expect(ref!.length).toBe(SAV_FILE_SIZE);
    expect(parseSav(ctx.game.config, ref!)).toEqual([]);
    const sf = ctx.game.config.saveFiles[10]!;
    expect(sf.levelName).toBe('NEW GAME');
    expect(saveName(sf)).toBe('LAST LEVEL    ');
    expect(sf.score).toBe(10000);
  });

  for (const d of ['d', 'd3']) {
    it.skipIf(!fixture(d, 'tyrian.sav'))(`parse then serialise reproduces the oracle bytes (${d})`, () => {
      const f = fixture(d, 'tyrian.sav')!;
      const c = mkCtx().game.config;
      expect(parseSav(c, f)).toEqual([]);
      c.editorLevel = swapEditor(c.editorLevel);
      expect(serializeSav(c)).toEqual(f);
      const cfg = fixture(d, 'tyrian.cfg')!;
      expect(parseCfg(c, cfg)).toBe(true);
      expect(serializeCfg(c)).toEqual(cfg);
    });
  }

  it.skipIf(!ref || !refCfg)('TS new-game state saved to slot 11 equals the oracle level-start save and cfg (seed 1)', () => {
    const ctx = mkCtx();
    loadConfiguration(ctx);
    initPlayerData(ctx);
    sortHighScores(ctx); // opentyr.c main loop
    const g = ctx.game, c = g.config;
    g.players[0].cash = 10000; c.difficultyLevel = 2; c.initialDifficulty = 2;
    g.items.initialEpisodeNum = 1; g.items.episodeNum = 1;
    saveGame(ctx, 11, 'LAST LEVEL    ');
    expect(serializeSav(c)).toEqual(ref);
    expect(serializeCfg(c)).toEqual(refCfg);
    expect(base64ToBytes(ctx.storage.get(STORAGE_KEYS.sav)!)).toEqual(ref);
  });

  // TODO(Task 12): replace the hand-built state above with the TS harness replaying
  // `newgame-ep1-first-shop-to-level`, and add the HOME-seeded oracle run of the load screen
  // (TS-written tyrian.sav loaded by C, compared by frame hash).
  it.todo('BYTES vs oracle for a full newgame scenario replay (Task 12)');
  it.todo('C loads a TS-written save: HOME-seeded load-screen hash (Task 12)');
});
