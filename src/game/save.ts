// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/config.c (JE_saveGame, JE_loadGame, JE_saveConfiguration, JE_encryptSaveTemp,
//   JE_decryptSaveTemp and the tyrian.sav / tyrian.cfg / opentyrian.cfg formats)
import type { Ctx } from '../ctx';
import { u8 } from '../core/int';
import { isScalingMode } from '../platform/scaling';
import { base64ToBytes, bytesToBase64, STORAGE_KEYS } from '../platform/storage';
import { initEpisode } from './episodes';
import { mergeStoredSav, noteWritten } from './save-sync';
import {
  SA_LASTSHIP, SA_ARCADE, SA_NONE, SA_SUPERTYRIAN, SAVE_FILE_SIZE, SAVE_FILES_NUM, SIZEOF_SAVEGAMETEMP,
  defaultKeySettings, defaultKeySettings2, defaultMouseSettings,
  type ConfigGroup, type PlayerItems, type SaveFile,
} from './world';

/** config.c cryptKey */
export const cryptKey: readonly number[] = [15, 50, 89, 240, 147, 34, 86, 9, 32, 208];

/** episodes.h EPISODE_AVAILABLE */
export const EPISODE_AVAILABLE = 5;

/** Bytes of one save record in saveTemp. */
export const SAVE_RECORD_SIZE = 109;
/** Total tyrian.sav size: saveTemp + 30 x 35 B (timed battle) ... see writeSav. */
export const SAV_FILE_SIZE = SIZEOF_SAVEGAMETEMP + 10 * 3 * 35 + 10 * 3 * 39; // 4722
export const CFG_FILE_SIZE = 28;

const latin1 = (b: Uint8Array, from: number, len: number): string => {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = b[from + i]!;
    if (c === 0) break; // C string terminator
    s += String.fromCharCode(c);
  }
  return s;
};

// ---------------------------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------------------------

// port of JE_encryptSaveTemp (config.c:618). In place on a SIZEOF_SAVEGAMETEMP image.
export function encryptSaveTemp(saveTemp: Uint8Array): void {
  const s3 = saveTemp.slice(0, SIZEOF_SAVEGAMETEMP);

  let y = 0;
  for (let x = 0; x < SAVE_FILE_SIZE; x++) y = (y + s3[x]!) & 0xff;
  saveTemp[SAVE_FILE_SIZE] = y;

  y = 0;
  for (let x = 0; x < SAVE_FILE_SIZE; x++) y = (y - s3[x]!) & 0xff;
  saveTemp[SAVE_FILE_SIZE + 1] = y;

  y = 1;
  for (let x = 0; x < SAVE_FILE_SIZE; x++) y = (y * s3[x]! + 1) & 0xff;
  saveTemp[SAVE_FILE_SIZE + 2] = y;

  y = 0;
  for (let x = 0; x < SAVE_FILE_SIZE; x++) y ^= s3[x]!;
  saveTemp[SAVE_FILE_SIZE + 3] = y;

  for (let x = 0; x < SAVE_FILE_SIZE; x++) {
    saveTemp[x] = saveTemp[x]! ^ cryptKey[(x + 1) % 10]!;
    if (x > 0) saveTemp[x] = saveTemp[x]! ^ saveTemp[x - 1]!;
  }
}

/**
 * port of JE_decryptSaveTemp (config.c:664). In place. The C `exit(255)`s on a bad checksum; here the
 * buffer is left untouched and the failure messages are returned (empty array = valid).
 */
