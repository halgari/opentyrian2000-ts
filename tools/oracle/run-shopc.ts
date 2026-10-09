// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/run-shopc.ts <name|all> [--raw a-b[,c]]   (Task 11 scenarios from scenarios-shopc.ts)
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, runOracle } from './lib';
import { SHOPC_SCENARIOS } from './scenarios-shopc';

mkdirSync(OUT, { recursive: true });
const arg = process.argv[2] ?? 'all';
const rawIdx = process.argv.indexOf('--raw'); // --raw a-b[,c]: also write <name>.dbg.frames (never a fixture)
const rawFrames = rawIdx >= 0 ? process.argv[rawIdx + 1] : undefined;
for (const name of arg === 'all' ? Object.keys(SHOPC_SCENARIOS) : [arg]) {
  const sc = SHOPC_SCENARIOS[name];
  if (!sc) throw new Error(`unknown shop C scenario ${name}`);
  const hash = join(OUT, `${name}.hash`), state2 = join(OUT, `${name}.state2`), saveDump = join(OUT, `${name}.save`);
  runOracle(name, sc, { hash, state2, saveDump, ...(rawFrames ? { dump: join(OUT, `${name}.dbg.frames`), rawFrames } : {}) });
  console.log(`oracle ${name}: ${statSync(hash).size / 8} hashes, ${statSync(state2).size / 144} state2 records`);
}
