// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/ctx';
import type { InputEvent } from '../../src/platform/input';
import { Scancode } from '../../src/platform/scancodes';
import { ShopState, itemScreen, quitRequest } from '../../src/screens/shop';
import { MENU_1_PLAYER_ARCADE, MENU_FULL_GAME, MENU_PLAY_NEXT_LEVEL } from '../../src/screens/shop-draw';
import { PLANET_X, PLANET_Y, computeDots, NavState, partWay } from '../../src/screens/shop-nav';
import { describeData, testArchive } from '../helpers/data';
import { newGameWorld } from '../helpers/shop';

const tap = (scancode: number): InputEvent[] => [{ type: 'keydown', scancode, mod: 0 }, { type: 'keyup', scancode }];
const click = (x: number, y: number): InputEvent[] => [
  { type: 'mousemove', x, y, moved: true }, { type: 'mousedown', button: 1, x, y },
];

/** A ctx at a shop with two planets (origin 1 -> planets 1 and 2, sections 7 and 8) and a driver that injects events at TS frame numbers. */
function shopCtx(plan: Record<number, InputEvent[]>, opts?: { arcade?: boolean }): { ctx: Ctx; frames: () => number } {
  const ctx = newGameWorld();
  const v = ctx.game.varz;
  v.mapOrigin = 1; v.mapPNum = 2;
  v.mapPlanet.set([1, 2]); v.mapSection.set([7, 8]);
  v.songBuy = 2;
  if (opts?.arcade) ctx.game.config.onePlayerAction = true;
  let frames = 0;
  ctx.frameSink = () => {
    for (const e of plan[frames] ?? []) ctx.input.push(e);
    if (++frames > 2000) throw new Error('shop never ended');
  };
  // a pressed mouse button is released while the shop waits for it (wait_noinput presents no frame)
  const sleep = ctx.clock.sleep.bind(ctx.clock);
  ctx.clock.sleep = async (ms: number) => {
    if (ctx.input.mousedown) ctx.input.push({ type: 'mouseup', button: 1, x: ctx.input.mouseX, y: ctx.input.mouseY });
    await sleep(ms);
  };
  return { ctx, frames: () => frames };
}