export function decryptSaveTemp(saveTemp: Uint8Array): string[] {
  const s2 = new Uint8Array(SAVE_FILE_SIZE);
  for (let x = SAVE_FILE_SIZE - 1; x >= 0; x--) {
    s2[x] = saveTemp[x]! ^ cryptKey[(x + 1) % 10]!;
    if (x > 0) s2[x] = s2[x]! ^ saveTemp[x - 1]!;
  }

  const errs: string[] = [];
  let y = 0;
  for (let x = 0; x < SAVE_FILE_SIZE; x++) y = (y + s2[x]!) & 0xff;
  if (saveTemp[SAVE_FILE_SIZE] !== y) errs.push(`Failed additive checksum: ${saveTemp[SAVE_FILE_SIZE]} vs ${y}`);

  y = 0;
  for (let x = 0; x < SAVE_FILE_SIZE; x++) y = (y - s2[x]!) & 0xff;
  if (saveTemp[SAVE_FILE_SIZE + 1] !== y) errs.push(`Failed subtractive checksum: ${saveTemp[SAVE_FILE_SIZE + 1]} vs ${y}`);

  y = 1;
  for (let x = 0; x < SAVE_FILE_SIZE; x++) y = (y * s2[x]! + 1) & 0xff;
  if (saveTemp[SAVE_FILE_SIZE + 2] !== y) errs.push(`Failed multiplicative checksum: ${saveTemp[SAVE_FILE_SIZE + 2]} vs ${y}`);

  y = 0;
  for (let x = 0; x < SAVE_FILE_SIZE; x++) y ^= s2[x]!;
  if (saveTemp[SAVE_FILE_SIZE + 3] !== y) errs.push(`Failed XOR'd checksum: ${saveTemp[SAVE_FILE_SIZE + 3]} vs ${y}`);

  if (errs.length) return errs;
  saveTemp.set(s2, 0); // bytes [2498..2502) keep their (checksum) contents
  return errs;
}

// ---------------------------------------------------------------------------------------------
// saveTemp <-> saveFiles (the record loops of JE_loadConfiguration / JE_saveConfiguration)
// ---------------------------------------------------------------------------------------------

function wr16(b: Uint8Array, p: number, v: number): void { b[p] = v & 0xff; b[p + 1] = (v >> 8) & 0xff; }
function wr32(b: Uint8Array, p: number, v: number): void {
  b[p] = v & 0xff; b[p + 1] = (v >>> 8) & 0xff; b[p + 2] = (v >>> 16) & 0xff; b[p + 3] = (v >>> 24) & 0xff;
}
const rd16 = (b: Uint8Array, p: number): number => b[p]! | (b[p + 1]! << 8);
const rd32 = (b: Uint8Array, p: number): number => (b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16) | (b[p + 3]! << 24)) | 0;

function wrPascal(b: Uint8Array, p: number, s: string, fieldSize: number, maxLen: number): void {
  b.fill(0, p, p + fieldSize);
  const len = Math.min(s.length, maxLen);
  b[p] = len;
  for (let i = 0; i < len; i++) b[p + 1 + i] = s.charCodeAt(i) & 0xff;
}

/** The record loop of JE_saveConfiguration (config.c:~1000): saveFiles + editorLevel into saveTemp. */
export function packSaveTemp(c: ConfigGroup): void {
  const b = c.saveTemp;
  let p = 0;
  for (let z = 0; z < SAVE_FILES_NUM; z++) {
    const f = c.saveFiles[z]!;
    wr16(b, p, f.encode); p += 2;
    wr16(b, p, f.level); p += 2;
    b.set(f.items, p); p += 12;
    wr32(b, p, f.score); p += 4;
    wr32(b, p, f.score2); p += 4;
    wrPascal(b, p, f.levelName, 10, 10); p += 10; // a 10-char name spills into name[0], which is rewritten below
    b.set(f.name.subarray(0, 14), p); p += 14;
    b[p++] = f.cubes;
    b[p++] = f.power[0]!; b[p++] = f.power[1]!;
    b[p++] = f.episode;
    b.set(f.lastItems, p); p += 12;
    b[p++] = f.difficulty; b[p++] = f.secretHint; b[p++] = f.input1; b[p++] = f.input2;
    b[p++] = f.gameHasRepeated ? 1 : 0;
    b[p++] = f.initialDifficulty;
    wr32(b, p, f.highScore1); p += 4;
    wr32(b, p, f.highScore2); p += 4;
    wrPascal(b, p, f.highScoreName, 30, 29); p += 30;
    b[p++] = f.highScoreDiff;
  }
  // Note the C asymmetry: saved as [-6]=hi, [-5]=lo, but loaded as (([-5]<<8)|[-6]).
  b[SIZEOF_SAVEGAMETEMP - 6] = (c.editorLevel >> 8) & 0xff;
  b[SIZEOF_SAVEGAMETEMP - 5] = c.editorLevel & 0xff;
}

