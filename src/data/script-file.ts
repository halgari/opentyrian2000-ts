// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/helptext.c (read_encrypted_pascal_string), src/mainint.c (str_pop_int),
//   src/game_menu.c (load_cube seek and header), libc (atoi, strtol)
import { decryptString } from './helptext';

/** `char s[256]` of JE_loadMap: the episode script's line buffer. */
export const SCRIPT_LINE_SIZE = 256;

// libc isspace in the C locale
const isSpace = (c: number): boolean => c === 32 || (c >= 9 && c <= 13);

/** strlen of the C string in `buf` starting at `off` (stops at the first NUL, or at the end of the buffer). */
export function cstrlen(buf: Uint8Array, off = 0): number {
  let n = 0;
  while (off + n < buf.length && buf[off + n] !== 0) n++;
  return n;
}

/** The C string at `buf + off` as a Latin-1 JS string. */
export function cstr(buf: Uint8Array, off = 0): string {
  let s = '';
  for (let i = off; i < buf.length && buf[i] !== 0; i++) s += String.fromCharCode(buf[i]!);
  return s;
}

// port of libc atoi(buf + off): skip blanks, optional sign, decimal digits, stop at anything else (incl. NUL).
// `buf` is the whole line buffer, so an offset beyond the terminator reads the stale bytes there, like the C.
export function atoiAt(buf: Uint8Array, off: number): number {
  let i = off;
  while (i < buf.length && isSpace(buf[i]!)) i++;
  let neg = false;
  if (buf[i] === 0x2d) { neg = true; i++; } else if (buf[i] === 0x2b) i++;
  let v = 0;
  while (i < buf.length && buf[i]! >= 0x30 && buf[i]! <= 0x39) { v = v * 10 + (buf[i]! - 0x30); if (v > 2 ** 40) v = 2 ** 40; i++; }
  return (neg ? -v : v) | 0;
}

/** C `atoi` of a JS string (same rules as atoiAt). */
export function atoi(s: string): number {
  const b = new Uint8Array(s.length + 1);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return atoiAt(b, 0);
}

// port of str_pop_int (mainint.c:2917): strtol(str, &end, 10) and, on success, `str` becomes the text after the number.
export function strPopInt(str: string): { value: number; rest: string } | null {
  const m = /^[ \t\n\v\f\r]*[+-]?[0-9]+/.exec(str);
  if (!m) return null;
  return { value: atoi(m[0]), rest: str.slice(m[0].length) };
}

/**
 * A sequential reader over a file of encrypted Pascal strings (levelsN.dat, cubetxtN.dat), standing in for the
 * `FILE *` that JE_loadMap and load_cube hold.
 */
export class ScriptReader {
  pos = 0;
  constructor(readonly bytes: Uint8Array) {}

  // port of read_encrypted_pascal_string (helptext.c:100) into a char[buf.length]. Reading past the end of the
  // file is fatal in the C (fread_u8_die / fread_die), here a RangeError.
  readInto(buf: Uint8Array): void {
    if (this.pos >= this.bytes.length) throw new RangeError('script file: read past end of file');
    const len = this.bytes[this.pos++]!;
    if (this.pos + len > this.bytes.length) throw new RangeError('script file: truncated string');
    const plain = decryptString(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    const n = Math.min(len, buf.length - 1); // assert(len < size) is compiled out; the C truncates
    buf.set(plain.subarray(0, n), 0);
    buf[n] = 0;
  }

  /** read_encrypted_pascal_string into a fresh char[size], returned as a string. */
  readString(size = SCRIPT_LINE_SIZE): string {
    const buf = new Uint8Array(size);
    this.readInto(buf);
    return cstr(buf);
  }

  // port of skip_pascal_string
  skip(): void {
    if (this.pos >= this.bytes.length) throw new RangeError('script file: read past end of file');
    this.pos += 1 + this.bytes[this.pos]!;
  }
}

export interface CubeText {
  /** `--cube.face_sprite`: 0-based FACE_SHAPES index (-1 when the header line has no number). */
  faceSprite: number;
  title: string;
  header: string;
  /** The raw body lines up to (not including) the closing `*` line. Word wrapping is the data-cube screen's job. */
  body: string[];
}

// port of the file side of load_cube (game_menu.c:1772-1815): seek to the cube_index-th `*` line (cube_index >= 1 as
// in the C: cubeList entries are 1-based), take the face sprite from its text after column 4, read title and header,
// then collect the body lines up to the next `*` line.
export function readCube(bytes: Uint8Array, cubeIndex: number): CubeText {
  if (cubeIndex < 1) throw new RangeError('readCube: cube_index must be >= 1 (the C reads an uninitialised buffer for 0)');
  const r = new ScriptReader(bytes);
  const buf = new Uint8Array(SCRIPT_LINE_SIZE);
  for (let n = cubeIndex; n > 0;) {
    r.readInto(buf);
    if (buf[0] === 0x2a) n--;
  }
  const pop = strPopInt(cstr(buf, 4));
  const faceSprite = (pop ? pop.value : 0) - 1; // face_sprite keeps its previous value on failure: callers start at 0
  const title = r.readString(SCRIPT_LINE_SIZE);
  const header = r.readString(SCRIPT_LINE_SIZE);
  const body: string[] = [];
  for (;;) {
    r.readInto(buf);
    if (buf[0] === 0x2a) break;
    body.push(cstr(buf));
  }
  return { faceSprite, title, header, body };
}
