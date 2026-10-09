// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_SFCodes), src/varz.c (JE_specialComplete, JE_doSpecialShot)
import type { Ctx } from '../ctx';
import type { Player } from './world';

// STUB(task 12): JE_SFCodes (mainint.c:2432); playerNum is 1-based like the C
export function sfCodes(_ctx: Ctx, _playerNum: number, _px: number, _py: number, _mouseX: number, _mouseY: number): void {}

// STUB(task 12): JE_specialComplete (varz.c:507)
export function specialComplete(_ctx: Ctx, _playerNum: number, _specialType: number): void {}

// STUB(task 12): JE_doSpecialShot (varz.c:682). C takes `uint *armor, uint *shield`; both are members of `player`.
export function doSpecialShot(_ctx: Ctx, _playerNum: number, _player: Player): void {}
