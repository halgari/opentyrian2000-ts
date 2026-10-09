// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { ENEMY_NUM, WEAP_NUM, loadItemDat } from '../../src/data/itemdat';
import { describeData, testArchive } from '../helpers/data';

// Spot-check values computed by hand from the raw tyrian.hdt bytes (independent python struct walk
// using the record sizes of episodes.c: weapon 80, port 82, special/power 37, ship 41, option 86, shield 37, enemy 77).
describeData('real tyrian.hdt item data', () => {
  const d = loadItemDat(testArchive!.get('tyrian.hdt'), 1);
  it('array sizes', () => {
    expect(d.weapons.length).toBe(WEAP_NUM + 1);
    expect(d.weaponPorts.length).toBe(61);
    expect(d.specials.length).toBe(55);
    expect(d.powerSys.length).toBe(7);
    expect(d.ships.length).toBe(19);
    expect(d.options.length).toBe(38);
    expect(d.shields.length).toBe(12);
    expect(d.enemyDat.length).toBe(ENEMY_NUM + 1);
  });
  it('weapons[1]', () => {
    const w = d.weapons[1]!;
    expect([w.drain, w.shotrepeat, w.multi, w.weapani, w.max, w.tx, w.ty, w.aim]).toEqual([10, 5, 1, 0, 1, 0, 0, 0]);
    expect(w.attack).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(w.sg).toEqual([67, 0, 0, 0, 0, 0, 0, 0]);
    expect([w.acceleration, w.accelerationx, w.circlesize, w.sound, w.trail, w.shipblastfilter]).toEqual([0, 0, 0, 28, 255, 208]);
  });
  it('ships[1]', () => {
    const s = d.ships[1]!;
    expect(s.name.startsWith('USP Talon')).toBe(true);
    expect([s.shipgraphic, s.itemgraphic, s.ani, s.spd, s.dmg, s.cost, s.bigshipgraphic]).toEqual([233, 277, 2, 0, 10, 6000, 32]);
  });
  it('enemyDat[1]', () => {
    const e = d.enemyDat[1]!;
    expect(e.ani).toBe(8);
    expect(e.tur).toEqual([127, 59, 9]);
    expect(e.freq).toEqual([60, 0, 0]);
    expect([e.armor, e.esize]).toEqual([254, 1]);
    expect(e.egraphic.slice(0, 4)).toEqual([1, 3, 5, 7]);
  });
  it('unloaded gap between banks stays zero', () => {
    expect(d.weapons[900]!.drain).toBe(0);
    expect(d.enemyDat[900]!.armor).toBe(0);
  });
  it('rejects episode 4 (unported)', () => {
    expect(() => loadItemDat(testArchive!.get('tyrian.hdt'), 4)).toThrow(/unported/);
  });
});