/** The record loop of JE_loadConfiguration (config.c:~840): saveTemp into saveFiles + editorLevel. */
export function unpackSaveTemp(c: ConfigGroup): void {
  const b = c.saveTemp;
  let p = 0;
  for (let z = 0; z < SAVE_FILES_NUM; z++) {
    const f = c.saveFiles[z]!;
    f.encode = rd16(b, p); p += 2;
    f.level = rd16(b, p); p += 2;
    f.items.set(b.subarray(p, p + 12)); p += 12;
    f.score = rd32(b, p); p += 4;
    f.score2 = rd32(b, p); p += 4;
    f.levelName = latin1(b, p + 1, Math.min(b[p]!, 10)); p += 10;
    f.name.fill(0); f.name.set(b.subarray(p, p + 14)); p += 14;
    f.cubes = b[p++]!;
    f.power[0] = b[p++]!; f.power[1] = b[p++]!;
    f.episode = b[p++]!;
    f.lastItems.set(b.subarray(p, p + 12)); p += 12;
    f.difficulty = b[p++]!; f.secretHint = b[p++]!; f.input1 = b[p++]!; f.input2 = b[p++]!;
    f.gameHasRepeated = b[p++] !== 0;
    f.initialDifficulty = b[p++]!;
    f.highScore1 = rd32(b, p); p += 4;
    f.highScore2 = rd32(b, p); p += 4;
    f.highScoreName = latin1(b, p + 1, Math.min(b[p]!, 29)); p += 30;
    f.highScoreDiff = b[p++]!;
  }
  c.editorLevel = (b[SIZEOF_SAVEGAMETEMP - 5]! << 8) | b[SIZEOF_SAVEGAMETEMP - 6]!;
}

// ---------------------------------------------------------------------------------------------
// tyrian.sav
// ---------------------------------------------------------------------------------------------

/** The unencrypted T2K high-score tail of tyrian.sav. */
function writeT2kTail(c: ConfigGroup, out: Uint8Array, p: number): number {
  for (let z = 0; z < 20; z++) {
    for (let y = 0; y < 3; y++) {
      const e = c.t2kHighScores[z]![y]!;
      wr32(out, p, e.score); p += 4;
      if (z >= 10) { wr32(out, p, 0x12345678); p += 4; } // "unknown long int that seems to have no effect"
      const len = Math.min(e.playerName.length, 29);
      out[p++] = len;
      for (let i = 0; i < 29; i++) out[p + i] = i < len ? e.playerName.charCodeAt(i) & 0xff : 0;
      p += 29;
      out[p++] = e.difficulty;
    }
  }
  return p;
}

export function readT2kTail(c: ConfigGroup, b: Uint8Array, p: number): number {
  for (let z = 0; z < 20; z++) {
    for (let y = 0; y < 3; y++) {
      const e = c.t2kHighScores[z]![y]!;
      e.score = rd32(b, p); p += 4;
      if (z >= 10) p += 4;
      const len = b[p++]!;
      e.playerName = latin1(b, p, Math.min(len, 29)); p += 29;
      e.difficulty = b[p++]!;
    }
  }
  return p;
}

/**
 * Serialise config.saveFiles/editorLevel/saveTemp/t2kHighScores to the 4722-byte tyrian.sav image
 * (JE_saveConfiguration's file body). saveTemp is left decrypted, as the C does after its
 * encrypt / write / decrypt dance.
 */
export function serializeSav(c: ConfigGroup): Uint8Array {
  packSaveTemp(c);
  const out = new Uint8Array(SAV_FILE_SIZE);
  const enc = c.saveTemp.slice();
  encryptSaveTemp(enc);
  out.set(enc, 0);
  writeT2kTail(c, out, SIZEOF_SAVEGAMETEMP);
  // C decrypts back in place; saveTemp's own checksum bytes are irrelevant, so keep the plain copy.
  return out;
}

/**
 * Parse a tyrian.sav image into `c` (JE_loadConfiguration's save-file branch). On a short file or a
 * bad checksum nothing in `c` is modified and the reasons are returned (the C exits with 255).
 */
export function parseSav(c: ConfigGroup, bytes: Uint8Array): string[] {
  if (bytes.length < SAV_FILE_SIZE) return [`tyrian.sav is ${bytes.length} bytes, expected ${SAV_FILE_SIZE}`];
  const tmp = bytes.slice(0, SIZEOF_SAVEGAMETEMP);
  const errs = decryptSaveTemp(tmp);
  if (errs.length) return errs;
  c.saveTemp.set(tmp);
  unpackSaveTemp(c);
  readT2kTail(c, bytes, SIZEOF_SAVEGAMETEMP);
  return [];
}

// ---------------------------------------------------------------------------------------------
// tyrian.cfg (28 bytes)
// ---------------------------------------------------------------------------------------------

