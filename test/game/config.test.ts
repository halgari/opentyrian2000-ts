import { expect, it } from 'vitest';
import { initPlayerData, loadConfigurationDefaults, setNewGameSpeed } from '../../src/game/config';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';
import { waitDelayPlain } from '../../src/platform/wait';
import { PIT_PERIOD_MS } from '../../src/platform/delay';

describeData('config defaults', () => {
  it('loadConfigurationDefaults sets C defaults and burns exactly 174 mt_rand draws', () => {
    const ctx = testCtx()!;
    expect(ctx.rng.calls).toBe(0);
    loadConfigurationDefaults(ctx);
    expect(ctx.rng.calls).toBe(174);
    const c = ctx.game.config;
    expect(c.tyrMusicVolume).toBe(191);
    expect(c.fxVolume).toBe(191);
    expect(c.processorType).toBe(3);
    expect(c.gameSpeed).toBe(4);
    expect(c.versionNum).toBe(3);
    expect(c.soundEffects).toBe(1);
    expect(c.fastPlay).toBe(0);
    expect(c.smoothScroll).toBe(false); // processorType 3
    expect(c.wild).toBe(false);
    expect(c.superWild).toBe(false);
    expect(c.explosionTransparent).toBe(true);
    expect(c.filtrationAvail).toBe(false);
    expect(c.background2).toBe(true);
    expect(c.displayScore).toBe(true);
    expect(Array.from(c.dosKeySettings)).toEqual([72, 80, 75, 77, 57, 28, 29, 56]);
    expect(c.editorLevel).toBe(800);
    expect(c.saveFiles[0]!.highScore1 % 1000).toBe(0);
    expect(c.t2kHighScores[19]![2]!.score % 1000).toBe(0);
  });

  it('initPlayerData draws exactly one value and sets the new-game items', () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx);
    initPlayerData(ctx);
    expect(ctx.rng.calls).toBe(175);
    const g = ctx.game;
    expect(g.config.secretHint).toBeGreaterThanOrEqual(1);
    expect(g.config.secretHint).toBeLessThanOrEqual(3);
    expect(g.players[0].items.ship).toBe(1);
    expect(g.players[0].items.weapon[0].id).toBe(1);
    expect(g.players[0].items.weapon[0].power).toBe(1);
    expect(g.players[1].items.weapon[1].id).toBe(15);
    expect(g.players[1].items.weapon[1].power).toBe(1);
    expect(g.players[1].items.sidekickLevel).toBe(101);
    expect(g.players[0].lastItems.weapon[1].id).toBe(0);
    expect(g.players[1].isDragonwing).toBe(true);
    expect(g.players[0].weaponMode).toBe(1);
    expect(g.config.mainLevel).toBe(1);
    expect(g.config.lastLevelName).toBe(ctx.assets.helpText.miscText[19]);
    // lives alias set up the way mainint.c:1082 does
    g.players[0].items.weapon[0].power = 7;
    expect(g.players[0].lives).toBe(7);
    g.players[1].lives = 4;
    expect(g.players[1].items.weapon[1].power).toBe(4);
    // the struct copy must not alias player 0's items
    expect(g.players[1].items).not.toBe(g.players[0].items);
  });

  it('setNewGameSpeed after defaults: fastPlay 0 -> 0x4300, smoothScroll, frameCountMax 2', () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx);
    setNewGameSpeed(ctx);
    const c = ctx.game.config;
    expect(c.fastPlay).toBe(0);
    expect(c.smoothScroll).toBe(true);
    expect(c.frameCountMax).toBe(2);
    expect(c.pentiumMode).toBe(false);
    // delay speed 0x4300: setDelay(2) targets now + 2 * 0x4300 * pitPeriod
    expect(ctx.delay.remaining()).toBe(Math.trunc(Math.fround(2 * Math.fround(0x4300 * PIT_PERIOD_MS))));
  });

  it('setNewGameSpeed rejects an invalid fastPlay like the C assert', () => {
    const ctx = testCtx()!;
    ctx.game.config.fastPlay = 9;
    expect(() => setNewGameSpeed(ctx)).toThrow();
  });
});

describeData('waitDelayPlain', () => {
  it('sleeps out the remaining delay without servicing input', async () => {
    const ctx = testCtx()!;
    ctx.delay.setDelay(200);
    ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 });
    await waitDelayPlain(ctx);
    expect(ctx.clock.now()).toBeGreaterThanOrEqual(2875);
    expect(ctx.input.newkey).toBe(false); // events were not serviced
  });
  it('returns immediately when the target has passed', async () => {
    const ctx = testCtx()!;
    await waitDelayPlain(ctx);
    expect(ctx.clock.now()).toBe(0);
  });
});
