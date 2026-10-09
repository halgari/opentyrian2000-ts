// SPDX-License-Identifier: GPL-2.0-or-later
// glibc random() TYPE_3 (degree 31, sep 3), as used by C rand()/srand().
export class CRand {
  private ring = new Uint32Array(31);
  private idx = 0;

  constructor(seed = 1) {
    this.srand(seed);
  }

  // port of srand (glibc random_r.c, __srandom_r)
  srand(seed: number): void {
    let s = seed >>> 0;
    if (s === 0) s = 1;
    const r = new Int32Array(34);
    r[0] = s | 0;
    let word = s | 0;
    for (let i = 1; i < 31; i++) {
      const hi = Math.trunc(word / 127773);
      const lo = word % 127773;
      word = (16807 * lo - 2836 * hi) | 0;
      if (word < 0) word += 2147483647;
      r[i] = word;
    }
    const buf = new Uint32Array(34);
    for (let i = 0; i < 31; i++) buf[i] = r[i] >>> 0;
    for (let i = 31; i < 34; i++) buf[i] = buf[i - 31];
    this.idx = 0;
    // r[i] = r[i-3] + r[i-31] for i in 34..343 (310 outputs discarded)
    const hist = new Uint32Array(34 + 310);
    hist.set(buf);
    for (let i = 34; i < 344; i++) hist[i] = (hist[i - 3] + hist[i - 31]) >>> 0;
    for (let i = 0; i < 31; i++) this.ring[i] = hist[344 - 31 + i];
  }

  // port of rand (glibc random_r.c, __random_r)
  rand(): number {
    // ring holds last 31 outputs, oldest at idx; r[i-31] = ring[idx], r[i-3] = ring[(idx+28)%31]
    const a = this.ring[(this.idx + 28) % 31];
    const v = (a + this.ring[this.idx]) >>> 0;
    this.ring[this.idx] = v;
    this.idx = (this.idx + 1) % 31;
    return v >>> 1;
  }
}
