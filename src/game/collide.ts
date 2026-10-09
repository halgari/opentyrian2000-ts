// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (player shots vs enemies)
import type { Ctx } from '../ctx';

// STUB(task 13): tyrian2.c:1449-1772 -- player_shot_move_and_draw for each live shot, collision with enemies
// (damage, chains, JE_setupExplosion, JE_doSP), then the last_x/y_shot_move update and the JE_playerCollide calls
// (calls playerCollide from player.ts, task 12).
export function playerShotsPass(_ctx: Ctx): void {}
