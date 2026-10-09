// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/varz.h, src/varz.c, src/config.h, src/config.c, src/player.h, src/player.c,
//   src/episodes.h, src/shots.h, src/backgrnd.h, src/backgrnd.c, src/lvlmast.h, src/lvlmast.c,
//   src/tyrian2.h, src/tyrian2.c (file-scope globals), src/mainint.h, src/mainint.c (file-scope globals),
//   src/sndmast.c (windowTextSamples), src/nortsong.c (fxPlayVol, frameCountMax, tempVolume)
//
// All C gameplay globals live in one typed object, `ctx.game`. Field names are the C names
// (verbatim for globals, camelCase for snake_case struct fields). Fixed-size C arrays become typed
// arrays (which wrap on store exactly like the C element type) or plain arrays of classes.
//
// C types used in trailing comments (opentyr.h): JE_byte=u8, JE_shortint=s8, JE_integer=s16,
// JE_word=u16, JE_longint=s32, JE_boolean/bool=boolean, JE_real=float32, uint=u32, ulong=64-bit.
// Scalar fields are plain JS numbers: the code that assigns them applies u8()/s16()/... wrapping
// (src/core/int.ts) exactly where the C narrows. Typed-array elements wrap by themselves.
import type { ShotOut } from './shots';
import { V_ACCELERATE, V_BOSS, V_CLEARED_PLATFORM, V_DANGER, V_ENEMIES, V_SPIKES } from '../audio/ids';
import type { Sprite2Sheet } from '../video/sprite2';

// ---------------------------------------------------------------------------------------------
// Size constants (lvlmast.h, varz.h, shots.h, config.h, episodes.h, tyrian2.h)
// ---------------------------------------------------------------------------------------------
export const SA = 9;
export const ENEMY_SHOT_MAX = 60;
export const MAX_EXPLOSIONS = 200;
export const MAX_REPEATING_EXPLOSIONS = 20;
export const MAX_SUPERPIXELS = 101;
export const MAX_PWEAPON = 81;
export const EVENT_MAXIMUM = 2500;
export const ENEMY_COUNT = 100; // JE_MultiEnemyType: 100 enemies
export const SAVE_FILES_NUM = 11 * 2;
/** config.h: sizes of the original TYRIAN.SAV image */
export const SAVE_FILES_SIZE = 2398;
export const SIZEOF_SAVEGAMETEMP = SAVE_FILES_SIZE + 4 + 100;
export const SAVE_FILE_SIZE = SIZEOF_SAVEGAMETEMP - 4;
export const MAX_STARS = 100;
export const STARFIELD_HUE = 0x90;
export const WEAP_NUM = 1818;
export const PORT_NUM = 60;
export const POWER_NUM = 6;
export const OPTION_NUM = 37;
export const SHIP_NUM = 18;
export const SHIELD_NUM = 11;
export const SPECIAL_NUM = 54;
export const ENEMY_NUM = 1850;
export const EPISODE_MAX = 5;
/** player.h */
export const FRONT_WEAPON = 0;
export const REAR_WEAPON = 1;
export const LEFT_SIDEKICK = 0;
export const RIGHT_SIDEKICK = 1;
/** config.h SHOT_* indexes of shotRepeat[] / shotMultiPos[] */
export const SHOT_FRONT = 0;
export const SHOT_REAR = 1;
export const SHOT_LEFT_SIDEKICK = 2;
export const SHOT_RIGHT_SIDEKICK = 3;
export const SHOT_MISC = 4;
export const SHOT_P2_CHARGE = 5;
export const SHOT_P1_SUPERBOMB = 6;
export const SHOT_P2_SUPERBOMB = 7;
export const SHOT_SPECIAL = 8;
export const SHOT_NORTSPARKS = 9;
export const SHOT_SPECIAL2 = 10;
/** config.h difficulty enum */
export const DIFFICULTY_WIMP = 0;
export const DIFFICULTY_EASY = 1;
export const DIFFICULTY_NORMAL = 2;
export const DIFFICULTY_HARD = 3;
export const DIFFICULTY_IMPOSSIBLE = 4;
export const DIFFICULTY_INSANITY = 5;
export const DIFFICULTY_SUICIDE = 6;
export const DIFFICULTY_MANIACAL = 7;
export const DIFFICULTY_ZINGLON = 8;
export const DIFFICULTY_NORTANEOUS = 9;
export const DIFFICULTY_10 = 10;
/** episodes.h */
export const EPISODE_AVAILABLE = 5;
/** varz.h SA_LASTSHIP */
export const SA_LASTSHIP = 9;
/** varz.h SA_* enum */
export const SA_NONE = 0;
export const SA_SUPERTYRIAN = 254;
export const SA_ARCADE = 255;
/** episodes.h */
export const FIRST_LEVEL = 1;
/** megaData sizes in the C struct field order (varz.h). Map slots are pointers (-1 = NULL here). */
export const MAP1_ROWS = 300, MAP1_COLS = 14;
export const MAP2_ROWS = 600, MAP2_COLS = 14;
export const MAP3_ROWS = 600, MAP3_COLS = 15;
export const SHAPE_BYTES = 24 * 28;

