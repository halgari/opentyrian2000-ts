// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/survive.ts <ep>-<file> <goalCurLoc> [segLen=120] [candidates=24]
// Greedy search for a key stream that keeps the ship alive up to curLoc `goalCurLoc` (the TS port is bit-exact with the C on
// the synthetic demos, so the stream survives in the oracle too). Each segment tries `candidates` seeded random leg sets,
// replays prefix+segment in a worker pool and keeps the best survivor. Prints the base64 legs for tools/oracle/long-keys.ts
// and merges them into that file.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { loadAssets } from '../../src/assets';
import { createCtx } from '../../src/ctx';
import { DataArchive } from '../../src/data/archive';
import { runGame } from '../../src/game';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import { archiveWith } from '../../test/golden/demo-harness';
import {
  ALL_DEMO_LEVELS, decodeLegs, demoBytes, encodeLegs, keyLegs, keyLegsSafe, longLoadoutFor, longScenarioName, type DemoLevel,
} from './demo-levels';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DATA = join(ROOT, 'data/tyrian2000');

class Stop extends Error {}

interface SimJob { ep: number; file: number; demo: Uint8Array; stopRel: number }
interface SimResult { aliveFor: number; armor: number; shield: number; maxLoc: number; levelFrames: number; killed: number }

function loadBase(): DataArchive {
  const files = new Map<string, Uint8Array>();
  for (const name of readdirSync(DATA)) files.set(name, new Uint8Array(readFileSync(join(DATA, name))));
  return new DataArchive(files);
}

async function simulate(base: DataArchive, job: SimJob): Promise<SimResult> {
  const ctx = createCtx({
    assets: loadAssets(archiveWith(base, { 'demo.1': job.demo })), clock: new VirtualClock(), presenter: new NullPresenter(),
    versionString: 'oracle', seed: 1,
  });
  ctx.game.demo.demoNum = 0;
  let n = 0, startF = -1, aliveFor = -1, maxLoc = 0, lastRel = 0;
  const g = ctx.game;
  ctx.frameSink = () => {
    for (const f of [141, 142, 143, 144, 145]) if (n === f) { ctx.input.push({ type: 'keydown', scancode: 81, mod: 0 }); ctx.input.push({ type: 'keyup', scancode: 81 }); }
    if (n === 146) { ctx.input.push({ type: 'keydown', scancode: 40, mod: 0 }); ctx.input.push({ type: 'keyup', scancode: 40 }); }
    const mine = g.items.episodeNum === job.ep && g.varz.lvlFileNum === job.file && ctx.state.playDemo && g.events.maxEvent > 0;
    if (mine) {
      if (startF < 0) startF = n;
      lastRel = n - startF;
      maxLoc = Math.max(maxLoc, g.events.curLoc);
      if (aliveFor < 0 && !g.players[0].isAlive && g.events.curLoc > 0) aliveFor = lastRel;
      if (lastRel >= job.stopRel) throw new Stop();
    } else if (startF >= 0) throw new Stop(); // the level is over
    n++;
    if (n > 40000) throw new Stop();
  };
  try { await runGame(ctx); } catch (e) { if (!(e instanceof Stop)) throw e; }
  const p = g.players[0];
  const levelOver = lastRel < job.stopRel;
  return { aliveFor: aliveFor >= 0 ? aliveFor : levelOver ? lastRel : Number.MAX_SAFE_INTEGER, armor: p.armor, shield: p.shield, maxLoc, levelFrames: lastRel, killed: g.enemies.enemyKilled };
}

if (!isMainThread) {
  const base = loadBase();
  parentPort!.on('message', async (m: { id: number; job: SimJob }) => {
    parentPort!.postMessage({ id: m.id, res: await simulate(base, m.job) });
  });
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}

