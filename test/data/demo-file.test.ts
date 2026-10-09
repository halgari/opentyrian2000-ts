// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { DemoReader, parseDemo, type DemoFile } from '../../src/data/demo-file';
import { describeData, testArchive } from '../helpers/data';

const synth = (initialWait: number, records: number[]): DemoFile => ({
  ...parseDemo(new Uint8Array(32)), initialWait, records: Uint8Array.from(records),
});

it('DemoReader: initial wait frames carry keys 0, then each record applies on the frame it is read', () => {
  const rd = new DemoReader(synth(2, [0x11, 0, 1, 0x22, 0, 2]));
  expect([rd.next(), rd.next(), rd.next(), rd.next(), rd.next(), rd.next()]).toEqual(
    [{ keys: 0 }, { keys: 0 }, { keys: 0x11 }, { keys: 0x22 }, { keys: 0x22 }, null]);
});
it('DemoReader: wait=0 records are consumed in the same call', () => {
  const rd = new DemoReader(synth(0, [0xaa, 0, 0, 0xbb, 0, 1]));
  expect(rd.next()).toEqual({ keys: 0xbb });
  expect(rd.next()).toBeNull();
  expect(rd.next()).toBeNull();
});
it('DemoReader: short tail (1 or 2 bytes) and empty records end the demo', () => {
  expect(new DemoReader(synth(0, [])).next()).toBeNull();
  expect(new DemoReader(synth(0, [5])).next()).toBeNull();
  expect(new DemoReader(synth(0, [5, 0])).next()).toBeNull();
  expect(new DemoReader(synth(1, [5])).next()).toEqual({ keys: 0 });
});
it('DemoReader: big-endian waits', () => {
  const rd = new DemoReader(synth(0, [7, 1, 0]));
  let n = 0;
  while (rd.next()) n++;
  expect(n).toBe(256);
});

// Header table: survey §1.5. [front id, rear id, front pwr, rear pwr, special, ship, left, right, shield, song, lvlFileNum, name]
const HEADERS = [
  { name: 'TYRIAN   ', lvl: 9, ship: 1, fw: 7, fp: 1, rw: 29, rp: 1, sp: 0, sk: [21, 20], sh: 6, song: 18, frames: 7134, wait0: 38 },
  { name: 'SAVARA   ', lvl: 12, ship: 6, fw: 5, fp: 10, rw: 29, rp: 11, sp: 2, sk: [21, 21], sh: 8, song: 33, frames: 5043, wait0: 17 },
  { name: 'SOH JIN  ', lvl: 13, ship: 4, fw: 19, fp: 3, rw: 0, rp: 1, sp: 0, sk: [21, 23], sh: 6, song: 16, frames: 4798, wait0: 3 },
  { name: 'MINES    ', lvl: 7, ship: 4, fw: 19, fp: 10, rw: 0, rp: 1, sp: 0, sk: [19, 19], sh: 9, song: 16, frames: 1702, wait0: 36 },
  { name: 'DELIANI  ', lvl: 5, ship: 3, fw: 19, fp: 10, rw: 0, rp: 1, sp: 0, sk: [19, 19], sh: 9, song: 14, frames: 2950, wait0: 22 },
];

describeData('real demo.1-5', () => {
  HEADERS.forEach((h, i) => {
    it(`demo.${i + 1} header and frame count`, () => {
      const bytes = testArchive!.get(`demo.${i + 1}`);
      const d = parseDemo(bytes);
      expect(d.episode).toBe(1);
      expect(d.levelName.length).toBe(10);
      expect(String.fromCharCode(...d.levelName).replace(/\0/g, ' ')).toBe(h.name.trimEnd().padEnd(10, ' '));
      expect(d.lvlFileNum).toBe(h.lvl);
      expect(d.ship).toBe(h.ship);
      expect([d.frontWeaponId, d.frontWeaponPower, d.rearWeaponId, d.rearWeaponPower]).toEqual([h.fw, h.fp, h.rw, h.rp]);
      expect(d.special).toBe(h.sp);
      expect([d.leftSidekick, d.rightSidekick]).toEqual(h.sk);
      expect(d.shield).toBe(h.sh);
      expect(d.levelSong).toBe(h.song);
      expect(d.generator).toBe(5);
      expect(d.superArcadeMode).toBe(0);
      expect([d.sidekickLevel, d.sidekickSeries, d.initialEpisodeNum]).toEqual([2, 1, i === 2 ? 2 : 1]); // demo.3 header byte 20 is 2
      expect(d.initialWait).toBe(h.wait0);
      expect(d.records.length).toBe(bytes.length - 32);
      expect(d.records.length % 3).toBe(1); // one trailing byte

      // Frames before null = initialWait + sum of waits of the complete 3-byte records
      // (hand-computed independently with python: 7134, 5043, 4798, 1702, 2950).
      const rd = new DemoReader(d);
      let n = 0;
      while (rd.next()) n++;
      expect(n).toBe(h.frames);
      expect(rd.next()).toBeNull();
    });
  });
});
