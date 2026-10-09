// SPDX-License-Identifier: GPL-2.0-or-later
// Whole-session driver for the oracle goldens: runGame from boot with the scenario's injected input (oracle idle rule), recording
// the CRC and the STATE2 record of every presented frame, then stopping after maxFrames.
import { existsSync, readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { resolve } from 'node:path';
import { loadAssets } from '../../src/assets';
import { decryptSaveTemp, readStoredCfg, readStoredSav } from '../../src/game/save';
import { createCtx, type Ctx } from '../../src/ctx';
import { runGame } from '../../src/game';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import type { Scenario } from '../../tools/oracle/scenarios';
import type { ShopState } from '../../src/screens/shop';
import { shopMock, shopRegistry } from './shop-registry';
import { testArchive } from './data';
import { ORACLE_DIR } from './frames';
import { frameCrc, readHashes } from './hash-frames';
import { Stop, injectOracleInput } from './inject';
import { STATE2_FIELDS, readStates2, type State2Field, type State2Record } from './state-trace';

export { shopRegistry, shopMock };

export function sessionCtx(seed = 1): Ctx {
  const ctx = createCtx({ assets: loadAssets(testArchive!), clock: new VirtualClock(), presenter: new NullPresenter(), versionString: 'oracle', seed });
  ctx.input.outputRect = { w: 640, h: 400 }; // the oracle's window
  return ctx;
}

/** The TS counterpart of write_state2 (curMenu is filled in by the caller). */
export function state2Of(ctx: Ctx, frame: number): State2Record {
  const g = ctx.game, c = g.config, v = g.varz;
  const p = g.players[0];
  const it = p.items;
  const r: Record<State2Field, number> = {
    frame, mtCalls: ctx.rng.calls, cash: p.cash >>> 0, frontPower: it.weapon[0].power, rearPower: it.weapon[1].power,
    item0: it.weapon[0].id, item1: it.weapon[1].id, item2: it.superArcadeMode, item3: it.sidekick[0], item4: it.sidekick[1],
    item5: it.generator, item6: it.sidekickLevel, item7: it.sidekickSeries, item8: g.items.initialEpisodeNum, item9: it.shield,
    item10: it.special, item11: it.ship,
    mainLevel: c.mainLevel, nextLevel: c.nextLevel, saveLevel: c.saveLevel, episodeNum: g.items.episodeNum, difficultyLevel: c.difficultyLevel,
    levelEnd: v.levelEnd >>> 0, endLevel: v.endLevel ? 1 : 0, reallyEndLevel: v.reallyEndLevel ? 1 : 0, gameLoaded: v.gameLoaded ? 1 : 0,
    curMenu: shopRegistry.current?.curMenu ?? 0, lvlFileNum: v.lvlFileNum, armor: p.armor, shield: p.shield,
    scratchTemp: g.scratch.temp, scratchTemp2: g.scratch.temp2, scratchTemp3: g.scratch.temp3, scratchTempW: g.scratch.tempW,
    p0x: p.x, p0y: p.y,
  };
  return r as State2Record;
}

export interface SessionResult { ctx: Ctx; crcs: number[]; states: State2Record[] }

/** Runs `runGame` for `sc.maxFrames` presented frames. */
export async function runSession(sc: Scenario, ctx: Ctx = sessionCtx(), frame0 = 0): Promise<SessionResult> {
  shopRegistry.current = null;
  shopRegistry.visits = 0;
  const states: State2Record[] = [];
  let lastShop: ShopState | null = null;
  const crcs = injectOracleInput(ctx, sc, frame0, frameCrc, (i) => {
    const rec = state2Of(ctx, frame0 + i);
    // the C's curMenu is a static that keeps its old value until a shop's prologue assigns FULL_GAME, after the first presented frame
    // of the visit; a fresh ShopState starts at FULL_GAME, so that one frame is not comparable (marked -999)
    if (shopRegistry.current !== lastShop) { lastShop = shopRegistry.current; if (frame0 + i > 0) rec.curMenu = -999; }
    states.push(rec);
    if (crcs.length >= sc.maxFrames - frame0) throw new Stop();
  });
  try {
    await runGame(ctx);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
  return { ctx, crcs, states };
}

/** First differing STATE2 field per frame, up to `max` reports (curMenu -999 and fields in `skip` are ignored). */
export function diffStates(ts: State2Record[], oracle: State2Record[], skip: readonly State2Field[] = [], max = 12): string[] {
  const out: string[] = [];
  const n = Math.min(ts.length, oracle.length);
  for (let i = 0; i < n && out.length < max; i++) {
    for (const f of STATE2_FIELDS) {
      if (skip.includes(f) || (f === 'curMenu' && ts[i]!.curMenu === -999)) continue;
      if (ts[i]![f] !== oracle[i]![f]) { out.push(`frame ${i} ${f}: ts ${ts[i]![f]} oracle ${oracle[i]![f]}`); break; }
    }
  }
  return out;
}

export function firstHashMismatch(crcs: number[], hashes: Uint32Array): number {
  for (let i = 0; i < crcs.length; i++) if ((crcs[i]! >>> 0) !== hashes[i]) return i;
  return -1;
}

/**
 * The user-directory files after a run versus the oracle's OT_SAVEDUMP: tyrian.sav (record by record, decrypted: an early difference
 * would smear over the rest of the encrypted image; the timed-battle tail raw) and tyrian.cfg. Returns the differences.
 */
export function diffSaves(ctx: Ctx, dir: string): string[] {
  const out: string[] = [];
  const cSavPath = resolve(dir, 'tyrian.sav'), cCfgPath = resolve(dir, 'tyrian.cfg');
  if (existsSync(cSavPath)) {
    const cSav = new Uint8Array(readFileSync(cSavPath));
    const tsSav = readStoredSav(ctx);
    if (!tsSav) return ['TS wrote no tyrian.sav'];
    if (tsSav.length !== cSav.length) out.push(`sav length ts ${tsSav.length} c ${cSav.length}`);
    const plain = (b: Uint8Array): Uint8Array => { const x = b.slice(0, 2502); decryptSaveTemp(x); return x; };
    const tp = plain(tsSav), cp = plain(cSav);
    for (let i = 0; i < 2498 && out.length < 20; i++) if (tp[i] !== cp[i]) out.push(`sav record ${Math.floor(i / 109)} +${i % 109} (byte ${i}): ts ${tp[i]} c ${cp[i]}`);
    for (let i = 2502; i < Math.min(tsSav.length, cSav.length) && out.length < 20; i++) if (tsSav[i] !== cSav[i]) out.push(`sav tail byte ${i}: ts ${tsSav[i]} c ${cSav[i]}`);
  }
  if (existsSync(cCfgPath)) {
    const cCfg = new Uint8Array(readFileSync(cCfgPath));
    const tsCfg = readStoredCfg(ctx);
    if (!tsCfg || !Buffer.from(tsCfg).equals(Buffer.from(cCfg))) out.push('tyrian.cfg differs');
  }
  return out;
}

export interface SessionMatchOpts {
  /** Seed the TS storage (e.g. a save file the C will also read) before the run. */
  setup?: (ctx: Ctx) => void;
  /** Called after the run with the result (extra assertions). */
  inspect?: (r: SessionResult) => void;
}

/**
 * The shared golden assertion: `name`'s oracle files exist (else returns false = skip), the TS session matches HASH on every frame,
 * STATE2 on every frame and, when the scenario dumps them, the saved files. Throws a vitest assertion error otherwise.
 */
export async function expectSessionMatches(
  name: string, sc: Scenario, opts: SessionMatchOpts = {},
): Promise<void> {
  const hashes = readHashes(resolve(ORACLE_DIR, `${name}.hash`));
  const states = readStates2(resolve(ORACLE_DIR, `${name}.state2`));
  if (!hashes || !states) throw new Error(`oracle files for ${name} are missing: run pnpm oracle:run ${name}`);
  const ctx = sessionCtx();
  opts.setup?.(ctx);
  const r = await runSession(sc, ctx);
  expect(r.crcs).toHaveLength(sc.maxFrames);
  expect(diffStates(r.states, states)).toEqual([]);
  expect(firstHashMismatch(r.crcs, hashes)).toBe(-1);
  if (sc.saveDump) expect(diffSaves(r.ctx, resolve(ORACLE_DIR, `${name}.save`))).toEqual([]);
  opts.inspect?.(r);
}

/** True when the oracle files of `name` exist (golden tests skip otherwise). */
export function hasOracle(name: string): boolean {
  return existsSync(resolve(ORACLE_DIR, `${name}.hash`)) && existsSync(resolve(ORACLE_DIR, `${name}.state2`));
}
