// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { REF_UNINIT, analyzeLevel, buildShapeRefs, loadLevelRecord } from '../../src/data/level';
import { describeData, testArchive } from '../helpers/data';

const DEMO_LEVELS = [
  { lvl: 9, events: 1010 }, { lvl: 12, events: 832 }, { lvl: 13, events: 379 }, { lvl: 7, events: 517 }, { lvl: 5, events: 552 },
];

describeData('real tyrian1.lvl', () => {
  const lvlBytes = () => testArchive!.get('tyrian1.lvl');
  it('analyzeLevel', () => {
    const { lvlNum, lvlPos } = analyzeLevel(lvlBytes());
    expect(lvlNum).toBe(37);
    expect(lvlPos.length).toBe(38);
    expect(lvlPos[lvlNum]).toBe(lvlBytes().length);
  });
  DEMO_LEVELS.forEach(({ lvl, events }, i) => {
    it(`demo ${i + 1} level ${lvl}: events, shape file, ref coverage`, () => {
      const { lvlPos } = analyzeLevel(lvlBytes());
      const L = loadLevelRecord(lvlBytes(), lvlPos, lvl, testArchive!);
      expect(L.maxEvent).toBe(events);
      expect(L.events.length).toBe(events + 1);
      expect(L.events[events]!.eventtime).toBe(65500);
      expect(['Z', 'Y']).toContain(String.fromCharCode(L.shapeFile));
      expect(L.map1.length).toBe(14 * 300);
      expect(L.map2.length).toBe(14 * 600);
      expect(L.map3.length).toBe(15 * 600);
      expect(L.shapes.pixels.length).toBe(600 * 672);
      expect(L.mapSh.length).toBe(3);

      // Uninitialised-ref assertion: every map byte must index a ref that the C assigned (slot or NULL).
      const { ref, shapeIndex } = buildShapeRefs(L);
      [L.map1, L.map2, L.map3].forEach((m, layer) => {
        for (const b of m) {
          expect(b).toBeLessThan(128);
          expect(ref[layer]![b]).not.toBe(REF_UNINIT);
        }
      });
      // slot refs point at themselves and at a real shape
      for (let layer = 0; layer < 3; layer++) {
        for (let x = 0; x < 128; x++) {
          if (ref[layer]![x]! >= 0) {
            expect(ref[layer]![x]).toBe(x);
            expect(shapeIndex[layer]![x]).toBe(L.mapSh[layer]![x]! - 1);
          }
        }
      }
    });
  });
});

it('analyzeLevel on a synthetic file', () => {
  const b = new Uint8Array(2 + 8 + 3);
  new DataView(b.buffer).setUint16(0, 2, true);
  new DataView(b.buffer).setInt32(2, 100, true);
  new DataView(b.buffer).setInt32(6, 200, true);
  const r = analyzeLevel(b);
  expect([r.lvlNum, ...r.lvlPos]).toEqual([2, 100, 200, 13]);
});
