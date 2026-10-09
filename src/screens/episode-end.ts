// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_nextEpisode) -- STUB
import type { Ctx } from '../ctx';

// TODO(task 13): port of JE_nextEpisode (mainint.c:975): lastLevelName = "Completed"; highScoreCheck;
// findNextEpisode; credits and the SuperCarrot roll (1 RNG draw) after the last episode; initEpisode;
// gameLoaded = true; mainLevel = saveLevel = FIRST_LEVEL; play_song(26); episode title screen and wait.
export async function nextEpisode(_ctx: Ctx): Promise<void> {
  throw new Error('unported: JE_nextEpisode (mainint.c:975), task 13');
}
