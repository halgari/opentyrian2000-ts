import { describe, expect, it } from 'vitest';
import { findPage, loadPage, parseAnim, playRunSkipDump, renderFrame } from '../../src/data/anim';
import { describeData, testArchive } from '../helpers/data';

const STOP = [0x80, 0x00, 0x00];
const run = (ops: number[], out = new Uint8Array(320 * 200)): { r: number; out: Uint8Array } => {
  const input = Uint8Array.from(ops);
  return { r: playRunSkipDump(input, 0, input.length, out), out };
};

describe('playRunSkipDump', () => {
  it('short copy, short RLE and short skip', () => {
    const { r, out } = run([3, 1, 2, 3, 0x00, 4, 9, 0x82, 2, 7, 7, ...STOP]);
    expect(r).toBe(0);
    expect(Array.from(out.subarray(0, 12))).toEqual([1, 2, 3, 9, 9, 9, 9, 0, 0, 7, 7, 0]);
  });

  it('long skip, long RLE and long copy', () => {
    const { r, out } = run([0x80, 0x03, 0x00, 0x80, 0x05, 0xc0, 0x42, 0x80, 0x02, 0x80, 0xaa, 0xbb, ...STOP]);
    expect(r).toBe(0);
    expect(Array.from(out.subarray(0, 10))).toEqual([0, 0, 0, 0x42, 0x42, 0x42, 0x42, 0x42, 0xaa, 0xbb]);
  });

  it('a stop opcode needs nothing after it', () => {
    expect(run(STOP).r).toBe(0);
  });

  it('fails on a truncated input (copy longer than the data, then end of data)', () => {
    expect(run([5, 1, 2]).r).toBe(-1);
    expect(run([]).r).toBe(-1);
  });

  it('fails when the output would overflow, and when a skip leaves the screen', () => {
    expect(run([0x00, 200, 1, 0x00, 200, 1, ...STOP]).r).toBe(0); // 400 bytes fit
    expect(run([...Array(33).fill([0x80, 0xff, 0x7f]).flat(), ...STOP]).r).toBe(-1); // 33 * 32767 skips leave 64000
    expect(run([0x80, 0xff, 0xff, 0xff]).r).toBe(-1); // long RLE ok, then the input is exhausted
  });
});

describeData('tyrend.anm', () => {
  const anim = parseAnim(testArchive!.get('tyrend.anm'));

  it('parses the LPF header and palette', () => {
    expect(anim).not.toBeNull();
    expect(anim!.nlps).toBeGreaterThan(0);
    expect(anim!.nRecords).toBeGreaterThan(100);
    expect(anim!.palette).toHaveLength(768);
    expect(anim!.palette.some((b) => b !== 0)).toBe(true);
  });

  it('rejects data that is not an LPF file', () => {
    expect(parseAnim(new Uint8Array(0x20))).toBeNull();
    const bad = testArchive!.get('tyrend.anm').slice();
    bad[0] = 0x58;
    expect(parseAnim(bad)).toBeNull();
    expect(parseAnim(testArchive!.get('tyrend.anm').subarray(0, 0x20000))).toBeNull(); // shorter than the page table says
  });

  it('decodes every played frame (records 0 .. nRecords-2) without error and draws something', () => {
    const screen = new Uint8Array(320 * 200);
    let page = null as ReturnType<typeof loadPage>;
    let changed = 0;
    let prev = 0;
    for (let i = 0; i < anim!.nRecords - 1; i++) {
      const n = findPage(anim!, i);
      expect(n).toBeGreaterThanOrEqual(0);
      if (page === null || page.number !== n) {
        page = loadPage(anim!, n);
        expect(page).not.toBeNull();
      }
      expect(renderFrame(page!, i, screen), `frame ${i}`).toBe(true);
      let sum = 0;
      for (let k = 0; k < screen.length; k += 97) sum = (sum + screen[k]!) | 0;
      if (sum !== prev) changed++;
      prev = sum;
    }
    expect(changed).toBeGreaterThan(10);
  });
});
