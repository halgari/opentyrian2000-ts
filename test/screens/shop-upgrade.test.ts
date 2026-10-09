// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { initializeStarfield } from '../../src/game/backgrounds';
import { ShopState } from '../../src/screens/shop';
import { MENU_FULL_GAME, MENU_UPGRADES, MENU_UPGRADE_SUB, cashLeft } from '../../src/screens/shop-draw';
import {
  initWeaponView, isWeaponSimMenu, menuFunctionUpgradeSub, menuFunctionUpgrades, simulatePlayerShots, upgradeSubCursorMoved,
  upgradeSubEscape, upgradeSubLeftRight, upgradeSubSlash, weaponSimUpdate, resetTempWeaponPower,
} from '../../src/screens/shop-weapon';
import { describeData } from '../helpers/data';
import { newGameWorld } from '../helpers/shop';

/** A shop in its first state with the front weapon list [1, 2, 7] and the rear list [0, 10, 11] (the sorted lists of the first shop). */
function setup() {
  const ctx = newGameWorld();
  const g = ctx.game;
  const s = new ShopState();
  s.menuInt = ctx.assets.helpText.menuInt.map((r) => r.slice());
  g.items.itemAvail[1]!.set([1, 2, 7]); g.items.itemAvailMax[1] = 3;
  g.items.itemAvail[2]!.set([0, 10, 11]); g.items.itemAvailMax[2] = 3;
  s.curMenu = MENU_UPGRADES;
  return { ctx, g, s, p0: g.players[0] };
}

