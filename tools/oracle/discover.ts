// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/discover.ts <spec.json> [--no-write]
//
// Turns a list of intended inputs ("press Return when the next screen is idle") into a concrete scenario with
// exact frame numbers, and writes it into the `<discovered>` region of scenarios.ts.
//
// Spec (JSON):
//   { "name": "my-scenario",
//     "steps": [ { "key": 40, "label": "title: New Game", "after": 141 },
//                { "key": 44, "hold": 300, "wait": 60 }, { "mouse": "d", "a": 1 } ],
//     "tail": 10,                       // frames to run after the last input (default 10)
//     "extra": { "hash": true, "state2": true, "saveDump": true, "homeSeed": "...", "dataDir": "..." },
//     "window": 400 }                   // probe length per step (default 400 frames)
//
// Step timing, relative to the previous step's frame P:
//   at: n        frame = n exactly (no probing). For animated screens such as the title menu.
//   wait: n      frame = P + n (no probing), P = the previous step's own frame (not its hold end). For level play, where frames never stop.
//   (default)    probe: run the oracle with the step pending "forever". If the screen blocks, the oracle's idle rule
//                (OT_IDLE_POLLS, see oracle.c) fires the step and logs the last presented frame L: frame = L, the
//                last frame before the block. Otherwise the screen is animating: frame = the first frame >= max(P+1, after)
//                that starts a run of `settle` (default 3) identical per-frame hashes.
//   after: n     lower bound for the frame (the probe/settle search never picks an earlier one).
//   hold: n      key held n frames (keyup after frame + n); the next step's P is frame + hold.
// Steps are "key": scancode (+hold) or "mouse": "m" | "d" | "u" with "a" (and "b" for motion).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, ROOT, runOracle } from './lib';
import type { KeyPress, MouseEvent, Scenario } from './scenarios';

interface Step {
  key?: number; hold?: number; mouse?: 'm' | 'd' | 'u'; a?: number; b?: number;
  at?: number; wait?: number; after?: number; settle?: number; label?: string;
}
interface Spec {
  name: string; steps: Step[]; tail?: number; window?: number;
  extra?: Partial<Pick<Scenario, 'hash' | 'state' | 'state2' | 'saveDump' | 'homeSeed' | 'dataDir' | 'idlePolls'>>;
}

const FAR = 999_999_999;

function readHashes(path: string): number[] {
  const b = readFileSync(path);
  const out: number[] = [];
  for (let p = 0; p + 8 <= b.length; p += 8) out.push(b.readUInt32LE(p + 4));
  return out;
}

