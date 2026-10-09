// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/video.c
import type { Ctx } from '../ctx';

// port of JE_showVGA
export function showVGA(ctx: Ctx): void {
  ctx.frameSink?.(ctx.vga.screen, ctx.palette.current);
  ctx.presenter.present(ctx.vga.screen, ctx.palette);
}
