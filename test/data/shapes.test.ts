// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { loadCompShapes, loadMainShapeTables } from '../../src/data/shapes';
import { describeData, testArchive } from '../helpers/data';

describeData('real tyrian.shp main tables', () => {
  it('loads 7 sprite tables with the known counts and 6 sprite2 sheets', () => {
    const m = loadMainShapeTables(testArchive!.get('tyrian.shp'));
    expect(m.tables.map((t) => t.count)).toEqual([60, 85, 127, 152, 18, 47, 22, 0]);
    expect(m.spriteSheet8.data.length).toBe(382486 - 350426);
    expect(m.spriteSheetT2000.data.length).toBe(505983 - 493635);
  });
  it('loads newsh1.shp (shop sprites incl. mouse pointers)', () => {
    expect(loadCompShapes(testArchive!, '1').data.length).toBe(testArchive!.get('newsh1.shp').length);
  });
});
