// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { SCENARIOS, type Scenario } from '../../tools/oracle/scenarios';
import type { Ctx } from '../../src/ctx';
import type { InputEvent } from '../../src/platform/input';
import { loadMap } from '../../src/game/level';
import type { ShopState } from '../../src/screens/shop';
import { testCtx } from '../helpers/ctx';
import { ORACLE_DIR } from '../helpers/frames';
import { frameCrc, readHashes } from '../helpers/hash-frames';
import { SHOP_FRAME0, newGameWorld } from '../helpers/shop';
import { readStates2 } from '../helpers/state-trace';

// loadMap calls itemScreen(ctx); the mock hands it a ShopState the test can read (the C's static curMenu)
const captured = vi.hoisted(() => ({ state: null as ShopState | null }));
vi.mock('../../src/screens/shop', async (orig) => {
  const m = await orig<typeof import('../../src/screens/shop')>();
  return { ...m, itemScreen: (ctx: Parameters<typeof m.itemScreen>[0]) => m.itemScreen(ctx, (captured.state = new m.ShopState())) };
});

const SCENARIO_NAMES = ['newgame-ep1-shop-upgrades', 'newgame-ep1-shop-upgrades-mouse'] as const;

class Stop extends Error {}

/**
 * Oracle input injection for a scenario (keys and mouse), including the oracle's idle rule: after OT_IDLE_POLLS (2000) clock
 * sleeps without a presented frame the head pending entry (and all entries with its frame number) fire. wait_noinput after a
 * click blocks until the button-up that way. TS frame i is oracle frame frame0 + i.
 */
function injectOracleInput(ctx: Ctx, sc: Scenario, frame0: number, onFrame: (i: number) => void): number[] {
  type Act = { frame: number; fire(): void };
  const acts: Act[] = [];
  const key = (scancode: number, down: boolean): InputEvent => (down ? { type: 'keydown', scancode, mod: 0 } : { type: 'keyup', scancode });
  for (const k of sc.keys) {
    if (k.frame < frame0) continue;
    acts.push({ frame: k.frame, fire: () => { ctx.input.push(key(k.scancode, true)); if (!k.hold) ctx.input.push(key(k.scancode, false)); } });
    if (k.hold) acts.push({ frame: k.frame + k.hold, fire: () => ctx.input.push(key(k.scancode, false)) });
  }
  let wx = 0, wy = 0; // accumulated window position (the oracle window is 640x400)
  const gx = (): number => Math.trunc(((2 * wx + 1) * 320) / (2 * 640));
  const gy = (): number => Math.trunc(((2 * wy + 1) * 200) / (2 * 400));
  for (const m of sc.mouse ?? []) {
    acts.push({ frame: m.frame, fire: () => {
      if (m.type === 'm') {
        wx += m.a; wy += m.b ?? 0;
        ctx.input.push({ type: 'mousemove', x: gx(), y: gy(), moved: m.a !== 0 || (m.b ?? 0) !== 0, dx: m.a, dy: m.b ?? 0 });
      } else if (m.type === 'd') ctx.input.push({ type: 'mousedown', button: m.a, x: gx(), y: gy() });
      else ctx.input.push({ type: 'mouseup', button: m.a, x: gx(), y: gy() });
    } });
  }
  acts.sort((a, b) => a.frame - b.frame); // stable
  const crcs: number[] = [];
  let idle = 0;
  const sleep = ctx.clock.sleep.bind(ctx.clock);
  ctx.clock.sleep = async (ms: number) => {
    if (++idle >= 2000 && acts.length > 0) {
      idle = 0;
      const head = acts[0]!.frame;
      while (acts.length > 0 && acts[0]!.frame === head) acts.shift()!.fire();
    }
    return sleep(ms);
  };
  ctx.frameSink = (screen, pal) => {
    idle = 0;
    const i = crcs.length;
    crcs.push(frameCrc(pal, screen.pixels));
    onFrame(i);
    while (acts.length > 0 && acts[0]!.frame <= frame0 + i) acts.shift()!.fire();
  };
  return crcs;
}

// The first shop of a new game, driven through Upgrade Ship: front weapon sim (power -/+, other items, buy), rear weapon sim
// (`/` mode key, power, Esc without buying), Ship Specs, and the same with the mouse (item rows, power buttons, Done, a
// sidekick screen with unaffordable rows). TS frame i is oracle frame 220 + i; both sides present a frame per JE_showVGA, so
// every hash and every STATE2 record of the shop session must match (the weapon sim draws starfield and shots from the shared
// MT, so mtCalls checks the RNG order frame by frame).
for (const SCENARIO of SCENARIO_NAMES) {
  const hashes = readHashes(resolve(ORACLE_DIR, `${SCENARIO}.hash`));
  const states = readStates2(resolve(ORACLE_DIR, `${SCENARIO}.state2`));
  const d = testCtx() && hashes && states ? describe : describe.skip;

  d(`golden: shop upgrades and weapon simulator, ${SCENARIO}`, () => {
    it('matches the C hash and STATE2 on every frame', async () => {
      const ctx = newGameWorld();
      const g = ctx.game;
      const last = SCENARIOS[SCENARIO].maxFrames - SHOP_FRAME0;
      const rng0 = ctx.rng.calls;
      const mismatches: string[] = [];
      let simFrames = 0;
      const crcs = injectOracleInput(ctx, SCENARIOS[SCENARIO], SHOP_FRAME0, (i) => {
        const shop = captured.state;
        if (!shop) return;
        const o = states![SHOP_FRAME0 + i]!;
        const p0 = g.players[0];
        const it = p0.items;
        const ts: Record<string, number> = {
          mtCalls: ctx.rng.calls - rng0, cash: p0.cash >>> 0, frontPower: it.weapon[0].power, rearPower: it.weapon[1].power,
          item0: it.weapon[0].id, item1: it.weapon[1].id, item3: it.sidekick[0], item4: it.sidekick[1], item5: it.generator,
          item9: it.shield, item11: it.ship, curMenu: shop.curMenu, gameLoaded: g.varz.gameLoaded ? 1 : 0, armor: p0.armor,
          scratchTemp: g.scratch.temp, scratchTemp2: g.scratch.temp2, scratchTemp3: g.scratch.temp3, scratchTempW: g.scratch.tempW,
        };
        const expected: Record<string, number> = { ...(o as unknown as Record<string, number>), mtCalls: o.mtCalls - states![SHOP_FRAME0]!.mtCalls };
        for (const [k, v] of Object.entries(ts)) if (expected[k] !== v && mismatches.length < 20) mismatches.push(`frame ${SHOP_FRAME0 + i} ${k}: ts ${v} oracle ${expected[k]}`);
        if (shop.curMenu === 4) simFrames++;
        if (i === last - 1) throw new Stop();
      });
      await expect(loadMap(ctx)).rejects.toBeInstanceOf(Stop);
      expect(simFrames).toBeGreaterThan(100); // sat in the upgrade submenus for a long while
      expect(mismatches).toEqual([]);
      expect(crcs).toHaveLength(last);
      const bad: number[] = [];
      for (let i = 0; i < crcs.length; i++) if (crcs[i]!.toString(16) !== hashes![SHOP_FRAME0 + i]!.toString(16)) bad.push(SHOP_FRAME0 + i);
      expect(bad.slice(0, 10)).toEqual([]);
    });
  });
}
