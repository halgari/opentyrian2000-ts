import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { SCENARIOS } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR, readFramesFile } from '../helpers/frames';
import { compareFrames } from './compare';
import { runScenario } from './harness';

const expected = readFramesFile(resolve(ORACLE_DIR, 'menu-nav.frames'));
const d = testArchive && expected ? describe : describe.skip;

d('golden: main menu navigation (Down×3, Up)', () => {
  it('matches the C original frame-for-frame', async () => {
    const actual = await runScenario(SCENARIOS['menu-nav']);
    expect(compareFrames('menu-nav', expected!, actual)).toBeNull();
  });
});