function discover(spec: Spec): { keys: KeyPress[]; mouse: MouseEvent[]; maxFrames: number } {
  const keys: KeyPress[] = [];
  const mouse: MouseEvent[] = [];
  const win = spec.window ?? 400;
  const tmp = join(OUT, `discover-${spec.name}`);
  mkdirSync(tmp, { recursive: true });
  const extra = spec.extra ?? {};
  const base = { dataDir: extra.dataDir, homeSeed: extra.homeSeed, idlePolls: extra.idlePolls };
  let prev = 0; // frame of the previous step (+ its hold)
  let last = -1;
  let end = 0; // last frame at which any input (including a key release) happens
  spec.steps.forEach((st, i) => {
    const label = st.label ?? `step ${i}`;
    let frame: number;
    if (st.at !== undefined) {
      frame = st.at;
      console.log(`  ${label}: frame ${frame} (at)`);
    } else if (st.wait !== undefined) {
      frame = Math.max(last, 0) + st.wait;
      console.log(`  ${label}: frame ${frame} (wait)`);
    } else {
      const lo = Math.max(prev, st.after ?? 0);
      const idleLog = join(tmp, 'idle.log');
      const hashPath = join(tmp, 'probe.hash');
      rmSync(idleLog, { force: true });
      const pk = [...keys], pm = [...mouse];
      if (st.key !== undefined) pk.push({ frame: FAR, scancode: st.key });
      else pm.push({ frame: FAR, type: st.mouse ?? 'd', a: st.a ?? 1, b: st.b });
      const probe: Scenario = { ...base, maxFrames: lo + win, keys: pk, mouse: pm, hash: true };
      runOracle(`${spec.name}-probe`, probe, { hash: hashPath, idleLog });
      let L = -1;
      try {
        const lines = readFileSync(idleLog, 'utf8').trim().split('\n').filter(Boolean);
        if (lines.length) L = Number(lines[0]);
      } catch { /* no idle fire */ }
      if (L >= 0 && L >= lo - 0) {
        frame = L;
      } else {
        if (L >= 0) console.log(`  ${label}: idle at ${L} is before lower bound ${lo}; settling instead`);
        const h = readHashes(hashPath);
        const need = st.settle ?? 3;
        frame = -1;
        for (let f = lo; f + need <= h.length; f++) {
          let ok = true;
          for (let k = 1; k < need; k++) if (h[f + k] !== h[f]) { ok = false; break; }
          if (ok) { frame = f; break; }
        }
        if (frame < 0) throw new Error(`${label}: no idle frame found in ${lo}..${lo + win}; give the step "wait" or "after"`);
      }
      console.log(`  ${label}: frame ${frame}${L >= 0 && frame === L ? ' (blocking screen)' : ' (settled)'}`);
    }
    if (st.key !== undefined) keys.push(st.hold ? { frame, scancode: st.key, hold: st.hold } : { frame, scancode: st.key });
    else mouse.push({ frame, type: st.mouse ?? 'd', a: st.a ?? 1, ...(st.b !== undefined ? { b: st.b } : {}) });
    last = frame;
    prev = frame + (st.hold ?? 0);
    end = Math.max(end, prev);
  });
  rmSync(tmp, { recursive: true, force: true });
  // maxFrames: records are written for frames 0..maxFrames-1, so the last input frame needs +1, then the tail.
  return { keys, mouse, maxFrames: end + (spec.tail ?? 10) + 1 };
}

const START = '// <discovered>';
const END = '// </discovered>';

/** JSON with unquoted identifier keys, on one line (valid TS object literal). */
function fmt(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(fmt).join(', ')}]`;
  if (v && typeof v === 'object') {
    return `{ ${Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${k}: ${fmt(x)}`).join(', ')} }`;
  }
  return JSON.stringify(v);
}

export function writeScenario(name: string, sc: Scenario): void {
  const path = join(ROOT, 'tools/oracle/scenarios.ts');
  const src = readFileSync(path, 'utf8');
  const a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error('scenarios.ts has no <discovered> region');
  const head = src.slice(a, src.indexOf('\n', a) + 1);
  const body = src.slice(head.length + a, b);
  const entries = body.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
  const mine = entries.filter((l) => !l.trim().startsWith(`${JSON.stringify(name)}:`));
  const entry = `  ${JSON.stringify(name)}: ${fmt(sc)},`;
  mine.push(entry);
  mine.sort();
  writeFileSync(path, `${src.slice(0, a)}${head}${mine.join('\n')}\n  ${src.slice(b)}`);
}

if (process.argv[1] && process.argv[1].endsWith('discover.ts')) {
  const args = process.argv.slice(2);
  const noWrite = args.includes('--no-write');
  const file = args.find((x) => !x.startsWith('--'));
  if (!file) throw new Error('usage: discover.ts <spec.json> [--no-write]');
  const spec = JSON.parse(readFileSync(file, 'utf8')) as Spec;
  console.log(`discovering ${spec.name}`);
  const r = discover(spec);
  const sc: Scenario = {
    maxFrames: r.maxFrames, keys: r.keys, ...(r.mouse.length ? { mouse: r.mouse } : {}),
    hash: true, state2: true, saveDump: true, ...(spec.extra ?? {}),
  };
  console.log(JSON.stringify(sc));
  if (!noWrite) { writeScenario(spec.name, sc); console.log('written to tools/oracle/scenarios.ts'); }
}