// ---------------------------------------------------------------------------------------------
// Static const tables (varz.c, sndmast.c, lvlmast.c) -- generated from the C initialisers.
// ---------------------------------------------------------------------------------------------
export const SANextShip: readonly number[] = [3, 8, 6, 2, 5, 1, 4, 10, 9, 7, 3]; // varz.c u8
export const SASpecialWeapon: readonly number[] = [7, 8, 9, 10, 11, 12, 13, 48, 47]; // varz.c u16
export const SASpecialWeaponB: readonly number[] = [37, 6, 15, 40, 16, 14, 41, 48, 47]; // varz.c u16
export const SAShip: readonly number[] = [3, 1, 5, 10, 2, 11, 12, 15, 17]; // varz.c u8
export const SAWeapon: readonly (readonly number[])[] = [
  [9, 31, 32, 33, 34],
  [19, 8, 22, 41, 34],
  [27, 5, 20, 42, 31],
  [15, 3, 28, 22, 12],
  [23, 35, 25, 14, 6],
  [2, 5, 21, 4, 7],
  [40, 38, 37, 41, 36],
  [47, 45, 19, 33, 19],
  [44, 26, 46, 26, 1],
]; // varz.c u16
export const specialArcadeWeapon: readonly number[] = [17, 17, 18, 0, 0, 0, 10, 0, 0, 0, 0, 0, 44, 0, 10, 0, 19, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // varz.c u8
export const optionSelect: readonly (readonly (readonly number[])[])[] = [
  [[0, 0], [0, 0], [0, 0]],
  [[1, 1], [16, 16], [30, 30]],
  [[2, 2], [29, 29], [29, 20]],
  [[3, 3], [21, 21], [12, 0]],
  [[4, 4], [18, 18], [16, 23]],
  [[0, 0], [0, 0], [0, 0]],
  [[6, 6], [29, 16], [0, 22]],
  [[7, 7], [19, 19], [19, 28]],
  [[0, 0], [0, 0], [0, 0]],
  [[0, 0], [0, 0], [0, 0]],
  [[10, 10], [21, 21], [21, 27]],
  [[0, 0], [0, 0], [0, 0]],
  [[0, 0], [0, 0], [0, 0]],
  [[13, 13], [17, 17], [13, 26]],
  [[0, 0], [0, 0], [0, 0]],
  [[15, 15], [15, 16], [15, 16]],
]; // varz.c u8
export const PGR: readonly number[] = [4, 1, 2, 3, 20, 36, 52, 68, 84, 100, 116, 132, 151, 151, 151, 151, 52, 52, 1, 2, 4]; // varz.c u16
export const PAni: readonly number[] = [1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]; // varz.c u8
export const linkGunWeapons: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 444, 445, 446, 447, 0, 448, 449, 0, 0, 0, 0, 0, 450, 451, 0, 506, 0, 564, 445, 446, 447, 448, 449, 445, 446, 447, 448, 449, 450, 451]; // varz.c u16
export const chargeGunWeapons: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 476, 458, 464, 482, 0, 488, 470, 0, 0, 0, 0, 0, 494, 500, 0, 528, 0, 558, 458, 458, 458, 458, 458, 458, 458, 458, 458, 458, 458, 458]; // varz.c u16
export const randomEnemyLaunchSounds: readonly number[] = [13, 6, 26]; // varz.c u8
export const keyboardCombos: readonly (readonly number[])[] = [
  [2, 1, 2, 5, 137, 0, 0, 0],
  [4, 3, 2, 5, 138, 0, 0, 0],
  [3, 4, 6, 139, 0, 0, 0, 0],
  [2, 5, 142, 0, 0, 0, 0, 0],
  [6, 2, 6, 143, 0, 0, 0, 0],
  [6, 7, 5, 8, 6, 7, 5, 112],
  [7, 8, 101, 0, 0, 0, 0, 0],
  [1, 7, 6, 146, 0, 0, 0, 0],
  [8, 6, 7, 1, 120, 0, 0, 0],
  [3, 6, 8, 5, 121, 0, 0, 0],
  [1, 2, 7, 8, 119, 0, 0, 0],
  [3, 4, 3, 6, 123, 0, 0, 0],
  [6, 7, 5, 8, 124, 0, 0, 0],
  [1, 6, 125, 0, 0, 0, 0, 0],
  [9, 5, 126, 0, 0, 0, 0, 0],
  [1, 7, 127, 0, 0, 0, 0, 0],
  [1, 8, 128, 0, 0, 0, 0, 0],
  [9, 7, 129, 0, 0, 0, 0, 0],
  [9, 8, 130, 0, 0, 0, 0, 0],
  [4, 2, 3, 5, 131, 0, 0, 0],
  [3, 1, 2, 8, 132, 0, 0, 0],
  [2, 4, 5, 133, 0, 0, 0, 0],
  [3, 4, 2, 8, 134, 0, 0, 0],
  [1, 4, 6, 135, 0, 0, 0, 0],
  [1, 3, 6, 137, 0, 0, 0, 0],
  [1, 4, 3, 4, 7, 136, 0, 0],
]; // varz.c u8
export const shipCombosB: readonly number[] = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 7, 8, 5, 25, 14, 4, 6, 3, 9, 2, 26]; // varz.c u8
export const superTyrianSpecials: readonly number[] = [1, 2, 4, 5]; // varz.c u8
export const shipCombos: readonly (readonly number[])[] = [
  [5, 4, 7],
  [1, 2, 0],
  [14, 4, 0],
  [4, 5, 0],
  [6, 5, 0],
  [7, 8, 0],
  [7, 9, 0],
  [10, 3, 5],
  [5, 8, 9],
  [1, 3, 0],
  [7, 16, 17],
  [2, 11, 12],
  [3, 8, 10],
  [0, 0, 0],
  [1, 0, 0],
  [4, 0, 0],
  [5, 9, 2],
  [0, 0, 0],
  [0, 0, 0],
]; // varz.c u8
/** sndmast.c:67 windowTextSamples[9] (JE_byte) */
export const windowTextSamples: readonly number[] = [
  V_DANGER, V_BOSS, V_ENEMIES, V_CLEARED_PLATFORM, V_DANGER, V_SPIKES, V_ACCELERATE, V_DANGER, V_ENEMIES,
];
/** lvlmast.c:23 shapeFile[36] (JE_char), the level shape-file letter table */
export const shapeFile: string = "2478ABCDEFGHIJKLMNOPQRSTU5#V0@3^59'%";
/** config.c:50 defaultDosKeySettings (JE_byte[8]) */
export const defaultDosKeySettings: readonly number[] = [72, 80, 75, 77, 57, 28, 29, 56];
/** config.c:55 defaultMouseSettings (JE_byte[3]) */
export const defaultMouseSettings: readonly number[] = [1, 4, 5];
/** config.c:60 defaultKeySettings: SDL scancodes UP DOWN LEFT RIGHT SPACE RETURN LCTRL LALT */
export const defaultKeySettings: readonly number[] = [82, 81, 80, 79, 44, 40, 224, 226];
/** config.c:106 initialItemAvail (JE_byte[100]) */
export const initialItemAvail: readonly number[] = [
  1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
];

// ---------------------------------------------------------------------------------------------
// Struct types
// ---------------------------------------------------------------------------------------------

/** varz.h JE_SingleEnemyType. Pointer fields: `sprite2s` is the sheet itself; `enemydatofs` is the
 *  index into `items.enemyDat` (C: `void *` into enemyDat[]); -1 = NULL. */
export class Enemy {
  fillbyte = 0;                        // JE_byte
  ex = 0; ey = 0;                      // JE_integer
  exc = 0; eyc = 0;                    // JE_shortint
  exca = 0; eyca = 0;                  // JE_shortint
  excc = 0; eycc = 0;                  // JE_shortint
  exccw = 0; eyccw = 0;                // JE_shortint
  armorleft = 0;                       // JE_byte
  eshotwait = new Uint8Array(3);       // JE_byte[3]
  eshotmultipos = new Uint8Array(3);   // JE_byte[3]
  enemycycle = 0;                      // JE_byte
  ani = 0;                             // JE_byte
  egr = new Uint16Array(20);           // JE_word[20]
  size = 0;                            // JE_byte
  linknum = 0;                         // JE_byte
  aniactive = 0;                       // JE_byte
  animax = 0;                          // JE_byte
  aniwhenfire = 0;                     // JE_byte
  sprite2s: Sprite2Sheet | null = null; // Sprite2_array *
  exrev = 0; eyrev = 0;                // JE_shortint
  exccadd = 0; eyccadd = 0;            // JE_integer
  exccwmax = 0; eyccwmax = 0;          // JE_byte
  enemydatofs = -1;                    // void * (index into enemyDat)
  edamaged = false;                    // JE_boolean
  enemytype = 0;                       // JE_word
  animin = 0;                          // JE_byte
  edgr = 0;                            // JE_word
  edlevel = 0;                         // JE_shortint
  edani = 0;                           // JE_shortint
  fill1 = 0;                           // JE_byte
  filter = 0;                          // JE_byte
  evalue = 0;                          // JE_integer
  fixedmovey = 0;                      // JE_integer
  freq = new Uint8Array(3);            // JE_byte[3]
  launchwait = 0;                      // JE_byte
  launchtype = 0;                      // JE_word
  launchfreq = 0;                      // JE_byte
  xaccel = 0;                          // JE_byte
  yaccel = 0;                          // JE_byte
  tur = new Uint8Array(3);             // JE_byte[3]
  enemydie = 0;                        // JE_word
  enemyground = false;                 // JE_boolean
  explonum = 0;                        // JE_byte
  mapoffset = 0;                       // JE_word
  scoreitem = false;                   // JE_boolean
  special = false;                     // JE_boolean
  flagnum = 0;                         // JE_byte
  setto = false;                       // JE_boolean
  iced = 0;                            // JE_byte
  launchspecial = 0;                   // JE_byte
  xminbounce = 0;                      // JE_integer
  xmaxbounce = 0;                      // JE_integer
  yminbounce = 0;                      // JE_integer
  ymaxbounce = 0;                      // JE_integer
  fill = new Uint8Array(3);            // JE_byte[3]

