// SPDX-License-Identifier: GPL-2.0-or-later
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATE3_FIELDS, STATE3_RECORD_SIZE, parseStates3, readStates3, STATE2_FIELDS, STATE2_RECORD_SIZE, STATE_FIELDS, STATE_RECORD_SIZE, firstState2Diff, firstStateDiff, parseStates, parseStates2 } from './state-trace';

function encode(rows: number[][]): Uint8Array {
  const b = new Uint8Array(rows.length * STATE_RECORD_SIZE);
  const v = new DataView(b.buffer);
  rows.forEach((r, i) => r.forEach((x, k) => v.setUint32(i * STATE_RECORD_SIZE + k * 4, x, true)));
  return b;
}
const row = (frame: number, bump = 0): number[] => STATE_FIELDS.map((_, k) => (k === 0 ? frame : k * 10 + bump));

describe('state trace', () => {
  it('has the 16 documented fields in order', () => {
    expect(STATE_FIELDS).toHaveLength(16);
    expect(STATE_FIELDS[0]).toBe('frame');
    expect(STATE_FIELDS[1]).toBe('mtCalls');
    expect(STATE_FIELDS[15]).toBe('mapY');
    expect(STATE_RECORD_SIZE).toBe(64);
  });
  it('parses records by name', () => {
    const recs = parseStates(encode([row(0), row(1)]));
    expect(recs).toHaveLength(2);
    expect(recs[1]!.frame).toBe(1);
    expect(recs[1]!.mtCalls).toBe(10);
    expect(recs[0]!.mapY).toBe(150);
  });
  it('keeps values above 2^31 unsigned', () => {
    const r = row(0); r[4] = 0xfffffff0;
    expect(parseStates(encode([r]))[0]!.p0x).toBe(0xfffffff0);
  });
  it('rejects non-sequential frames and partial records', () => {
    expect(() => parseStates(encode([row(0), row(2)]))).toThrow(/frame index/);
    expect(() => parseStates(new Uint8Array(63))).toThrow(/partial/);
  });
  it('reports the first differing field', () => {
    const c = parseStates(encode([row(0)]))[0]!;
    expect(firstStateDiff(c, { ...c })).toBeNull();
    const d = { ...c, p0armor: 1, mapY: 2 };
    expect(firstStateDiff(c, d)).toBe('p0armor');
  });
});

describe('state2 trace', () => {
  const enc = (rows: number[][]): Uint8Array => {
    const b = new Uint8Array(rows.length * STATE2_RECORD_SIZE);
    const v = new DataView(b.buffer);
    rows.forEach((r, i) => r.forEach((x, k) => v.setUint32(i * STATE2_RECORD_SIZE + k * 4, x >>> 0, true)));
    return b;
  };
  const row2 = (frame: number): number[] => STATE2_FIELDS.map((_, k) => (k === 0 ? frame : k));
  it('has 36 fields in the documented order', () => {
    expect(STATE2_FIELDS).toHaveLength(36);
    expect(STATE2_RECORD_SIZE).toBe(144);
    expect(STATE2_FIELDS.indexOf('mtCalls')).toBe(1);
    expect(STATE2_FIELDS.indexOf('cash')).toBe(2);
    expect(STATE2_FIELDS.indexOf('item0')).toBe(5);
    expect(STATE2_FIELDS.indexOf('item11')).toBe(16);
    expect(STATE2_FIELDS.indexOf('mainLevel')).toBe(17);
    expect(STATE2_FIELDS.indexOf('p0y')).toBe(35);
  });
  it('parses by name with signed fields', () => {
    const r = row2(1);
    r[STATE2_FIELDS.indexOf('p0x')] = -5;
    r[STATE2_FIELDS.indexOf('cash')] = 0xfffffff0;
    const recs = parseStates2(enc([row2(0), r]));
    expect(recs[1]!.p0x).toBe(-5);
    expect(recs[1]!.cash).toBe(0xfffffff0);
    expect(recs[0]!.nextLevel).toBe(18);
    expect(firstState2Diff(recs[0]!, recs[1]!)).toBe('frame');
  });
  it('rejects partial records and bad frame indexes', () => {
    expect(() => parseStates2(new Uint8Array(143))).toThrow(/partial/);
    expect(() => parseStates2(enc([row2(3)]))).toThrow(/frame index/);
  });
});

describe('state3 trace', () => {
  it('has 16 fields and 64-byte records', () => {
    expect(STATE3_FIELDS).toHaveLength(16);
    expect(STATE3_RECORD_SIZE).toBe(64);
  });
  it('round-trips a hand-built record through readStates3', () => {
    const rows = [0, 1].map((frame) => STATE3_FIELDS.map((_, k) => (k === 0 ? frame : k === 9 ? 0xffffff00 + frame : k * 7 + frame)));
    const b = new Uint8Array(rows.length * STATE3_RECORD_SIZE);
    const v = new DataView(b.buffer);
    rows.forEach((r, i) => r.forEach((x, k) => v.setUint32(i * STATE3_RECORD_SIZE + k * 4, x, true)));
    const dir = mkdtempSync(join(tmpdir(), 'state3-'));
    const path = join(dir, 'x.state3');
    writeFileSync(path, b);
    const recs = readStates3(path)!;
    expect(recs).toHaveLength(2);
    expect(recs[1]).toEqual(Object.fromEntries(STATE3_FIELDS.map((f, k) => [f, rows[1]![k]])));
    expect(recs[0]!.galagaLife).toBe(0xffffff00);
    expect(parseStates3(b)).toEqual(recs);
    expect(readStates3(join(dir, 'missing'))).toBeNull();
    expect(() => parseStates3(b.slice(0, 70))).toThrow(/partial/);
  });
});
