import { expect, it } from 'vitest';
import type { Ctx } from '../../src/ctx';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { readPlayerInput } from '../../src/game/input-level';
import { inputDeviceOf, playerLinking, scrollAnchorX } from '../../src/game/twoplayer';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('two-player linking', () => {
  function twoShips(): Ctx {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx); initPlayerData(ctx); initEpisode(ctx, 1);
    const g = ctx.game;
    g.config.twoPlayerMode = true;
    for (const p of g.players) { p.isAlive = true; p.armor = 10; }
    g.players[0].x = 100; g.players[0].y = 160;
    g.varz.mouseX = 100; g.varz.mouseY = 160;
    return ctx;
  }
  /** Player 2 stands still this frame (x == mouseXB), as the C requires for link detection. */
  function place2(ctx: Ctx, x: number, y: number): void {
    const p = ctx.game.players[1];
    p.x = x; p.y = y;
    ctx.game.varz.mouseXB = x; ctx.game.varz.mouseYB = y;
  }
  it('ships within 8 px link; one pixel further they do not', () => {
    const ctx = twoShips();
    place2(ctx, 107, 160);
    playerLinking(ctx, ctx.game.players[1], 2, ctx.game.varz.button);
    expect(ctx.game.config.twoPlayerLinked).toBe(true);
    ctx.game.config.twoPlayerLinked = false;
    place2(ctx, 108, 160); // abs(dx) < 8 is the C's test
    playerLinking(ctx, ctx.game.players[1], 2, ctx.game.varz.button);
    expect(ctx.game.config.twoPlayerLinked).toBe(false);
  });
  it('a ship that moved this frame does not link', () => {
    const ctx = twoShips();
    place2(ctx, 104, 160);
    ctx.game.varz.mouseXB = 103;
    playerLinking(ctx, ctx.game.players[1], 2, ctx.game.varz.button);
    expect(ctx.game.config.twoPlayerLinked).toBe(false);
  });
  it('a dead partner never links', () => {
    const ctx = twoShips();
    place2(ctx, 104, 160); ctx.game.players[1].isAlive = false;
    playerLinking(ctx, ctx.game.players[1], 2, ctx.game.varz.button);
    expect(ctx.game.config.twoPlayerLinked).toBe(false);
  });
  it('galaga never links', () => {
    const ctx = twoShips();
    ctx.game.config.galagaMode = true;
    place2(ctx, 104, 160);
    playerLinking(ctx, ctx.game.players[1], 2, ctx.game.varz.button);
    expect(ctx.game.config.twoPlayerLinked).toBe(false);
  });
  it('linkGunDirec stays a finite float32 while player 2 fires linked and steers', () => {
    const ctx = twoShips();
    place2(ctx, 104, 160);
    const b = ctx.game.varz.button;
    playerLinking(ctx, ctx.game.players[1], 2, b);
    expect(ctx.game.config.twoPlayerLinked).toBe(true);
    const p = ctx.game.players[1];
    for (let i = 0; i < 400; i++) {
      b[0] = true; b[1] = i % 3 === 0; b[2] = i % 5 === 0;
      ctx.game.varz.mouseXB = p.x - [3, 0, -3, 0][i % 4]!; ctx.game.varz.mouseYB = p.y - [0, 3, 0, -3][i % 4]!;
      playerLinking(ctx, p, 2, b);
      const d = ctx.game.config.linkGunDirec;
      expect(Number.isFinite(d)).toBe(true);
      expect(Math.fround(d)).toBe(d);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(2 * Math.PI + 1e-6);
    }
  });
  it('link gun turns by 0.2 toward the moved direction and snaps within 0.3', () => {
    const ctx = twoShips();
    place2(ctx, 104, 160);
    const c = ctx.game.config; const b = ctx.game.varz.button;
    playerLinking(ctx, ctx.game.players[1], 2, b);
    b[0] = true;
    c.linkGunDirec = Math.fround(Math.PI);
    ctx.game.varz.mouseXB = 101; // moved right by 3: tempR = pi/2, d - tempR < pi so d -= 0.2f
    playerLinking(ctx, ctx.game.players[1], 2, b);
    expect(c.linkGunDirec).toBe(Math.fround(Math.fround(Math.PI) - Math.fround(0.2)));
    c.linkGunDirec = Math.fround(Math.PI / 2 + 0.1); // within 0.3: snaps
    playerLinking(ctx, ctx.game.players[1], 2, b);
    expect(c.linkGunDirec).toBe(Math.fround(Math.PI / 2));
  });
  it('scrollAnchorX averages both ships in two-player mode only', () => {
    const ctx = twoShips();
    ctx.game.players[1].x = 201;
    expect(scrollAnchorX(ctx.game)).toBe(150);
    ctx.game.config.twoPlayerMode = false;
    expect(scrollAnchorX(ctx.game)).toBe(100);
  });
  it('inputDeviceOf routes the configured devices in two-player mode, 0 otherwise', () => {
    const ctx = twoShips();
    expect([inputDeviceOf(ctx, 1), inputDeviceOf(ctx, 2)]).toEqual([1, 2]);
    ctx.game.config.twoPlayerMode = false;
    expect(inputDeviceOf(ctx, 1)).toBe(0);
  });
  it('a joystick device with no pad is unported until Task 8', () => {
    const ctx = twoShips();
    ctx.game.config.inputDevice[1] = 4;
    expect(() => readPlayerInput(ctx, ctx.game.players[1], 4)).toThrow(/unported/);
  });
});