  /** `memset(&enemy, 0, sizeof)` */
  reset(): void {
    const z = new Enemy();
    Object.assign(this, z);
  }
}

/** varz.h EnemyShotType */
export class EnemyShot {
  sx = 0; sy = 0;                      // JE_integer
  sxm = 0; sym = 0;                    // JE_integer
  sxc = 0; syc = 0;                    // JE_shortint
  tx = 0; ty = 0;                      // JE_byte
  sgr = 0;                             // JE_word
  sdmg = 0;                            // JE_byte
  duration = 0;                        // JE_byte
  animate = 0;                         // JE_word
  animax = 0;                          // JE_word
  fill = new Uint8Array(12);           // JE_byte[12]
}

/** shots.h PlayerShotDataType */
export class PlayerShot {
  shotX = 0; shotY = 0; shotXM = 0; shotYM = 0; shotXC = 0; shotYC = 0; // JE_integer
  shotComplicated = false;             // JE_boolean
  shotDevX = 0; shotDirX = 0; shotDevY = 0; shotDirY = 0; shotCirSizeX = 0; shotCirSizeY = 0; // JE_integer
  shotTrail = 0;                       // JE_byte
  shotGr = 0; shotAni = 0; shotAniMax = 0; // JE_word
  shotDmg = 0;                         // Uint8
  shotBlastFilter = 0; chainReaction = 0; playerNumber = 0; aimAtEnemy = 0; aimDelay = 0; aimDelayMax = 0; // JE_byte
}

/** varz.h Explosion */
export class Explosion {
  ttl = 0;                             // JE_byte
  x = 0; y = 0;                        // JE_integer
  sprite = 0;                          // JE_word
  followPlayer = false;                // bool
  fixedPosition = false;               // bool
  deltaY = 0;                          // JE_integer
}

/** varz.h rep_explosion_type */
export class RepExplosion {
  delay = 0; ttl = 0;                  // unsigned int
  x = 0; y = 0;                        // unsigned int
  big = false;                         // bool
}

/** varz.h superpixel_type */
export class SuperPixel {
  x = 0; y = 0; z = 0;                 // unsigned int
  deltaX = 0; deltaY = 0;              // signed int
  color = 0;                           // Uint8
}

/** varz.h struct JE_EventRecType */
export class EventRec {
  eventtime = 0;                       // JE_word
  eventtype = 0;                       // JE_byte
  eventdat = 0; eventdat2 = 0;         // JE_integer
  eventdat3 = 0; eventdat5 = 0; eventdat6 = 0; // JE_shortint
  eventdat4 = 0;                       // JE_byte
}

/** episodes.h JE_WeaponType */
export interface WeaponType {
  drain: number;                       // JE_word
  shotrepeat: number;                  // JE_byte
  multi: number;                       // JE_byte
  weapani: number;                     // JE_word
  max: number;                         // JE_byte
  tx: number; ty: number; aim: number; // JE_byte
  attack: number[]; del: number[];     // JE_byte[8]
  sx: number[]; sy: number[];          // JE_shortint[8]
  bx: number[]; by: number[];          // JE_shortint[8]
  sg: number[];                        // JE_word[8]
  acceleration: number; accelerationx: number; // JE_shortint
  circlesize: number;                  // JE_byte
  sound: number;                       // JE_byte
  trail: number;                       // JE_byte
  shipblastfilter: number;             // JE_byte
}

/** episodes.h JE_WeaponPortType element */
export interface WeaponPort {
  name: string;                        // char[31]
  opnum: number;                       // JE_byte
  op: [number[], number[]];            // JE_word[2][11]
  cost: number;                        // JE_word
  itemgraphic: number;                 // JE_word
  poweruse: number;                    // JE_word
}

/** episodes.h JE_SpecialType element */
export interface SpecialType {
  name: string;                        // char[31]
  itemgraphic: number;                 // JE_word
  pwr: number;                         // JE_byte
  stype: number;                       // JE_byte
  wpn: number;                         // JE_word
}

/** episodes.h JE_PowerType element (powerSys) */
export interface PowerSys {
  name: string;                        // char[31]
  itemgraphic: number;                 // JE_word
  power: number;                       // JE_byte
  speed: number;                       // JE_shortint
  cost: number;                        // JE_word
}

/** episodes.h JE_ShipType element */
export interface ShipType {
  name: string;                        // char[31]
  shipgraphic: number;                 // JE_word
  itemgraphic: number;                 // JE_word
  ani: number;                         // JE_byte
  spd: number;                         // JE_shortint
  dmg: number;                         // JE_byte
  cost: number;                        // JE_word
  bigshipgraphic: number;              // JE_byte
}

/** episodes.h JE_OptionType */
export interface OptionType {
  name: string;                        // char[31]
  pwr: number;                         // JE_byte
  itemgraphic: number;                 // JE_word
  cost: number;                        // JE_word
  tr: number; option: number;          // JE_byte
  opspd: number;                       // JE_shortint
  ani: number;                         // JE_byte
  gr: number[];                        // JE_word[20]
  wport: number;                       // JE_byte
  wpnum: number;                       // JE_word
  ammo: number;                        // JE_byte
  stop: boolean;                       // JE_boolean
  icongr: number;                      // JE_byte
}

/** episodes.h JE_ShieldType element */
export interface ShieldType {
  name: string;                        // char[31]
  tpwr: number;                        // JE_byte
  mpwr: number;                        // JE_byte
  itemgraphic: number;                 // JE_word
  cost: number;                        // JE_word
}

/** episodes.h JE_EnemyDatType element */
export interface EnemyDatType {
  ani: number;                         // JE_byte
  tur: number[];                       // JE_byte[3]
  freq: number[];                      // JE_byte[3]
  xmove: number; ymove: number;        // JE_shortint
  xaccel: number; yaccel: number;      // JE_shortint
  xcaccel: number; ycaccel: number;    // JE_shortint
  startx: number; starty: number;      // JE_integer
  startxc: number; startyc: number;    // JE_shortint
  armor: number;                       // JE_byte
  esize: number;                       // JE_byte
  egraphic: number[];                  // JE_word[20]
  explosiontype: number;               // JE_byte
  animate: number;                     // JE_byte
  shapebank: number;                   // JE_byte
  xrev: number; yrev: number;          // JE_shortint
  dgr: number;                         // JE_word
  dlevel: number;                      // JE_shortint
  dani: number;                        // JE_shortint
  elaunchfreq: number;                 // JE_byte
  elaunchtype: number;                 // JE_word
  value: number;                       // JE_integer
  eenemydie: number;                   // JE_word
}

