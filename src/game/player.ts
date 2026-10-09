// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_mainGamePlayerFunctions, JE_playerMovement, JE_playerCollide), src/player.c
import type { Ctx } from '../ctx';
import { replayDemoKeys } from './demo';
import type { Player } from './world';

// port of calc_purple_balls_needed (player.c:23)
const PURPLE_BALLS_REQUIRED = [1, 1, 2, 4, 8, 12, 16, 20, 25, 30, 40, 50];
export function calcPurpleBallsNeeded(p: Player): void {
  p.purpleBallsNeeded = PURPLE_BALLS_REQUIRED[p.lives]!;
}

// STUB(task 11): JE_mainGamePlayerFunctions (mainint.c:4662) + JE_playerMovement (mainint.c:3497).
// Only the bookkeeping the skeleton loop needs to run a demo to its end is present; task 11 replaces the whole body:
//   - levelEnd/levelEndWarp countdown while endLevel (mainint.c:4666-4670)
//   - demo key replay, with end-of-demo => endLevel = true, levelEnd = 40 (mainint.c:3672-3676)
//   - the "End Level Fade-Out" reallyEndLevel conditions (mainint.c:3954-3969), without the ship trail drawing
// Not present: ship movement/clamping/drawing, firing, sidekicks, SF codes, parallax offsets.
export function mainGamePlayerFunctions(ctx: Ctx): void {
  const g = ctx.game;
  const v = g.varz;
  const p = g.players[0];

  if (v.endLevel && v.levelEnd > 0) {
    v.levelEnd--;
    v.levelEndWarp++;
  }
  v.SFExecuted.fill(0);
  g.config.portConfigChange = false;

  // JE_playerMovement(&player[0], ...)
  if (!v.endLevel && p.isAlive) {
    v.button[0] = v.button[1] = v.button[2] = v.button[3] = false;
    if (ctx.state.playDemo && !replayDemoKeys(ctx)) {
      v.endLevel = true;
      v.levelEnd = 40;
    }
  }
  if (v.levelEnd > 0 && !p.isAlive) v.reallyEndLevel = true; // all_players_dead() (one-player)
  if (p.isAlive && v.endLevel) {
    if (v.levelEnd === 0) {
      v.reallyEndLevel = true;
    } else {
      p.y -= v.levelEndWarp;
      if (p.y < -200) v.reallyEndLevel = true;
    }
  }
}

// STUB(task 12): JE_playerCollide (mainint.c:4732); playerNum is 1-based like the C
export function playerCollide(_ctx: Ctx, _player: Player, _playerNum: number): void {}
