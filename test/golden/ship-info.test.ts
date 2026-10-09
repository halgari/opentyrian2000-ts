import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { testArchive } from '../helpers/data';
import { ORACLE_DIR } from '../helpers/frames';
import { readStates } from '../helpers/state-trace';
import { runDemoScenario } from './demo-harness';

const states = readStates(resolve(ORACLE_DIR, 'demo-1.state'));
const d = testArchive && states ? describe : describe.skip;

d('golden: getShipInfo', () => {
  it('demo-1 player armor at the first loop frame equals the oracle', async () => {
    const actual = await runDemoScenario('demo-1', 214);
    expect(actual.states[213]!.p0armor).toBe(states![213]!.p0armor);
    expect(actual.states[213]!.p0armor).toBe(10);
  });
});