export const newWeaponType = (): WeaponType => ({
  drain: 0, shotrepeat: 0, multi: 0, weapani: 0, max: 0, tx: 0, ty: 0, aim: 0,
  attack: new Array<number>(8).fill(0), del: new Array<number>(8).fill(0),
  sx: new Array<number>(8).fill(0), sy: new Array<number>(8).fill(0),
  bx: new Array<number>(8).fill(0), by: new Array<number>(8).fill(0),
  sg: new Array<number>(8).fill(0),
  acceleration: 0, accelerationx: 0, circlesize: 0, sound: 0, trail: 0, shipblastfilter: 0,
});
export const newWeaponPort = (): WeaponPort => ({
  name: '', opnum: 0, op: [new Array<number>(11).fill(0), new Array<number>(11).fill(0)],
  cost: 0, itemgraphic: 0, poweruse: 0,
});
export const newSpecialType = (): SpecialType => ({ name: '', itemgraphic: 0, pwr: 0, stype: 0, wpn: 0 });
export const newPowerSys = (): PowerSys => ({ name: '', itemgraphic: 0, power: 0, speed: 0, cost: 0 });
export const newShipType = (): ShipType => ({
  name: '', shipgraphic: 0, itemgraphic: 0, ani: 0, spd: 0, dmg: 0, cost: 0, bigshipgraphic: 0,
});
export const newOptionType = (): OptionType => ({
  name: '', pwr: 0, itemgraphic: 0, cost: 0, tr: 0, option: 0, opspd: 0, ani: 0,
  gr: new Array<number>(20).fill(0), wport: 0, wpnum: 0, ammo: 0, stop: false, icongr: 0,
});
export const newShieldType = (): ShieldType => ({ name: '', tpwr: 0, mpwr: 0, itemgraphic: 0, cost: 0 });
export const newEnemyDatType = (): EnemyDatType => ({
  ani: 0, tur: [0, 0, 0], freq: [0, 0, 0], xmove: 0, ymove: 0, xaccel: 0, yaccel: 0, xcaccel: 0, ycaccel: 0,
  startx: 0, starty: 0, startxc: 0, startyc: 0, armor: 0, esize: 0, egraphic: new Array<number>(20).fill(0),
  explosiontype: 0, animate: 0, shapebank: 0, xrev: 0, yrev: 0, dgr: 0, dlevel: 0, dani: 0,
  elaunchfreq: 0, elaunchtype: 0, value: 0, eenemydie: 0,
});

/** player.h PlayerItems */
export class PlayerItems {
  ship = 0;                            // Uint8
  generator = 0;                       // Uint8
  shield = 0;                          // Uint8
  weapon: [{ id: number; power: number }, { id: number; power: number }] =
    [{ id: 0, power: 0 }, { id: 0, power: 0 }]; // Uint8 id, power
  sidekick: [number, number] = [0, 0]; // Uint8[2]
  special = 0;                         // Uint8
  sidekickSeries = 0;                  // Uint8 (sidekick_series)
  sidekickLevel = 0;                   // Uint8 (sidekick_level)
  superArcadeMode = 0;                 // Uint8 (super_arcade_mode)

  /** C struct assignment `dst = src` (deep copy). */
  copyFrom(o: PlayerItems): void {
    this.ship = o.ship; this.generator = o.generator; this.shield = o.shield;
    for (let i = 0; i < 2; i++) {
      this.weapon[i]!.id = o.weapon[i]!.id;
      this.weapon[i]!.power = o.weapon[i]!.power;
      this.sidekick[i] = o.sidekick[i]!;
    }
    this.special = o.special; this.sidekickSeries = o.sidekickSeries;
    this.sidekickLevel = o.sidekickLevel; this.superArcadeMode = o.superArcadeMode;
  }
}

/** player.h Player.sidekick[] anonymous struct */
export class PlayerSidekick {
  ammoMax = 0;                         // int
  ammoRefillTicksMax = 0;              // uint
  style = 0;                           // uint
  x = 0; y = 0;                        // int
  ammo = 0;                            // int
  ammoRefillTicks = 0;                 // uint
  animationEnabled = false;            // bool
  animationFrame = 0;                  // uint
  charge = 0;                          // uint
  chargeTicks = 0;                     // uint
}

/** player.h Player. `lives` is C's `Uint8 *lives`: an alias of items.weapon[livesIndex].power. */
export class Player {
  cash = 0;                            // ulong (64-bit; JS number, safe below 2^53)
  items = new PlayerItems();
  lastItems = new PlayerItems();       // last_items
  isDragonwing = false;                // is_dragonwing
  /** index into items.weapon that `lives` aliases; C: `lives = &items.weapon[p].power` (mainint.c:1082) */
  livesIndex: number;
  shieldMax = 0;                       // uint shield_max
  initialArmor = 0;                    // uint initial_armor
  shotHitAreaX = 0; shotHitAreaY = 0;  // uint
  isAlive = false;                     // bool
  invulnerableTicks = 0;               // uint
  explodingTicks = 0;                  // uint
  shield = 0;                          // uint
  armor = 0;                           // uint
  weaponMode = 0;                      // uint
  superbombs = 0;                      // uint
  purpleBallsNeeded = 0;               // uint
  x = 0; y = 0;                        // int
  oldX = new Int32Array(20); oldY = new Int32Array(20); // int[20]
  xVelocity = 0; yVelocity = 0;        // int
  xFrictionTicks = 0; yFrictionTicks = 0; // uint
  deltaXShotMove = 0; deltaYShotMove = 0; // int
  lastXShotMove = 0; lastYShotMove = 0;   // int
  lastXExplosionFollow = 0; lastYExplosionFollow = 0; // int
  sidekick: [PlayerSidekick, PlayerSidekick] = [new PlayerSidekick(), new PlayerSidekick()];

  constructor(playerNum: number) {
    // C: NULL until JE_initPlayerData. Defaulting to the same pointer initPlayerData sets is harmless.
    this.livesIndex = playerNum;
  }
  /** `*player[p].lives` */
  get lives(): number { return this.items.weapon[this.livesIndex]!.power; }
  set lives(v: number) { this.items.weapon[this.livesIndex]!.power = v & 0xff; }
}

// ---------------------------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------------------------

/** config.c T2KHighScoreType */
export interface T2KHighScore { score: number; playerName: string; difficulty: number }
/** config.h JE_SaveFileType (the on-disk layout is in src/game/save.ts). */
export interface SaveFile {
  encode: number;                      // JE_word
  level: number;                       // JE_word
  items: Uint8Array;                   // JE_PItemsType, byte[12]
  score: number; score2: number;       // JE_longint (s32)
  levelName: string;                   // char[11]
  /** char[15]: kept as raw bytes because the file stores 14 raw bytes (stale bytes after the NUL survive a save). */
  name: Uint8Array;
  cubes: number;                       // JE_byte
  power: Uint8Array;                   // JE_byte[2]
  episode: number;                     // JE_byte
  lastItems: Uint8Array;               // JE_PItemsType
  difficulty: number; secretHint: number; input1: number; input2: number; // JE_byte
  gameHasRepeated: boolean;
  initialDifficulty: number;           // JE_byte
  highScore1: number; highScore2: number; // JE_longint
  highScoreName: string;               // char[30]
  highScoreDiff: number;               // JE_byte
}