describeData('shop upgrades (Shop B)', () => {
  it('entering a weapon: old_items snapshot, cash credited with the installed item, item list strings, cursor on the owned item', () => {
    const { ctx, g, s, p0 } = setup();
    p0.items.weapon[0]!.id = 2;
    p0.items.weapon[0]!.power = 3;
    s.curSel[MENU_UPGRADES] = 3;
    const before = p0.cash;
    menuFunctionUpgrades(ctx, s, 3);
    expect(s.curMenu).toBe(MENU_UPGRADE_SUB);
    expect(s.menuChoices[MENU_UPGRADE_SUB]).toBe(5);
    expect(s.curSel[MENU_UPGRADE_SUB]).toBe(3); // item 2 is the second entry
    expect(s.menuInt[5]!.slice(0, 4).map((x) => x.trimEnd())).toEqual(['Pulse-Cannon', 'Multi-Cannon', 'Vulcan Cannon', ctx.assets.helpText.miscText[13]]);
    expect(s.oldItems[0].weapon[0]!.id).toBe(2);
    // Multi-Cannon 750 + power 2 (1 * 750) + power 3 (3 * 750) = 3750 is credited: cash * 2 - cashLeft()
    expect(p0.cash).toBe(before + 3750);
    expect(cashLeft(ctx, s)).toBe(before);
    expect(s.weaponSimTime).toBe(0);
    expect(g.scratch.temp3).toBe(3);
  });

  it('Done: the first Enter moves the cursor to Done, the second leaves with the item paid for; Esc restores items, selection and cash', () => {
    const { ctx, p0, s } = setup();
    s.curSel[MENU_UPGRADES] = 3;
    menuFunctionUpgrades(ctx, s, 3);
    expect(p0.cash).toBe(10500); // the installed Pulse-Cannon (500) is credited
    p0.items.weapon[0]!.id = 7; // as the draw step does for the highlighted row (Vulcan Cannon, 600)
    menuFunctionUpgradeSub(ctx, s);
    expect(s.curSel[MENU_UPGRADE_SUB]).toBe(5);
    expect(s.curMenu).toBe(MENU_UPGRADE_SUB);
    menuFunctionUpgradeSub(ctx, s);
    expect(s.curMenu).toBe(MENU_UPGRADES);
    expect(p0.cash).toBe(9900);

    // Esc from the submenu restores what was installed on entry
    menuFunctionUpgrades(ctx, s, 3);
    expect(p0.cash).toBe(10500);
    p0.items.weapon[0]!.id = 2;
    s.curSel[MENU_UPGRADE_SUB] = 4;
    s.curMenu = MENU_UPGRADE_SUB;
    upgradeSubEscape(ctx, s);
    expect(p0.items.weapon[0]!.id).toBe(7);
    expect(s.curSel[MENU_UPGRADE_SUB]).toBe(s.lastCurSel);
    expect(p0.cash).toBe(9900);
  });

  it('power -/+ and the temp_weapon_power table follow the cursor; power never leaves 1..11 and unaffordable steps click', () => {
    const { ctx, s, p0 } = setup();
    s.curSel[MENU_UPGRADES] = 3;
    resetTempWeaponPower(ctx, s);
    menuFunctionUpgrades(ctx, s, 3);
    s.curMenu = MENU_UPGRADE_SUB;
    s.leftPower = false; s.rightPower = true; s.rightPowerAfford = true;
    upgradeSubLeftRight(ctx, s, -1); // can not downgrade
    expect(p0.items.weapon[0]!.power).toBe(1);
    upgradeSubLeftRight(ctx, s, 1);
    expect(p0.items.weapon[0]!.power).toBe(2);
    expect(s.tempWeaponPower[s.curSel[MENU_UPGRADE_SUB]! - 2]).toBe(2);
    s.rightPowerAfford = false;
    upgradeSubLeftRight(ctx, s, 1);
    expect(p0.items.weapon[0]!.power).toBe(2);
    // moving the cursor to another row loads that row's remembered power
    s.tempWeaponPower[1] = 5;
    s.curSel[MENU_UPGRADE_SUB] = 3;
    upgradeSubCursorMoved(ctx, s);
    expect(p0.items.weapon[0]!.power).toBe(5);
  });

  it('`/` cycles the rear weapon mode only on the rear screen and wraps at opnum', () => {
    const { ctx, g, s, p0 } = setup();
    s.curMenu = MENU_UPGRADE_SUB;
    s.curSel[MENU_UPGRADES] = 4;
    p0.items.weapon[1]!.id = 10; // Multi-Cannon (rear), opnum 2
    p0.weaponMode = 1;
    upgradeSubSlash(ctx, s);
    expect(p0.weaponMode).toBe(2);
    upgradeSubSlash(ctx, s);
    expect(p0.weaponMode).toBe(1);
    expect(g.items.weaponPort[10]!.opnum).toBe(2);
    s.curSel[MENU_UPGRADES] = 3;
    upgradeSubSlash(ctx, s);
    expect(p0.weaponMode).toBe(1);
    s.curMenu = MENU_FULL_GAME;
    expect(isWeaponSimMenu(s)).toBe(false);
  });

  it('JE_initWeaponView draws 400 random numbers (the starfield) and resets the simulator state', () => {
    const { ctx, g, p0 } = setup();
    const before = ctx.rng.calls;
    g.playerShots.shotAvail.fill(5);
    g.config.shotRepeat.fill(9);
    initWeaponView(ctx);
    expect(ctx.rng.calls - before).toBe(400);
    expect([p0.x, p0.y, g.config.power, g.config.lastPower]).toEqual([72, 110, 500, 500]);
    expect([...g.playerShots.shotAvail].every((v) => v === 0)).toBe(true);
    expect([...g.config.shotRepeat].every((v) => v === 1)).toBe(true);
    expect([p0.sidekick[0].x, p0.sidekick[0].y, p0.sidekick[1].x, p0.sidekick[1].y]).toEqual([57, 120, 87, 120]);
    initializeStarfield(ctx); // same call the level uses
  });

  it('the simulator frame fires the front weapon and shots leave the 140x170 box after being drawn', () => {
    const { ctx, g, s, p0 } = setup();
    s.curMenu = MENU_UPGRADE_SUB;
    s.curSel[MENU_UPGRADES] = 3;
    initWeaponView(ctx);
    const rng0 = ctx.rng.calls;
    for (let i = 0; i < 200; i++) weaponSimUpdate(ctx, s);
    expect(ctx.rng.calls).toBe(rng0); // the simulator itself draws nothing after the starfield
    expect(s.weaponSimTime).toBe(50);
    expect(g.config.power).toBeGreaterThan(0);
    // every live shot is inside the box
    for (let z = 0; z < g.playerShots.shotAvail.length - 1; z++) {
      if (g.playerShots.shotAvail[z] !== 0) {
        const sh = g.playerShots.playerShotData[z]!;
        expect(sh.shotX).toBeGreaterThanOrEqual(0); expect(sh.shotX).toBeLessThanOrEqual(140);
        expect(sh.shotY).toBeGreaterThanOrEqual(0); expect(sh.shotY).toBeLessThanOrEqual(170);
      }
    }
    expect(p0.x).toBe(72);
    simulatePlayerShots(ctx);
  });
});