describeData('shop (Shop A)', () => {
  it('Next Level -> second planet: mainLevel = mapSection[1], jumpSection, planet dots for the selection, STATE-visible curMenu', async () => {
    const { ctx } = shopCtx({
      3: tap(Scancode.Down), 5: tap(Scancode.Down), 7: tap(Scancode.Down), 9: tap(Scancode.Down), // FULL_GAME row 2 -> 6 (Next Level)
      12: tap(Scancode.Return), // -> MENU_PLAY_NEXT_LEVEL
      16: tap(Scancode.Down), 18: tap(Scancode.Return), // second planet
    });
    const state = new ShopState();
    await itemScreen(ctx, state);
    expect(ctx.game.config.mainLevel).toBe(8);
    expect(ctx.game.varz.jumpSection).toBe(true);
    expect(ctx.game.varz.gameLoaded).toBe(false);
    expect(state.curMenu).toBe(MENU_PLAY_NEXT_LEVEL);
    expect(state.menuInt[4]!.slice(0, 4)).toEqual(['Next Level', ctx.assets.helpText.pName[0], ctx.assets.helpText.pName[1], ctx.assets.helpText.miscText[5]]);
    expect(state.menuChoices[MENU_PLAY_NEXT_LEVEL]).toBe(4);
    expect(state.nav!.planetDots[1]).toBe(7); // origin 1 (200,40) -> planet 2 (150,90): round(sqrtf(sqrtf(5000))) - 1
    expect(ctx.game.scratch.temp).toBe(2); // JE_menuFunction's `temp = mapPlanet[x]` loop leaves the last planet
  });

  it('the shop prologue merges last_items into itemAvail and sorts it (a 0 entry, "None", sorts last), writing the scratch globals', async () => {
    const { ctx } = shopCtx({ 3: tap(Scancode.Down), 5: tap(Scancode.Down), 7: tap(Scancode.Down), 9: tap(Scancode.Down), 12: tap(Scancode.Return), 16: tap(Scancode.Return) });
    const g = ctx.game;
    g.items.itemAvail[1]!.set([13, 2, 7]);
    g.items.itemAvailMax[1] = 3;
    g.items.itemAvail[2]!.set([0, 9]);
    g.items.itemAvailMax[2] = 2;
    g.players[0].lastItems.weapon[0]!.id = 1;
    g.players[0].lastItems.weapon[1]!.id = 9; // already for sale
    g.players[0].lastItems.ship = 1;
    await itemScreen(ctx);
    expect(Array.from(g.items.itemAvail[1]!.subarray(0, 4))).toEqual([1, 2, 7, 13]);
    expect(g.items.itemAvailMax[1]).toBe(4);
    expect(Array.from(g.items.itemAvail[2]!.subarray(0, 2))).toEqual([9, 0]); // the C's `itemAvail[temp] == 0` clause swaps a leading 0 away
    expect(g.items.itemAvailMax[2]).toBe(2);
  });

  it('Escape asks to quit; Escape in the dialog keeps playing, Enter on "Quit" sets gameLoaded and mainLevel 0 and fades to black', async () => {
    const { ctx } = shopCtx({ 3: tap(Scancode.Escape), 10: tap(Scancode.Escape), 20: tap(Scancode.Escape), 30: tap(Scancode.Return) });
    await itemScreen(ctx);
    expect(ctx.game.varz.gameLoaded).toBe(true);
    expect(ctx.game.config.mainLevel).toBe(0);
    expect(ctx.palette.current.every((b) => b === 0)).toBe(true);
  });

  it('the quit row of the full-game menu (row 7) also asks', async () => {
    const { ctx } = shopCtx({ 3: tap(Scancode.Up), 6: tap(Scancode.Return), 15: tap(Scancode.Return) });
    const state = new ShopState();
    await itemScreen(ctx, state);
    expect(state.curSel[MENU_FULL_GAME]).toBe(7);
    expect(ctx.game.varz.gameLoaded).toBe(true);
  });

  it('quit dialog: Left/Tab toggle, mouse regions answer (No on the right button)', async () => {
    const ctx = newGameWorld();
    let f = 0;
    const events: Record<number, InputEvent[]> = { 2: tap(Scancode.Left), 4: tap(Scancode.Tab), 6: click(190, 130) };
    ctx.frameSink = () => { for (const e of events[f] ?? []) ctx.input.push(e); f++; };
    const sleep = ctx.clock.sleep.bind(ctx.clock);
    ctx.clock.sleep = async (ms) => { if (ctx.input.mousedown && f > 6) ctx.input.push({ type: 'mouseup', button: 1, x: 190, y: 130 }); await sleep(ms); };
    expect(await quitRequest(ctx)).toBe(false);
  });

  it('mouse: a click selects a row, a second click on it activates (Next Level opens the planet map)', async () => {
    const { ctx } = shopCtx({
      3: click(200, 102), // (102 - 38) / 16 + 2 = 6: Next Level selected
      8: [{ type: 'mousedown', button: 1, x: 200, y: 102 }],
      14: tap(Scancode.Return), // first planet
    });
    const state = new ShopState();
    await itemScreen(ctx, state);
    expect(state.curMenu).toBe(MENU_PLAY_NEXT_LEVEL);
    expect(ctx.game.config.mainLevel).toBe(7);
    expect(ctx.game.varz.mouseX).toBe(200); // the mouse.c globals the level reads later
  });

  it('1-player arcade menu: Play goes to the last planet section, Quit asks', async () => {
    const { ctx } = shopCtx({ 3: tap(Scancode.Return) }, { arcade: true });
    const state = new ShopState();
    await itemScreen(ctx, state);
    expect(state.curMenu).toBe(MENU_1_PLAYER_ARCADE);
    expect(ctx.game.config.mainLevel).toBe(8);
    expect(ctx.game.varz.jumpSection).toBe(true);

    const q = shopCtx({ 3: tap(Scancode.Down), 5: tap(Scancode.Down), 7: tap(Scancode.Return), 15: tap(Scancode.Return) }, { arcade: true });
    await itemScreen(q.ctx);
    expect(q.ctx.game.varz.gameLoaded).toBe(true);
    expect(q.ctx.game.config.mainLevel).toBe(0);
  });

  it('menus of Tasks 10/11 are extension points that throw "unported: shop menu N (task 10/11)"', async () => {
    // FULL_GAME row 4 = Upgrade Ship
    const up = shopCtx({ 3: tap(Scancode.Down), 5: tap(Scancode.Down), 7: tap(Scancode.Return) });
    await expect(itemScreen(up.ctx)).rejects.toThrow('unported: shop menu 1 (task 10/11)');
    // row 5 = Options
    const opt = shopCtx({ 3: tap(Scancode.Down), 5: tap(Scancode.Down), 7: tap(Scancode.Down), 9: tap(Scancode.Return) });
    await expect(itemScreen(opt.ctx)).rejects.toThrow('unported: shop menu 2 (task 10/11)');
    // row 2 = Data Cubes
    const cube = shopCtx({ 3: tap(Scancode.Return) });
    await expect(itemScreen(cube.ctx)).rejects.toThrow('unported: shop menu 7 (task 10/11)');
  });

  it('two-player and SuperTyrian shops are unported (sp5)', async () => {
    const a = shopCtx({});
    a.ctx.game.config.twoPlayerMode = true;
    await expect(itemScreen(a.ctx)).rejects.toThrow('unported: shop menu 9');
    const b = shopCtx({});
    b.ctx.game.config.superTyrian = true;
    await expect(itemScreen(b.ctx)).rejects.toThrow('unported: shop menu 13');
  });
});

describe('shop-nav: dots and planet math', () => {
  it('partWay is C int arithmetic (truncating division)', () => {
    expect(partWay(200, 150, 7, 0)).toBe(195); // -50 / 9 = -5 (not -6)
    expect(partWay(200, 150, 7, 6)).toBe(165); // -5 * 7 + 200
  });

  it('computeDots: roundf(sqrtf(sqrtf(dx*dx + dy*dy))) - 1 dots, at most 10, 0 for the origin itself', () => {
    const ctx = newGameWorldOrNull();
    if (!ctx) return;
    const v = ctx.game.varz;
    v.mapOrigin = 1; v.mapPNum = 3;
    v.mapPlanet.set([1, 2, 18]); // origin itself, (150,90), (330,55)
    const nav = new NavState();
    computeDots(ctx, nav);
    expect(Array.from(nav.planetDots.subarray(0, 3))).toEqual([0, 7, 10]); // 17125 -> 130.9 -> 11.44 -> 11 - 1 = 10 (the cap)
    expect(PLANET_X[1]).toBe(150);
    expect(PLANET_Y[1]).toBe(90);
    expect(nav.planetDotX[1]![0]).toBe(195);
    expect(nav.planetDotY[1]![0]).toBe(45); // 40 + 50 / 9 = 40 + 5
  });
});

function newGameWorldOrNull(): Ctx | null {
  return testArchive ? newGameWorld() : null;
}
