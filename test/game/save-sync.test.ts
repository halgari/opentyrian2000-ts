import { describe, expect, it } from 'vitest';
import { createCtx, type Ctx } from '../../src/ctx';
import { initPlayerData, loadConfiguration, sortHighScores } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { saveGame, saveName } from '../../src/game/save';
import { reloadSavesFromStorage } from '../../src/game/save-sync';
import { localStorageAdapter, type StorageLike } from '../../src/platform/storage';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import { describeData, testArchive } from '../helpers/data';
import { loadAssets } from '../../src/assets';

function fakeStorage(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}
function tab(shared: StorageLike): Ctx {
  const ctx = createCtx({ assets: loadAssets(testArchive!), clock: new VirtualClock(), presenter: new NullPresenter(), versionString: 'oracle', seed: 1, storage: localStorageAdapter(shared) });
  loadConfiguration(ctx); initPlayerData(ctx); sortHighScores(ctx); initEpisode(ctx, 1);
  return ctx;
}

describeData('two tabs', () => {
  it('tab B saving slot 5 does not erase tab A\'s slot 3', () => {
    const shared = fakeStorage();
    const a = tab(shared), b = tab(shared);
    saveGame(a, 3, 'FROM TAB A');
    saveGame(b, 5, 'FROM TAB B');
    const c = tab(shared);
    expect(saveName(c.game.config.saveFiles[2]!)).toBe('FROM TAB A');
    expect(saveName(c.game.config.saveFiles[4]!)).toBe('FROM TAB B');
  });
  it('the same slot written by both tabs: the later writer wins', () => {
    const shared = fakeStorage();
    const a = tab(shared), b = tab(shared);
    saveGame(a, 2, 'FIRST'); saveGame(b, 2, 'SECOND');
    expect(saveName(tab(shared).game.config.saveFiles[1]!)).toBe('SECOND');
  });
  it('reloadSavesFromStorage (the storage event) pulls the other tab\'s save in', () => {
    const shared = fakeStorage();
    const a = tab(shared), b = tab(shared);
    saveGame(a, 4, 'REMOTE');
    expect(reloadSavesFromStorage(b)).toBe(true);
    expect(saveName(b.game.config.saveFiles[3]!)).toBe('REMOTE');
    expect(reloadSavesFromStorage(b)).toBe(false);
  });
  it('a corrupt stored image is ignored and left in place', () => {
    const shared = fakeStorage();
    const a = tab(shared);
    shared.setItem('opentyrian.tyrian.sav', 'bm90IGEgc2F2ZQ==');
    expect(reloadSavesFromStorage(a)).toBe(false);
    expect(shared.getItem('opentyrian.tyrian.sav')).toBe('bm90IGEgc2F2ZQ==');
  });
});
