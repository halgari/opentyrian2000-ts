// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/varz.c (explosions, superpixels) and the explosion passes of src/tyrian2.c JE_main
import type { Ctx } from '../ctx';

// STUB(task 6): tyrian2.c:1897-1937 -- sequenced (repeating) explosions: spawn only
export function updateRepeatingExplosions(_ctx: Ctx): void {}

// STUB(task 6): tyrian2.c:1939-1965 -- explosion sprite pass (blit_sprite2_blend when explosionTransparent)
export function drawExplosions(_ctx: Ctx): void {}

// STUB(task 6): JE_drawSP (varz.c:1170) -- superpixels, drawn on VGAScreen (game_screen in the loop)
export function drawSP(_ctx: Ctx): void {}
