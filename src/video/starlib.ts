// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/starlib.c (the jukebox star field)
import { cosf, f32, sinf } from '../core/cmath';
import { idiv, s16, u16, u8 } from '../core/int';
import type { Ctx } from '../ctx';
import { KMOD_LALT, KMOD_LCTRL, KMOD_LSHIFT, KMOD_RALT, KMOD_RCTRL, KMOD_RSHIFT } from '../platform/scancodes';
import { waitInput, waitNoInput } from '../platform/wait';

const STARLIB_MAX_STARS = 1000;
const MAX_TYPES = 14;
const KMOD_SHIFT = KMOD_LSHIFT | KMOD_RSHIFT, KMOD_CTRL = KMOD_LCTRL | KMOD_RCTRL, KMOD_ALT = KMOD_LALT | KMOD_RALT, KMOD_GUI = 0x0c00;

const F_0_01 = f32(0.01), F_0_005 = f32(0.005);

/** The starlib.c file-scope statics. One instance lives on `ctx.starlib` (the C initialises once per process). */
export class Starlib {
  // struct JE_StarType: JE_integer (Sint16) fields
  readonly spX = new Int16Array(STARLIB_MAX_STARS);
  readonly spY = new Int16Array(STARLIB_MAX_STARS);
  readonly spZ = new Int16Array(STARLIB_MAX_STARS);
  readonly lastX = new Int16Array(STARLIB_MAX_STARS);
  readonly lastY = new Int16Array(STARLIB_MAX_STARS);
  tempX = 0; tempY = 0; // int
  setup = 0; stepCounter = 0; // JE_byte, JE_word
  nsp2 = 1; nspVar2Inc = 1; // JE_word, JE_shortint
  nsp = 0; nspVarInc = 0; nspVarVarInc = 0; // JE_real = float
  changeTime = 0; doChange = false;
  starlibSpeed = 0; speedChange = 0; // JE_integer, JE_shortint
  pColor = 0; // JE_byte
}

// port of JE_resetValues
function resetValues(s: Starlib): void {
  s.nsp2 = 1;
  s.nspVar2Inc = 1;
  s.nspVarInc = f32(0.1);
  s.nspVarVarInc = f32(0.0001);
  s.nsp = 0;
  s.pColor = 32;
  s.starlibSpeed = 2;
  s.speedChange = 0;
}

// port of JE_changeSetup
function changeSetup(ctx: Ctx, s: Starlib, setupType: number): void {
  s.stepCounter = 0;
  s.changeTime = ctx.rng.rand() % 1000;
  if (setupType > 0) s.setup = setupType;
  else s.setup = ctx.rng.rand() % (MAX_TYPES + 1);
  if (s.setup === 1) s.nspVarInc = f32(0.1);
  if (s.nspVarInc > f32(2.2)) s.nspVarInc = f32(0.1);
}

// port of JE_starlib_init: creates the state on first use only (the C's `static initialized`)
export function starlibInit(ctx: Ctx): Starlib {
  if (ctx.starlib) return ctx.starlib;
  const s = ctx.starlib = new Starlib();
  resetValues(s);
  changeSetup(ctx, s, 2);
  s.doChange = true;
  for (let x = 0; x < STARLIB_MAX_STARS; x++) {
    s.spX[x] = (ctx.rng.rand() % 64000) - 32000;
    s.spY[x] = (ctx.rng.rand() % 40000) - 20000;
    s.spZ[x] = x + 1;
  }
  return s;
}

const int = (x: number): number => Math.trunc(x) | 0; // C (int) cast of a float

