import { describe, expect, it, vi } from 'vitest';
import { createCtx, type Ctx } from '../../src/ctx';
import { initPlayerData, loadConfiguration, sortHighScores } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { saveGame, saveName, serializeSav } from '../../src/game/save';
import { attachSaveSync, reloadSavesFromStorage } from '../../src/game/save-sync';
import { bytesToBase64, localStorageAdapter, STORAGE_KEYS, type StorageLike } from '../../src/platform/storage';
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

// A reloaded editorLevel is byte-swapped (the C stores hi,lo but loads lo<<8|hi).
const swap16 = (v: number): number => ((v & 0xff) << 8) | (v >> 8);

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

  it('the high-score tail merges as a block when only the other tab changed it', () => {
    const shared = fakeStorage();
    const a = tab(shared), b = tab(shared);
    a.game.config.t2kHighScores[0]![0]!.score = 99999;
    saveGame(a, 3, 'A');
    saveGame(b, 5, 'B');
    expect(tab(shared).game.config.t2kHighScores[0]![0]!.score).toBe(99999);
  });
  it('the editor area merges per byte', () => {
    const shared = fakeStorage();
    const a = tab(shared), b = tab(shared);
    a.game.config.saveTemp[2400] = 7;
    saveGame(a, 3, 'A');
    b.game.config.saveTemp[2401] = 9;
    saveGame(b, 5, 'B');
    const c = tab(shared).game.config;
    expect([c.saveTemp[2400], c.saveTemp[2401]]).toEqual([7, 9]);
  });
  it('editorLevel merges as one 2-byte unit', () => {
    const shared = fakeStorage();
    const a = tab(shared), b = tab(shared);
    a.game.config.editorLevel = 1000;
    saveGame(a, 3, 'A');
    saveGame(b, 5, 'B'); // b did not touch it: a's value arrives
    expect(tab(shared).game.config.editorLevel).toBe(swap16(1000)); // stored bytes survive b's merge and re-save
    const s2 = fakeStorage();
    const a2 = tab(s2), b2 = tab(s2);
    a2.game.config.editorLevel = 0x0120;
    b2.game.config.editorLevel = 0x0321; // differs from a2 in the other byte: no mixing
    saveGame(a2, 3, 'A');
    saveGame(b2, 5, 'B');
    expect(tab(s2).game.config.editorLevel).toBe(swap16(0x0321));
  });
  it('reload keeps unsaved local high scores and editorLevel, and the next save has both', () => {
    const shared = fakeStorage();
    const a = tab(shared), b = tab(shared);
    b.game.config.t2kHighScores[1]![0]!.score = 99999;
    b.game.config.editorLevel = 1234;
    saveGame(a, 4, 'REMOTE');
    expect(reloadSavesFromStorage(b)).toBe(true);
    expect(saveName(b.game.config.saveFiles[3]!)).toBe('REMOTE');
    expect(b.game.config.t2kHighScores[1]![0]!.score).toBe(99999);
    expect(b.game.config.editorLevel).toBe(1234);
    saveGame(b, 5, 'LOCAL');
    const c = tab(shared).game.config;
    expect(saveName(c.saveFiles[3]!)).toBe('REMOTE');
    expect(saveName(c.saveFiles[4]!)).toBe('LOCAL');
    expect(c.t2kHighScores[1]![0]!.score).toBe(99999);
    expect(c.editorLevel).toBe(swap16(1234));
  });
  it('a corrupt stored image on the merge path is overwritten by a valid save', () => {
    const shared = fakeStorage();
    const a = tab(shared);
    shared.setItem(STORAGE_KEYS.sav, 'bm90IGEgc2F2ZQ==');
    saveGame(a, 3, 'MINE');
    expect(saveName(tab(shared).game.config.saveFiles[2]!)).toBe('MINE');
  });
  it('a failed storage.set leaves the baseline unchanged', () => {
    const m = fakeStorage();
    let fail = false;
    const flaky: StorageLike = { getItem: (k) => m.getItem(k), removeItem: (k) => m.removeItem(k), setItem: (k, v) => { if (fail) throw new Error('quota'); m.setItem(k, v); } };
    const a = tab(flaky);
    const before = a.saveSync.baseline;
    expect(before).not.toBeNull();
    fail = true;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    saveGame(a, 3, 'X');
    vi.restoreAllMocks();
    expect(a.saveSync.baseline).toBe(before);
  });
  it('a single tab writes exactly serializeSav, save after save', () => {
    const shared = fakeStorage();
    const a = tab(shared);
    for (const slot of [3, 5, 3]) {
      saveGame(a, slot, 'S' + slot);
      expect(shared.getItem(STORAGE_KEYS.sav)).toBe(bytesToBase64(serializeSav(a.game.config)));
    }
  });
  it('attachSaveSync reloads on a storage event for the sav key only', () => {
    const shared = fakeStorage();
    const a = tab(shared), b = tab(shared);
    const target = new EventTarget();
    attachSaveSync(target, b);
    saveGame(a, 4, 'REMOTE');
    target.dispatchEvent(Object.assign(new Event('storage'), { key: STORAGE_KEYS.cfg }));
    expect(saveName(b.game.config.saveFiles[3]!)).not.toBe('REMOTE');
    b.game.config.configurationLoaded = false;
    target.dispatchEvent(Object.assign(new Event('storage'), { key: STORAGE_KEYS.sav }));
    expect(saveName(b.game.config.saveFiles[3]!)).not.toBe('REMOTE');
    b.game.config.configurationLoaded = true;
    target.dispatchEvent(Object.assign(new Event('storage'), { key: STORAGE_KEYS.sav }));
    expect(saveName(b.game.config.saveFiles[3]!)).toBe('REMOTE');
  });
});
