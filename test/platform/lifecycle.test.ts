import { describe, expect, it } from 'vitest';
import { attachPageLifecycle } from '../../src/game/save-sync';
import { STORAGE_KEYS } from '../../src/platform/storage';
import { testCtx } from '../helpers/ctx';
import { describeData } from '../helpers/data';
import { loadConfigurationDefaults } from '../../src/game/config';

describeData('page lifecycle', () => {
  it('pagehide and visibilitychange->hidden write tyrian.cfg and opentyrian.cfg, never tyrian.sav', () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx);
    ctx.game.config.configurationLoaded = true;
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    attachPageLifecycle(win, doc, ctx);
    ctx.game.config.fxVolume = 77;
    win.dispatchEvent(new Event('pagehide'));
    expect(ctx.storage.get(STORAGE_KEYS.cfg)).not.toBeNull();
    expect(ctx.storage.get(STORAGE_KEYS.opentyrianCfg)).not.toBeNull();
    expect(ctx.storage.get(STORAGE_KEYS.sav)).toBeNull();
    ctx.storage.remove(STORAGE_KEYS.cfg);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.storage.get(STORAGE_KEYS.cfg)).not.toBeNull();
  });
  it('does nothing before the configuration was loaded', () => {
    const ctx = testCtx()!;
    const win = new EventTarget();
    attachPageLifecycle(win, Object.assign(new EventTarget(), { visibilityState: 'hidden' }), ctx);
    win.dispatchEvent(new Event('pagehide'));
    expect(ctx.storage.get(STORAGE_KEYS.cfg)).toBeNull();
  });
  it('visibilitychange to visible writes nothing', () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx);
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    attachPageLifecycle(new EventTarget(), doc, ctx);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.storage.get(STORAGE_KEYS.cfg)).toBeNull();
  });
});
