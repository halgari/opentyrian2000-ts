// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { SC } from '../../tools/oracle/scenarios-shopc';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { loadGame } from '../../src/game/save';
import { endLevelAni } from '../../src/screens/endlevel';
import { highScoreCheck } from '../../src/screens/highscores';
import { gameplaySelect, newGame } from '../../src/screens/select';
import { nextInputDevice, normalizeInputDevices } from '../../src/screens/shop-twoplayer';
import { describeData } from '../helpers/data';
import { drive, menuCtx } from '../helpers/drive';
import { testCtx } from '../helpers/ctx';

vi.mock('../../src/screens/shop', async (orig) => (await import('../helpers/shop-registry')).shopMock(orig as never));

const D = SC.Down, R = SC.Return;

describe('input device cycling (game_menu.c:1451-1470)', () => {
  for (const joysticks of [0, 1, 2]) {
    it(`never lands on the other player's device and stays in 1..${2 + joysticks} (joysticks=${joysticks})`, () => {
      for (const start of [[1, 2], [2, 1], [1, 3], [3, 2]].filter(([a, b]) => a! <= 2 + joysticks && b! <= 2 + joysticks)) {
        for (const which of [0, 1] as const) for (const dir of [1, -1] as const) {
          const d = Uint8Array.from(start as number[]);
          const next = nextInputDevice(d, which, dir, joysticks);
          expect(next).toBeGreaterThanOrEqual(1);
          expect(next).toBeLessThanOrEqual(2 + joysticks);
          expect(next).not.toBe(d[1 - which]);
        }
      }
    });
  }
  it('without joysticks the cycle swaps the two devices (the C copies the old one to the other player)', () => {
    const d = Uint8Array.of(1, 2);
    nextInputDevice(d, 0, 1, 0);
    expect([...d]).toEqual([2, 1]);
  });
  it('with a joystick it walks 1 -> 2 -> 3 -> 1, skipping the other player\'s device', () => {
    const d = Uint8Array.of(1, 2);
    expect(nextInputDevice(d, 0, 1, 1)).toBe(3);
    expect(nextInputDevice(d, 0, 1, 1)).toBe(1);
    expect(nextInputDevice(d, 0, -1, 1)).toBe(3);
  });
});

describe('normalizeInputDevices (Review Focus 2)', () => {
  it('repairs equal, zero and out-of-range pairs', () => {
    for (const bad of [[1, 1], [0, 0], [9, 9], [2, 2], [5, 1]]) {
      const d = Uint8Array.from(bad);
      normalizeInputDevices(d, 0);
      expect(d[0]).not.toBe(d[1]);
      expect(d[0]! >= 1 && d[0]! <= 2 && d[1]! >= 1 && d[1]! <= 2).toBe(true);
    }
  });
  it('keeps a legal pair untouched', () => { const d = Uint8Array.of(2, 1); normalizeInputDevices(d, 0); expect([...d]).toEqual([2, 1]); });
  it('a gamepad id is legal only when a gamepad exists', () => {
    const d = Uint8Array.of(1, 3);
    normalizeInputDevices(d, 1);
    expect([...d]).toEqual([1, 3]);
    normalizeInputDevices(d, 0);
    expect(d[0] !== d[1] && d[0]! <= 2 && d[1]! <= 2).toBe(true);
  });
});

