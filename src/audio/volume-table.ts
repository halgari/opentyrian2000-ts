// SPDX-License-Identifier: GPL-2.0-or-later
const VOLUME_RANGE = 30; // dB

// port of init_audio volume table (loudness.c); Q20.12 fixed point
export function buildVolumeFactorTable(): Int32Array {
  const f = Math.fround;
  const t = new Int32Array(256);
  const k = f(-VOLUME_RANGE / f(20 * 255));
  for (let i = 1; i < 256; i++) {
    const p = f(Math.pow(10, f(f(255 - i) * k)));
    t[i] = Math.trunc(f(p * 4096)) | 0; // TO_FIXED
  }
  return t;
}
