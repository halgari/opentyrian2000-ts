// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c

// port of load_next_demo (mainint.c) -- header parse only; file I/O and JE_initEpisode are the caller's.
export interface DemoFile {
  episode: number;
  /** 10 raw bytes (not trimmed; NUL-padded in the file). */
  levelName: Uint8Array;
  lvlFileNum: number;
  frontWeaponId: number;
  rearWeaponId: number;
  superArcadeMode: number;
  leftSidekick: number;
  rightSidekick: number;
  generator: number;
  sidekickLevel: number;
  sidekickSeries: number;
  initialEpisodeNum: number;
  shield: number;
  special: number;
  ship: number;
  frontWeaponPower: number;
  rearWeaponPower: number;
  levelSong: number;
  /** demo_keys_wait after the header: big-endian u16 (missing bytes read as 0, like the zero-initialised temp2). */
  initialWait: number;
  /** Rest of the file after the 32-byte header. */
  records: Uint8Array;
}

export const DEMO_HEADER_SIZE = 32;

// port of load_next_demo (mainint.c)
export function parseDemo(bytes: Uint8Array): DemoFile {
  if (bytes.length < DEMO_HEADER_SIZE) throw new RangeError('demo file shorter than its header');
  const b = bytes;
  return {
    episode: b[0]!,
    levelName: b.slice(1, 11),
    lvlFileNum: b[11]!,
    frontWeaponId: b[12]!,
    rearWeaponId: b[13]!,
    superArcadeMode: b[14]!,
    leftSidekick: b[15]!,
    rightSidekick: b[16]!,
    generator: b[17]!,
    sidekickLevel: b[18]!,
    sidekickSeries: b[19]!,
    initialEpisodeNum: b[20]!,
    shield: b[21]!,
    special: b[22]!,
    ship: b[23]!,
    frontWeaponPower: b[24]!,
    rearWeaponPower: b[25]!,
    // b[26..28] unused
    levelSong: b[29]!,
    initialWait: (b[30]! << 8) | b[31]!,
    records: b.slice(DEMO_HEADER_SIZE),
  };
}

/**
 * port of replay_demo_keys (mainint.c): the key/wait part. One next() call = one frame.
 * Returns null where the C returns false (feof after a short record read).
 */
export class DemoReader {
  private pos = 0;
  private wait: number;
  private keys = 0; // demo_keys (persists between calls)
  private readonly records: Uint8Array;

  constructor(d: DemoFile) {
    this.records = d.records;
    this.wait = d.initialWait;
  }

  next(): { keys: number } | null {
    while (this.wait === 0) {
      this.keys = 0;
      // fread_u8(&demo_keys,1) then fread_u8(temp2,2); feof is set iff either read came up short.
      const rem = this.records.length - this.pos;
      if (rem < 3) {
        this.pos = this.records.length;
        return null;
      }
      this.keys = this.records[this.pos]!;
      this.wait = (this.records[this.pos + 1]! << 8) | this.records[this.pos + 2]!;
      this.pos += 3;
    }
    this.wait--;
    return { keys: this.keys };
  }
}
