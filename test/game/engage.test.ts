// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { initEpisode } from '../../src/game/episodes';
import { runEpisodeScript } from '../../src/game/script';
import { testCtx } from '../helpers/ctx';
import { describeData } from '../helpers/data';
import { useScript } from '../helpers/script';

describeData('script ]e', () => {
  it('sets the ENGAGE loadout and flags exactly as tyrian2.c:2523-2542', async () => {
    const ctx = testCtx()!;
    loadConfigurationDefaults(ctx); initPlayerData(ctx); initEpisode(ctx, 1);
    ctx.game.players[0].cash = 777;
    ctx.game.players[0].items.sidekick[0] = 5;
    ctx.game.players[0].items.special = 3;
    ctx.game.config.twoPlayerMode = true;
    useScript(ctx, ['*1', ']e', ']L[ 9999 001 TIME WAR 37 17']);
    ctx.game.config.mainLevel = 1;
    expect(await runEpisodeScript(ctx, new Uint8Array(256))).toBe('level');
    const c = ctx.game.config, p = ctx.game.players[0];
    expect([c.superTyrian, c.onePlayerAction, c.twoPlayerMode, ctx.game.varz.doNotSaveBackup]).toEqual([true, true, false, true]);
    expect([p.cash, p.items.ship, p.items.weapon[0].id, p.items.weapon[0].power, p.items.weapon[1].id, p.items.weapon[1].power,
      p.items.sidekick[0], p.items.sidekick[1], p.items.generator, p.items.shield, p.items.special])
      .toEqual([0, 13, 39, 3, 0, 1, 0, 0, 2, 4, 0]);
  });
});