export function serializeCfg(c: ConfigGroup): Uint8Array {
  const b = new Uint8Array(CFG_FILE_SIZE);
  let p = 0;
  b[p++] = c.background2 ? 1 : 0;
  b[p++] = c.gameSpeed; b[p++] = c.inputDevice_; b[p++] = c.jConfigure; b[p++] = c.versionNum;
  b[p++] = c.processorType; b[p++] = c.midiPort; b[p++] = c.soundEffects; b[p++] = c.gammaCorrection;
  b[p++] = c.difficultyLevel & 0xff; // s8
  b.set(c.joyButtonAssign, p); p += 4;
  wr16(b, p, c.tyrMusicVolume); p += 2;
  wr16(b, p, c.fxVolume); p += 2;
  b[p++] = c.inputDevice[0]!; b[p++] = c.inputDevice[1]!;
  b.set(c.dosKeySettings, p);
  return b;
}

/** Returns false (and leaves `c` untouched) unless `b` is a valid 28-byte tyrian.cfg. */
export function parseCfg(c: ConfigGroup, b: Uint8Array): boolean {
  if (b.length !== CFG_FILE_SIZE) return false;
  if (b[0]! > 1) return false; // fread_bool_die rejects anything but 0/1
  let p = 0;
  c.background2 = b[p++] !== 0;
  c.gameSpeed = b[p++]!; c.inputDevice_ = b[p++]!; c.jConfigure = b[p++]!; c.versionNum = b[p++]!;
  c.processorType = b[p++]!; c.midiPort = b[p++]!; c.soundEffects = b[p++]!; c.gammaCorrection = b[p++]!;
  c.difficultyLevel = (b[p++]! << 24) >> 24;
  c.joyButtonAssign.set(b.subarray(p, p + 4)); p += 4;
  c.tyrMusicVolume = rd16(b, p); p += 2;
  c.fxVolume = rd16(b, p); p += 2;
  c.inputDevice[0] = b[p++]!; c.inputDevice[1] = b[p++]!;
  c.dosKeySettings.set(b.subarray(p, p + 8));
  return true;
}

// ---------------------------------------------------------------------------------------------
// opentyrian.cfg as JSON: { version: 1, keySettings: number[8], mouseSettings: number[3] }
// (the C file also carries video scaler/fullscreen options, which the browser build does not have)
// ---------------------------------------------------------------------------------------------

export function serializeOpentyrianConfig(c: ConfigGroup): string {
  return JSON.stringify({
    version: 1, keySettings: Array.from(c.keySettings), mouseSettings: Array.from(c.mouseSettings),
    keySettings2: Array.from(c.keySettings2), sharedKeyboard: c.sharedKeyboard, scalingMode: c.scalingMode, // web extensions
  });
}

/** load_opentyrian_config: defaults first, then any valid stored values override them. */
export function parseOpentyrianConfig(c: ConfigGroup, json: string | null): void {
  c.keySettings.set(defaultKeySettings);
  c.mouseSettings.set(defaultMouseSettings);
  c.keySettings2.set(defaultKeySettings2);
  c.sharedKeyboard = false;
  c.scalingMode = 'fit-4-3';
  if (json === null) return;
  try {
    const o = JSON.parse(json) as { keySettings?: unknown; mouseSettings?: unknown; keySettings2?: unknown; sharedKeyboard?: unknown; scalingMode?: unknown };
    if (Array.isArray(o.keySettings)) {
      for (let i = 0; i < 8; i++) {
        const v = o.keySettings[i];
        if (Number.isInteger(v) && v > 0 && v < 512) c.keySettings[i] = v; // SDL_SCANCODE_UNKNOWN (0) is ignored
      }
    }
    if (Array.isArray(o.keySettings2)) {
      for (let i = 0; i < 8; i++) {
        const v = o.keySettings2[i];
        if (Number.isInteger(v) && v > 0 && v < 512) c.keySettings2[i] = v;
      }
    }
    if (o.sharedKeyboard === true) c.sharedKeyboard = true;
    if (isScalingMode(o.scalingMode)) c.scalingMode = o.scalingMode;
    if (Array.isArray(o.mouseSettings)) {
      for (let i = 0; i < 3; i++) {
        const v = o.mouseSettings[i];
        if (Number.isInteger(v) && v >= 1 && v <= 5) c.mouseSettings[i] = v; // mouseSettingValues[5]
      }
    }
  } catch {
    // unparsable: keep defaults (the C returns false from config_parse)
  }
}

