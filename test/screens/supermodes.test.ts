// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { SC } from '../../tools/oracle/scenarios-shopc';
import { DIFFICULTY_HARD, DIFFICULTY_SUICIDE, DIFFICULTY_ZINGLON } from '../../src/game/world';
import { newSuperArcadeGame, newSuperTyrianGame, whoa } from '../../src/screens/supermodes';
import { describeData } from '../helpers/data';
import { drive, menuCtx } from '../helpers/drive';

const R = SC.Return, E = SC.Escape;

describeData('newSuperArcadeGame', () => {
  it('STEALTH: Normal difficulty makes the game one level harder, sets the arcade state and the ship loadout', async () => {
    const ctx = menuCtx();
    // episode select Return, difficulty select Return (Normal), then wait_input after the ship screen
    const ok = await drive(ctx, (c) => newSuperArcadeGame(c, 0), (t) => t.tap(R).wait(24).tap(R).wait(90).tap(R), 200);
    const c = ctx.game.config, p = ctx.game.players[0];
    expect(ok).toBe(true);
    expect([c.onePlayerAction, c.superArcadeMode, c.timedBattleMode, ctx.game.varz.gameLoaded]).toEqual([true, 1, false, true]);
    expect(c.initialDifficulty).toBe(DIFFICULTY_HARD); // initialDifficulty = ++difficultyLevel (C quirk)
    expect([p.cash, p.items.ship, p.items.weapon[0].id, p.items.special]).toEqual([0, ctx.game.tables.SAShip[0], ctx.game.tables.SAWeapon[0]![0], ctx.game.tables.SASpecialWeapon[0]]);
  });
  it('Esc in the episode select returns false and leaks nothing', async () => {
    const ctx = menuCtx();
    expect(await drive(ctx, (c) => newSuperArcadeGame(c, 0), (t) => t.tap(E))).toBe(false);
    const c = ctx.game.config;
    expect([c.onePlayerAction, c.superArcadeMode, c.superTyrian, ctx.game.varz.gameLoaded]).toEqual([false, 0, false, false]);
  });
  it('Esc in the difficulty select leaks nothing either', async () => {
    const ctx = menuCtx();
    expect(await drive(ctx, (c) => newSuperArcadeGame(c, 3), (t) => t.tap(R).wait(24).tap(E))).toBe(false);
    expect([ctx.game.config.onePlayerAction, ctx.game.config.superArcadeMode]).toEqual([false, 0]);
    expect([ctx.game.varz.gameLoaded, ctx.game.config.superTyrian]).toEqual([false, false]);
  });
  it('Nort-Ship Z (i = 6) gets sidekick 24 in both slots (tyrian2.c:3676 onwards)', async () => {
    const ctx = menuCtx();
    expect(await drive(ctx, (c) => newSuperArcadeGame(c, 6), (t) => t.tap(R).wait(24).tap(R).wait(90).tap(R), 200)).toBe(true);
    expect([...ctx.game.players[0].items.sidekick]).toEqual([24, 24]);
  });
});

describeData('newSuperTyrianGame', () => {
  it('without ScrollLock the run is ZINGLON with the ENGAGE ship; with it, SUICIDE', async () => {
    let ctx = menuCtx();
    expect(await drive(ctx, newSuperTyrianGame, (t) => t.tap(R).wait(40).tap(R), 600)).toBe(true); // text screen key, episode Return
    const c = ctx.game.config, p = ctx.game.players[0];
    expect([c.superTyrian, c.onePlayerAction, c.initialDifficulty, c.difficultyLevel]).toEqual([true, true, DIFFICULTY_ZINGLON, DIFFICULTY_ZINGLON]);
    expect([p.cash, p.items.ship, p.items.weapon[0].id]).toEqual([0, 13, 39]);
    ctx = menuCtx();
    expect(await drive(ctx, (c) => { c.input.keysactive[71] = 1; /* ScrollLock held when the code is typed */ return newSuperTyrianGame(c); }, (t) => t.tap(R).wait(40).tap(R), 600)).toBe(true);
    expect(ctx.game.config.initialDifficulty).toBe(DIFFICULTY_SUICIDE);
  });
  it('Esc at the episode select cancels with nothing set', async () => {
    const ctx = menuCtx();
    expect(await drive(ctx, newSuperTyrianGame, (t) => t.tap(R).wait(40).tap(E), 600)).toBe(false);
    const c = ctx.game.config;
    expect([c.superTyrian, c.onePlayerAction, ctx.game.varz.gameLoaded]).toEqual([false, false, false]);
  });
});

describeData('whoa', () => {
  it('bleeds a lit screen towards black, borders cleared first, and sets levelWarningLines', async () => {
    const ctx = menuCtx();
    ctx.vga.screen.pixels.fill(200);
    ctx.vga.screen2.pixels.fill(7);
    await drive(ctx, whoa, (t) => t.tap(R), 5);
    const px = ctx.vga.screen.pixels;
    expect(px.subarray(0, 1280).every((v) => v === 0)).toBe(true);
    expect(px.subarray(64000 - 960).every((v) => v === 0)).toBe(true);
    expect(ctx.game.text.levelWarningLines).toBe(4);
  });
});
