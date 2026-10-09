// SPDX-License-Identifier: GPL-2.0-or-later
import { fileURLToPath } from 'node:url';
import type { Frame } from '../helpers/frames';
import { writeIndexedPng } from '../helpers/png';

const OUT = fileURLToPath(new URL('../../test-output/golden', import.meta.url));

export function compareFrames(name: string, expected: Frame[], actual: Frame[]): string | null {
  if (expected.length === 0) return 'no expected frames';
  const n = Math.min(expected.length, actual.length);
  for (let f = 0; f < n; f++) {
    const e = expected[f]!, a = actual[f]!;
    let problem: string | null = null;
    for (let i = 0; i < 768 && !problem; i++) {
      if (e.palette[i] !== a.palette[i]) {
        problem = `frame ${f}: palette entry ${Math.floor(i / 3)} channel ${'rgb'[i % 3]} expected ${e.palette[i]} got ${a.palette[i]}`;
      }
    }
    for (let i = 0; i < 64000 && !problem; i++) {
      if (e.pixels[i] !== a.pixels[i]) {
        problem = `frame ${f}: pixel (${i % 320},${Math.floor(i / 320)}) expected ${e.pixels[i]} got ${a.pixels[i]}`;
      }
    }
    if (problem) {
      writeIndexedPng(`${OUT}/${name}/frame${f}-expected.png`, e);
      writeIndexedPng(`${OUT}/${name}/frame${f}-actual.png`, a);
      return `${problem} (PNGs in test-output/golden/${name}/)`;
    }
  }
  if (expected.length !== actual.length) return `frame count: expected ${expected.length} got ${actual.length}`;
  return null;
}
