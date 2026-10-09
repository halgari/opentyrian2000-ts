// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/run-input.ts <name|all>   (Task 6 scenarios from scenarios-input.ts)
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, runOracle } from './lib';
import { INPUT_SCENARIOS } from './scenarios-input';

mkdirSync(OUT, { recursive: true });
const arg = process.argv[2] ?? 'all';
const rawIdx = process.argv.indexOf('--raw'); // --raw a-b[,c]: also write <name>.dbg.frames (never a fixture)
const rawFrames = rawIdx >= 0 ? process.argv[rawIdx + 1] : undefined;
for (const name of arg === 'all' ? Object.keys(INPUT_SCENARIOS) : [arg]) {
  const sc = INPUT_SCENARIOS[name];
  if (!sc) throw new Error(`unknown input scenario ${name}`);
  const hash = join(OUT, `${name}.hash`), state2 = join(OUT, `${name}.state2`);
  runOracle(name, sc, { hash, state2, ...(rawFrames ? { dump: join(OUT, `${name}.dbg.frames`), rawFrames } : {}) });
  console.log(`oracle ${name}: ${statSync(hash).size / 8} hashes, ${statSync(state2).size / 144} state2 records`);
}
