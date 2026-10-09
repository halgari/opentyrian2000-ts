// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/run.ts <scenario|all> [--raw a-b[,c,...]] [--raw-every n] [--fixture]
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_SCENARIOS, SCENARIOS, type AudioScenarioName, type Scenario, type ScenarioName } from './scenarios';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BIN = join(ROOT, 'reference/oracle/opentyrian2000');
const DATA = join(ROOT, 'data/tyrian2000');
const OUT = join(ROOT, 'test-data/oracle');
const RECORD = 4 + 768 + 64000;

/** `fixture`: write <name>.raw.frames (read by tests); otherwise debug dumps go to <name>.dbg.frames so they never clobber fixtures */
interface RawOpts { frames?: string; every?: string; fixture?: boolean }

function run(name: ScenarioName, raw: RawOpts = {}): void {
  const sc: Scenario = SCENARIOS[name];
  const rawMode = raw.frames !== undefined || raw.every !== undefined;
  const home = join(OUT, `home-${name}`);
  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  // Hash/state scenarios write .hash/.state; the raw dump is then only produced on request (--raw).
  const hashed = sc.hash === true || sc.state === true;
  const out = join(OUT, rawMode ? `${name}.${raw.fixture ? 'raw' : 'dbg'}.frames` : `${name}.frames`);
  const hashOut = join(OUT, `${name}.hash`);
  const stateOut = join(OUT, `${name}.state`);
  rmSync(out, { force: true });
  rmSync(hashOut, { force: true });
  rmSync(stateOut, { force: true });
  const dumpRaw = rawMode || !hashed;
  const res = spawnSync(BIN, ['-t', DATA], {
    env: {
      ...process.env,
      HOME: home, XDG_CONFIG_HOME: home, XDG_DATA_HOME: home,
      SDL_VIDEODRIVER: 'dummy', SDL_AUDIODRIVER: 'dummy',
      OT_SEED: '1', OT_MAX_FRAMES: String(sc.maxFrames), OT_FAST: '1',
      OT_KEYS: sc.keys.map((k) => `${k.frame}:${k.scancode}`).join(','),
      ...(dumpRaw ? { OT_DUMP: out } : {}),
      ...(raw.frames !== undefined ? { OT_RAW_FRAMES: raw.frames } : {}),
      ...(raw.every !== undefined ? { OT_RAW_EVERY: raw.every } : {}),
      ...(sc.hash ? { OT_HASH: hashOut } : {}),
      ...(sc.state ? { OT_STATE: stateOut } : {}),
      ...(sc.demo !== undefined ? { OT_DEMO: String(sc.demo) } : {}),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
    timeout: 180_000,
  });
  if (res.status !== 0) throw new Error(`oracle ${name} exited with ${res.status ?? res.signal}`);
  if (dumpRaw && !rawMode) {
    const frames = statSync(out).size / RECORD;
    if (frames !== sc.maxFrames) throw new Error(`oracle ${name}: expected ${sc.maxFrames} frames, got ${frames}`);
    console.log(`oracle ${name}: ${frames} frames -> ${out}`);
  }
  if (rawMode) console.log(`oracle ${name}: ${statSync(out).size / RECORD} raw frames -> ${out}`);
  if (sc.hash) {
    const n = statSync(hashOut).size / 8;
    if (n !== sc.maxFrames) throw new Error(`oracle ${name}: expected ${sc.maxFrames} hashes, got ${n}`);
    console.log(`oracle ${name}: ${n} hashes -> ${hashOut}`);
  }
  if (sc.state) {
    const n = statSync(stateOut).size / 64;
    if (n !== sc.maxFrames) throw new Error(`oracle ${name}: expected ${sc.maxFrames} states, got ${n}`);
    console.log(`oracle ${name}: ${n} states -> ${stateOut}`);
  }
}

const AUDIO_BIN = join(ROOT, 'reference/oracle/audio-render');
const AUDIO_OUT = join(OUT, 'audio');

function runAudio(name: AudioScenarioName): void {
  const sc = AUDIO_SCENARIOS[name];
  const out = join(AUDIO_OUT, `${name}.pcm`);
  rmSync(out, { force: true });
  const res = spawnSync(
    AUDIO_BIN,
    [join(DATA, 'music.mus'), String(sc.song), String(sc.samples), sc.mode, String(sc.musicVolume), String(sc.fadeAt), out],
    { stdio: ['ignore', 'ignore', 'inherit'], timeout: 180_000 },
  );
  if (res.status !== 0) throw new Error(`audio oracle ${name} exited with ${res.status ?? res.signal}`);
  const want = sc.mode === 'voltable' ? 256 * 4 : sc.samples * 2;
  const got = statSync(out).size;
  if (got !== want) throw new Error(`audio oracle ${name}: expected ${want} bytes, got ${got}`);
  console.log(`audio oracle ${name}: ${got} bytes -> ${out}`);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(AUDIO_OUT, { recursive: true });
const argv = process.argv.slice(2);
const flag = (f: string): string | undefined => {
  const i = argv.indexOf(f);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined) throw new Error(`${f} needs a value`);
  argv.splice(i, 2);
  return v;
};
const fixtureIdx = argv.indexOf('--fixture');
if (fixtureIdx >= 0) argv.splice(fixtureIdx, 1);
const rawOpts: RawOpts = { frames: flag('--raw'), every: flag('--raw-every'), fixture: fixtureIdx >= 0 };
const arg = argv[0] ?? 'all';
if (arg === 'all') {
  for (const n of Object.keys(SCENARIOS) as ScenarioName[]) run(n);
  for (const n of Object.keys(AUDIO_SCENARIOS) as AudioScenarioName[]) runAudio(n);
} else if (arg in AUDIO_SCENARIOS) {
  runAudio(arg as AudioScenarioName);
} else if (arg in SCENARIOS) {
  run(arg as ScenarioName, rawOpts);
} else {
  throw new Error(`unknown scenario ${arg}`);
}