export function newSaveFile(): SaveFile {
  return {
    encode: 0, level: 0, items: new Uint8Array(12), score: 0, score2: 0, levelName: '', name: new Uint8Array(15),
    cubes: 0, power: new Uint8Array(2), episode: 0, lastItems: new Uint8Array(12), difficulty: 0, secretHint: 0,
    input1: 0, input2: 0, gameHasRepeated: false, initialDifficulty: 0, highScore1: 0, highScore2: 0,
    highScoreName: '', highScoreDiff: 0,
  };
}

/** config.c / nortsong.c / opentyr.c-level settings and per-game state. */
export interface ConfigGroup {
  smoothies: boolean[];                // JE_boolean[9]
  starShowVGASpecialCode: number;      // JE_byte
  lastCubeMax: number; cubeMax: number; // JE_word
  cubeList: Uint16Array;               // JE_word[4]
  gameHasRepeated: boolean;
  difficultyLevel: number; oldDifficultyLevel: number; initialDifficulty: number; // JE_shortint
  timeBattleSelection: number;         // JE_byte
  power: number; lastPower: number; powerAdd: number; // uint
  shieldWait: number; shieldT: number; // JE_byte
  shotRepeat: Uint8Array;              // JE_byte[11]
  shotMultiPos: Uint8Array;            // JE_byte[11]
  portConfigChange: boolean; portConfigDone: boolean;
  lastLevelName: string; levelName: string; // char[11]
  mainLevel: number; nextLevel: number; saveLevel: number; // JE_byte
  dosKeySettings: Uint8Array;          // JE_byte[8]
  keySettings: Int32Array;             // SDL_Scancode[8]
  mouseSettings: Uint8Array;           // JE_byte[3]
  levelFilter: number; levelFilterNew: number; levelBrightness: number; levelBrightnessChg: number; // JE_shortint
  filtrationAvail: boolean; filterActive: boolean; filterFade: boolean; filterFadeStart: boolean;
  gameJustLoaded: boolean;
  galagaMode: boolean;
  extraGame: boolean;
  twoPlayerMode: boolean; twoPlayerLinked: boolean; onePlayerAction: boolean;
  timedBattleMode: boolean; superTyrian: boolean; trentWin: boolean;
  superArcadeMode: number;             // JE_byte
  superArcadePowerUp: number;          // JE_byte
  linkGunDirec: number;                // JE_real (float32)
  inputDevice: Uint8Array;             // JE_byte[2] = {1, 2}
  secretHint: number;                  // JE_byte
  background3over: number; background2over: number; // JE_byte
  gammaCorrection: number;             // JE_byte
  superPause: boolean; explosionTransparent: boolean; youAreCheating: boolean; displayScore: boolean;
  background2: boolean; smoothScroll: boolean; wild: boolean; superWild: boolean; starActive: boolean;
  topEnemyOver: boolean; skyEnemyOverAll: boolean; background2notTransparent: boolean;
  soundEffects: number;                // JE_byte
  versionNum: number;                  // JE_byte
  fastPlay: number;                    // JE_byte
  pentiumMode: boolean;
  gameSpeed: number;                   // JE_byte
  processorType: number;               // JE_byte
  saveFiles: SaveFile[];               // JE_SaveFilesType[22]
  /** config.c saveTemp[2502]: decrypted image; bytes 2398.. are the shop's item-availability table (JE_EditorItemAvailType). */
  saveTemp: Uint8Array;
  inputDevice_: number; jConfigure: number; midiPort: number; // JE_byte (tyrian.cfg only)
  joyButtonAssign: Uint8Array;         // JE_byte[4]
  configurationLoaded: boolean;
  t2kHighScores: T2KHighScore[][];     // [20][3]
  editorLevel: number;                 // JE_word
  /** nortsong.c */
  tyrMusicVolume: number; fxVolume: number; // JE_word
  fxPlayVol: number;                   // const JE_word = 4
  tempVolume: number;                  // JE_word
  frameCountMax: number;               // JE_word
}

/** varz.c: level flow, effects, special-weapon, option and misc globals. */
export interface VarzGroup {
  lvlFileNum: number;                  // JE_byte
  tempBackMove: number; explodeMove: number; // JE_word
  levelEnd: number;                    // JE_byte
  levelEndFxWait: number;              // JE_word
  levelEndWarp: number;                // JE_shortint
  endLevel: boolean; reallyEndLevel: boolean; waitToEndLevel: boolean; playerEndLevel: boolean;
  normalBonusLevelCurrent: boolean; bonusLevelCurrent: boolean; smallEnemyAdjust: boolean;
  readyToEndLevel: boolean; quitRequested: boolean;
  galagaShotFreq: number;              // JE_word
  galagaLife: number;                  // JE_longint
  debug: boolean;
  debugTime: number; lastDebugTime: number; // Uint32
  debugHistCount: number;              // JE_longint
  debugHist: number;                   // JE_real
  firstGameOver: boolean; gameLoaded: boolean; enemyStillExploding: boolean;
  flash: number;                       // JE_byte
  flashChange: number;                 // JE_shortint
  displayTime: number;                 // JE_byte
  soundQueue: Uint8Array;              // JE_byte[8]
  enemyContinualDamage: boolean; enemiesActive: boolean; forceEvents: boolean; stopBackgrounds: boolean;
  stopBackgroundNum: number;           // JE_byte
  damageRate: number;                  // JE_byte
  background3x1: boolean; background3x1b: boolean;
  levelTimer: boolean;
  levelTimerCountdown: number; levelTimerJumpTo: number; // JE_word
  randomExplosions: boolean;
  editShip1: boolean; editShip2: boolean;
  globalFlags: boolean[];              // JE_boolean[10]
  levelSong: number;                   // JE_byte
  mapOrigin: number; mapPNum: number;  // JE_word
  mapPlanet: Uint8Array; mapSection: Uint8Array; // JE_byte[5]
  skipStarShowVGA: boolean;
  fireButtonHeld: boolean;
  allPlayersGone: boolean;
  shadowYDist: number;                 // const uint = 10
  optionSatelliteRotate: number;       // JE_real
  optionAttachmentMove: number;        // JE_integer
  optionAttachmentLinked: boolean; optionAttachmentReturn: boolean;
  chargeWait: number; chargeLevel: number; chargeMax: number; chargeGr: number; chargeGrWait: number; // JE_byte
  neat: number;                        // JE_word
  doNotSaveBackup: boolean;
  specialWeaponFilter: number; specialWeaponFreq: number; // JE_shortint
  specialWeaponWpn: number;            // JE_word
  linkToPlayer: boolean;
  shipGr: number; shipGr2: number;     // JE_word
  shipGrPtr: Sprite2Sheet | null; shipGr2ptr: Sprite2Sheet | null;
  SFCurrentCode: Uint8Array[];         // JE_byte[2][21]
  SFExecuted: Uint8Array;              // JE_byte[2]
  /** tyrian2.c file scope */
  quit: boolean; loadLevelOk: boolean; // JE_boolean
  tempStr: string;                     // char[31]
  /** mainint.c file scope */
  button: boolean[];                   // bool[4]
  constantLastX: number;               // JE_shortint
  // JE_word. These are the mouse.c globals (shared with game_menu.c: the shop writes them via JE_mousePosition,
  // and the stale shop values reach in-level shots fired during endLevel). sp4's shop must write these same fields.
  mouseX: number; mouseY: number; mouseXB: number; mouseYB: number;
  textErase: number;                   // JE_word
  upgradeCost: number; downgradeCost: number; // JE_word
  performSave: boolean; jumpSection: boolean; useLastBank: boolean;
  pauseGamePressed: boolean; ingamemenuPressed: boolean; // pause_pressed, ingamemenu_pressed
  // globals JE_main initialises that the earlier world pass did not list (fonthand.h, musmast.h, network.h)
  warningCol: number;                  // JE_byte
  warningColChange: number;            // JE_shortint
  warningSoundDelay: number;           // JE_byte
  armorShipDelay: number;              // JE_word
  musicFade: boolean;
  yourInGameMenuRequest: boolean;
}

