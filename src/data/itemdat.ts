// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/episodes.c

import { BinaryReader } from '../core/binary-reader';

export const WEAP_END1 = 818;
export const WEAP_START2 = 1000;
export const WEAP_NUM = 1818;
export const PORT_NUM = 60;
export const POWER_NUM = 6;
export const OPTION_NUM = 37;
export const SHIP_NUM = 18;
export const SHIELD_NUM = 11;
export const SPECIAL_NUM = 54;
export const ENEMY_END1 = 850;
export const ENEMY_START2 = 1001;
export const ENEMY_NUM = 1850;

export interface WeaponType {
  drain: number; shotrepeat: number; multi: number; weapani: number; max: number;
  tx: number; ty: number; aim: number;
  attack: number[]; del: number[]; sx: number[]; sy: number[]; bx: number[]; by: number[]; sg: number[];
  acceleration: number; accelerationx: number; circlesize: number; sound: number; trail: number; shipblastfilter: number;
}
export interface WeaponPortType { name: string; opnum: number; op: [number[], number[]]; cost: number; itemgraphic: number; poweruse: number }
export interface SpecialType { name: string; itemgraphic: number; pwr: number; stype: number; wpn: number }
export interface PowerType { name: string; itemgraphic: number; power: number; speed: number; cost: number }
export interface ShipType {
  name: string; shipgraphic: number; itemgraphic: number; ani: number; spd: number; dmg: number; cost: number; bigshipgraphic: number;
}
export interface OptionType {
  name: string; pwr: number; itemgraphic: number; cost: number; tr: number; option: number; opspd: number; ani: number;
  gr: number[]; wport: number; wpnum: number; ammo: number; stop: boolean; icongr: number;
}
export interface ShieldType { name: string; tpwr: number; mpwr: number; itemgraphic: number; cost: number }
export interface EnemyDatType {
  ani: number; tur: number[]; freq: number[]; xmove: number; ymove: number; xaccel: number; yaccel: number;
  xcaccel: number; ycaccel: number; startx: number; starty: number; startxc: number; startyc: number;
  armor: number; esize: number; egraphic: number[]; explosiontype: number; animate: number; shapebank: number;
  xrev: number; yrev: number; dgr: number; dlevel: number; dani: number; elaunchfreq: number; elaunchtype: number;
  value: number; eenemydie: number;
}

export interface ItemDat {
  /** [0..WEAP_NUM]; entries outside the two loaded banks stay zero (C globals are zero-initialised). */
  weapons: WeaponType[];
  weaponPorts: WeaponPortType[];
  specials: SpecialType[];
  powerSys: PowerType[];
  ships: ShipType[];
  options: OptionType[];
  shields: ShieldType[];
  /** [0..ENEMY_NUM] */
  enemyDat: EnemyDatType[];
}

const z = (n: number): number[] => new Array<number>(n).fill(0);
const emptyWeapon = (): WeaponType => ({
  drain: 0, shotrepeat: 0, multi: 0, weapani: 0, max: 0, tx: 0, ty: 0, aim: 0,
  attack: z(8), del: z(8), sx: z(8), sy: z(8), bx: z(8), by: z(8), sg: z(8),
  acceleration: 0, accelerationx: 0, circlesize: 0, sound: 0, trail: 0, shipblastfilter: 0,
});
const emptyEnemy = (): EnemyDatType => ({
  ani: 0, tur: z(3), freq: z(3), xmove: 0, ymove: 0, xaccel: 0, yaccel: 0, xcaccel: 0, ycaccel: 0,
  startx: 0, starty: 0, startxc: 0, startyc: 0, armor: 0, esize: 0, egraphic: z(20), explosiontype: 0,
  animate: 0, shapebank: 0, xrev: 0, yrev: 0, dgr: 0, dlevel: 0, dani: 0, elaunchfreq: 0, elaunchtype: 0,
  value: 0, eenemydie: 0,
});

const u8s = (r: BinaryReader, n: number): number[] => Array.from(r.bytes(n));
const s8s = (r: BinaryReader, n: number): number[] => Array.from({ length: n }, () => r.s8());
const u16s = (r: BinaryReader, n: number): number[] => Array.from({ length: n }, () => r.u16());

// fread 30 bytes then NUL at min(nameLen, 30)
function readName(r: BinaryReader): string {
  const len = r.u8();
  const raw = r.bytes(30);
  let s = '';
  for (let i = 0; i < Math.min(len, 30) && raw[i] !== 0; i++) s += String.fromCharCode(raw[i]!);
  return s;
}

