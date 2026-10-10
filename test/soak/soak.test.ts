// SPDX-License-Identifier: GPL-2.0-or-later
// Headless soak (skipped unless SOAK=1): a bot with seeded random held keys plays every level record of every episode in the TS port
// (levels are started directly from a synthetic demo header, the way the Task 3 goldens do, then handed to the bot), and walks every
// episode's script with random keys through its shops, story screens and planet maps.
//
// Asserts: nothing throws (every `unported:` error is a finding, except the dead `]V`/`]R` reveals), no MegaData.oobReads (the C reads
// neighbouring memory there: undefined behaviour), and the shop invariants after every presented frame (cash did not wrap, every item id
// indexes its table).
//
//   SOAK=1 pnpm vitest run test/soak            # defaults: 1 round, 8000 level frames, 6000 script frames per episode
//   SOAK=1 SOAK_ROUNDS=5 SOAK_SEED=7 SOAK_FRAMES=8000 pnpm vitest run test/soak
import { describe, expect, it, vi } from 'vitest';
import { loadAssets } from '../../src/assets';
import { createCtx, type Ctx } from '../../src/ctx';
import { initPlayerData, loadConfigurationDefaults } from '../../src/game/config';
import { initEpisode, scanForEpisodes } from '../../src/game/episodes';
import { levelFrame, levelSetup, loadMap } from '../../src/game/level';
import { OPTION_NUM, PORT_NUM, POWER_NUM, SHIELD_NUM, SHIP_NUM, SPECIAL_NUM, DIFFICULTY_NORMAL, FIRST_LEVEL, type GameWorld } from '../../src/game/world';
import { runGame } from '../../src/game';
import { STORAGE_KEYS, bytesToBase64 } from '../../src/platform/storage';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import { ALL_DEMO_LEVELS, FRONT_PORTS, GENERATORS, SHIELDS, SHIPS, SIDEKICKS, SPECIAL_POOL, demoBytes, type DemoLevel, type DemoLoadout } from '../../tools/oracle/demo-levels';
import { SEEDS, seedRel } from '../../tools/oracle/ts-save';
import { registerPolishSeeds } from '../../tools/oracle/ts-specs-polish';
import { archiveWith } from '../golden/demo-harness';
import { testArchive } from '../helpers/data';
import { Stop } from '../helpers/script-input';

const SOAK = process.env.SOAK === '1';
const ROUNDS = Number(process.env.SOAK_ROUNDS ?? 1);
const SEED = Number(process.env.SOAK_SEED ?? 1);
const LEVEL_FRAMES = Number(process.env.SOAK_FRAMES ?? 8000);
const SCRIPT_FRAMES = Number(process.env.SOAK_SCRIPT_FRAMES ?? 6000);

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UP = 82, DOWN = 81, LEFT = 80, RIGHT = 79, SPACE = 44, RET = 40, LCTRL = 224, LALT = 226, ESC = 41, PGUP = 75, PGDN = 78;
/** The default key settings, with their hold probability per re-roll. */
const LEVEL_KEYS: ReadonlyArray<readonly [sc: number, p: number]> = [[UP, 0.3], [DOWN, 0.3], [LEFT, 0.4], [RIGHT, 0.4], [SPACE, 0.85], [RET, 0.12], [LCTRL, 0.15], [LALT, 0.15]];
const MENU_KEYS = [UP, DOWN, LEFT, RIGHT, RET, RET, SPACE, ESC, PGUP, PGDN];

function newCtx(extra?: Record<string, Uint8Array>): Ctx {
  const ctx = createCtx({
    assets: loadAssets(extra ? archiveWith(testArchive!, extra) : testArchive!), clock: new VirtualClock(), presenter: new NullPresenter(),
    versionString: 'soak', seed: 1,
  });
  ctx.input.outputRect = { w: 640, h: 400 };
  loadConfigurationDefaults(ctx);
  initPlayerData(ctx);
  scanForEpisodes(ctx);
  return ctx;
}