/** Scratch globals (varz.c:296-300). Writers must wrap to the C type. */
export interface ScratchGroup {
  temp: number; temp2: number; temp3: number; // JE_byte
  tempW: number;                       // JE_word
  b: number;                           // JE_integer (s16)
  x: number; y: number;                // JE_word
  tempDat: number; tempDat2: number; tempDat3: number; // JE_integer
}

/** varz.h megaData1/2/3: map pointer layers (flat slots, -1 = NULL) + the shape tile bytes (spec §2.5). */
export interface MegaData {
  /** mainmap as pointer slots in C order; value = shape index (tile at `shapes` + base), -1 = NULL */
  mainmap: Int32Array;
  /** struct `shapes[]` bytes in C order (tempdat excluded); layout differs per megaData (see MAP*_ constants) */
  shapes: Uint8Array;
  tempdat: number;                     // JE_byte tempdat1/2/3
  /** Debug: count of mainmap slot reads outside the array (the C reads neighbouring memory there; see backgrounds.ts) */
  oobReads: number;
}

export interface MapGroup {
  megaData1: MegaData;                 // mainmap[300][14], shapes[72][672], tempdat1
  megaData2: MegaData;                 // mainmap[600][14], shapes[71][3+1+672], tempdat2
  megaData3: MegaData;                 // mainmap[600][15], shapes[70][3+1+672], tempdat3
  /** BKwrap pointers into mainmap, as slot indexes (C: JE_byte **) */
  BKwrap1to: number; BKwrap2to: number; BKwrap3to: number;
  BKwrap1: number; BKwrap2: number; BKwrap3: number;
}

/** backgrnd.c */
export interface BackgroundsGroup {
  backPos: number; backPos2: number; backPos3: number;       // JE_word
  backMove: number; backMove2: number; backMove3: number;    // JE_word
  mapX: number; mapY: number; mapX2: number; mapX3: number; mapY2: number; mapY3: number; // JE_word
  /** JE_byte ** as slot indexes into the matching megaData mainmap (may be -1 / out of range, like the C) */
  mapYPos: number; mapY2Pos: number; mapY3Pos: number;
  mapXPos: number; oldMapXOfs: number; mapXOfs: number; mapX2Ofs: number; mapX2Pos: number; mapX3Pos: number;
  oldMapX3Ofs: number; mapX3Ofs: number; tempMapXOfs: number; // JE_word
  mapXbpPos: number; mapX2bpPos: number; mapX3bpPos: number;  // intptr_t
  map1YDelay: number; map1YDelayMax: number; map2YDelay: number; map2YDelayMax: number; // JE_byte
  anySmoothies: boolean;
  smoothieData: Uint8Array;            // JE_byte[9]
  starfieldSpeed: number;              // int
  /** static StarfieldStar starfield_stars[100] */
  starfieldStars: { color: Uint8Array; position: Uint16Array; speed: Int32Array };
}

export interface EnemiesGroup {
  enemy: Enemy[];                      // JE_MultiEnemyType[100]
  enemyAvail: Uint8Array;              // JE_byte[100] (0 used, 1 free, 2 secret pick-up)
  enemyOffset: number;                 // JE_word
  enemyOnScreen: number;               // JE_word
  superEnemy254Jump: number;           // JE_word
  totalEnemy: number; enemyKilled: number; // JE_word
  /** tyrian2.h boss_bar_t[2] */
  bossBar: { linkNum: number; armor: number; color: number }[];
}

export interface EnemyShotsGroup {
  enemyShotAvail: boolean[];           // JE_boolean[60]
  enemyShot: EnemyShot[];              // EnemyShotType[60]
}

export interface PlayerShotsGroup {
  playerShotData: PlayerShot[];        // PlayerShotDataType[MAX_PWEAPON + 1]
  shotAvail: Uint8Array;               // JE_byte[MAX_PWEAPON]
  zinglonDuration: number; astralDuration: number; // JE_byte
  flareDuration: number;               // JE_word
  flareStart: boolean;
  flareColChg: number;                 // JE_shortint
  specialWait: number; nextSpecialWait: number; // JE_byte
  spraySpecial: boolean;
  doIced: number;                      // JE_byte
  infiniteShot: boolean;
  /** JE_main's per-shot locals (persist across slots; uninitialised in C) */
  shotOut: ShotOut;
}

export interface ExplosionsGroup {
  explosions: Explosion[];             // Explosion[200]
  explosionFollowAmountX: number; explosionFollowAmountY: number; // JE_integer
  repExplosions: RepExplosion[];       // rep_explosions[20]
  superpixels: SuperPixel[];           // superpixels[101]
  lastSuperpixel: number;              // unsigned int
}

export interface EventsGroup {
  eventRec: EventRec[];                // EventRec[EVENT_MAXIMUM]
  maxEvent: number; eventLoc: number;  // JE_word
  curLoc: number;                      // JE_word
  returnLoc: number;                   // JE_word
  returnActive: boolean;
  newPL: Uint8Array;                   // JE_byte[10]
  levelEnemyMax: number; levelEnemyFrequency: number; // JE_word
  levelEnemy: Uint16Array;             // JE_word[40]
}

export interface DemoGroup {
  recordDemo: boolean; stoppedDemo: boolean;
  demoNum: number;                     // Uint8, persists across demos
  /** demo_file: set by loadNextDemo (type is owned by src/data/demo-file.ts) */
  demoFile: object | null;
  demoKeys: number;                    // Uint8
  demoKeysWait: number;                // Uint16
}

