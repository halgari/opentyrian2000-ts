// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/tyrian2.c (JE_eventSystem)
import type { Ctx } from '../ctx';

// STUB(task 10): JE_eventSystem (tyrian2.c:4308). The real one ends with `eventLoc++` after its switch; the
// stub does only that, so the level loop's `while (eventRec[eventLoc-1].eventtime <= curLoc ...)` terminates.
export function eventSystem(ctx: Ctx): void {
  ctx.game.events.eventLoc = (ctx.game.events.eventLoc + 1) & 0xffff;
}
