import { expect, it } from 'vitest';
import { loadConfigurationDefaults } from '../../src/game/config';
import { readPlayerInput } from '../../src/game/input-level';
import { parseOpentyrianConfig, serializeOpentyrianConfig } from '../../src/game/save';
import { effectiveInputDevices, inputDeviceOf, nextInputDevice, normalizeInputDevices } from '../../src/game/twoplayer';
import { defaultKeySettings, defaultKeySettings2 } from '../../src/game/world';
import { DEVICE_KEYBOARD_B } from '../../src/platform/input';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('shared keyboard (web extension, not in the C)', () => {
  it('device 0x80 reads keySettings2 and is the exact mirror of the keyboard branch', () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx);
    const c = ctx.game.config;
    const p = ctx.game.players[1]!;
    const dirs = [{ i: 0, axis: 'y', delta: -1 }, { i: 1, axis: 'y', delta: 1 }, { i: 2, axis: 'x', delta: -1 }, { i: 3, axis: 'x', delta: 1 }] as const;
    for (const { i, axis, delta } of dirs) {
      p.x = 100; p.y = 100;
      ctx.input.keysactive.fill(0);
      ctx.input.keysactive[c.keySettings2[i]!] = 1;
      readPlayerInput(ctx, p, DEVICE_KEYBOARD_B);
      expect(axis === 'x' ? p.x - 100 : p.y - 100).toBe(delta);
      expect(axis === 'x' ? p.y - 100 : p.x - 100).toBe(0);
    }
    const b = ctx.game.varz.button;
    for (const [slot, btn] of [[4, 0], [5, 3], [6, 1], [7, 2]] as const) {
      ctx.input.keysactive.fill(0); ctx.input.keysactive[c.keySettings2[slot]!] = 1;
      b.fill(false); readPlayerInput(ctx, p, DEVICE_KEYBOARD_B);
      expect(b[btn]).toBe(true);
    }
  });
  it('keys of map A do nothing for device 0x80, and map B keys do nothing for device 1', () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx);
    const c = ctx.game.config, p = ctx.game.players[1]!;
    p.x = 100; p.y = 100;
    ctx.input.keysactive[c.keySettings[2]!] = 1;
    readPlayerInput(ctx, p, DEVICE_KEYBOARD_B);
    expect([p.x, p.y]).toEqual([100, 100]);
    ctx.input.keysactive.fill(0);
    ctx.input.keysactive[c.keySettings2[2]!] = 1;
    readPlayerInput(ctx, p, 1);
    expect([p.x, p.y]).toEqual([100, 100]);
  });
  it('the extension is off by default and the id is normalised away when it is off', () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx);
    expect(ctx.game.config.sharedKeyboard).toBe(false);
    expect([...ctx.game.config.keySettings2]).toEqual([...defaultKeySettings2]);
    const d = Uint8Array.of(1, 0x80);
    normalizeInputDevices(d, 0, false);
    expect([...d]).toEqual([1, 2]);
    const e = Uint8Array.of(1, 0x80);
    normalizeInputDevices(e, 0, true);
    expect([...e]).toEqual([1, 0x80]);
    // at the point of use: a stored 0x80 with the extension off resolves legally, and the stored bytes survive
    ctx.game.config.twoPlayerMode = true;
    ctx.game.config.inputDevice.set([1, 0x80]);
    expect([...effectiveInputDevices(ctx)]).toEqual([1, 2]);
    expect(inputDeviceOf(ctx, 2)).toBe(2);
    expect([...ctx.game.config.inputDevice]).toEqual([1, 0x80]);
    ctx.game.config.sharedKeyboard = true;
    expect(inputDeviceOf(ctx, 2)).toBe(0x80);
  });
  it('nextInputDevice reaches 0x80 only when the extension is on', () => {
    const seen = (extended: boolean): Set<number> => {
      const out = new Set<number>();
      for (const start of [[1, 2], [2, 1]]) for (const dir of [1, -1] as const) {
        let d = Uint8Array.from(start);
        for (let k = 0; k < 8; k++) { d = Uint8Array.of(nextInputDevice(d, 0, dir, 0, extended), d[1]!); out.add(d[0]!); }
      }
      return out;
    };
    expect(seen(false).has(0x80)).toBe(false);
    expect(seen(true).has(0x80)).toBe(true);
  });
  it('keySettings2 and sharedKeyboard survive the opentyrian.cfg round trip; bad values are ignored', () => {
    const a = testCtx()!; loadConfigurationDefaults(a);
    a.game.config.keySettings2[0] = 44; a.game.config.sharedKeyboard = true;
    const json = serializeOpentyrianConfig(a.game.config);
    const b = testCtx()!; loadConfigurationDefaults(b);
    parseOpentyrianConfig(b.game.config, json);
    expect([b.game.config.keySettings2[0], b.game.config.sharedKeyboard]).toEqual([44, true]);
    parseOpentyrianConfig(b.game.config, JSON.stringify({ version: 1, keySettings2: [0, 999, 'x'], sharedKeyboard: 'yes' }));
    expect([...b.game.config.keySettings2]).toEqual([...defaultKeySettings2]);
    expect(b.game.config.sharedKeyboard).toBe(false);
  });
  it('the default map B avoids every Ctrl+key the browser keeps (W T N Q cannot be cancelled; R F P L D reload/find/print/address bar/bookmark)', () => {
    const SC = { A: 4, D: 7, F: 9, L: 15, N: 17, P: 19, Q: 20, R: 21, T: 23, W: 26 };
    const reserved = new Set(Object.values(SC));
    expect(defaultKeySettings2.filter((k) => reserved.has(k))).toEqual([]);
    expect(new Set(defaultKeySettings2).size).toBe(8);
    for (const k of defaultKeySettings2) expect(defaultKeySettings).not.toContain(k);
  });
});