/** Shop / item invariants, checked after every presented frame. Returns a message or null. */
function itemFault(g: GameWorld): string | null {
  const p = g.players[0], it = p.items;
  if (!Number.isInteger(p.cash) || p.cash > 0x7fffffff) return `cash ${p.cash} (wrapped or fractional)`;
  const ids: Array<[string, number, number, number]> = [
    ['front weapon', it.weapon[0].id, 0, PORT_NUM], ['rear weapon', it.weapon[1].id, 0, PORT_NUM],
    ['generator', it.generator, 0, POWER_NUM], ['shield', it.shield, 0, SHIELD_NUM],
    ['special', it.special, 0, SPECIAL_NUM], ['left sidekick', it.sidekick[0], 0, OPTION_NUM], ['right sidekick', it.sidekick[1], 0, OPTION_NUM],
    ['front power', it.weapon[0].power, 0, 11], ['rear power', it.weapon[1].power, 0, 11],
  ];
  for (const [what, v, lo, hi] of ids) if (!Number.isInteger(v) || v < lo || v > hi) return `${what} id ${v} outside ${lo}..${hi}`;
  const ship = it.ship;
  if (!((ship >= 1 && ship <= SHIP_NUM) || (ship > 90 && ship < 256))) return `ship id ${ship}`;
  if (it.weapon[0].id === 0 && g.config.mainLevel !== 0 && !g.config.onePlayerAction) return 'no front weapon';
  return null;
}

function oobReads(g: GameWorld): number {
  return g.map.megaData1.oobReads + g.map.megaData2.oobReads + g.map.megaData3.oobReads;
}

interface Finding { where: string; what: string }
const knownUb: string[] = [];
/** Dead code, intentionally unported: no shipped script uses the `]V` / `]R` reveals. Every other `unported:` error is a finding. */
const DEAD_UNPORTED = /unported: \](V|R) /;
const noteTo = (findings: Finding[]) => (where: string, e: unknown): void => {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (DEAD_UNPORTED.test(msg)) return;
  findings.push({ where, what: msg + (e instanceof Error ? `\n${e.stack}` : '') });
};

function randomLoadout(r: () => number, k: number): DemoLoadout {
  const pick = (n: number): number => Math.floor(r() * n);
  return {
    front: 1 + pick(FRONT_PORTS), rear: r() < 0.15 ? 0 : 1 + pick(FRONT_PORTS), leftSidekick: pick(SIDEKICKS + 1), rightSidekick: pick(SIDEKICKS + 1),
    generator: 1 + pick(GENERATORS), shield: 1 + pick(SHIELDS), special: SPECIAL_POOL[pick(SPECIAL_POOL.length)]!, ship: 1 + pick(SHIPS),
    frontPower: 1 + pick(11), rearPower: 1 + pick(11),
  };
}

