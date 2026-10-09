// SPDX-License-Identifier: GPL-2.0-or-later
// Review Focus 4: starting a new game after a game over, or after quitting to the title, without a reload: no world state may leak.
// Two sessions run back to back in one ctx must present the same frames, and reach the same STATE2, as a session run from a fresh ctx.
import { describe, expect, it, vi } from 'vitest';
import { gameLoop } from '../../src/game';
import { loadConfiguration } from '../../src/game/config';
import { scanForEpisodes } from '../../src/game/episodes';
import type { Ctx } from '../../src/ctx';
import { describeData } from '../helpers/data';
import { frameCrc } from '../helpers/hash-frames';
import { installScript, Stop, type ScriptStep } from '../helpers/script-input';
import { sessionCtx, state2Of } from '../helpers/session';
import type { State2Record } from '../helpers/state-trace';

vi.mock('../../src/screens/shop', async (orig) => (await import('../helpers/shop-registry')).shopMock(orig as never));

const RET = 40, ESC = 41, DOWN = 81, SPACE = 44;

/** title -> Full Game -> episode 1 -> Normal -> first shop. */
const TO_SHOP = (ctx0?: (c: Ctx) => void): ScriptStep[] => [
  { sc: RET, onFire: ctx0 }, { sc: RET }, { sc: RET }, { sc: RET },
];

interface Seg { crcs: number[]; states: State2Record[] }

/** Runs `sessions` copies of `session` back to back in one ctx; returns the frames from each session's first key to the next. */
async function run(sessions: number, session: () => ScriptStep[]): Promise<{ segs: Seg[]; ctx: Ctx }> {
  const ctx = sessionCtx(1);
  loadConfiguration(ctx);
  scanForEpisodes(ctx);
  const crcs: number[] = [];
  const states: State2Record[] = [];
  const steps: ScriptStep[] = [];
  const marks: number[] = [];
  for (let s = 0; s < sessions; s++) {
    const body = session();
    // reseed at the title's first key: initPlayerData has drawn already (secretHint), everything after is the session proper
    body[0] = { ...body[0]!, onFire: () => {
      ctx.rng.srand(1);
      // The one carried-over C global that moves the ship: player[0].x/y_friction_ticks are never reset in the C (mainint.c:4030), so a
      // second session in the C process starts with whatever the first left. Normalised here; the C golden of two sessions in one
      // process (session-twice-ep1) pins the real behaviour.
      ctx.game.players[0].xFrictionTicks = 0;
      ctx.game.players[0].yFrictionTicks = 0;
      marks.push(crcs.length);
    } };
    steps.push(...body);
  }
  const run = installScript(ctx, steps, {
    onFrame: (i) => { states.push(state2Of(ctx, i)); },
  });
  const sink = ctx.frameSink!;
  ctx.frameSink = (screen, pal) => { crcs.push(frameCrc(pal, screen.pixels)); sink(screen, pal); };
  try { await gameLoop(ctx); } catch (e) { if (!(e instanceof Stop)) throw e; }
  // STATE2 is compared from the difficulty select on: cash, episode, difficulty, ... keep the previous session's values until
  // newGame assigns them, exactly as in the C (JE_initPlayerData does not touch them)
  const perSession = steps.length / sessions;
  const segs: Seg[] = marks.map((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1]! : crcs.length;
    const from = run.fires[k * perSession + 3]! + 12;
    return { crcs: crcs.slice(m, end), states: states.slice(from, end) };
  });
  return { segs, ctx };
}

/** STATE2 minus the RNG call count (the draw at initPlayerData differs by construction) and minus curMenu bookkeeping. */
const comparable = (s: State2Record): Partial<State2Record> => {
  const { frame: _f, mtCalls: _m, curMenu: _c, ...all } = s;
  const rest: Partial<typeof all> = all;
  // outside a level these keep the previous session's values until the first level loads them (C globals, never reset)
  if (s.levelEnd === 0) { delete rest.nextLevel; delete rest.lvlFileNum; delete rest.p0x; delete rest.p0y; }
  return rest;
};

function expectSame(a: Seg, b: Seg, label: string): void {
  expect(a.crcs.length, `${label}: frame count`).toBe(b.crcs.length);
  const bad = a.crcs.findIndex((c, i) => c !== b.crcs[i]);
  expect(bad, `${label}: first differing frame`).toBe(-1);
  expect(a.states.length, `${label}: state count`).toBe(b.states.length);
  for (let i = 0; i < a.states.length; i++) expect(comparable(a.states[i]!), `${label}: state ${i}`).toEqual(comparable(b.states[i]!));
}

describeData('sessions back to back in one ctx (Review Focus 4)', () => {
  it('quit to the title from the shop, then a second new game: identical to a fresh ctx', async () => {
    const session = (): ScriptStep[] => [...TO_SHOP(), { sc: ESC, after: 12 }, { sc: RET, after: 8 }];
    const { segs } = await run(2, session);
    const fresh = await run(1, session);
    expect(segs).toHaveLength(2);
    expect(fresh.segs[0]!.crcs.length).toBeGreaterThan(60);
    expectSame(segs[0]!, fresh.segs[0]!, 'first session vs fresh');
    expectSame(segs[1]!, fresh.segs[0]!, 'second session vs fresh');
  }, 120000);

  it('game over in level 1 (restore, shop) and quit, then a second session: identical to a fresh ctx', async () => {
    const session = (): ScriptStep[] => {
      let wasAlive = false; // isAlive is also false before the level starts
      const dead = (c: Ctx): boolean => {
        wasAlive = wasAlive || c.game.players[0].isAlive;
        return wasAlive && !c.game.players[0].isAlive && !c.game.varz.firstGameOver;
      };
      return [
      ...TO_SHOP(),
      { sc: DOWN, after: 12 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: DOWN, after: 1 }, { sc: RET, after: 1 }, { sc: RET, after: 4 }, // Next Level -> first planet
      { sc: RET, when: dead },                                                            // any key at the game-over text
      { sc: ESC, after: 60 }, { sc: RET, after: 8 },                                      // restored shop: quit
      ];
    };
    const { segs } = await run(2, session);
    const fresh = await run(1, session);
    expect(segs).toHaveLength(2);
    expect(fresh.segs[0]!.crcs.length).toBeGreaterThan(1300);
    expectSame(segs[1]!, fresh.segs[0]!, 'second session vs fresh');
    expectSame(segs[0]!, fresh.segs[0]!, 'first session vs fresh');
  }, 300000);
});