// ---------------------------------------------------------------------------------------------
// Game hooks
// ---------------------------------------------------------------------------------------------

// port of JE_saveConfiguration (config.c:~985)
export function saveConfiguration(ctx: Ctx): void {
  const c = ctx.game.config;
  // Don't save nothing
  if (!c.configurationLoaded) return;
  // Web: another tab may have saved a slot since this tab last looked; keep its changes (save-sync.ts).
  mergeStoredSav(ctx);
  const image = serializeSav(c);
  if (ctx.storage.set(STORAGE_KEYS.sav, bytesToBase64(image))) noteWritten(ctx, image);
  saveConfigFiles(ctx);
}

/** The tyrian.cfg and opentyrian.cfg writes of saveConfiguration (web: also run on pagehide). */
export function saveConfigFiles(ctx: Ctx): void {
  const c = ctx.game.config;
  if (!c.configurationLoaded) return;
  ctx.storage.set(STORAGE_KEYS.cfg, bytesToBase64(serializeCfg(c)));
  ctx.storage.set(STORAGE_KEYS.opentyrianCfg, serializeOpentyrianConfig(c));
}

/** Reads the stored tyrian.sav bytes (null if absent or not base64). */
export function readStoredSav(ctx: Ctx): Uint8Array | null {
  const s = ctx.storage.get(STORAGE_KEYS.sav);
  return s === null ? null : (base64ToBytes(s) ?? new Uint8Array(0));
}

export function readStoredCfg(ctx: Ctx): Uint8Array | null {
  const s = ctx.storage.get(STORAGE_KEYS.cfg);
  return s === null ? null : (base64ToBytes(s) ?? new Uint8Array(0));
}

/** Keeps a corrupt blob under a fresh backup key so nothing is lost; returns the key. */
export function backupCorruptSav(ctx: Ctx, raw: string): string {
  let n = 1;
  while (ctx.storage.get(STORAGE_KEYS.corruptSavPrefix + n) !== null) n++;
  const key = STORAGE_KEYS.corruptSavPrefix + n;
  ctx.storage.set(key, raw);
  return key;
}

function playerItemsToPItems(out: Uint8Array, items: PlayerItems, initialEpisodeNum: number): void {
  // port of playeritems_to_pitems (config.c:343)
  out[0] = items.weapon[0].id;
  out[1] = items.weapon[1].id;
  out[2] = items.superArcadeMode;
  out[3] = items.sidekick[0];
  out[4] = items.sidekick[1];
  out[5] = items.generator;
  out[6] = items.sidekickLevel;
  out[7] = items.sidekickSeries;
  out[8] = initialEpisodeNum;
  out[9] = items.shield;
  out[10] = items.special;
  out[11] = items.ship;
}

function pItemsToPlayerItems(items: PlayerItems, p: Uint8Array): number {
  // port of pitems_to_playeritems (config.c:359); returns pItems[8] (initial_episode_num)
  items.weapon[0].id = p[0]!;
  items.weapon[1].id = p[1]!;
  items.superArcadeMode = p[2]!;
  items.sidekick[0] = p[3]!;
  items.sidekick[1] = p[4]!;
  items.generator = p[5]!;
  items.sidekickLevel = p[6]!;
  items.sidekickSeries = p[7]!;
  items.shield = p[9]!;
  items.special = p[10]!;
  items.ship = p[11]!;
  return p[8]!;
}

/** strcpy into char[15] (zero-fills nothing: stale bytes after the NUL survive, as in C). */
export function setSaveName(f: SaveFile, name: string): void {
  const n = Math.min(name.length, 14);
  for (let i = 0; i < n; i++) f.name[i] = name.charCodeAt(i) & 0xff;
  f.name[n] = 0;
}

/** The C string in SaveFile.name. */
export function saveName(f: SaveFile): string { return latin1(f.name, 0, 15); }

