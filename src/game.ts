// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/opentyr.c
import type { Ctx } from './ctx';
import { initPlayerData, loadConfigurationDefaults } from './game/config';
import { introLogos } from './screens/intro';
import { quitScreen, stubScreen } from './screens/stub';
import { titleScreen } from './screens/title';

// port of the main() loop (opentyr.c). JE_sortHighScores (no RNG) is not ported; JE_main
// arrives with later sub-projects; quitting returns to the title instead of exiting.
export async function runGame(ctx: Ctx): Promise<never> {
  loadConfigurationDefaults(ctx); // main(): JE_loadConfiguration() precedes intro_logos()
  await introLogos(ctx);
  for (;;) {
    initPlayerData(ctx);
    ctx.state.playDemo = false;
    ctx.state.loadDestruct = false;
    if (!(await titleScreen(ctx))) {
      await quitScreen(ctx);
      continue;
    }
    if (ctx.state.loadDestruct) await stubScreen(ctx, 'Destruct');
    else if (ctx.state.playDemo) await stubScreen(ctx, 'Demo', 'Not yet implemented', 200);
    else await stubScreen(ctx, 'Game');
  }
}
