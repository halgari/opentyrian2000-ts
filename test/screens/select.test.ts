// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { SC } from '../../tools/oracle/scenarios-shopc';
import { setSaveName } from '../../src/game/save';
import { DIFFICULTY_EASY, DIFFICULTY_HARD, DIFFICULTY_IMPOSSIBLE, DIFFICULTY_NORMAL, DIFFICULTY_SUICIDE, DIFFICULTY_ZINGLON } from '../../src/game/world';
import { highScoreScreen } from '../../src/screens/highscores';
import { loadScreen } from '../../src/screens/loadscreen';
import { difficultySelect, episodeSelect, gameplaySelect, newGame } from '../../src/screens/select';
import { setupMenu } from '../../src/screens/setup';
import { describeData } from '../helpers/data';
import { Stop } from '../helpers/inject';
import { drive, menuCtx } from '../helpers/drive';

const D = SC.Down, U = SC.Up, R = SC.Return, E = SC.Escape;
const LSHIFT = 225, KEY_G = 10, KEY_RBRACKET = 48, KEY_L = 15, KEY_O = 18, KEY_R = 21, KEY_D = 7;

describeData('gameplaySelect', () => {
  it('Full Game and 1 Player Arcade set the mode flags; Esc cancels', async () => {
    let ctx = menuCtx();
    expect(await drive(ctx, gameplaySelect, (t) => t.tap(R))).toBe(true);
    expect([ctx.game.config.onePlayerAction, ctx.game.config.timedBattleMode, ctx.game.config.twoPlayerMode]).toEqual([false, false, false]);
    ctx = menuCtx();
    expect(await drive(ctx, gameplaySelect, (t) => t.tap(D, R))).toBe(true);
    expect(ctx.game.config.onePlayerAction).toBe(true);
    ctx = menuCtx();
    expect(await drive(ctx, gameplaySelect, (t) => t.tap(E))).toBe(false);
  });
  it('wraps with Up, accepts timed battle, and accepts 2-player arcade, refuses the network row (the screen stays up)', async () => {
    const ctx = menuCtx();
    // Up wraps to the network row: refused, still waiting -> the driver stops it
    await expect(drive(ctx, gameplaySelect, (t) => t.tap(U, R))).rejects.toBeInstanceOf(Stop);
    const c2 = menuCtx();
    expect(await drive(c2, gameplaySelect, (t) => t.tap(D, D, R))).toBe(true); // timed battle
    expect([c2.game.config.timedBattleMode, c2.game.config.onePlayerAction, c2.game.config.twoPlayerMode]).toEqual([true, false, false]);
    const c3 = menuCtx();
    expect(await drive(c3, gameplaySelect, (t) => t.tap(D, D, D, R))).toBe(true); // 2-player arcade
    expect([c3.game.config.twoPlayerMode, c3.game.config.onePlayerAction, c3.game.config.timedBattleMode]).toEqual([true, false, false]);
  });
});

describeData('episodeSelect', () => {
  it('picks an available episode, sets initialEpisodeNum, and Esc cancels', async () => {
    const ctx = menuCtx();
    expect(await drive(ctx, episodeSelect, (t) => t.tap(D, D, R))).toBe(true);
    expect(ctx.game.items.episodeNum).toBe(3);
    expect(ctx.game.items.initialEpisodeNum).toBe(3);
    const c2 = menuCtx();
    expect(await drive(c2, episodeSelect, (t) => t.tap(E))).toBe(false);
  });
  it('refuses an unavailable episode', async () => {
    const ctx = menuCtx();
    ctx.game.items.episodeAvail[1] = false;
    await expect(drive(ctx, episodeSelect, (t) => t.tap(D, R))).rejects.toBeInstanceOf(Stop);
  });
  it('Up wraps to episode 5', async () => {
    const ctx = menuCtx();
    expect(await drive(ctx, episodeSelect, (t) => t.tap(U, R))).toBe(true);
    expect(ctx.game.items.episodeNum).toBe(5);
  });
});

