// SPDX-License-Identifier: GPL-2.0-or-later
// Replaces the fread_*_die helpers of file.h: little-endian reads over an in-memory file.
export class BinaryReader {
  pos: number;
  readonly length: number;
  private readonly view: DataView;

  constructor(readonly data: Uint8Array, pos = 0) {
    this.pos = pos;
    this.length = data.length;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  private need(n: number): number {
    const p = this.pos;
    if (p < 0 || p + n > this.length) throw new RangeError(`read past end (${p}+${n} > ${this.length})`);
    this.pos = p + n;
    return p;
  }

  u8(): number { return this.view.getUint8(this.need(1)); }
  s8(): number { return this.view.getInt8(this.need(1)); }
  bool(): boolean { return this.u8() !== 0; }
  u16(): number { return this.view.getUint16(this.need(2), true); }
  s16(): number { return this.view.getInt16(this.need(2), true); }
  u32(): number { return this.view.getUint32(this.need(4), true); }
  s32(): number { return this.view.getInt32(this.need(4), true); }
  bytes(n: number): Uint8Array { const p = this.need(n); return this.data.slice(p, p + n); }
  seek(pos: number): void { this.pos = pos; }
  skip(n: number): void { this.need(n); }
  eof(): boolean { return this.pos >= this.length; }
}
