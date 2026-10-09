// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { findNextEpisode, initEpisode, scanForEpisodes } from '../../src/game/episodes';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('episode helpers', () => {
  it('initEpisode keeps lvlNum/lvlPos and reloads tables on change', () => {
    const ctx = testCtx()!;
    const it_ = ctx.game.items;
    initEpisode(ctx, 1);
    const ships1 = it_.ships;
    const dmg1 = it_.ships[1]!.cost;
    expect(it_.lvlNum).toBeGreaterThan(0);
    expect(it_.lvlPos[it_.lvlNum]).toBe(ctx.assets.archive.get('tyrian1.lvl').length);
    initEpisode(ctx, 1);
    expect(it_.ships).toBe(ships1);
    initEpisode(ctx, 4);
    expect(it_.ships).not.toBe(ships1);
    expect(it_.episodeFile).toBe('levels4.dat');
    expect(it_.cubeFile).toBe('cubetxt4.dat');
    const lvl4 = ctx.assets.archive.get('tyrian4.lvl');
    expect(it_.lvlPos[it_.lvlNum]).toBe(lvl4.length);
    expect(it_.ships[1]!.cost).toBeGreaterThan(0);
    initEpisode(ctx, 1);
    expect(it_.ships[1]!.cost).toBe(dmg1);
  });
  it('scanForEpisodes + findNextEpisode', () => {
    const ctx = testCtx()!;
    const it_ = ctx.game.items;
    scanForEpisodes(ctx);
    expect(it_.episodeAvail).toEqual([true, true, true, true, true]);
    it_.episodeNum = 5;
    expect(findNextEpisode(ctx)).toBe(1);
    expect(it_.jumpBackToEpisode1).toBe(true);
    expect(ctx.game.config.gameHasRepeated).toBe(true);
    it_.episodeNum = 2;
    it_.jumpBackToEpisode1 = false;
    expect(findNextEpisode(ctx)).toBe(3);
    expect(it_.jumpBackToEpisode1).toBe(false);
    it_.episodeAvail = [true, false, false, false, false];
    it_.episodeNum = 1;
    expect(findNextEpisode(ctx)).toBe(1);
  });
});
