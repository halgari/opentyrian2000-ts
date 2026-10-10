import { expect, it, vi } from 'vitest';
import { SC } from '../../tools/oracle/scenarios-shopc';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { runEpisodeScript } from '../../src/game/script';
import { newGame, timedBattleSelect } from '../../src/screens/select';
import { testCtx } from '../helpers/ctx';
import { describeData } from '../helpers/data';
import { drive, menuCtx } from '../helpers/drive';
import { useScript } from '../helpers/script';

const highScoreCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/screens/highscores', async (orig) => ({
  ...(await orig<typeof import('../../src/screens/highscores')>()),
  highScoreCheck: async (): Promise<void> => { highScoreCalls.n++; },
}));

const D = SC.Down, R = SC.Return, E = SC.Escape;


describeData('timed battle', () => {
  it('timedBattleSelect: Deliani -> episode 1, selection 1; Savara -> episode 5, selection 3; Esc cancels', async () => {
    let ctx = menuCtx();
    expect(await drive(ctx, timedBattleSelect, (t) => t.tap(R))).toBe(true);
    expect([ctx.game.items.episodeNum, ctx.game.config.timeBattleSelection]).toEqual([1, 1]);
    ctx = menuCtx();
    expect(await drive(ctx, timedBattleSelect, (t) => t.tap(D, D, R))).toBe(true);
    expect([ctx.game.items.episodeNum, ctx.game.config.timeBattleSelection]).toEqual([5, 3]);
    ctx = menuCtx();
    expect(await drive(ctx, timedBattleSelect, (t) => t.tap(E))).toBe(false);
  });

  it('newGame with item 3: Stalker ship, no cash, onePlayerAction + timedBattleMode', async () => {
    const ctx = menuCtx();
    // gameplaySelect Down Down Return; timedBattleSelect Return; difficultySelect Return
    expect(await drive(ctx, newGame, (t) => t.tap(D, D, R).wait(40).tap(R).wait(40).tap(R), 400)).toBe(true);
    const c = ctx.game.config, p = ctx.game.players[0];
    expect([c.timedBattleMode, c.onePlayerAction, p.cash, p.items.ship]).toEqual([true, true, 0, 8]);
  });

  it('a following Full Game does not inherit the mode (Review Focus 4)', async () => {
    const ctx = menuCtx();
    await drive(ctx, newGame, (t) => t.tap(D, D, R).wait(40).tap(R).wait(40).tap(R), 400);
    initPlayerData(ctx); // the main loop's JE_initPlayerData (opentyr.c:851) between sessions
    ctx.game.varz.gameLoaded = false;
    await drive(ctx, newGame, (t) => t.tap(R).wait(40).tap(R).wait(40).tap(R), 400); // Full Game, episode 1, Normal
    const c = ctx.game.config;
    expect([c.timedBattleMode, c.onePlayerAction, c.twoPlayerMode]).toEqual([false, false, false]);
    expect(ctx.game.players[0].items.ship).not.toBe(8);
  });

  it(']T jumps to the section of the selection; ]T and ]q do nothing outside timed battle', async () => {
    // sections are counted by their `*` marker lines, so 42 empty ones put DELI at section 43
    const lines = ['*1', ']T[ 43 44 45 46 47', ']L[ 9999 001 NOPE 18 09', ...Array<string>(41).fill('*x'),
      '*43', ']L[ 9999 002 DELI 18 09', '*44', ']L[ 9999 003 STATION 18 09', '*45', ']L[ 9999 004 SAVARA 18 09'];
    for (const [sel, want] of [[1, 43], [2, 44], [3, 45]] as const) {
      const ctx = testCtx()!;
      loadConfigurationDefaults(ctx); initPlayerData(ctx); initEpisode(ctx, 1);
      ctx.game.config.timedBattleMode = true; ctx.game.config.timeBattleSelection = sel;
      useScript(ctx, lines);
      ctx.game.config.mainLevel = 1;
      expect(await runEpisodeScript(ctx, new Uint8Array(256))).toBe('level');
      expect(ctx.game.config.mainLevel).toBe(want);
    }
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx); initPlayerData(ctx); initEpisode(ctx, 1);
    useScript(ctx, ['*1', ']T[ 43 44 45 46 47', ']q', ']L[ 9999 001 NOPE 18 09']);
    ctx.game.config.mainLevel = 1;
    highScoreCalls.n = 0;
    expect(await runEpisodeScript(ctx, new Uint8Array(256))).toBe('level');
    expect(ctx.game.config.mainLevel).toBe(1); // untouched: not in timed battle
    expect(highScoreCalls.n).toBe(0);
  });

  it(']q in timed battle runs the high score check, clears mainLevel and returns', async () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx); initPlayerData(ctx); initEpisode(ctx, 1);
    ctx.game.config.timedBattleMode = true;
    useScript(ctx, ['*1', ']q', ']L[ 9999 001 NOPE 18 09']);
    ctx.game.config.mainLevel = 1;
    highScoreCalls.n = 0;
    expect(await runEpisodeScript(ctx, new Uint8Array(256))).toBe('return');
    expect([ctx.game.config.mainLevel, highScoreCalls.n]).toEqual([0, 1]);
  });
});
