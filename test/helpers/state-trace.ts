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
