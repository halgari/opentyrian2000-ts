import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENARIOS, type Scenario } from '../tools/oracle/scenarios';

const SRC = resolve(__dirname, '../src');
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
const all = files(SRC).map((p) => [p.slice(SRC.length + 1), readFileSync(p, 'utf8')] as const);

describe('source guards', () => {
  it('no TODO(...) task markers remain', () => {
    expect(all.filter(([, t]) => /TODO\(/.test(t)).map(([n]) => n)).toEqual([]);
  });
  it('the only remaining "unported:" throws are the documented ones', () => {
    // Each entry is either a dead script command (no shipped script uses it) or a place where the C reads or writes outside an
    // array (undefined behaviour) and no shipped data reaches it; the soak fails on every one of them except ]V and ]R.
    const allowed = [
      /\]V scroll-down reveal/, /\]R scroll-left reveal/, // dead: no shipped script uses them
      /extraShips/, /custom ship graphic/, // ship ids > 90 index past the C's tables
      /map byte/, /event 16/, /event 61/, /itemAvail\[\]\[10\]/, /itemAvail\[9\]\[10\]/, /mapPlanet\[5\]/, /cubeList\[4\]/, /levelWarningText/,
      /JE_tyrianHalt/, // haltGame is only set by network code, which has no build here
    ];
    const hits = all.flatMap(([n, t]) => t.split('\n').filter((l) => /unported/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/class UnavailableModeError|UnavailableModeError\(/.test(l)).map((l) => `${n}: ${l.trim()}`));
    expect(hits.filter((h) => !allowed.some((re) => re.test(h)))).toEqual([]);
  });
  it('every polish golden scenario records STATE3', () => {
    const polish = Object.entries(SCENARIOS as Record<string, Scenario>).filter(([n]) => n.startsWith('polish-'));
    expect(polish.length).toBeGreaterThan(0);
    expect(polish.filter(([, sc]) => !(sc as { state3?: boolean }).state3).map(([n]) => n)).toEqual([]);
  });
});
