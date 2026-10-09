// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/lvllib.c, src/tyrian2.c

import { BinaryReader } from '../core/binary-reader';
import type { DataArchive } from './archive';

export const SHAPE_COUNT = 600;
export const SHAPE_SIZE = 24 * 28;

// port of JE_analyzeLevel (lvllib.c)
export function analyzeLevel(lvl: Uint8Array): { lvlNum: number; lvlPos: Int32Array } {
  const r = new BinaryReader(lvl);
  const lvlNum = r.u16();
  const lvlPos = new Int32Array(lvlNum + 1);
  for (let i = 0; i < lvlNum; i++) lvlPos[i] = r.s32();
  lvlPos[lvlNum] = lvl.length; // ftell_eof
  return { lvlNum, lvlPos };
}

export interface EventRecData {
  eventtime: number; eventtype: number; eventdat: number; eventdat2: number;
  eventdat3: number; eventdat5: number; eventdat6: number; eventdat4: number;
}

export interface LevelData {
  mapFile: number; // char code
  shapeFile: number; // char code
  mapX: number; mapX2: number; mapX3: number;
  levelEnemy: Uint16Array;
  maxEvent: number;
  /** maxEvent records followed by one sentinel record with eventtime 65500. */
  events: EventRecData[];
  /** mapSh[layer][0..127], byte-swapped as in the C (SDL_Swap16). */
  mapSh: Uint16Array[];
  map1: Uint8Array; // 14*300
  map2: Uint8Array; // 14*600
  map3: Uint8Array; // 15*600
  shapes: { blank: Uint8Array; pixels: Uint8Array }; // blank[600]; pixels[600*672], zero for blank shapes
}

// port of JE_loadMap (tyrian2.c): level record + shapes file parse
export function loadLevelRecord(
  lvl: Uint8Array, lvlPos: Int32Array, lvlFileNum: number, archive: DataArchive,
): LevelData {
  const r = new BinaryReader(lvl, lvlPos[(lvlFileNum - 1) * 2]!);
  const mapFile = r.u8();
  const shapeFile = r.u8();
  const mapX = r.u16(), mapX2 = r.u16(), mapX3 = r.u16();
  const levelEnemyMax = r.u16();
  const levelEnemy = new Uint16Array(levelEnemyMax);
  for (let i = 0; i < levelEnemyMax; i++) levelEnemy[i] = r.u16();

  const maxEvent = r.u16();
  const events: EventRecData[] = [];
  for (let x = 0; x < maxEvent; x++) {
    events.push({
      eventtime: r.u16(), eventtype: r.u8(), eventdat: r.s16(), eventdat2: r.s16(),
      eventdat3: r.s8(), eventdat5: r.s8(), eventdat6: r.s8(), eventdat4: r.u8(),
    });
  }
  events.push({ eventtime: 65500, eventtype: 0, eventdat: 0, eventdat2: 0, eventdat3: 0, eventdat5: 0, eventdat6: 0, eventdat4: 0 });

  const mapSh: Uint16Array[] = [];
  for (let t = 0; t < 3; t++) {
    const row = new Uint16Array(128);
    // read LE then SDL_Swap16
    for (let i = 0; i < 128; i++) { const v = r.u16(); row[i] = ((v & 0xff) << 8) | (v >> 8); }
    mapSh.push(row);
  }

  const shp = new BinaryReader(archive.get(`shapes${String.fromCharCode(shapeFile).toLowerCase()}.dat`));
  const blank = new Uint8Array(SHAPE_COUNT);
  const pixels = new Uint8Array(SHAPE_COUNT * SHAPE_SIZE);
  for (let zi = 0; zi < SHAPE_COUNT; zi++) {
    blank[zi] = shp.u8() !== 0 ? 1 : 0;
    if (!blank[zi]) pixels.set(shp.bytes(SHAPE_SIZE), zi * SHAPE_SIZE);
  }

  const map1 = r.bytes(14 * 300);
  const map2 = r.bytes(14 * 600);
  const map3 = r.bytes(15 * 600);

  return { mapFile, shapeFile, mapX, mapX2, mapX3, levelEnemy, maxEvent, events, mapSh, map1, map2, map3, shapes: { blank, pixels } };
}

/** ref[] entry that the C never assigned (uninitialised stack in JE_loadMap). */
export const REF_UNINIT = -2;
/** ref[] entry assigned NULL. */
export const REF_NULL = -1;

export interface ShapeRefs {
  /** ref[layer][x]: slot index x (the megaDataN.shapes[x] slot), REF_NULL, or REF_UNINIT. */
  ref: Int16Array[];
  /** Index z (0..599) of the shapes.dat shape copied into slot x of each layer, or -1 if none. */
  shapeIndex: Int16Array[];
  /** megaDataN.shapes[x].fill for layers 1 and 2 (layer 0 has none). */
  fill: Uint8Array[];
}

// port of JE_loadMap (tyrian2.c) "Match 1/2/3" loops: ref[][] as slot indexes
export function buildShapeRefs(level: LevelData): ShapeRefs {
  const ref = [0, 1, 2].map(() => new Int16Array(128).fill(REF_UNINIT));
  const shapeIndex = [0, 1, 2].map(() => new Int16Array(128).fill(-1));
  const fill = [0, 1, 2].map(() => new Uint8Array(128));
  const { mapSh, shapes } = level;
  for (let zi = 0; zi < SHAPE_COUNT; zi++) {
    const shapeBlank = shapes.blank[zi]!;
    const base = zi * SHAPE_SIZE;
    const allSolid = (): number => {
      let y = 1;
      for (let yy = 0; yy < SHAPE_SIZE >> 1; yy++) if (shapes.pixels[base + yy] === 0) y = 0;
      return y;
    };
    for (let x = 0; x <= 71; ++x) {
      if (mapSh[0]![x] === zi + 1) { shapeIndex[0]![x] = zi; ref[0]![x] = x; }
    }
    for (let x = 0; x <= 71; ++x) {
      if (mapSh[1]![x] === zi + 1) {
        if (x !== 71 && !shapeBlank) {
          shapeIndex[1]![x] = zi; fill[1]![x] = allSolid(); ref[1]![x] = x;
        } else ref[1]![x] = REF_NULL;
      }
    }
    for (let x = 0; x <= 71; ++x) {
      if (mapSh[2]![x] === zi + 1) {
        if (x < 70 && !shapeBlank) {
          shapeIndex[2]![x] = zi; fill[2]![x] = allSolid(); ref[2]![x] = x;
        } else ref[2]![x] = REF_NULL;
      }
    }
  }
  return { ref, shapeIndex, fill };
}
