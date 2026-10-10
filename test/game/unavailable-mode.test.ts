// SPDX-License-Identifier: GPL-2.0-or-later
// ]g (GALAGA) is offered by ordinary planet menus but are not ported (sub-project 5): the session must end at the
// title with a notice, not with a page-level crash.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameLoop } from '../../src/game';
import { loadConfigurationDefaults } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { UnavailableModeError } from '../../src/game/unported';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';
import { useScript } from '../helpers/script';

const h = vi.hoisted(() => ({ titles: 0, notices: [] as string[], stop: new Error('stop') }));
vi.mock('../../src/screens/title', () => ({
  titleScreen: async (): Promise<boolean> => { if (++h.titles > 1) throw h.stop; return true; },
}));
vi.mock('../../src/screens/stub', () => ({
  stubScreen: async (_ctx: unknown, title: string): Promise<void> => { h.notices.push(title); },
  quitScreen: async (): Promise<void> => {},
}));

beforeEach(() => { h.titles = 0; h.notices = []; });

describeData('unavailable script modes return to the title', () => {
  for (const cmd of [']g[ GALAGA']) {
    it(`${cmd.slice(0, 2)} shows a notice and runs the title again without throwing`, async () => {
      const ctx = testCtx()!;
      loadConfigurationDefaults(ctx);
      initEpisode(ctx, 1);
      useScript(ctx, ['*1', cmd]);
      ctx.game.config.mainLevel = 1;
      // gameLoop only ends here because the second title visit throws the sentinel
      await expect(gameLoop(ctx)).rejects.toBe(h.stop);
      expect(h.titles).toBe(2);
      expect(h.notices).toEqual(['This mode is not yet available']);
    });
  }

  it('the error stays an unported: error for callers that do not catch it', () => {
    expect(new UnavailableModeError(']e').message).toMatch(/^unported:/);
  });
});
