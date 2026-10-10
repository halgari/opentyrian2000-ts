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
import { STATE2_FIELDS, STATE3_FIELDS, readStates2, readStates3, type State2Field, type State2Record, type State3Record } from './state-trace';

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

/** The TS counterpart of write_state3 (player 2, the mode flags, galaga / timer globals). */
export function state3Of(ctx: Ctx, frame: number): State3Record {
  const g = ctx.game, c = g.config, v = g.varz;
  const p1 = g.players[1];
  return {
    frame, p1x: p1.x >>> 0, p1y: p1.y >>> 0, p1armor: p1.armor >>> 0, p1shield: p1.shield >>> 0, p1cash: p1.cash >>> 0, p1alive: p1.isAlive ? 1 : 0,
    flags: ((c.twoPlayerMode ? 1 : 0) | (c.twoPlayerLinked ? 2 : 0) | (c.galagaMode ? 4 : 0) | (c.timedBattleMode ? 8 : 0) |
      (c.onePlayerAction ? 16 : 0) | (c.superTyrian ? 32 : 0) | (c.superArcadeMode << 8)) >>> 0,
    linkGunDirecBits: new Uint32Array(new Float32Array([c.linkGunDirec]).buffer)[0]!,
    galagaLife: v.galagaLife >>> 0, galagaShotFreq: v.galagaShotFreq >>> 0, levelTimerCountdown: v.levelTimerCountdown >>> 0,
    p1frontId: p1.items.weapon[0].id, p1frontPower: p1.items.weapon[0].power, p1rearId: p1.items.weapon[1].id, p1ship: p1.items.ship,
  };
}

export interface SessionResult { ctx: Ctx; crcs: number[]; states: State2Record[]; states3: State3Record[] }

/** Runs `runGame` for `sc.maxFrames` presented frames. */
export async function runSession(sc: Scenario, ctx: Ctx = sessionCtx(), frame0 = 0): Promise<SessionResult> {
  shopRegistry.current = null;
  shopRegistry.visits = 0;
  const states: State2Record[] = [];
  const states3: State3Record[] = [];
  let lastShop: ShopState | null = null;
  const crcs = injectOracleInput(ctx, sc, frame0, frameCrc, (i) => {
    const rec = state2Of(ctx, frame0 + i);
    // the C's curMenu is a static that keeps its old value until a shop's prologue assigns FULL_GAME, after the first presented frame
    // of the visit; a fresh ShopState starts at FULL_GAME, so that one frame is not comparable (marked -999)
    if (shopRegistry.current !== lastShop) { lastShop = shopRegistry.current; if (frame0 + i > 0) rec.curMenu = -999; }
    states.push(rec);
    states3.push(state3Of(ctx, frame0 + i));
    if (crcs.length >= sc.maxFrames - frame0) throw new Stop();
  });
  try {
    await runGame(ctx);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
  return { ctx, crcs, states, states3 };
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

/** First differing STATE3 field per frame, up to `max` reports. */
export function diffStates3(ts: State3Record[], oracle: State3Record[], max = 12): string[] {
  const out: string[] = [];
  const n = Math.min(ts.length, oracle.length);
  for (let i = 0; i < n && out.length < max; i++) {
    for (const f of STATE3_FIELDS) {
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
export function diffSaves(ctx: Ctx, dir: string, required = false): string[] {
  const out: string[] = [];
  const cSavPath = resolve(dir, 'tyrian.sav'), cCfgPath = resolve(dir, 'tyrian.cfg');
  // a regeneration that failed to dump must not turn the BYTES assertion into a no-op
  if (required && !existsSync(cSavPath)) out.push(`oracle save dump missing: ${cSavPath}`);
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
  const states3 = sc.state3 ? readStates3(resolve(ORACLE_DIR, `${name}.state3`)) : null;
  if (!hashes || !states || (sc.state3 && !states3)) throw new Error(`oracle files for ${name} are missing: run pnpm oracle:run ${name}`);
  const ctx = sessionCtx();
  opts.setup?.(ctx);
  const r = await runSession(sc, ctx);
  expect(r.crcs).toHaveLength(sc.maxFrames);
  expect(states.length, 'oracle .state2 is truncated or from another run').toBe(r.states.length);
  expect(diffStates(r.states, states)).toEqual([]);
  if (states3) {
    expect(states3.length, 'oracle .state3 is truncated or from another run').toBe(r.states3.length);
    expect(diffStates3(r.states3, states3)).toEqual([]);
  }
  expect(firstHashMismatch(r.crcs, hashes)).toBe(-1);
  if (sc.saveDump) expect(diffSaves(r.ctx, resolve(ORACLE_DIR, `${name}.save`), true)).toEqual([]);
  opts.inspect?.(r);
}

/**
 * Whether the golden tests run: true when the oracle directory exists at all. A scenario whose files are missing from an existing
 * directory is then a failure (expectSessionMatches), not a skip, so a lost golden cannot hide as one more "skipped".
 * `name` is only documentation here.
 */
export function hasOracle(_name: string): boolean {
  return existsSync(ORACLE_DIR);
}

/** The oracle files `name` must have (HASH, STATE2 and, when the scenario dumps the saves, tyrian.sav; tyrian.cfg is not written by every scenario). */
export function missingOracleFiles(name: string, sc: Scenario): string[] {
  const files = [`${name}.hash`, `${name}.state2`];
  if (sc.state3) files.push(`${name}.state3`);
  if (sc.saveDump) files.push(`${name}.save/tyrian.sav`);
  return files.filter((f) => !existsSync(resolve(ORACLE_DIR, f)));
}