// port of JE_loadItemDat (episodes.c)
// Only the episode <= 3 path (tyrian.hdt) is ported; episodes 4 and 5 read item data from the level file.
export function loadItemDat(hdt: Uint8Array, episode: number): ItemDat {
  if (episode > 3) throw new Error('unported: episodes.c:64 (episode 4/5 item data in level file)'); // TODO(sp4)
  const r = new BinaryReader(hdt);
  const episode1DataLoc = r.s32();
  r.seek(episode1DataLoc);
  u16s(r, 7); // itemNum[7]

  const weapons = Array.from({ length: WEAP_NUM + 1 }, emptyWeapon);
  for (const [lo, hi] of [[0, WEAP_END1], [WEAP_START2, WEAP_NUM]] as const) {
    for (let i = lo; i <= hi; i++) {
      weapons[i] = {
        drain: r.u16(), shotrepeat: r.u8(), multi: r.u8(), weapani: r.u16(), max: r.u8(),
        tx: r.u8(), ty: r.u8(), aim: r.u8(),
        attack: u8s(r, 8), del: u8s(r, 8), sx: s8s(r, 8), sy: s8s(r, 8), bx: s8s(r, 8), by: s8s(r, 8), sg: u16s(r, 8),
        acceleration: r.s8(), accelerationx: r.s8(), circlesize: r.u8(), sound: r.u8(), trail: r.u8(), shipblastfilter: r.u8(),
      };
    }
  }

  const weaponPorts: WeaponPortType[] = [];
  for (let i = 0; i <= PORT_NUM; i++) {
    const name = readName(r);
    const opnum = r.u8();
    const op: [number[], number[]] = [u16s(r, 11), u16s(r, 11)];
    weaponPorts.push({ name, opnum, op, cost: r.u16(), itemgraphic: r.u16(), poweruse: r.u16() });
  }

  const specials: SpecialType[] = [];
  for (let i = 0; i <= SPECIAL_NUM; i++) {
    specials.push({ name: readName(r), itemgraphic: r.u16(), pwr: r.u8(), stype: r.u8(), wpn: r.u16() });
  }

  const powerSys: PowerType[] = [];
  for (let i = 0; i <= POWER_NUM; i++) {
    powerSys.push({ name: readName(r), itemgraphic: r.u16(), power: r.u8(), speed: r.s8(), cost: r.u16() });
  }

  const ships: ShipType[] = [];
  for (let i = 0; i <= SHIP_NUM; i++) {
    ships.push({
      name: readName(r), shipgraphic: r.u16(), itemgraphic: r.u16(), ani: r.u8(), spd: r.s8(), dmg: r.u8(),
      cost: r.u16(), bigshipgraphic: r.u8(),
    });
  }

  const options: OptionType[] = [];
  for (let i = 0; i <= OPTION_NUM; i++) {
    options.push({
      name: readName(r), pwr: r.u8(), itemgraphic: r.u16(), cost: r.u16(), tr: r.u8(), option: r.u8(),
      opspd: r.s8(), ani: r.u8(), gr: u16s(r, 20), wport: r.u8(), wpnum: r.u16(), ammo: r.u8(),
      stop: r.bool(), icongr: r.u8(),
    });
  }

  const shields: ShieldType[] = [];
  for (let i = 0; i <= SHIELD_NUM; i++) {
    shields.push({ name: readName(r), tpwr: r.u8(), mpwr: r.u8(), itemgraphic: r.u16(), cost: r.u16() });
  }

  const enemyDat = Array.from({ length: ENEMY_NUM + 1 }, emptyEnemy);
  for (const [lo, hi] of [[0, ENEMY_END1], [ENEMY_START2, ENEMY_NUM]] as const) {
    for (let i = lo; i <= hi; i++) {
      enemyDat[i] = {
        ani: r.u8(), tur: u8s(r, 3), freq: u8s(r, 3),
        xmove: r.s8(), ymove: r.s8(), xaccel: r.s8(), yaccel: r.s8(), xcaccel: r.s8(), ycaccel: r.s8(),
        startx: r.s16(), starty: r.s16(), startxc: r.s8(), startyc: r.s8(),
        armor: r.u8(), esize: r.u8(), egraphic: u16s(r, 20), explosiontype: r.u8(), animate: r.u8(),
        shapebank: r.u8(), xrev: r.s8(), yrev: r.s8(), dgr: r.u16(), dlevel: r.s8(), dani: r.s8(),
        elaunchfreq: r.u8(), elaunchtype: r.u16(), value: r.s16(), eenemydie: r.u16(),
      };
    }
  }

  return { weapons, weaponPorts, specials, powerSys, ships, options, shields, enemyDat };
}
