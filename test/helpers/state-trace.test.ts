// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { STATE_FIELDS, STATE_RECORD_SIZE, firstStateDiff, parseStates } from './state-trace';

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
