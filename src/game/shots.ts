// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/shots.c, src/varz.c (JE_getShipInfo, JE_portConfigs)
import type { Ctx } from '../ctx';

// STUB(task 7): JE_getShipInfo (varz.c:330) -- ship sprite sheet/graphic, powerAdd, armor, initial_armor, hit area.
// Until it lands, player[].armor keeps its initPlayerData value and powerAdd stays 0.
export function getShipInfo(_ctx: Ctx): void {}