// port of JE_saveGame (config.c:376)
export function saveGame(ctx: Ctx, slot: number, name: string): void {
  const g = ctx.game;
  const c = g.config;
  const [p0, p1] = g.players;
  const sf = c.saveFiles[slot - 1]!;

  sf.initialDifficulty = c.initialDifficulty & 0xff;
  sf.gameHasRepeated = c.gameHasRepeated;
  sf.level = c.saveLevel;

  if (c.superTyrian) p0.items.superArcadeMode = SA_SUPERTYRIAN;
  else if (c.superArcadeMode === SA_NONE && c.onePlayerAction) p0.items.superArcadeMode = SA_ARCADE;
  else p0.items.superArcadeMode = c.superArcadeMode;

  playerItemsToPItems(sf.items, p0.items, g.items.initialEpisodeNum);

  if (c.twoPlayerMode) playerItemsToPItems(sf.lastItems, p1.items, 0);
  else playerItemsToPItems(sf.lastItems, p0.lastItems, 0);

  sf.score = p0.cash | 0;  // JE_longint = ulong truncation
  sf.score2 = p1.cash | 0;

  sf.levelName = c.lastLevelName;
  sf.cubes = c.lastCubeMax;

  if (c.lastLevelName === 'Completed') {
    g.scratch.temp = u8(g.items.episodeNum - 1);
    // C: temp is a JE_byte, so `episodeNum - 1` of 0 wraps to 255 and the `< 1` test is on the stored value
    if (g.scratch.temp < 1) g.scratch.temp = EPISODE_AVAILABLE; /* JE: {Episodemax is 4 for completion purposes} */
    sf.episode = g.scratch.temp;
  } else {
    sf.episode = g.items.episodeNum;
  }

  sf.difficulty = c.difficultyLevel & 0xff;
  sf.secretHint = c.secretHint;
  sf.input1 = c.inputDevice[0]!;
  sf.input2 = c.inputDevice[1]!;

  setSaveName(sf, name);

  for (let port = 0; port < 2; port++) {
    // if two-player, use first player's front and second player's rear weapon
    sf.power[port] = g.players[c.twoPlayerMode ? port : 0]!.items.weapon[port]!.power;
  }

  saveConfiguration(ctx);
}

// port of JE_loadGame (config.c:439)
export function loadGame(ctx: Ctx, slot: number): void {
  const g = ctx.game;
  const c = g.config;
  const [p0, p1] = g.players;
  const sf = c.saveFiles[slot - 1]!;

  c.superTyrian = false;
  c.onePlayerAction = false;
  c.twoPlayerMode = false;
  c.extraGame = false;
  c.galagaMode = false;
  c.timedBattleMode = false;

  c.initialDifficulty = (sf.initialDifficulty << 24) >> 24; // JE_shortint
  c.gameHasRepeated = sf.gameHasRepeated;
  c.twoPlayerMode = slot - 1 > 10;
  c.difficultyLevel = (sf.difficulty << 24) >> 24;

  g.items.initialEpisodeNum = pItemsToPlayerItems(p0.items, sf.items);

  c.superArcadeMode = p0.items.superArcadeMode;

  if (c.superArcadeMode === SA_SUPERTYRIAN) c.superTyrian = true;
  if (c.superArcadeMode !== SA_NONE) c.onePlayerAction = true;
  if (c.superArcadeMode > SA_LASTSHIP) c.superArcadeMode = SA_NONE;

  if (c.twoPlayerMode) {
    c.onePlayerAction = false;
    pItemsToPlayerItems(p1.items, sf.lastItems);
  } else {
    pItemsToPlayerItems(p0.lastItems, sf.lastItems);
  }

  /* Compatibility with old version */
  if (p1.items.sidekickLevel < 101) {
    p1.items.sidekickLevel = 101;
    p1.items.sidekickSeries = p1.items.sidekick[0];
  }

  p0.cash = sf.score;
  p1.cash = sf.score2;

  c.mainLevel = sf.level;
  c.cubeMax = sf.cubes;
  c.lastCubeMax = c.cubeMax;

  c.secretHint = sf.secretHint;
  c.inputDevice[0] = sf.input1;
  c.inputDevice[1] = sf.input2;

  for (let port = 0; port < 2; port++) {
    // if two-player, use first player's front and second player's rear weapon
    g.players[c.twoPlayerMode ? port : 0]!.items.weapon[port]!.power = sf.power[port]!;
  }

  let episode = sf.episode;

  c.levelName = sf.levelName;

  if (c.levelName === 'Completed') {
    if (episode === EPISODE_AVAILABLE) episode = 1;
    else if (episode < EPISODE_AVAILABLE) episode++;
    /* Increment episode.  Episode EPISODE_AVAILABLE goes to 1. */
  }

  initEpisode(ctx, episode);
  c.saveLevel = c.mainLevel;
  c.lastLevelName = c.levelName;
}
