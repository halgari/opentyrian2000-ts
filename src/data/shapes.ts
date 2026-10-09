// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/sprite.c

import { BinaryReader } from '../core/binary-reader';
import type { Sprite2Sheet } from '../video/sprite2';
import { emptySpriteTable, loadSpriteTable, type SpriteTable } from '../video/sprite';
import type { DataArchive } from './archive';

export interface MainShapes {
  tables: SpriteTable[];
  spriteSheet8: Sprite2Sheet;      // player shots
  spriteSheet9: Sprite2Sheet;      // player ships
  spriteSheet10: Sprite2Sheet;     // power-ups
  spriteSheet11: Sprite2Sheet;     // coins, datacubes
  spriteSheet12: Sprite2Sheet;     // more player shots
  spriteSheetT2000: Sprite2Sheet;  // Tyrian 2000 ships
}

// port of JE_loadMainShapeTables
export function loadMainShapeTables(bytes: Uint8Array): MainShapes {
  const SHP_NUM = 13;
  const r = new BinaryReader(bytes);
  const shpNumb = r.u16();
  if (shpNumb !== SHP_NUM) throw new Error(`unexpected shape file table count ${shpNumb}`);
  const pos: number[] = [];
  for (let i = 0; i < shpNumb; i++) pos.push(r.s32());
  pos.push(bytes.length);

  const tables: SpriteTable[] = [];
  for (let i = 0; i < 7; i++) {
    r.seek(pos[i]!);
    tables.push(loadSpriteTable(r));
  }
  tables.push(emptySpriteTable()); // EXTRA_SHAPES, loaded later by the ending
  // the C reads each sheet from the stream position left by the previous load; tables are contiguous
  const sheet = (i: number): Sprite2Sheet => ({ data: bytes.slice(pos[i]!, pos[i + 1]!) });
  return {
    tables,
    spriteSheet8: sheet(7),
    spriteSheet9: sheet(8),
    spriteSheet10: sheet(9),
    spriteSheet11: sheet(10),
    spriteSheet12: sheet(11),
    spriteSheetT2000: sheet(12),
  };
}

// port of JE_loadCompShapes
export function loadCompShapes(archive: DataArchive, s: string): Sprite2Sheet {
  return { data: archive.get(`newsh${s.toLowerCase()}.shp`).slice() };
}
