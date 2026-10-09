// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/run.ts <scenario|all>
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_SCENARIOS, SCENARIOS, type AudioScenarioName, type ScenarioName } from './scenarios';

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
const arg = process.argv[2] ?? 'all';
if (arg === 'all') {
  for (const n of Object.keys(SCENARIOS) as ScenarioName[]) run(n);
  for (const n of Object.keys(AUDIO_SCENARIOS) as AudioScenarioName[]) runAudio(n);
} else if (arg in AUDIO_SCENARIOS) {
  runAudio(arg as AudioScenarioName);
} else if (arg in SCENARIOS) {
  run(arg as ScenarioName);
} else {
  throw new Error(`unknown scenario ${arg}`);
}
