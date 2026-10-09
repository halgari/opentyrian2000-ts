// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
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
});
