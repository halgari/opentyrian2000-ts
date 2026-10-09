// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { SCENARIOS } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR, readFramesFile } from '../helpers/frames';
import { compareFrames } from './compare';
import { runScenario } from './harness';

const expected = readFramesFile(resolve(ORACLE_DIR, 'boot.frames'));
const d = testArchive && expected ? describe : describe.skip;

d('golden: boot (intro logos → title → idle menu)', () => {
  it('matches the C original frame-for-frame', async () => {
    expect(expected!.length).toBe(SCENARIOS.boot.maxFrames);
    const actual = await runScenario(SCENARIOS.boot);
    expect(compareFrames('boot', expected!, actual)).toBeNull();
  });
});