describeData('difficultySelect', () => {
  it('starts on Normal; Up = Easy, Down = Hard', async () => {
    for (const [keys, want] of [[[R], DIFFICULTY_NORMAL], [[U, R], DIFFICULTY_EASY], [[D, R], DIFFICULTY_HARD]] as const) {
      const ctx = menuCtx();
      expect(await drive(ctx, difficultySelect, (t) => t.tap(...keys))).toBe(true);
      expect(ctx.game.config.difficultyLevel).toBe(want);
    }
  });
  it('hides Impossible until Shift+G, Suicide until Shift+], Zinglon until L-O-R-D (typed in order)', async () => {
    let ctx = menuCtx();
    // without the secret there are only three rows: Down x2 wraps to Easy
    expect(await drive(ctx, difficultySelect, (t) => t.tap(D, D, R))).toBe(true);
    expect(ctx.game.config.difficultyLevel).toBe(DIFFICULTY_EASY);

    ctx = menuCtx();
    expect(await drive(ctx, difficultySelect, (t) => { t.keys.push({ frame: 13, scancode: LSHIFT, hold: 12 }, { frame: 14, scancode: KEY_G, hold: 5 }); t.f = 32; t.tap(D, D, R); })).toBe(true);
    expect(ctx.game.config.difficultyLevel).toBe(DIFFICULTY_IMPOSSIBLE);

    ctx = menuCtx();
    expect(await drive(ctx, difficultySelect, (t) => {
      t.keys.push({ frame: 13, scancode: LSHIFT, hold: 30 }, { frame: 14, scancode: KEY_G, hold: 5 }, { frame: 24, scancode: KEY_RBRACKET, hold: 5 });
      t.f = 40; t.tap(U, U, R);
    })).toBe(true);
    expect(ctx.game.config.difficultyLevel).toBe(DIFFICULTY_SUICIDE);

    ctx = menuCtx();
    expect(await drive(ctx, difficultySelect, (t) => {
      t.keys.push({ frame: 13, scancode: LSHIFT, hold: 30 }, { frame: 14, scancode: KEY_G, hold: 5 }, { frame: 24, scancode: KEY_RBRACKET, hold: 5 });
      t.f = 40; t.tap(KEY_L, KEY_O, KEY_R, KEY_D, U, U, R); // L O R D (typed in order), then Up wraps to the new last row
    })).toBe(true);
    expect(ctx.game.config.difficultyLevel).toBe(DIFFICULTY_ZINGLON);
  });
});

describeData('newGame', () => {
  it('full game: cash by episode, episode and difficulty chosen', async () => {
    const ctx = menuCtx();
    expect(await drive(ctx, newGame, (t) => t.tap(R).wait(24).tap(D, R).wait(24).tap(U, R))).toBe(true); // Full game, episode 2, Easy
    const g = ctx.game;
    expect(g.varz.gameLoaded).toBe(true);
    expect(g.items.episodeNum).toBe(2);
    expect(g.items.initialEpisodeNum).toBe(2);
    expect(g.config.difficultyLevel).toBe(DIFFICULTY_EASY);
    expect(g.config.initialDifficulty).toBe(DIFFICULTY_EASY);
    expect(g.players[0].cash).toBe(15000);
  });
  it('1 player arcade: Stalker, no cash', async () => {
    const ctx = menuCtx();
    expect(await drive(ctx, newGame, (t) => t.tap(D, R).wait(24).tap(R).wait(24).tap(R))).toBe(true);
    expect(ctx.game.config.onePlayerAction).toBe(true);
    expect(ctx.game.players[0].items.ship).toBe(8);
    expect(ctx.game.players[0].cash).toBe(0);
  });
  it('cancelling the episode select returns false and leaves gameLoaded unset', async () => {
    const ctx = menuCtx();
    expect(await drive(ctx, newGame, (t) => t.tap(R).wait(24).tap(E))).toBe(false);
    expect(ctx.game.varz.gameLoaded).toBe(false);
    const c2 = menuCtx();
    expect(await drive(c2, newGame, (t) => t.tap(E))).toBe(false);
  });
});

describeData('load screen, high scores and setup', () => {
  it('loads a used slot (gameLoaded, level and cash from the save); empty slots clink; Esc leaves', async () => {
    const ctx = menuCtx();
    const sf = ctx.game.config.saveFiles[1]!;
    sf.level = 7; setSaveName(sf, 'TESTER'); sf.levelName = 'SAVED'; sf.episode = 1; sf.score = 4242;
    expect(await drive(ctx, loadScreen, (t) => t.tap(D, R))).toBe(true);
    expect(ctx.game.varz.gameLoaded).toBe(true);
    expect(ctx.game.config.mainLevel).toBe(7);
    expect(ctx.game.players[0].cash).toBe(4242);

    const c2 = menuCtx();
    c2.game.config.saveFiles.forEach((f) => { f.level = 0; });
    await expect(drive(c2, loadScreen, (t) => t.tap(R))).rejects.toBeInstanceOf(Stop); // empty slot: refused
    const c3 = menuCtx();
    expect(await drive(c3, loadScreen, (t) => t.tap(E))).toBe(false);
    expect(c3.game.varz.gameLoaded).toBe(false);
    const c4 = menuCtx();
    c4.game.config.saveFiles.forEach((f) => { f.level = 0; });
    expect(await drive(c4, loadScreen, (t) => t.tap(U, R))).toBe(false); // Up wraps to "Exit to Main Menu"
  });
  it('high scores page left/right and leave', async () => {
    const ctx = menuCtx();
    await drive(ctx, highScoreScreen, (t) => t.tap(SC.Right, SC.Right, SC.Left, E));
  });
  it('setup: Sound... volume rows change by 8, Done returns', async () => {
    const ctx = menuCtx();
    ctx.game.config.tyrMusicVolume = 100;
    ctx.game.config.fxVolume = 100;
    await drive(ctx, setupMenu, (t) => t.tap(R, SC.Right, SC.Right, D, SC.Left, E, D, R));
    expect(ctx.game.config.tyrMusicVolume).toBe(116);
    expect(ctx.game.config.fxVolume).toBe(92);
  });
});