export interface ItemsGroup {
  weaponPort: WeaponPort[];            // [PORT_NUM + 1]
  weapons: WeaponType[];               // [WEAP_NUM + 1]
  powerSys: PowerSys[];                // [POWER_NUM + 1]
  ships: ShipType[];                   // [SHIP_NUM + 1]
  options: OptionType[];               // [OPTION_NUM + 1]
  shields: ShieldType[];               // [SHIELD_NUM + 1]
  special: SpecialType[];              // [SPECIAL_NUM + 1]
  enemyDat: EnemyDatType[];            // [ENEMY_NUM + 1]
  initialEpisodeNum: number; episodeNum: number; // JE_byte
  episodeAvail: boolean[];             // JE_boolean[EPISODE_MAX]
  episodeFile: string; cubeFile: string; // char[13]
  episode1DataLoc: number;             // JE_longint
  lvlNum: number;                      // JE_word (lvllib.c)
  lvlPos: Int32Array;                  // JE_LvlPosType (lvllib.c), lvlNum+1 used
  bonusLevel: boolean;
  jumpBackToEpisode1: boolean;
  itemAvail: Uint8Array[];             // JE_byte[9][10] (tyrian2.c)
  itemAvailMax: Uint8Array;            // JE_byte[9]
}

/** sprite.c sprite sheets that gameplay owns (the others are in ctx.assets.shapes / ctx.shopSpriteSheet) */
export interface SpritesGroup {
  explosionSpriteSheet: Sprite2Sheet | null;
  enemySpriteSheets: (Sprite2Sheet | null)[]; // [4]
  enemySpriteSheetIds: Uint8Array;     // Uint8[4]
}

/** The const tables (varz.c, sndmast.c, lvlmast.c), reachable as `g.tables.X`. */
export interface TablesGroup {
  SANextShip: readonly number[];
  SASpecialWeapon: readonly number[];
  SASpecialWeaponB: readonly number[];
  SAShip: readonly number[];
  SAWeapon: readonly (readonly number[])[];
  specialArcadeWeapon: readonly number[];
  optionSelect: readonly (readonly (readonly number[])[])[];
  PGR: readonly number[];
  PAni: readonly number[];
  linkGunWeapons: readonly number[];
  chargeGunWeapons: readonly number[];
  randomEnemyLaunchSounds: readonly number[];
  keyboardCombos: readonly (readonly number[])[];
  shipCombosB: readonly number[];
  superTyrianSpecials: readonly number[];
  shipCombos: readonly (readonly number[])[];
  windowTextSamples: readonly number[];
  shapeFile: string;
}

export interface GameWorld {
  config: ConfigGroup;
  varz: VarzGroup;
  scratch: ScratchGroup;
  map: MapGroup;
  backgrounds: BackgroundsGroup;
  players: [Player, Player];           // player[2]
  enemies: EnemiesGroup;
  enemyShots: EnemyShotsGroup;
  playerShots: PlayerShotsGroup;
  explosions: ExplosionsGroup;
  events: EventsGroup;
  demo: DemoGroup;
  items: ItemsGroup;
  sprites: SpritesGroup;
  tables: TablesGroup;
}

const mapSlots = (n: number): Int32Array => new Int32Array(n).fill(-1);

function makeMegaData(rows: number, cols: number, shapeCount: number, shapeStride: number): MegaData {
  return { mainmap: mapSlots(rows * cols), shapes: new Uint8Array(shapeCount * shapeStride), tempdat: 0, oobReads: 0 };
}

