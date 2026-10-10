// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { describeData } from './data';
import { testCtx } from './ctx';
import { installScript } from './script-input';

describeData('installScript mouse steps', () => {
  it('a relative mouse step leaves a non-zero relative position', () => {
    const ctx = testCtx()!;
    const run = installScript(ctx, [{ sc: 0, mouse: { type: 'm', a: 6, b: -4 }, after: 0 }], { idleLimit: 1 });
    ctx.input.mouseSetRelative(true);
    void ctx.clock.sleep(16); // idle rule fires the head step
    expect(run.fires).toHaveLength(1);
    ctx.input.serviceEvents(false);
    const [x, y] = ctx.input.mouseGetRelativePosition();
    expect(x !== 0 || y !== 0).toBe(true);
  });
});