// port of JE_newStar
function newStar(ctx: Ctx, s: Starlib): void {
  if (s.setup === 0) {
    s.tempX = (ctx.rng.rand() % 64000) - 32000;
    s.tempY = (ctx.rng.rand() % 40000) - 20000;
    return;
  }
  s.nsp = f32(s.nsp + s.nspVarInc);
  const nsp = s.nsp;
  const inc2 = (): void => {
    s.nsp2 = u16(s.nsp2 + s.nspVar2Inc);
    if (s.nsp2 === 65535 || s.nsp2 === 0) s.nspVar2Inc = -s.nspVar2Inc;
  };
  switch (s.setup) {
    case 1:
      s.tempX = int(f32(sinf(f32(nsp / 30)) * 20000));
      s.tempY = (ctx.rng.rand() % 40000) - 20000;
      break;
    case 2:
      s.tempX = int(f32(cosf(nsp) * 20000));
      s.tempY = int(f32(sinf(nsp) * 20000));
      break;
    case 3:
      s.tempX = int(f32(cosf(f32(nsp * 15)) * 100)) * (int(f32(nsp / 6)) % 200);
      s.tempY = int(f32(sinf(f32(nsp * 15)) * 100)) * (int(f32(nsp / 6)) % 200);
      break;
    case 4:
      s.tempX = int(f32(sinf(f32(nsp / 60)) * 20000));
      s.tempY = int(f32(f32(cosf(nsp) * int(f32(sinf(f32(nsp / 200)) * 300))) * 100));
      break;
    case 5:
      s.tempX = int(f32(sinf(f32(nsp / 2)) * 20000));
      s.tempY = int(f32(f32(cosf(nsp) * int(f32(sinf(f32(nsp / 200)) * 300))) * 100));
      break;
    case 6:
      s.tempX = int(f32(sinf(nsp) * 40000));
      s.tempY = int(f32(cosf(nsp) * 20000));
      break;
    case 8:
      s.tempX = int(f32(sinf(f32(nsp / 2)) * 40000));
      s.tempY = int(f32(cosf(nsp) * 20000));
      break;
    case 7:
      s.tempX = ctx.rng.rand() % 65535;
      if (ctx.rng.rand() % 2 === 0) s.tempY = int(f32(cosf(f32(nsp / 80)) * 10000)) + 15000;
      else s.tempY = 50000 - int(f32(cosf(f32(nsp / 80)) * 13000));
      break;
    case 9:
      inc2();
      s.tempX = int(f32(cosf(f32(sinf(f32(s.nsp2 / 10)) + f32(nsp / 500))) * 32000));
      s.tempY = int(f32(sinf(f32(cosf(f32(s.nsp2 / 10)) + f32(nsp / 500))) * 30000));
      break;
    case 10:
      inc2();
      s.tempX = int(f32(cosf(f32(sinf(f32(s.nsp2 / 5)) + f32(nsp / 100))) * 32000));
      s.tempY = int(f32(sinf(f32(cosf(f32(s.nsp2 / 5)) + f32(nsp / 100))) * 30000));
      break;
    case 11:
      inc2();
      s.tempX = int(f32(cosf(f32(sinf(f32(s.nsp2 / 1000)) + f32(nsp / 2))) * 32000));
      s.tempY = int(f32(sinf(f32(cosf(f32(s.nsp2 / 1000)) + f32(nsp / 2))) * 30000));
      break;
    case 12:
      if (nsp !== 0) {
        inc2();
        const sq = f32(Math.sqrt(Math.abs(nsp))); // sqrtf(fabsf(nsp))
        const dd = f32(f32(sq / 10) + 1);
        s.tempX = int(f32(cosf(f32(f32(sinf(f32(s.nsp2 / 2)) / dd) + f32(s.nsp2 / 100))) * 32000));
        s.tempY = int(f32(sinf(f32(f32(cosf(f32(s.nsp2 / 2)) / dd) + f32(s.nsp2 / 100))) * 30000));
      }
      break;
    case 13:
      if (nsp !== 0) {
        inc2();
        s.tempX = int(f32(cosf(f32(f32(sinf(f32(s.nsp2 / 10)) / 2) + f32(nsp / 20))) * 32000));
        s.tempY = int(f32(sinf(f32(f32(sinf(f32(s.nsp2 / 11)) / 2) + f32(nsp / 20))) * 30000));
      }
      break;
    case 14:
      s.nsp2 = u16(s.nsp2 + s.nspVar2Inc);
      s.tempX = int(f32(f32(sinf(nsp) + f32(cosf(f32(s.nsp2 / 1000)) * 3)) * 12000));
      s.tempY = int(f32(cosf(nsp) * 10000)) + s.nsp2;
      break;
  }
}

// key letters as SDL scancodes
const SC_1 = 30, SC_0 = 39, SC_ESC = 41, SC_MINUS = 45, SC_EQUALS = 46, SC_LBRACKET = 47, SC_RBRACKET = 48, SC_GRAVE = 53;
const SC_C = 6, SC_P = 19, SC_S = 22, SC_X = 27, SC_KP_MINUS = 86, SC_KP_PLUS = 87, SC_KP_1 = 89, SC_KP_0 = 98;

