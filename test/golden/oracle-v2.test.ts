// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIN, DATA, OUT, runOracle } from '../../tools/oracle/lib';
import { SCENARIOS } from '../../tools/oracle/scenarios';
import { parseStates2 } from '../helpers/state-trace';

const have = existsSync(BIN) && existsSync(DATA);
const sc = SCENARIOS['newgame-ep1-first-shop-to-level'];

function once(tag: string): { hash: Buffer; state2: Buffer; sav: Buffer } {
  const dir = join(OUT, `test-${tag}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const paths = { hash: join(dir, 'h'), state2: join(dir, 's2'), saveDump: join(dir, 'save') };
  runOracle(`test-${tag}`, sc, paths);
  const out = { hash: readFileSync(paths.hash), state2: readFileSync(paths.state2), sav: readFileSync(join(paths.saveDump, 'tyrian.sav')) };
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(OUT, `home-test-${tag}`), { recursive: true, force: true });
  return out;
}

describe.skipIf(!have)('oracle v2: newgame-ep1-first-shop-to-level', () => {
  it('is deterministic and reaches level 1 with held keys applied', () => {
    const a = once('a');
    const b = once('b');
    expect(b.hash.equals(a.hash)).toBe(true);
    expect(b.state2.equals(a.state2)).toBe(true);
    expect(b.sav.equals(a.sav)).toBe(true);
    expect(a.hash.length / 8).toBe(sc.maxFrames);
    const st = parseStates2(new Uint8Array(a.state2));
    expect(st).toHaveLength(sc.maxFrames);
    // New game: episode 1, normal difficulty, 10000 cash, in a level from about frame 331.
    expect(st[300]).toMatchObject({ episodeNum: 1, difficultyLevel: 2, cash: 10000 });
    expect(st[340]!.p0x).toBe(100);
    // Left is held from frame 355 for 40 frames: the ship moves left while it is held and stops after.
    expect(st[380]!.p0x).toBeLessThan(st[354]!.p0x);
    expect(st[420]!.p0x).toBe(st[400]!.p0x);
  });
});