async function main(): Promise<void> {
  const [which, goalStr, segStr, candStr] = process.argv.slice(2);
  const [ep, file] = which!.split('-').map(Number) as [number, number];
  const goal = Number(goalStr), segLen = Number(segStr ?? 120), K = Number(candStr ?? 24);
  const lv = ALL_DEMO_LEVELS.find((l) => l.ep === ep && l.file === file)!;
  const lo = longLoadoutFor(lv);
  const nw = Math.min(cpus().length - 2, K);
  const pool = Array.from({ length: nw }, () => new Worker(fileURLToPath(import.meta.url), { workerData: {} , execArgv: process.execArgv }));
  const waiting = new Map<number, (r: SimResult) => void>();
  pool.forEach((w) => w.on('message', (m: { id: number; res: SimResult }) => waiting.get(m.id)!(m.res)));
  let nextId = 0, rr = 0;
  const run = (job: SimJob): Promise<SimResult> => new Promise((res) => { const id = nextId++; waiting.set(id, res); pool[rr++ % nw]!.postMessage({ id, job }); });

  let legs: Array<[number, number]> = [];
  const segs: Array<Array<[number, number]>> = []; // the chosen segments, so a dead end can backtrack
  let frames = 0;
  let seed = 1;
  const M = 6;
  const t0 = Date.now();
  const candidate = (c: number): Array<[number, number]> => {
    const s = ep * 1000003 + file * 7919 + seed++ * 104729;
    const style = c % 3;
    return style === 0 ? keyLegsSafe(s, segLen) : style === 1 ? keyLegs(s, segLen) : ([[16 | [0, 4, 8, 1, 2][s % 5]!, segLen]] as Array<[number, number]>); // fire + one drift direction
  };
  let reached = 0;
  let fails = 0;
  while (reached < goal) {
    // two-level search: a candidate segment is scored by how many random continuations of one more segment survive
    const cands = Array.from({ length: K }, (_, c) => candidate(c));
    const jobs: Array<{ ci: number; p: Promise<SimResult> }> = [];
    for (let ci = 0; ci < cands.length; ci++) {
      for (let m = 0; m < M; m++) {
        const cont = candidate(ci + m);
        jobs.push({ ci, p: run({ ep, file, demo: demoBytes(lv, lo, 0, mergeLegs([...legs, ...cands[ci]!, ...cont, [16, 90]])), stopRel: frames + 2 * segLen }) });
      }
    }
    const res = await Promise.all(jobs.map((j) => j.p));
    const score = new Array<number>(K).fill(0), loc = new Array<number>(K).fill(0);
    res.forEach((r, i) => {
      const ci = jobs[i]!.ci;
      if (r.aliveFor >= frames + 2 * segLen) { score[ci]! += 1000 + r.armor * 4 + r.shield + r.killed * 30; loc[ci] = Math.max(loc[ci]!, r.maxLoc); }
    });
    let bi = 0;
    for (let i = 1; i < K; i++) if (score[i]! > score[bi]!) bi = i;
    if (score[bi]! === 0) {
      fails++;
      console.error(`no survivor at level frame ${frames} (fail ${fails})`);
      if (fails >= 3 && segs.length > 0) { segs.pop(); legs = mergeLegs(segs.flat()); frames -= segLen; fails = 0; console.error(`backtrack to ${frames}`); }
      if (Date.now() - t0 > 3 * 3600_000) throw new Error('giving up');
      continue;
    }
    fails = 0;
    segs.push(cands[bi]!);
    legs = mergeLegs(segs.flat());
    frames += segLen;
    reached = Math.max(reached, loc[bi]!);
    console.error(`frames ${frames} curLoc ${loc[bi]} score ${score[bi]} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  legs = mergeLegs([...legs, [16, 150]]); // a little tail so the level can play out
  // merge with the file as it is now (several searches may run at once)
  const cur: Record<string, string> = {};
  for (const m of readFileSync(join(ROOT, 'tools/oracle/long-keys.ts'), 'utf8').matchAll(/'([^']+)': '([^']+)'/g)) cur[m[1]!] = m[2]!;
  const out = { ...cur, [longScenarioName(ep, file)]: encodeLegs(legs) };
  const lines = Object.entries(out).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `  '${k}': '${v}',`);
  writeFileSync(join(ROOT, 'tools/oracle/long-keys.ts'), `// SPDX-License-Identifier: GPL-2.0-or-later\n// Generated by tools/oracle/survive.ts: key legs (keys u8, wait u16 BE; base64) of the long demos.\nexport const LONG_KEYS: Record<string, string> = {\n${lines.join('\n')}\n};\n`);
  for (const w of pool) void w.terminate();
  process.exit(0);
}

function mergeLegs(legs: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [k, w] of legs) {
    const last = out[out.length - 1];
    if (last && last[0] === k) last[1] += w; else out.push([k, w]);
  }
  return out;
}
