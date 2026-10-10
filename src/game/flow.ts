// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (JE_main)
import type { Ctx } from '../ctx';
import { endLevelAni } from '../screens/endlevel';
import { waitNoInput } from '../platform/wait';
import { fadeBlack } from '../video/fade';
import { levelFrame, levelSetup, allPlayersDead } from './level';
import { loadGame } from './save';
import { SA_NONE } from './world';

// port of JE_main (tyrian2.c:621): `start_level_first` -> level_loop -> `start_level` -> JE_loadMap ...
// Demos run one level and return; a normal game loops until the shop is quit (mainLevel == 0).
export async function jeMain(ctx: Ctx): Promise<void> {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const demo = ctx.state.playDemo;

  for (;;) {
    // start_level_first:
    const loc = await levelSetup(ctx);
    if (loc === null) return; // quit itemscreen: back to the title screen

    // level_loop:
    while ((await levelFrame(ctx, loc)) !== 'end') { /* goto level_loop */ }

    // start_level:
    ctx.input.mouseSetRelative(false);
    if (c.galagaMode) c.twoPlayerMode = false;
    // JE_clearKeyboard() is a no-op in the C
    g.sprites.enemySpriteSheets.fill(null); // free_sprite2s(&enemySpriteSheets[0..3])

    /* Normal speed */
    if (c.fastPlay !== 0) {
      c.smoothScroll = true;
      ctx.delay.setDelaySpeed(0x4300);
    }

    if (demo) {
      g.demo.demoFile = null; // fclose(demo_file)
      ctx.state.moveTyrianLogoUp = true;
      ctx.audio.stopSong();
      await fadeBlack(ctx, 10);
      await waitNoInput(ctx, true, true, true);
    }

    c.difficultyLevel = c.oldDifficultyLevel; /* Return difficulty to normal */

    if (!demo) {
      if ((!allPlayersDead(g) || v.normalBonusLevelCurrent || v.bonusLevelCurrent) && !v.playerEndLevel) {
        c.mainLevel = c.nextLevel;
        await endLevelAni(ctx);
        ctx.audio.fadeSong();
      } else {
        ctx.audio.fadeSong();
        await fadeBlack(ctx, 10);

        if (c.timedBattleMode) { // port of JE_main (tyrian2.c:697)
          c.mainLevel = 0;
          return;
        }
        loadGame(ctx, c.twoPlayerMode ? 22 : 11);
        if (v.doNotSaveBackup) {
          c.superTyrian = false;
          c.onePlayerAction = false;
          g.players[0].items.superArcadeMode = SA_NONE;
        }
        if (v.bonusLevelCurrent && !v.playerEndLevel) c.mainLevel = c.nextLevel;
      }
    }
    v.doNotSaveBackup = false;

    if (demo) return;
  }
}
