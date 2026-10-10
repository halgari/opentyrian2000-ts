import { describe, expect, it } from 'vitest';
import { initPlayerData, loadConfigurationDefaults, sortHighScores } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { totalScore } from '../../src/game/economy';
import { highScoreCheck } from '../../src/screens/highscores';
import { nextEpisode } from '../../src/screens/episode-end';
import { testCtx } from '../helpers/ctx';
import { describeData } from '../helpers/data';

function freshCtx() {
  const ctx = testCtx()!;
  loadConfigurationDefaults(ctx);
  initPlayerData(ctx);
  initEpisode(ctx, 1);
  ctx.game.items.initialEpisodeNum = 1;
  return ctx;
}

describeData('episode end', () => {
  it('highScoreCheck draws nothing and keeps the table when the score is not above the third place', async () => {
    const ctx = freshCtx();
    const g = ctx.game;
    g.items.initialEpisodeNum = 1;
    for (const e of g.config.t2kHighScores[10]!) e.score = totalScore(ctx, g.players[0]) + 1000;
    let frames = 0;
    ctx.frameSink = () => { frames++; };
    await highScoreCheck(ctx);
    expect(frames).toBe(0);
    expect(g.config.t2kHighScores[10]!.map((e) => e.score)).toEqual(g.config.t2kHighScores[10]!.map(() => totalScore(ctx, g.players[0]) + 1000));
  });

  it('escape cancels the entry: no new score is stored', async () => {
    const ctx = freshCtx();
    const g = ctx.game;
    g.items.initialEpisodeNum = 1;
    g.players[0].cash = 100000;
    sortHighScores(ctx);
    const before = g.config.t2kHighScores[10]!.map((e) => e.score);
    // Escape while the entry screen runs, then a key at the end of the table screen (wait_input)
    let n = 0;
    ctx.frameSink = () => {
      if (++n === 5) { ctx.input.push({ type: 'keydown', scancode: 41, mod: 0 }); ctx.input.push({ type: 'keyup', scancode: 41 }); }
    };
    const sleep = ctx.clock.sleep.bind(ctx.clock);
    let sleeps = 0;
    ctx.clock.sleep = (ms: number) => {
      if (n > 5 && ++sleeps % 40 === 0) { ctx.input.push({ type: 'keydown', scancode: 40, mod: 0 }); ctx.input.push({ type: 'keyup', scancode: 40 }); }
      return sleep(ms);
    };
    await highScoreCheck(ctx);
    // the C shifts the table down before the name is asked: cancelling leaves the old first place twice
    expect(g.config.t2kHighScores[10]!.map((e) => e.score)).toEqual([before[0], before[0], before[1]]);
  });

  it('nextEpisode is exported', () => {
    expect(typeof nextEpisode).toBe('function');
  });
});
