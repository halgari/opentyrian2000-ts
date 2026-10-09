import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/platform/clock';

describe('VirtualClock', () => {
  it('sleep advances time instantly', async () => {
    const c = new VirtualClock();
    expect(c.now()).toBe(0);
    await c.sleep(16);
    await c.sleep(4);
    expect(c.now()).toBe(20);
  });
  it('throws once the limit is exceeded (guards against hung tests)', async () => {
    const c = new VirtualClock(100);
    await c.sleep(100);
    await expect(c.sleep(1)).rejects.toThrow(/limit exceeded/);
  });
});