describeData('two-player screens and saves', () => {
  it('loadGame of a 2P slot whose devices are both 1 leaves a legal pair', () => {
    const ctx = menuCtx();
    const sf = ctx.game.config.saveFiles[11]!;
    sf.level = 1; sf.episode = 1; sf.input1 = 1; sf.input2 = 1;
    loadGame(ctx, 12);
    expect(ctx.game.config.twoPlayerMode).toBe(true);
    const d = ctx.game.config.inputDevice;
    expect(d[0]).not.toBe(d[1]);
    expect(d[0]! >= 1 && d[0]! <= 2 && d[1]! >= 1 && d[1]! <= 2).toBe(true);
  });

  it('newGame item 4 (tyrian2.c:3646): cash 0/0, Silver Ship, difficulty + 1, devices {1, 2}; a following full game clears twoPlayerMode', async () => {
    const ctx = menuCtx();
    ctx.game.players[0].cash = 99; ctx.game.players[1].cash = 77;
    ctx.game.config.inputDevice.set([2, 1]);
    // gameplaySelect Down x3 Return; episodeSelect Return; difficultySelect Return (Normal)
    expect(await drive(ctx, newGame, (t) => t.tap(D, D, D, R).wait(40).tap(R).wait(40).tap(R), 500)).toBe(true);
    const c = ctx.game.config;
    expect([c.twoPlayerMode, c.onePlayerAction, c.timedBattleMode]).toEqual([true, false, false]);
    expect(ctx.game.players.map((p) => p.cash)).toEqual([0, 0]);
    expect(ctx.game.players[0].items.ship).toBe(11);
    expect(c.difficultyLevel).toBe(c.initialDifficulty + 1);
    expect([...c.inputDevice]).toEqual([1, 2]);
    // Review Focus 4
    expect(await drive(ctx, gameplaySelect, (t) => t.tap(R))).toBe(true);
    expect(c.twoPlayerMode).toBe(false);
  });

  it('endLevelAni draws both cash lines (mainint.c:2753) and the "press a key" line at 150', async () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx);
    initPlayerData(ctx);
    initEpisode(ctx, 1);
    const g = ctx.game;
    g.config.twoPlayerMode = true;
    g.config.initialDifficulty = 2;
    g.config.levelName = 'TESTLVL';
    g.players[0].isAlive = true; g.players[1].isAlive = false;
    g.players[0].cash = 12345; g.players[1].cash = 678;
    const band = (px: Uint8Array, y0: number): boolean => {
      for (let y = y0; y < y0 + 8; y++) for (let x = 30; x < 120; x++) if (px[y * 320 + x] !== 0) return true;
      return false;
    };
    let row50 = false, row70 = false, row150 = false;
    ctx.frameSink = (screen) => {
      row50 ||= band(screen.pixels, 50);
      row70 ||= band(screen.pixels, 70);
      row150 ||= band(screen.pixels, 150);
    };
    ctx.input.push({ type: 'keydown', scancode: 4, mod: 0 });
    const sleep = ctx.clock.sleep.bind(ctx.clock);
    let pushed = false;
    ctx.clock.sleep = async (ms: number) => {
      await sleep(ms);
      if (!pushed && ctx.clock.now() >= 1000) {
        pushed = true;
        ctx.input.push({ type: 'keyup', scancode: 4 });
        ctx.input.push({ type: 'keydown', scancode: 5, mod: 0 });
      }
    };
    await endLevelAni(ctx);
    expect([row50, row70, row150]).toEqual([true, true, true]);
    expect(g.scratch.temp2).toBe(150);
  });

  it('highScoreCheck with two players asks the higher scorer first and writes the two-player table', async () => {
    const ctx = menuCtx();
    initEpisode(ctx, 1);
    const g = ctx.game, c = g.config;
    g.items.initialEpisodeNum = 1;
    c.twoPlayerMode = true;
    g.players[0].cash = 5000; g.players[1].cash = 9000;
    for (const e of c.t2kHighScores[11]!) { e.score = 100; e.playerName = 'NOBODY'; }
    // per player: a letter at frame 24 of the entry screen (after its fade-in), Return at frame 50; then a key for the table screen's wait_input (it presents no frames while it waits, which tells it from the entry screen)
    const press = (sc: number): void => { ctx.input.push({ type: 'keydown', scancode: sc, mod: 0 }); ctx.input.push({ type: 'keyup', scancode: sc }); };
    let phase: 'entry' | 'table' = 'entry', player = 0, entryFrames = 0, idle = 0;
    ctx.frameSink = () => {
      idle = 0;
      if (phase !== 'entry') return;
      entryFrames++;
      if (entryFrames === 24) {
        ctx.input.push({ type: 'keydown', scancode: 4, mod: 0 });
        ctx.input.push({ type: 'text', text: player === 0 ? 'A' : 'B' });
        ctx.input.push({ type: 'keyup', scancode: 4 });
      } else if (entryFrames === 50) { press(40); phase = 'table'; }
    };
    const sleep = ctx.clock.sleep.bind(ctx.clock);
    ctx.clock.sleep = (ms: number) => {
      if (phase === 'table' && ++idle === 300) { press(40); phase = 'entry'; player++; entryFrames = 0; idle = 0; }
      return sleep(ms);
    };
    await highScoreCheck(ctx);
    const t = c.t2kHighScores[11]!;
    expect(t.map((e) => e.score)).toEqual([9000, 5000, 100]);
    expect(t.slice(0, 2).map((e) => e.playerName.trim())).toEqual(['A', 'B']);
  }, 60000);
});
