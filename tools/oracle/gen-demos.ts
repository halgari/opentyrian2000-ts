// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: tsx tools/oracle/gen-demos.ts   (also used by run.ts through ensureLevelDemo)
// Writes test-data/demos/lvl-<ep>-<nn>.demo for every level and, per level, an alternate oracle data dir
// test-data/oracle/data-lvl-<ep>-<nn>/ = symlinks to data/tyrian2000/* with demo.1 -> that demo file.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadItemDat } from '../../src/data/itemdat';
import { analyzeLevel } from '../../src/data/level';
import { ALL_DEMO_LEVELS, buildDemo, demoScenarioName, LONG_DEMO_LEVELS, longScenarioName, SPECIAL_POOL, type DemoLevel } from './demo-levels';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DATA = join(ROOT, 'data/tyrian2000');
export const DEMO_DIR = join(ROOT, 'test-data/demos');
const ORACLE = join(ROOT, 'test-data/oracle');

export const demoPath = (lv: DemoLevel, long = false): string => join(DEMO_DIR, `${long ? longScenarioName(lv.ep, lv.file) : demoScenarioName(lv.ep, lv.file)}.demo`);
export const dataDirRel = (lv: DemoLevel, long = false): string =>
  `test-data/oracle/data-${long ? longScenarioName(lv.ep, lv.file) : demoScenarioName(lv.ep, lv.file)}`;

/** Writes the demo file and the alt data dir for one level (idempotent). `long` = the lvlx-<ep>-<nn> variant. */
export function writeLevelDemo(lv: DemoLevel, long = false): void {
  mkdirSync(DEMO_DIR, { recursive: true });
  const bytes = buildDemo(lv, long);
  const path = demoPath(lv, long);
  if (!existsSync(path) || Buffer.compare(readFileSync(path), bytes) !== 0) writeFileSync(path, bytes);
  const dir = join(ROOT, dataDirRel(lv, long));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(DATA)) {
    if (f === 'demo.1') continue;
    symlinkSync(join(DATA, f), join(dir, f));
  }
  symlinkSync(path, join(dir, 'demo.1'));
}

export function ensureLevelDemo(name: string): void {
  const lv = ALL_DEMO_LEVELS.find((l) => demoScenarioName(l.ep, l.file) === name);
  if (lv) writeLevelDemo(lv);
  const lx = LONG_DEMO_LEVELS.find((l) => longScenarioName(l.ep, l.file) === name);
  if (lx) writeLevelDemo(lx, true);
}

/** Checks that every id in every demo header names a real item of that episode's tables; returns coverage counts. */
function validate(): void {
  const cover = { front: new Set<number>(), rear: new Set<number>(), sk: new Set<number>(), ship: new Set<number>(), shield: new Set<number>(), gen: new Set<number>(), special: new Set<number>() };
  const tables = new Map<number, ReturnType<typeof loadItemDat>>();
  for (const ep of [1, 2, 3, 4, 5]) {
    if (ep <= 3) {
      const hdt = readFileSync(join(DATA, 'tyrian.hdt'));
      tables.set(ep, loadItemDat(new Uint8Array(hdt), hdt.readInt32LE(0)));
    } else {
      const lvl = new Uint8Array(readFileSync(join(DATA, `tyrian${ep}.lvl`)));
      const a = analyzeLevel(lvl);
      tables.set(ep, loadItemDat(lvl, a.lvlPos[a.lvlNum - 1]!));
    }
  }
  const real = (name: string): boolean => name.trim() !== '' && name.trim() !== 'None' && name.trim() !== 'Test';
  for (const lv of ALL_DEMO_LEVELS) {
    const b = buildDemo(lv);
    const t = tables.get(lv.ep)!;
    const [front, rear, left, right, , gen] = [b[12]!, b[13]!, b[15]!, b[16]!, 0, b[17]!];
    const shield = b[21]!, special = b[22]!, ship = b[23]!;
    const bad: string[] = [];
    if (!real(t.weaponPorts[front]!.name)) bad.push(`front ${front}`);
    if (rear !== 0 && !real(t.weaponPorts[rear]!.name)) bad.push(`rear ${rear}`);
    for (const [n, id] of [['left', left], ['right', right]] as const) if (id !== 0 && !real(t.options[id]!.name)) bad.push(`${n} sidekick ${id}`);
    if (!real(t.powerSys[gen]?.name ?? '')) bad.push(`generator ${gen}`);
    if (!real(t.shields[shield]!.name)) bad.push(`shield ${shield}`);
    if (special !== 0 && !real(t.specials[special]!.name)) bad.push(`special ${special}`);
    if (!real(t.ships[ship]!.name)) bad.push(`ship ${ship}`);
    if (bad.length) throw new Error(`${demoScenarioName(lv.ep, lv.file)}: invalid ids: ${bad.join(', ')}`);
    cover.front.add(front); cover.rear.add(rear); cover.sk.add(left); cover.sk.add(right); cover.ship.add(ship);
    cover.shield.add(shield); cover.gen.add(gen); cover.special.add(special);
  }
  const miss = (s: Set<number>, lo: number, hi: number): number[] => { const m: number[] = []; for (let i = lo; i <= hi; i++) if (!s.has(i)) m.push(i); return m; };
  const report = {
    front: miss(cover.front, 1, 47), rear: miss(cover.rear, 1, 47), sidekick: miss(cover.sk, 0, 32), ship: miss(cover.ship, 1, 18),
    shield: miss(cover.shield, 1, 11), generator: miss(cover.gen, 1, 6), special: SPECIAL_POOL.filter((i) => !cover.special.has(i)),
  };
  for (const [k, v] of Object.entries(report)) if (v.length) throw new Error(`loadout coverage gap in ${k}: ${v.join(',')}`);
  console.log('loadout coverage: all front 1-47, rear 1-47, sidekicks 0-32, ships 1-18, shields 1-11, generators 1-6, specials: the 27 with a HUD icon');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(ORACLE, { recursive: true });
  validate();
  for (const lv of ALL_DEMO_LEVELS) writeLevelDemo(lv);
  for (const lv of LONG_DEMO_LEVELS) writeLevelDemo(lv, true);
  const sizes = ALL_DEMO_LEVELS.map((lv) => lstatSync(demoPath(lv)).size);
  console.log(`wrote ${ALL_DEMO_LEVELS.length} demos (${Math.min(...sizes)}..${Math.max(...sizes)} bytes) to ${DEMO_DIR}`);
}
