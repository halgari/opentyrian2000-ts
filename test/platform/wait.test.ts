// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { Joysticks } from '../../src/platform/gamepad';
import { waitDelayOrInput, waitInput, waitNoInput } from '../../src/platform/wait';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';

describeData('waits', () => {
  it('waitDelayOrInput returns early on a key and clears newkey', async () => {
    const ctx = testCtx()!;
    ctx.delay.setDelay(200);
    ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 });
    await waitDelayOrInput(ctx);
    expect(ctx.clock.now()).toBe(0);
    expect(ctx.input.newkey).toBe(false);
  });
  it('waitDelayOrInput waits the full delay without input', async () => {
    const ctx = testCtx()!;
    ctx.delay.setDelay(200);
    await waitDelayOrInput(ctx);
    expect(ctx.clock.now()).toBeGreaterThanOrEqual(2875);
  });
  it('waitInput / waitNoInput follow keydown state', async () => {
    const ctx = testCtx()!;
    ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 });
    await waitInput(ctx, true, true, true);
    expect(ctx.input.keydown).toBe(true);
    ctx.input.push({ type: 'keyup', scancode: 44 });
    await waitNoInput(ctx, true, true, true);
    expect(ctx.input.keydown).toBe(false);
  });
  it('waitInput(joystick) returns on a pad button; waitNoInput(joystick) waits for it to be released', async () => {
    const ctx = testCtx()!;
    let held = false;
    ctx.input.joysticks = new Joysticks({ getGamepads: () => [{ index: 0, connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held && i === 0, value: 0 })) }] }, () => ctx.clock.now());
    const orig = ctx.clock.sleep.bind(ctx.clock);
    let n = 0;
    ctx.clock.sleep = async (ms: number) => { await orig(ms); if (++n === 2) held = !held; };
    await waitInput(ctx, false, false, true);
    expect(held).toBe(true);
    n = 0;
    await waitNoInput(ctx, false, false, true);
    expect(held).toBe(false);
  });
  it('waitInput(joystick) with a missing pad does not return early', async () => {
    const ctx = testCtx()!;
    ctx.input.joysticks = new Joysticks({ getGamepads: () => [null] }, () => 0);
    let n = 0;
    const orig = ctx.clock.sleep.bind(ctx.clock);
    ctx.clock.sleep = async (ms: number) => { await orig(ms); if (++n === 5) ctx.input.push({ type: 'keydown', scancode: 44, mod: 0 }); };
    await waitInput(ctx, true, false, true);
    expect(n).toBeGreaterThanOrEqual(5);
  });
});