// port of JE_starlib_main (starlib.c:63)
export async function starlibMain(ctx: Ctx): Promise<void> {
  const s = starlibInit(ctx);
  const input = ctx.input;
  const surf = ctx.vga.cur.pixels; // VGAScreen

  s.starlibSpeed = s16(s.starlibSpeed + s.speedChange);

  for (let i = 0; i < STARLIB_MAX_STARS; i++) {
    // We don't want trails in our star field. Erase the old graphic.
    let off = s.lastX[i]! + s.lastY[i]! * 320;
    if (off >= 640 && off < 320 * 200 - 640) {
      surf[off] = 0;
      surf[off - 1] = 0; surf[off + 1] = 0; surf[off - 2] = 0; surf[off + 2] = 0;
      surf[off - 320] = 0; surf[off + 320] = 0; surf[off - 640] = 0; surf[off + 640] = 0;
    }

    // Move star
    let tempZ = s.spZ[i]!;
    s.tempX = idiv(s.spX[i]!, tempZ) + 160;
    s.tempY = idiv(s.spY[i]!, tempZ) + 100;
    tempZ = s16(tempZ - s.starlibSpeed);

    // If star is out of range, make a new one
    if (tempZ <= 0 || s.tempY === 0 || s.tempY > 198 || s.tempX > 318 || s.tempX < 1) {
      s.spZ[i] = 500;
      newStar(ctx, s);
      s.spX[i] = s.tempX;
      s.spY[i] = s.tempY;
    } else {
      s.lastX[i] = s.tempX;
      s.lastY[i] = s.tempY;
      s.spZ[i] = tempZ;
      off = s.tempX + s.tempY * 320;
      let tempCol = u8(s.pColor + ((tempZ >> 4) & 31));
      if (off >= 640 && off < 320 * 200 - 640) {
        surf[off] = tempCol;
        tempCol = u8(tempCol + 72);
        surf[off - 1] = tempCol; surf[off + 1] = tempCol; surf[off - 320] = tempCol; surf[off + 320] = tempCol;
        tempCol = u8(tempCol + 72);
        surf[off - 2] = tempCol; surf[off + 2] = tempCol; surf[off - 640] = tempCol; surf[off + 640] = tempCol;
      }
    }
  }

  if (input.newkey) {
    let key = '';
    const sc = input.lastkeyScan, mod = input.lastkeyMod;
    if ((mod & (KMOD_CTRL | KMOD_SHIFT | KMOD_ALT | KMOD_GUI)) === 0) {
      if (sc === SC_C) key = 'c';
      else if (sc === SC_P) key = 'p';
      else if (sc === SC_S) key = 's';
      else if (sc === SC_X) key = 'x';
      else if (sc >= SC_1 && sc < SC_0) key = String(sc - SC_1 + 1);
      else if (sc === SC_0) key = '0';
      else if (sc === SC_ESC) key = 'esc';
      else if (sc === SC_MINUS || sc === SC_KP_MINUS) key = '-';
      else if (sc === SC_LBRACKET) key = '[';
      else if (sc === SC_RBRACKET) key = ']';
      else if (sc === SC_GRAVE) key = '`';
      else if (sc === SC_KP_PLUS) key = '+';
      else if (sc >= SC_KP_1 && sc < SC_KP_0) key = String(sc - SC_KP_1 + 1);
      else if (sc === SC_KP_0) key = '0';
    } else if ((mod & KMOD_SHIFT) !== 0 && (mod & (KMOD_CTRL | KMOD_ALT | KMOD_GUI)) === 0) {
      if (sc === SC_C) key = 'C';
      else if (sc === SC_P) key = 'P';
      else if (sc === SC_S) key = 'S';
      else if (sc === SC_X) key = 'X';
      else if (sc === SC_1) key = '!';
      else if (sc === SC_1 + 1) key = '@';
      else if (sc === SC_1 + 2) key = '#';
      else if (sc === SC_1 + 3) key = '$';
      else if (sc === SC_EQUALS) key = '+';
      else if (sc === SC_LBRACKET) key = '{';
      else if (sc === SC_RBRACKET) key = '}';
    }

    switch (key === 'esc' ? key : key.toUpperCase()) {
      case '+': s.starlibSpeed = s16(s.starlibSpeed + 1); s.speedChange = 0; break;
      case '-': s.starlibSpeed = s16(s.starlibSpeed - 1); s.speedChange = 0; break;
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
        changeSetup(ctx, s, Number(key)); break;
      case '0': changeSetup(ctx, s, 10); break;
      case '!': changeSetup(ctx, s, 11); break;
      case '@': changeSetup(ctx, s, 12); break;
      case '#': changeSetup(ctx, s, 13); break;
      case '$': changeSetup(ctx, s, 14); break;
      case 'C': resetValues(s); break;
      case 'S': s.nspVarVarInc = f32(f32(ctx.rng.rand1() * F_0_01) - F_0_005); break;
      case 'X': case 'esc': break; // run = false: nothing reads `run`
      case '[': s.pColor = u8(s.pColor - 1); break;
      case ']': s.pColor = u8(s.pColor + 1); break;
      case '{': s.pColor = u8(s.pColor - 72); break;
      case '}': s.pColor = u8(s.pColor + 72); break;
      case '`': s.doChange = !s.doChange; break;
      case 'P':
        await waitNoInput(ctx, true, false, false);
        await waitInput(ctx, true, false, false);
        break;
    }
  }

  if (s.doChange) {
    s.stepCounter = u16(s.stepCounter + 1);
    if (s.stepCounter > s.changeTime) changeSetup(ctx, s, 0);
  }

  if (ctx.rng.rand() % 1000 === 1) s.nspVarVarInc = f32(f32(ctx.rng.rand1() * F_0_01) - F_0_005);

  s.nspVarInc = f32(s.nspVarInc + s.nspVarVarInc);
}