/** Plays one level record with the bot until its end or `frames` frames. Returns the frames played and how it ended. */
async function playLevel(lv: DemoLevel, seed: number, frames: number): Promise<{ frames: number; end: string; immortal: boolean }> {
  const r = prng(seed);
  const lo = randomLoadout(r, lv.index);
  const ctx = newCtx({ 'demo.1': demoBytes(lv, lo, 0, [[0, 0]]) });
  const g = ctx.game;
  ctx.state.playDemo = true; // loadMap takes demo.1 (the level record, loadout and song), as in the Task 3 goldens
  g.demo.demoNum = 0;
  const loc = await levelSetup(ctx);
  ctx.state.playDemo = false; // from here on the keyboard drives the ship
  g.demo.demoFile = null;
  g.config.difficultyLevel = 1 + Math.floor(r() * 8); // Easy .. Zinglon
  if (loc === null) throw new Error('levelSetup returned null');

  // two runs in three are immortal (armor and shield refilled each frame) so the bot reaches the late events of the level; the rest can die
  const immortal = r() < 0.67;
  const p0 = g.players[0];
  const held = new Set<number>();
  let n = 0;
  let fault: string | null = null;
  let firstOob = -1;
  ctx.frameSink = () => {
    if (++n % 3 === 0 && r() < 0.35) { // re-roll the held keys every few frames
      for (const [sc, p] of LEVEL_KEYS) {
        const want = r() < p;
        if (want && !held.has(sc)) { held.add(sc); ctx.input.push({ type: 'keydown', scancode: sc, mod: 0 }); }
        else if (!want && held.has(sc)) { held.delete(sc); ctx.input.push({ type: 'keyup', scancode: sc }); }
      }
    }
    if (immortal) { p0.armor = p0.initialArmor; p0.shield = p0.shieldMax; }
    fault ??= itemFault(g);
    if (firstOob < 0 && oobReads(g) > 0) firstOob = n;
    if (n >= frames) throw new Stop();
  };
  let end = 'cap';
  try {
    while ((await levelFrame(ctx, loc)) !== 'end') { /* level_loop */ }
    end = g.varz.endLevel && !g.players[0].isAlive ? 'dead' : 'ended';
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
  expect(fault, `item invariant at ${lv.ep}-${lv.file} frame ${n}`).toBeNull();
  const oob = oobReads(g);
  const msg = `oobReads in episode ${lv.ep} level ${lv.file} (${lv.name.trim()}): ${oob} reads after ${n} frames, the first at frame ${firstOob} (level time ${g.events.curLoc} of ${g.events.eventRec[g.events.maxEvent - 1]!.eventtime} (event ${g.events.eventLoc}/${g.events.maxEvent}), mapYPos ${g.backgrounds.mapYPos}, mapY2Pos ${g.backgrounds.mapY2Pos}, mapY3Pos ${g.backgrounds.mapY3Pos}; per layer ${g.map.megaData1.oobReads}/${g.map.megaData2.oobReads}/${g.map.megaData3.oobReads})`;
  // Known C-undefined case: the level never ended (its boss was not killed), every event is consumed and layer 3 has scrolled to the top
  // of its map; the C then reads the live globals in front of megaData3 as tile pointers (see the note in src/game/backgrounds.ts). Real
  // play ends the level first; the bot does not kill bosses. Reported, not failed. Anything else (layers 1 or 2, or layer 3 while events
  // remain) is a port bug.
  const undefinedInC = oob > 0 && g.map.megaData1.oobReads === 0 && g.map.megaData2.oobReads === 0 && g.events.eventLoc > g.events.maxEvent;
  if (undefinedInC) knownUb.push(msg); else expect(oob, msg).toBe(0);
  return { frames: n, end, immortal };
}

/** Plays episode 1 section 41 (`]e`, `]g`, the ALE galaga level) with random held keys; returns the frames played and the pickup warning count. */
async function playGalaga(seed: number, frames: number): Promise<{ frames: number; end: string; oobPickups: number }> {
  const r = prng(seed);
  const ctx = newCtx();
  initEpisode(ctx, 1);
  ctx.game.config.mainLevel = 41;
  const loc = await levelSetup(ctx);
  if (loc === null) throw new Error('levelSetup returned null');
  if (!ctx.game.config.galagaMode) throw new Error('section 41 did not arm galagaMode');
  const held = new Set<number>();
  let n = 0;
  ctx.frameSink = () => {
    if (++n % 3 === 0 && r() < 0.35) {
      for (const [sc, p] of LEVEL_KEYS) {
        const want = r() < p;
        if (want && !held.has(sc)) { held.add(sc); ctx.input.push({ type: 'keydown', scancode: sc, mod: 0 }); }
        else if (!want && held.has(sc)) { held.delete(sc); ctx.input.push({ type: 'keyup', scancode: sc }); }
      }
    }
    if (n >= frames) throw new Stop();
  };
  let end = 'cap';
  try {
    while ((await levelFrame(ctx, loc)) !== 'end') { /* level_loop */ }
    end = 'ended';
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
  return { frames: n, end, oobPickups: ctx.game.varz.oobPickupReads };
}

/**
 * Starts a whole session (runGame) from a seeded tyrian.sav and drives it with random menu taps and held level keys, so the title,
 * Load Game, the shop and the seeded mode's levels are all reachable. Returns the frames played and the mode flags seen.
 */
async function playSeed(seedPath: string, seed: number, frames: number): Promise<{ frames: number; modes: string[]; oob: number }> {
  const r = prng(seed);
  const ctx = newCtx();
  ctx.storage.set(STORAGE_KEYS.sav, bytesToBase64(SEEDS[seedPath]!()));
  const c = ctx.game.config;
  const modes = new Set<string>();
  const held = new Set<number>();
  const pad = [...LEVEL_KEYS.map(([sc]) => sc), ...MENU_KEYS];
  let n = 0;
  const tap = (): void => {
    const sc = pad[Math.floor(r() * pad.length)]!;
    ctx.input.push({ type: 'keydown', scancode: sc, mod: 0 });
    ctx.input.push({ type: 'keyup', scancode: sc });
  };
  // a screen that waits without presenting frames (e.g. "wait for no key held") gets the held keys released, then a tap
  const sleep = ctx.clock.sleep.bind(ctx.clock);
  ctx.clock.sleep = async (ms: number) => {
    for (const sc of held) ctx.input.push({ type: 'keyup', scancode: sc });
    held.clear();
    if (r() < 0.2) tap();
    return sleep(ms);
  };
  ctx.frameSink = () => {
    if (c.timedBattleMode) modes.add('timed');
    if (c.twoPlayerMode) modes.add('2p');
    if (c.galagaMode) modes.add('galaga');
    if (c.superTyrian) modes.add('superTyrian');
    if (c.onePlayerAction) modes.add('arcade');
    if (++n % 3 === 0 && r() < 0.35) {
      for (const [sc, p] of LEVEL_KEYS) {
        const want = r() < p;
        if (want && !held.has(sc)) { held.add(sc); ctx.input.push({ type: 'keydown', scancode: sc, mod: 0 }); }
        else if (!want && held.has(sc)) { held.delete(sc); ctx.input.push({ type: 'keyup', scancode: sc }); }
      }
    }
    if (r() < 0.04) tap();
    if (n >= frames) throw new Stop();
  };
  try { await runGame(ctx); } catch (e) { if (!(e instanceof Stop)) throw e; }
  return { frames: n, modes: [...modes], oob: oobReads(ctx.game) + ctx.game.varz.oobPickupReads };
}

/** Walks an episode's script from level 1 with random keys: story text, shops (purchases), planet maps; every level is "won" at once. */
async function walkScript(episode: number, seed: number, frames: number): Promise<{ frames: number; visits: number; cashMax: number }> {
  const r = prng(seed);
  const ctx = newCtx();
  const g = ctx.game, c = g.config, p = g.players[0];
  initEpisode(ctx, episode);
  g.items.initialEpisodeNum = episode;
  c.difficultyLevel = c.initialDifficulty = DIFFICULTY_NORMAL;
  c.mainLevel = FIRST_LEVEL;
  p.cash = [10000, 10000, 10000, 10000, 10000][episode - 1] ?? 10000;

  let n = 0, visits = 0, cashMax = p.cash;
  let fault: string | null = null;
  const tap = (): void => {
    const sc = MENU_KEYS[Math.floor(r() * MENU_KEYS.length)]!;
    ctx.input.push({ type: 'keydown', scancode: sc, mod: 0 });
    ctx.input.push({ type: 'keyup', scancode: sc });
  };
  // the idle rule: a screen that blocks without presenting frames still gets keys; the shop and story loops present constantly
  const sleep = ctx.clock.sleep.bind(ctx.clock);
  ctx.clock.sleep = async (ms: number) => { if (r() < 0.2) tap(); return sleep(ms); };
  ctx.frameSink = () => {
    if (r() < 0.08) tap();
    fault ??= itemFault(g);
    cashMax = Math.max(cashMax, p.cash);
    if (++n >= frames) throw new Stop();
  };
  try {
    for (let guard = 0; guard < 400; guard++) {
      await loadMap(ctx); // runs the script from c.mainLevel: text, shops, planet map; returns once a level is chosen (or quit)
      visits++;
      expect(fault, `item invariant in episode ${episode} script at frame ${n}`).toBeNull();
      if (c.mainLevel === 0) { c.mainLevel = FIRST_LEVEL; g.varz.gameLoaded = false; continue; } // "Quit Game": start over
      // the level is won on the spot: income, then on to the next section
      p.cash += Math.floor(r() * 3000);
      c.mainLevel = c.nextLevel;
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
  expect(fault, `item invariant in episode ${episode} script at frame ${n}`).toBeNull();
  return { frames: n, visits, cashMax };
}

(SOAK && testArchive ? describe : describe.skip)('soak (SOAK=1)', () => {
  const warns: string[] = [];
  const findings: Finding[] = [];
  const note = noteTo(findings);
  const noteScript = note;
  it('plays every level of every episode with random held keys', async () => {
    findings.length = 0;
    const spy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.join(' ')); });
    const t0 = Date.now();
    const summary: string[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      for (const lv of ALL_DEMO_LEVELS) {
        const where = `ep${lv.ep} level ${lv.file} (${lv.name.trim()}) round ${round} seed ${SEED + round * 1000 + lv.index}`;
        try {
          const res = await playLevel(lv, SEED + round * 1000 + lv.index, LEVEL_FRAMES);
          summary.push(`${where}: ${res.frames} frames, ${res.end}${res.immortal ? ' (immortal)' : ''}`);
        } catch (e) { note(where, e); }
      }
    }
    spy.mockRestore();
    console.log(`soak levels: ${summary.length} runs ok in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log(summary.join('\n'));
    if (knownUb.length) console.log(`C-undefined (reported, not failed):\n${knownUb.join('\n')}`);
    expect(findings.map((f) => `${f.where}: ${f.what}`)).toEqual([]);
    expect(warns.filter((w) => w.includes('outside the array')).length > 0, 'oobReads warnings only with a known-UB level').toBe(knownUb.length > 0);
  }, 1_800_000);

  it('walks every episode script with random keys (shops, story, planet maps)', async () => {
    findings.length = 0;
    const out: string[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      for (let ep = 1; ep <= 5; ep++) {
        const where = `episode ${ep} script round ${round}`;
        try {
          const res = await walkScript(ep, SEED + round * 100 + ep, SCRIPT_FRAMES);
          out.push(`${where}: ${res.frames} frames, ${res.visits} level starts, max cash ${res.cashMax}`);
        } catch (e) { noteScript(where, e); }
      }
    }
    console.log(out.join('\n'));
    expect(findings.map((f) => `${f.where}: ${f.what}`)).toEqual([]);
  }, 1_800_000);

  it('plays the galaga section (ep1 section 41) with random keys; out-of-range pickups are reported, not failed', async () => {
    findings.length = 0;
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out: string[] = [];
    try {
      for (let round = 0; round < ROUNDS * 4; round++) {
        const where = `galaga round ${round} seed ${SEED + round}`;
        try {
          const res = await playGalaga(SEED + round, LEVEL_FRAMES);
          out.push(`${where}: ${res.frames} frames, ${res.end}${res.oobPickups ? `, WARNING ${res.oobPickups} out-of-range pickup(s) (C UB, modelled as no pickup)` : ''}`);
        } catch (e) { note(where, e); }
      }
    } finally { spy.mockRestore(); }
    console.log(out.join('\n'));
    expect(findings.map((f) => `${f.where}: ${f.what}`)).toEqual([]);
  }, 1_800_000);

  it('plays whole sessions from the polish seeds (ENGAGE, galaga, two-player) with random keys', async () => {
    findings.length = 0;
    registerPolishSeeds();
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out: string[] = [];
    try {
      for (let round = 0; round < ROUNDS * 2; round++) {
        for (const name of ['polish-engage', 'polish-galaga', 'polish-2p']) {
          const where = `${name} round ${round} seed ${SEED + round}`;
          try {
            const res = await playSeed(seedRel(name), SEED + round, LEVEL_FRAMES);
            out.push(`${where}: ${res.frames} frames, modes [${res.modes.join(', ')}]${res.oob ? `, WARNING ${res.oob} out-of-range read(s) (C UB, reported not failed)` : ''}`);
          } catch (e) { note(where, e); }
        }
      }
    } finally { spy.mockRestore(); }
    console.log(out.join('\n'));
    expect(findings.map((f) => `${f.where}: ${f.what}`)).toEqual([]);
  }, 1_800_000);
});
