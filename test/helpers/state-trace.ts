// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readFileSync } from 'node:fs';

/**
 * Field order of one OT_STATE record (16 x u32 LE); mirrors write_state() in tools/oracle/dump-frames.patch.
 * Outside a level the fields are whatever the zero-initialised C globals hold. In particular enemyAvail[]
 * and enemyShotAvail[] are all 0 before JE_main memsets them, so liveEnemies=100 and liveEnemyShots=60
 * until the first level starts.
 */
export const STATE_FIELDS = [
  'frame', 'mtCalls', 'curLoc', 'eventLoc', 'p0x', 'p0y', 'p0shield', 'p0armor', 'p0cash',
  'enemyOnScreen', 'liveEnemies', 'livePlayerShots', 'liveEnemyShots', 'liveExplosions', 'backPos', 'mapY',
] as const;

export type StateField = (typeof STATE_FIELDS)[number];
export type StateRecord = Record<StateField, number>;
export const STATE_RECORD_SIZE = STATE_FIELDS.length * 4;

export function parseStates(bytes: Uint8Array): StateRecord[] {
  if (bytes.length % STATE_RECORD_SIZE !== 0) throw new Error('state file ends in a partial record');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: StateRecord[] = [];
  for (let p = 0, i = 0; p < bytes.length; p += STATE_RECORD_SIZE, i++) {
    const rec = {} as Record<StateField, number>;
    STATE_FIELDS.forEach((f, k) => { rec[f] = view.getUint32(p + k * 4, true); });
    if (rec.frame !== i) throw new Error(`state file: record ${i} has frame index ${rec.frame}`);
    out.push(rec);
  }
  return out;
}

/** Returns null when the oracle file is absent (golden tests then skip). */
export function readStates(path: string): StateRecord[] | null {
  return existsSync(path) ? parseStates(new Uint8Array(readFileSync(path))) : null;
}

/** First differing field of two records, or null when equal. Field order = suspected-subsystem order. */
export function firstStateDiff(a: StateRecord, b: StateRecord): StateField | null {
  for (const f of STATE_FIELDS) if (a[f] !== b[f]) return f;
  return null;
}

/**
 * Field order of one OT_STATE2 record (36 x 32-bit LE words); mirrors write_state2() in tools/oracle/dump-frames.patch.
 * Words are unsigned except the SIGNED_STATE2 fields. `cash` is the low 32 bits of player[0].cash. `item0..item11`
 * are the C pItems order (config.c playeritems_to_pitems): front id, rear id, super_arcade_mode, left sidekick,
 * right sidekick, generator, sidekick_level, sidekick_series, initial_episode_num, shield, special, ship.
 * `scratch*` are the zero-initialised C globals temp/temp2/temp3/tempW, which shop and menu code leaves stale values in.
 */
export const STATE2_FIELDS = [
  'frame', 'mtCalls', 'cash', 'frontPower', 'rearPower',
  'item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'item7', 'item8', 'item9', 'item10', 'item11',
  'mainLevel', 'nextLevel', 'saveLevel', 'episodeNum', 'difficultyLevel',
  'levelEnd', 'endLevel', 'reallyEndLevel', 'gameLoaded', 'curMenu', 'lvlFileNum', 'armor', 'shield',
  'scratchTemp', 'scratchTemp2', 'scratchTemp3', 'scratchTempW', 'p0x', 'p0y',
] as const;

export type State2Field = (typeof STATE2_FIELDS)[number];
export type State2Record = Record<State2Field, number>;
export const STATE2_RECORD_SIZE = STATE2_FIELDS.length * 4;
export const SIGNED_STATE2: readonly State2Field[] = ['difficultyLevel', 'curMenu', 'p0x', 'p0y'];

export function parseStates2(bytes: Uint8Array): State2Record[] {
  if (bytes.length % STATE2_RECORD_SIZE !== 0) throw new Error('state2 file ends in a partial record');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: State2Record[] = [];
  for (let p = 0, i = 0; p < bytes.length; p += STATE2_RECORD_SIZE, i++) {
    const rec = {} as Record<State2Field, number>;
    STATE2_FIELDS.forEach((f, k) => {
      rec[f] = SIGNED_STATE2.includes(f) ? view.getInt32(p + k * 4, true) : view.getUint32(p + k * 4, true);
    });
    if (rec.frame !== i) throw new Error(`state2 file: record ${i} has frame index ${rec.frame}`);
    out.push(rec);
  }
  return out;
}

/** Returns null when the oracle file is absent (golden tests then skip). */
export function readStates2(path: string): State2Record[] | null {
  return existsSync(path) ? parseStates2(new Uint8Array(readFileSync(path))) : null;
}

/** First differing field of two v2 records, or null when equal. */
export function firstState2Diff(a: State2Record, b: State2Record): State2Field | null {
  for (const f of STATE2_FIELDS) if (a[f] !== b[f]) return f;
  return null;
}

/**
 * Field order of one OT_STATE3 record (16 x u32 LE); mirrors write_state3() in tools/oracle/dump-frames.patch: player 2, the mode
 * flags and the galaga / timer globals that STATE2 does not cover. All words are the unsigned reading of the C values (x, y and
 * galagaLife are signed in C: compare bit patterns). `flags`: bit0 twoPlayerMode, 1 twoPlayerLinked, 2 galagaMode, 3 timedBattleMode,
 * 4 onePlayerAction, 5 superTyrian, bits 8.. superArcadeMode.
 */
export const STATE3_FIELDS = [
  'frame', 'p1x', 'p1y', 'p1armor', 'p1shield', 'p1cash', 'p1alive', 'flags', 'linkGunDirecBits',
  'galagaLife', 'galagaShotFreq', 'levelTimerCountdown', 'p1frontId', 'p1frontPower', 'p1rearId', 'p1ship',
] as const;
export type State3Field = (typeof STATE3_FIELDS)[number];
export type State3Record = Record<State3Field, number>;
export const STATE3_RECORD_SIZE = STATE3_FIELDS.length * 4;

export function parseStates3(bytes: Uint8Array): State3Record[] {
  if (bytes.length % STATE3_RECORD_SIZE !== 0) throw new Error('state3 file ends in a partial record');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: State3Record[] = [];
  for (let p = 0, i = 0; p < bytes.length; p += STATE3_RECORD_SIZE, i++) {
    const rec = {} as Record<State3Field, number>;
    STATE3_FIELDS.forEach((f, k) => { rec[f] = view.getUint32(p + k * 4, true); });
    if (rec.frame !== i) throw new Error(`state3 file: record ${i} has frame index ${rec.frame}`);
    out.push(rec);
  }
  return out;
}

/** Returns null when the oracle file is absent (golden tests then skip). */
export function readStates3(path: string): State3Record[] | null {
  return existsSync(path) ? parseStates3(new Uint8Array(readFileSync(path))) : null;
}
