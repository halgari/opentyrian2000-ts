import { expect, it } from 'vitest';
import { NullAudio } from '../../src/platform/audio';
import { itemScreen } from '../../src/screens/shop';
import { testCtx } from '../helpers/ctx';
import { describeData } from '../helpers/data';

describeData('shop stub (Task 9 replaces it)', () => {
  it('behaves like "Next Level" -> first planet: mainLevel = mapSection[0], jumpSection, gameLoaded cleared', async () => {
    const ctx = testCtx()!;
    const songs: number[] = [];
    ctx.audio = Object.assign(new NullAudio(), { playSong: (n: number) => { songs.push(n); } });
    const v = ctx.game.varz;
    v.mapSection.set([7, 8]);
    v.gameLoaded = true;
    v.songBuy = 2;
    await itemScreen(ctx);
    expect(ctx.game.config.mainLevel).toBe(7);
    expect(v.jumpSection).toBe(true);
    expect(v.gameLoaded).toBe(false);
    expect(songs).toEqual([2]);
  });
});
