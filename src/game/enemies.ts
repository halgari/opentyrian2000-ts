// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (enemies, enemy shots)
import type { Ctx } from '../ctx';

// STUB(task 9): JE_drawEnemy (tyrian2.c:175); enemyOffset is 25 (sky), 50 / 100 (ground), 75 (top)
export function drawEnemy(_ctx: Ctx, _enemyOffset: number): void {}

// STUB(task 9): the random enemy spawn at tyrian2.c:1393-1398
//   if (enemiesActive && mt_rand() % 100 > levelEnemyFrequency) { tempW = levelEnemy[mt_rand() % levelEnemyMax]; ... b = JE_newEnemy(0, tempW, 0); }
// It draws from the RNG every frame while enemiesActive, so it is part of the RNG call order.
export function randomEnemySpawn(_ctx: Ctx): void {}

// STUB(task 9): enemy shot update/collision/draw pass (tyrian2.c:1778-1860); runs only `if (!endLevel)`
export function updateEnemyShots(_ctx: Ctx): void {}

// STUB(task 9): JE_eventJump (tyrian2.c:4261)
export function eventJump(_ctx: Ctx, _jump: number): void {}
