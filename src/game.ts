// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/opentyr.c
import type { Ctx } from './ctx';
import { initPlayerData, loadConfiguration, sortHighScores } from './game/config';
import { scanForEpisodes } from './game/episodes';
import { jeMain } from './game/flow';
import { saveConfiguration } from './game/save';
import { UnavailableModeError } from './game/unported';
import { introLogos } from './screens/intro';
import { quitScreen, stubScreen } from './screens/stub';
import { titleScreen } from './screens/title';

// port of the main() loop (opentyr.c). Quitting returns to the title instead of exiting.
export async function runGame(ctx: Ctx): Promise<never> {
  loadConfiguration(ctx); // main(): JE_loadConfiguration() precedes intro_logos()
  scanForEpisodes(ctx); // main(): JE_scanForEpisodes()
  await introLogos(ctx);
  return gameLoop(ctx);
}

// the for (;;) loop of main(): one pass is one session (title screen, then JE_main or Destruct)
export async function gameLoop(ctx: Ctx): Promise<never> {
  for (;;) {
    initPlayerData(ctx);
    sortHighScores(ctx);
    ctx.state.playDemo = false;
    ctx.game.demo.stoppedDemo = false;
    ctx.game.varz.gameLoaded = false;
    ctx.game.varz.jumpSection = false;
    ctx.state.loadDestruct = false;
    if (!(await titleScreen(ctx))) {
      // JE_tyrianHalt: the C saves its configuration on exit; the page has no exit, so quitting to the title does it
      saveConfiguration(ctx);
      await quitScreen(ctx);
      continue;
    }
    if (ctx.state.loadDestruct) await stubScreen(ctx, 'Destruct');
    else {
      try {
        await jeMain(ctx); // JE_main()
      } catch (e) {
        // ]e / ]g (secret modes, sub-project 5): not an error page, just back to the title like a finished session
        if (!(e instanceof UnavailableModeError)) throw e;
        ctx.input.mouseSetRelative(false);
        ctx.vga.cur = ctx.vga.screen;
        ctx.audio.stopSong();
        await stubScreen(ctx, 'This mode is not yet available', 'Returning to the title screen');
      }
    }
  }
}
