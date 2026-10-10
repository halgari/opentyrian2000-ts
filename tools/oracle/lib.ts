// SPDX-License-Identifier: GPL-2.0-or-later
// Runs the patched C oracle for one scenario. Shared by run.ts and discover.ts.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from './scenarios';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const BIN = process.env.OT_ORACLE_BIN ?? join(ROOT, 'reference/oracle/opentyrian2000');
export const DATA = join(ROOT, 'data/tyrian2000');
export const OUT = join(ROOT, 'test-data/oracle');

export const keysEnv = (sc: Pick<Scenario, 'keys'>): string =>
  sc.keys.map((k) => (k.hold ? `${k.frame}:${k.scancode}:${k.hold}` : `${k.frame}:${k.scancode}`)).join(',');
export const textEnv = (sc: Pick<Scenario, 'text'>): string =>
  (sc.text ?? []).map((t) => `${t.frame}:${t.scancode}:${t.char.charCodeAt(0)}`).join(',');
export const mouseEnv = (sc: Pick<Scenario, 'mouse'>): string =>
  (sc.mouse ?? []).map((m) => `${m.frame}:${m.type}:${m.a}${m.type === 'm' ? `:${m.b ?? 0}` : ''}`).join(',');

export interface OraclePaths {
  /** raw frames (OT_DUMP) or undefined */ dump?: string;
  hash?: string; state?: string; state2?: string; state3?: string; saveDump?: string; idleLog?: string;
  rawFrames?: string; rawEvery?: string;
}

/** Runs the oracle in a fresh HOME. Throws on a non-zero exit. */
export function runOracle(name: string, sc: Scenario, paths: OraclePaths, timeoutMs = 180_000): void {
  const home = join(OUT, `home-${name}`);
  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  if (sc.homeSeed !== undefined) {
    // XDG_CONFIG_HOME=home -> the game's user dir is <home>/opentyrian2000
    mkdirSync(join(home, 'opentyrian2000'), { recursive: true });
    copyFileSync(join(ROOT, sc.homeSeed), join(home, 'opentyrian2000', 'tyrian.sav'));
  }
  if (paths.saveDump) rmSync(paths.saveDump, { recursive: true, force: true });
  const res = spawnSync(BIN, ['-t', sc.dataDir !== undefined ? join(ROOT, sc.dataDir) : DATA], {
    env: {
      ...process.env,
      HOME: home, XDG_CONFIG_HOME: home, XDG_DATA_HOME: home,
      SDL_VIDEODRIVER: 'dummy', SDL_AUDIODRIVER: 'dummy',
      OT_SEED: '1', OT_MAX_FRAMES: String(sc.maxFrames), OT_FAST: '1',
      OT_KEYS: keysEnv(sc), OT_MOUSE: mouseEnv(sc), OT_TEXT: textEnv(sc),
      ...(sc.idlePolls !== undefined ? { OT_IDLE_POLLS: String(sc.idlePolls) } : {}),
      ...(paths.dump ? { OT_DUMP: paths.dump } : {}),
      ...(paths.rawFrames !== undefined ? { OT_RAW_FRAMES: paths.rawFrames } : {}),
      ...(paths.rawEvery !== undefined ? { OT_RAW_EVERY: paths.rawEvery } : {}),
      ...(paths.hash ? { OT_HASH: paths.hash } : {}),
      ...(paths.state ? { OT_STATE: paths.state } : {}),
      ...(paths.state2 ? { OT_STATE2: paths.state2 } : {}),
      ...(paths.state3 ? { OT_STATE3: paths.state3 } : {}),
      ...(paths.saveDump ? { OT_SAVEDUMP: paths.saveDump } : {}),
      ...(paths.idleLog ? { OT_IDLELOG: paths.idleLog } : {}),
      ...(sc.demo !== undefined ? { OT_DEMO: String(sc.demo) } : {}),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
    timeout: timeoutMs,
  });
  if (res.status !== 0) throw new Error(`oracle ${name} exited with ${res.status ?? res.signal}`);
}
