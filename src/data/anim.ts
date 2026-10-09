// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/animlib.c, src/sizebuf.c
//
// Decoding side of the LPF animation player (tyrend.anm). The playback loop is in src/screens/anim.ts.

const PALETTE_OFFSET = 0x100;    // 128 + sizeof(header)
const PAGEHEADER_OFFSET = 0x500; // PALETTE_OFFSET + sizeof(palette)
const ANIM_OFFSET = 0x0b00;      // PAGEHEADER_OFFSET + sizeof(largepageheader) * 256
const ANI_PAGE_SIZE = 0x10000;

export interface AnimPageHeader { baseRecord: number; nRecords: number; nBytes: number }

export interface Anim {
  bytes: Uint8Array;
  nlps: number;
  nRecords: number;
  pageHeaders: AnimPageHeader[];
  /** The 256-entry palette as r,g,b triples (the file stores b,g,r,unused). */
  palette: Uint8Array;
}

/** The page JE_loadPage leaves in CurrentPageBuffer / CurrentPageHeader / CurrentPageRecordSizes. */
export interface AnimPage {
  number: number;
  header: AnimPageHeader;
  recordSizes: number[];
  buffer: Uint8Array;
}

const u16At = (b: Uint8Array, p: number): number => b[p]! | (b[p + 1]! << 8);
const u32At = (b: Uint8Array, p: number): number => (u16At(b, p) | (u16At(b, p + 2) << 16)) >>> 0;

// port of JE_loadAnim (animlib.c:218) minus the file open and set_palette: returns null where the C returns -1.
export function parseAnim(bytes: Uint8Array): Anim | null {
  if (bytes.length < ANIM_OFFSET) return null;
  if (bytes[0] !== 0x4c || bytes[1] !== 0x50 || bytes[2] !== 0x46 || bytes[3] !== 0x20) return null; // "LPF "
  const nlps = u16At(bytes, 6);
  const nRecords = u32At(bytes, 8);
  if (nlps === 0 || nRecords === 0 || nlps > 256 || nRecords > 65535) return null;

  const pageHeaders: AnimPageHeader[] = [];
  for (let i = 0; i < nlps; i++) {
    const p = PAGEHEADER_OFFSET + i * 6;
    pageHeaders.push({ baseRecord: u16At(bytes, p), nRecords: u16At(bytes, p + 2), nBytes: u16At(bytes, p + 4) });
  }

  const last = pageHeaders[nlps - 1]!;
  if (bytes.length < (nlps - 1) * ANI_PAGE_SIZE + ANIM_OFFSET + last.nBytes + last.nRecords * 2 + 8) return null;

  const palette = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    const p = PALETTE_OFFSET + i * 4;
    palette[i * 3] = bytes[p + 2]!;     // r
    palette[i * 3 + 1] = bytes[p + 1]!; // g
    palette[i * 3 + 2] = bytes[p]!;     // b
  }
  return { bytes, nlps, nRecords, pageHeaders, palette };
}

// port of JE_findPage: -1 when no page holds the frame
export function findPage(anim: Anim, frame: number): number {
  for (let i = 0; i < anim.nlps; i++) {
    const h = anim.pageHeaders[i]!;
    if (h.baseRecord <= frame && h.baseRecord + h.nRecords > frame) return i;
  }
  return -1;
}

// port of JE_loadPage (animlib.c:73): null where the C returns -1 (the headers lie about the page size)
export function loadPage(anim: Anim, pageNumber: number): AnimPage | null {
  const b = anim.bytes;
  let p = ANIM_OFFSET + pageNumber * ANI_PAGE_SIZE;
  const header = { baseRecord: u16At(b, p), nRecords: u16At(b, p + 2), nBytes: u16At(b, p + 4) };
  p += 6 + 2;
  const recordSizes: number[] = [];
  for (let i = 0; i < header.nRecords; i++, p += 2) recordSizes.push(u16At(b, p));
  if (p + header.nBytes > b.length) throw new RangeError('anim: page runs past the end of the file'); // fread_die
  const buffer = b.subarray(p, p + header.nBytes);
  let pageSize = 0;
  for (const s of recordSizes) pageSize += s;
  if (pageSize !== header.nBytes) return null;
  return { number: pageNumber, header, recordSizes, buffer };
}

