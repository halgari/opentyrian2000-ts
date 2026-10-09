// SPDX-License-Identifier: GPL-2.0-or-later
// Kept free of heavy imports: vi.mock factories load it while the module graph that needs the mock is still loading.
import type { ShopState } from '../../src/screens/shop';

/** The most recently created ShopState (the C's static curMenu outlives a shop visit). */
export const shopRegistry: { current: ShopState | null; visits: number } = { current: null, visits: 0 };

/** For `vi.mock('../../src/screens/shop', async (orig) => (await import('../helpers/shop-registry')).shopMock(orig))`. */
export function shopMock(orig: () => Promise<typeof import('../../src/screens/shop')>) {
  return orig().then((m) => ({
    ...m,
    itemScreen: (ctx: Parameters<typeof m.itemScreen>[0], state?: ShopState) => {
      const s = state ?? new m.ShopState();
      shopRegistry.current = s;
      shopRegistry.visits++;
      return m.itemScreen(ctx, s);
    },
  }));
}
