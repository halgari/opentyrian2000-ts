// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mtrand.c
//
// Original Mersenne Twister notice (retained from mtrand.c):
//    Copyright (C) 1997--2004, Makoto Matsumoto, Takuji Nishimura, and
//    Eric Landry; All rights reserved.
//
//    Redistribution and use in source and binary forms, with or without
//    modification, are permitted provided that the following conditions
//    are met:
//
//      1. Redistributions of source code must retain the above copyright
//         notice, this list of conditions and the following disclaimer.
//
//      2. Redistributions in binary form must reproduce the above copyright
//         notice, this list of conditions and the following disclaimer
//         in the documentation and/or other materials provided with the
//         distribution.
//
//      3. The names of its contributors may not be used to endorse or
//         promote products derived from this software without specific
//         prior written permission.
//
//    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
//    "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
//    LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
//    A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT
//    OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
//    SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
//    LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
//    DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
//    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
//    (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
//    OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
//    Any feedback is very welcome.
//    http://www.math.sci.hiroshima-u.ac.jp/~m-mat/MT/emt.html
//    email: m-mat @ math.sci.hiroshima-u.ac.jp (remove space)
//
//    Reference: M. Matsumoto and T. Nishimura, "Mersenne Twister:
//    A 623-Dimensionally Equidistributed Uniform Pseudo-Random Number
//    Generator", ACM Transactions on Modeling and Computer Simulation,
//    Vol. 8, No. 1, January 1998, pp 3--30.

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

export const MT_RAND_MAX = 0xffffffff;

export class MersenneTwister {
  private readonly x = new Uint32Array(N);
  private p0 = -1; // -1 = never seeded (C: p0 == NULL)
  private p1 = 0;
  private pm = 0;

  // port of mt_srand
  srand(seed: number): void {
    const x = this.x;
    x[0] = seed >>> 0;
    for (let i = 1; i < N; ++i) {
      const prev = x[i - 1]!;
      x[i] = (Math.imul(1812433253, (prev ^ (prev >>> 30)) >>> 0) + i) >>> 0;
    }
    this.p0 = 0;
    this.p1 = 1;
    this.pm = M;
  }

  // port of mt_rand
  rand(): number {
    if (this.p0 < 0) this.srand(5489);
    const x = this.x;
    const a = x[this.p0]!;
    const b = x[this.p1]!;
    let y = (x[this.pm++]! ^ (((a & UPPER_MASK) | (b & LOWER_MASK)) >>> 1) ^ (b & 1 ? MATRIX_A : 0)) >>> 0;
    x[this.p0] = y;
    this.p0 = this.p1++;
    if (this.pm === N) this.pm = 0;
    if (this.p1 === N) this.p1 = 0;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  // port of mt_rand_1: float32 math, [0,1]
  rand1(): number {
    return Math.fround(Math.fround(this.rand()) / Math.fround(MT_RAND_MAX));
  }

  // port of mt_rand_lt1: float32 math, [0,1)
  randLt1(): number {
    return Math.fround(Math.fround(this.rand()) / Math.fround(Math.fround(MT_RAND_MAX) + 1));
  }
}
