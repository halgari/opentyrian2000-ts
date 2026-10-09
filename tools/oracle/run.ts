// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/run.ts <scenario|all>
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, type ScenarioName } from './scenarios';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BIN = join(ROOT, 'reference/oracle/opentyrian2000');
const DATA = join(ROOT, 'data/tyrian2000');
const OUT = join(ROOT, 'test-data/oracle');
const RECORD = 4 + 768 + 64000;

function run(name: ScenarioName): void {
  const sc = SCENARIOS[name];
  const home = join(OUT, `home-${name}`);
  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  const out = join(OUT, `${name}.frames`);
  rmSync(out, { force: true });
  const res = spawnSync(BIN, ['-t', DATA], {
    env: {
      ...process.env,
      HOME: home, XDG_CONFIG_HOME: home, XDG_DATA_HOME: home,
      SDL_VIDEODRIVER: 'dummy', SDL_AUDIODRIVER: 'dummy',
      OT_DUMP: out, OT_SEED: '1', OT_MAX_FRAMES: String(sc.maxFrames),
      OT_KEYS: sc.keys.map((k) => `${k.frame}:${k.scancode}`).join(','),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
    timeout: 180_000,
  });
  if (res.status !== 0) throw new Error(`oracle ${name} exited with ${res.status ?? res.signal}`);
  const frames = statSync(out).size / RECORD;
  if (frames !== sc.maxFrames) throw new Error(`oracle ${name}: expected ${sc.maxFrames} frames, got ${frames}`);
  console.log(`oracle ${name}: ${frames} frames -> ${out}`);
}

mkdirSync(OUT, { recursive: true });
const arg = process.argv[2] ?? 'all';
const names = arg === 'all' ? (Object.keys(SCENARIOS) as ScenarioName[]) : [arg as ScenarioName];
for (const n of names) {
  if (!(n in SCENARIOS)) throw new Error(`unknown scenario ${n}`);
  run(n);
}