// port of JE_renderFrame (animlib.c:131): decodes the record of `frame` into `out` (a 320x200 screen). True on success.
export function renderFrame(page: AnimPage, frame: number, out: Uint8Array): boolean {
  const destframe = frame - page.header.baseRecord;
  let offset = 0;
  for (let i = 0; i < destframe; i++) offset += page.recordSizes[i]!;
  // C: JE_playRunSkipDump(buffer + offset + 4, recordSizes[destframe] - 4) with an unsigned length
  const len = (page.recordSizes[destframe]! - 4) >>> 0;
  return playRunSkipDump(page.buffer, offset + 4, len, out) === 0;
}

/** sizebuf_t (sizebuf.c): a bounds-checked cursor with a sticky error flag. */
class SizeBuf {
  pos = 0;
  error = false;
  constructor(readonly data: Uint8Array, readonly start: number, readonly len: number) {}

  memset(value: number, count: number): void {
    if (this.error || this.pos + count > this.len) { this.error = true; return; }
    this.data.fill(value, this.start + this.pos, this.start + this.pos + count);
    this.pos += count;
  }

  seekCur(count: number): void {
    this.pos += count;
    this.error = this.pos > this.len; // SZ_Seek clears the error flag again when the new position is in range
  }

  readByte(): number {
    if (this.error || this.pos + 1 > this.len) { this.error = true; return 0; }
    return this.data[this.start + this.pos++]!;
  }

  readWord(): number {
    if (this.error || this.pos + 2 > this.len) { this.error = true; return 0; }
    const v = this.data[this.start + this.pos]! | (this.data[this.start + this.pos + 1]! << 8);
    this.pos += 2;
    return v;
  }
}

// port of SZ_Memcpy2: copy `count` bytes from `src` to `dst`
function memcpy2(dst: SizeBuf, src: SizeBuf, count: number): void {
  if (dst.error || dst.pos + count > dst.len) { dst.error = true; return; }
  if (src.error || src.pos + count > src.len) { src.error = true; return; }
  dst.data.set(src.data.subarray(src.start + src.pos, src.start + src.pos + count), dst.start + dst.pos);
  dst.pos += count;
  src.pos += count;
}

// port of JE_playRunSkipDump (animlib.c:301). Returns 0 on success, -1 when the data is broken.
export function playRunSkipDump(input: Uint8Array, inStart: number, inLen: number, out: Uint8Array): number {
  const bin = new SizeBuf(input, inStart, inLen);
  const bout = new SizeBuf(out, 0, 320 * 200);

  for (;;) {
    let opcode = bin.readByte();
    if (bin.error || bout.error) return -1;

    if (opcode === 0x80) { // long ops
      opcode = bin.readWord();
      if (opcode === 0x0000) break; // ANI_STOP
      if (!(opcode & 0x8000)) {
        bout.seekCur(opcode); // skip
      } else {
        opcode &= ~0x8000;
        if (opcode & 0x4000) { // RLE
          const count = opcode & ~0x4000;
          bout.memset(bin.readByte(), count);
        } else {
          memcpy2(bout, bin, opcode); // long copy
        }
      }
    } else if (opcode & 0x80) {
      bout.seekCur(opcode & ~0x80); // short skip
    } else if (opcode === 0) { // short RLE
      const count = bin.readByte();
      const value = bin.readByte();
      bout.memset(value, count);
    } else {
      memcpy2(bout, bin, opcode); // short copy
    }
  }
  return 0;
}
