// SPDX-License-Identifier: GPL-2.0-or-later
// Standard zlib CRC-32 (poly 0xEDB88320), as computed by the oracle's OT_HASH.
const TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE[i] = c >>> 0;
}

/** CRC-32 of `bytes`. `seed` is the CRC of the preceding data (0 for none), so calls can be chained. */
export function crc32(bytes: Uint8Array, seed = 0): number {
  let crc = ~seed >>> 0;
  for (let i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return ~crc >>> 0;
}
