import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/platform/clock';
import { DelayTimer, PIT_PERIOD_MS } from '../../src/platform/delay';

describe('DelayTimer (port of setDelay/getDelayTicks)', () => {
  it('one delay unit is 0x4300 PIT ticks ≈ 14.375 ms, truncated to whole ms', async () => {
    const c = new VirtualClock();
    const d = new DelayTimer(c);
    expect(0x4300 * PIT_PERIOD_MS).toBeCloseTo(14.375, 3);
    d.setDelay(1);
    expect(d.getDelayTicks()).toBe(14);
    d.setDelay(200);
    expect(d.getDelayTicks()).toBe(2875);
    await c.sleep(3000);
    expect(d.getDelayTicks()).toBe(0);
    expect(d.remaining()).toBeLessThan(0);
  });
  it('setDelaySpeed changes the period', () => {
    const d = new DelayTimer(new VirtualClock());
    d.setDelaySpeed(0x4300 / 2);
    d.setDelay(2);
    expect(d.getDelayTicks()).toBe(14);
  });
});