/** Reproduces the C static-initialiser state of every gameplay global (all zero except where noted). */
export function createGameWorld(): GameWorld {
  const arr = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
  return {
    config: {
      smoothies: new Array<boolean>(9).fill(false),
      starShowVGASpecialCode: 0,
      lastCubeMax: 0, cubeMax: 0, cubeList: new Uint16Array(4),
      gameHasRepeated: false,
      difficultyLevel: 0, oldDifficultyLevel: 0, initialDifficulty: 0,
      timeBattleSelection: 0,
      power: 0, lastPower: 0, powerAdd: 0,
      shieldWait: 0, shieldT: 0,
      shotRepeat: new Uint8Array(11), shotMultiPos: new Uint8Array(11),
      portConfigChange: false, portConfigDone: false,
      lastLevelName: '', levelName: '',
      mainLevel: 0, nextLevel: 0, saveLevel: 0,
      dosKeySettings: new Uint8Array(8), keySettings: new Int32Array(8), mouseSettings: new Uint8Array(3),
      levelFilter: 0, levelFilterNew: 0, levelBrightness: 0, levelBrightnessChg: 0,
      filtrationAvail: false, filterActive: false, filterFade: false, filterFadeStart: false,
      gameJustLoaded: false,
      galagaMode: false,
      extraGame: false,
      twoPlayerMode: false, twoPlayerLinked: false, onePlayerAction: false,
      timedBattleMode: false, superTyrian: false, trentWin: false,
      superArcadeMode: 0, superArcadePowerUp: 0,
      linkGunDirec: 0,
      inputDevice: Uint8Array.of(1, 2), // config.c: { 1, 2 } (0:any 1:keyboard 2:mouse 3+:joystick)
      secretHint: 0,
      background3over: 0, background2over: 0,
      gammaCorrection: 0,
      superPause: false, explosionTransparent: false, youAreCheating: false, displayScore: false,
      background2: false, smoothScroll: false, wild: false, superWild: false, starActive: false,
      topEnemyOver: false, skyEnemyOverAll: false, background2notTransparent: false,
      soundEffects: 0, versionNum: 0, fastPlay: 0, pentiumMode: false, gameSpeed: 0, processorType: 0,
      saveFiles: arr(SAVE_FILES_NUM, () => newSaveFile()),
      saveTemp: new Uint8Array(SIZEOF_SAVEGAMETEMP),
      inputDevice_: 0, jConfigure: 0, midiPort: 1, joyButtonAssign: Uint8Array.of(1, 4, 5, 5), configurationLoaded: false, // config.c:773-774
      t2kHighScores: arr(20, () => arr(3, () => ({ score: 0, playerName: '', difficulty: 0 }))),
      editorLevel: 0,
      tyrMusicVolume: 0, fxVolume: 0,
      fxPlayVol: 4, // nortsong.c: const JE_word fxPlayVol = 4
      tempVolume: 0,
      frameCountMax: 0,
    },
    varz: {
      lvlFileNum: 0,
      tempBackMove: 0, explodeMove: 0,
      levelEnd: 0, levelEndFxWait: 0, levelEndWarp: 0,
      endLevel: false, reallyEndLevel: false, waitToEndLevel: false, playerEndLevel: false,
      normalBonusLevelCurrent: false, bonusLevelCurrent: false, smallEnemyAdjust: false,
      readyToEndLevel: false, quitRequested: false,
      galagaShotFreq: 0, galagaLife: 0,
      debug: false, debugTime: 0, lastDebugTime: 0, debugHistCount: 0, debugHist: 0,
      firstGameOver: false, gameLoaded: false, enemyStillExploding: false,
      flash: 0, flashChange: 0, displayTime: 0,
      soundQueue: new Uint8Array(8),
      enemyContinualDamage: false, enemiesActive: false, forceEvents: false, stopBackgrounds: false,
      stopBackgroundNum: 0, damageRate: 0,
      background3x1: false, background3x1b: false,
      levelTimer: false, levelTimerCountdown: 0, levelTimerJumpTo: 0,
      randomExplosions: false,
      editShip1: false, editShip2: false,
      globalFlags: new Array<boolean>(10).fill(false),
      levelSong: 0,
      mapOrigin: 0, mapPNum: 0, mapPlanet: new Uint8Array(5), mapSection: new Uint8Array(5),
      skipStarShowVGA: false,
      fireButtonHeld: false,
      allPlayersGone: false,
      shadowYDist: 10, // varz.c: const uint shadowYDist = 10
      optionSatelliteRotate: 0,
      optionAttachmentMove: 0, optionAttachmentLinked: false, optionAttachmentReturn: false,
      chargeWait: 0, chargeLevel: 0, chargeMax: 0, chargeGr: 0, chargeGrWait: 0,
      neat: 0,
      doNotSaveBackup: false,
      specialWeaponFilter: 0, specialWeaponFreq: 0, specialWeaponWpn: 0,
      linkToPlayer: false,
      shipGr: 0, shipGr2: 0, shipGrPtr: null, shipGr2ptr: null,
      SFCurrentCode: [new Uint8Array(21), new Uint8Array(21)],
      SFExecuted: new Uint8Array(2),
      quit: false, loadLevelOk: false, tempStr: '',
      button: [false, false, false, false],
      constantLastX: 0, mouseX: 0, mouseY: 0, mouseXB: 0, mouseYB: 0, textErase: 0, upgradeCost: 0, downgradeCost: 0,
      performSave: false, jumpSection: false, useLastBank: false,
      pauseGamePressed: false, ingamemenuPressed: false,
      warningCol: 0, warningColChange: 0, warningSoundDelay: 0, armorShipDelay: 0, musicFade: false,
      yourInGameMenuRequest: false,
    },
    scratch: { temp: 0, temp2: 0, temp3: 0, tempW: 0, b: 0, x: 0, y: 0, tempDat: 0, tempDat2: 0, tempDat3: 0 },
    map: {
      // shapes bytes: megaData1 72 x 672; megaData2/3 N x (3 'nothing' + 1 fill + 672)
      megaData1: makeMegaData(MAP1_ROWS, MAP1_COLS, 72, SHAPE_BYTES),
      megaData2: makeMegaData(MAP2_ROWS, MAP2_COLS, 71, 4 + SHAPE_BYTES),
      megaData3: makeMegaData(MAP3_ROWS, MAP3_COLS, 70, 4 + SHAPE_BYTES),
      BKwrap1to: 0, BKwrap2to: 0, BKwrap3to: 0, BKwrap1: 0, BKwrap2: 0, BKwrap3: 0,
    },
    backgrounds: {
      backPos: 0, backPos2: 0, backPos3: 0, backMove: 0, backMove2: 0, backMove3: 0,
      mapX: 0, mapY: 0, mapX2: 0, mapX3: 0, mapY2: 0, mapY3: 0,
      mapYPos: 0, mapY2Pos: 0, mapY3Pos: 0,
      mapXPos: 0, oldMapXOfs: 0, mapXOfs: 0, mapX2Ofs: 0, mapX2Pos: 0, mapX3Pos: 0,
      oldMapX3Ofs: 0, mapX3Ofs: 0, tempMapXOfs: 0,
      mapXbpPos: 0, mapX2bpPos: 0, mapX3bpPos: 0,
      map1YDelay: 0, map1YDelayMax: 0, map2YDelay: 0, map2YDelayMax: 0,
      anySmoothies: false, smoothieData: new Uint8Array(9), starfieldSpeed: 0,
      starfieldStars: { color: new Uint8Array(MAX_STARS), position: new Uint16Array(MAX_STARS), speed: new Int32Array(MAX_STARS) },
    },
    players: [new Player(0), new Player(1)],
    enemies: {
      enemy: arr(ENEMY_COUNT, () => new Enemy()),
      enemyAvail: new Uint8Array(ENEMY_COUNT),
      enemyOffset: 0, enemyOnScreen: 0, superEnemy254Jump: 0, totalEnemy: 0, enemyKilled: 0,
      bossBar: arr(2, () => ({ linkNum: 0, armor: 0, color: 0 })),
    },
    enemyShots: {
      enemyShotAvail: new Array<boolean>(ENEMY_SHOT_MAX).fill(false),
      enemyShot: arr(ENEMY_SHOT_MAX, () => new EnemyShot()),
    },
    playerShots: {
      playerShotData: arr(MAX_PWEAPON + 1, () => new PlayerShot()),
      shotAvail: new Uint8Array(MAX_PWEAPON),
      zinglonDuration: 0, astralDuration: 0, flareDuration: 0, flareStart: false, flareColChg: 0,
      specialWait: 0, nextSpecialWait: 0, spraySpecial: false, doIced: 0, infiniteShot: false,
      shotOut: {
        isSpecial: false, shotX: 0, shotY: 0, shotDamage: 0, blastFilter: 0, chain: 0, playerNum: 1,
        specialRadiusW: 0, specialRadiusH: 0,
      },
    },
    explosions: {
      explosions: arr(MAX_EXPLOSIONS, () => new Explosion()),
      explosionFollowAmountX: 0, explosionFollowAmountY: 0,
      repExplosions: arr(MAX_REPEATING_EXPLOSIONS, () => new RepExplosion()),
      superpixels: arr(MAX_SUPERPIXELS, () => new SuperPixel()),
      lastSuperpixel: 0,
    },
    events: {
      eventRec: arr(EVENT_MAXIMUM, () => new EventRec()),
      maxEvent: 0, eventLoc: 0, curLoc: 0, returnLoc: 0, returnActive: false,
      newPL: new Uint8Array(10),
      levelEnemyMax: 0, levelEnemyFrequency: 0, levelEnemy: new Uint16Array(40),
    },
    demo: { recordDemo: false, stoppedDemo: false, demoNum: 0, demoFile: null, demoKeys: 0, demoKeysWait: 0 },
    items: {
      weaponPort: arr(PORT_NUM + 1, newWeaponPort),
      weapons: arr(WEAP_NUM + 1, newWeaponType),
      powerSys: arr(POWER_NUM + 1, newPowerSys),
      ships: arr(SHIP_NUM + 1, newShipType),
      options: arr(OPTION_NUM + 1, newOptionType),
      shields: arr(SHIELD_NUM + 1, newShieldType),
      special: arr(SPECIAL_NUM + 1, newSpecialType),
      enemyDat: arr(ENEMY_NUM + 1, newEnemyDatType),
      initialEpisodeNum: 0, episodeNum: 0,
      episodeAvail: new Array<boolean>(EPISODE_MAX).fill(false),
      episodeFile: '', cubeFile: '', episode1DataLoc: 0,
      lvlNum: 0, lvlPos: new Int32Array(43),
      bonusLevel: false, jumpBackToEpisode1: false,
      itemAvail: arr(9, () => new Uint8Array(10)),
      itemAvailMax: new Uint8Array(9),
    },
    sprites: {
      explosionSpriteSheet: null,
      enemySpriteSheets: [null, null, null, null],
      enemySpriteSheetIds: new Uint8Array(4),
    },
    tables: {
      SANextShip, SASpecialWeapon, SASpecialWeaponB, SAShip, SAWeapon, specialArcadeWeapon, optionSelect,
      PGR, PAni, linkGunWeapons, chargeGunWeapons, randomEnemyLaunchSounds, keyboardCombos, shipCombosB,
      superTyrianSpecials, shipCombos, windowTextSamples, shapeFile,
    },
  };
}
