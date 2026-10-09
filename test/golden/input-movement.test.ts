// SPDX-License-Identifier: GPL-2.0-or-later
// Per-frame ship position of the oracle (STATE2 p0x/p0y) vs the TS non-demo input block (keyboard, relative mouse).
// The first ~150 frames of level 1 have no enemies, so the position depends on the input alone: the TS player step is
// driven here with the scenario's events, injected with the oracle's timing (after frame f is presented), from a ship
// placed at the level-start position. Full-pipeline goldens (HASH + STATE2 through the shop) are Task 12's.
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { INPUT_SCENARIOS } from '../../tools/oracle/scenarios-input';
import { OUT } from '../../tools/oracle/lib';
import { loadItemDatIntoWorld } from '../../src/game/episodes';
import { mainGamePlayerFunctions } from '../../src/game/player';
import { getShipInfo } from '../../src/game/shots';
import { defaultKeySettings, defaultMouseSettings } from '../../src/game/world';
import { readStates2 } from '../helpers/state-trace';
import { describeData } from '../helpers/data';
import { testCtx } from '../helpers/ctx';
import { expectSessionMatches, hasOracle } from '../helpers/session';

vi.mock('../../src/screens/shop', async (orig) => (await import('../helpers/shop-registry')).shopMock(orig as never));

const MOVEMENT = ['input-move-fire', 'input-sidekicks', 'input-mouse', 'input-mouse-keys'];
const LIMIT = 500; // frames after which level events (not input) may push the ship

describeData('oracle golden: in-level movement input (p0x/p0y per frame)', () => {
  for (const name of MOVEMENT) {
    const st = readStates2(join(OUT, `${name}.state2`));
    (st ? it : it.skip)(`${name}: ship trace equals the oracle`, () => {
      const states = st!;
      const sc = INPUT_SCENARIOS[name]!;
      const first = states.findIndex((s) => s.levelEnd === 255);
      expect(first).toBeGreaterThan(300);

      const ctx = testCtx()!;
      const g = ctx.game;
      ctx.state.playDemo = false;
      g.config.keySettings.set(defaultKeySettings);
      g.config.mouseSettings.set(defaultMouseSettings);
      loadItemDatIntoWorld(ctx);
      const p = g.players[0];
      p.items.ship = 1; p.items.weapon[0].id = 0; p.items.weapon[1].id = 0;
      getShipInfo(ctx);
      p.isAlive = true; p.x = states[first]!.p0x; p.y = states[first]!.p0y;
      g.config.shotRepeat.fill(0);
      ctx.input.outputRect = { w: 640, h: 400 }; // the oracle's window (measured via the mouse scenarios)
      ctx.input.mouseSetRelative(true);

      // oracle injection: after frame f is presented, every act with frame <= f fires; keys before mouse at equal frames
      type Act = { frame: number; fire(): void };
      const acts: Act[] = [];
      for (const k of sc.keys) {
        acts.push({ frame: k.frame, fire: () => {
          ctx.input.push({ type: 'keydown', scancode: k.scancode, mod: 0 });
          if (!k.hold) ctx.input.push({ type: 'keyup', scancode: k.scancode });
        } });
        if (k.hold) acts.push({ frame: k.frame + k.hold, fire: () => ctx.input.push({ type: 'keyup', scancode: k.scancode }) });
      }
      for (const m of sc.mouse ?? []) {
        acts.push({ frame: m.frame, fire: () => {
          if (m.type === 'm') ctx.input.push({ type: 'mousemove', x: 0, y: 0, moved: true, dx: m.a, dy: m.b ?? 0 });
          else ctx.input.push(m.type === 'd' ? { type: 'mousedown', button: m.a, x: 0, y: 0 } : { type: 'mouseup', button: m.a, x: 0, y: 0 });
        } });
      }
      acts.sort((a, b) => a.frame - b.frame); // stable

      let compared = 0, moved = false;
      for (let f = first; f < Math.min(LIMIT, states.length); f++) {
        if (f > first && (states[f]!.shield < states[f - 1]!.shield || states[f]!.armor < states[f - 1]!.armor)) break; // hit by an enemy
        for (const a of acts) if (a.frame === f - 1) a.fire();
        mainGamePlayerFunctions(ctx);
        expect([p.x, p.y], `${name} frame ${f}`).toEqual([states[f]!.p0x, states[f]!.p0y]);
        if (p.x !== states[first]!.p0x || p.y !== states[first]!.p0y) moved = true;
        compared++;
      }
      expect(compared).toBeGreaterThan(100);
      if (name !== 'input-sidekicks') expect(moved).toBe(true);
    });
  }

  // Full pipeline, boot -> title -> new game -> shop -> level 1 with the scenario's held keys / mouse events: every presented frame
  // must hash like the C's and every STATE2 record (p0x/p0y, armor, shield, cash, levelEnd, ...) must agree.
  const FULL: Record<string, string> = {
    'input-move-fire': 'HASH + STATE2 through the shop: diagonals, cancelling keys, fire taps and a long hold',
    'input-sidekicks': 'sidekick keys and change-fire with fire held',
    'input-mouse': 'relative mouse motion (clamp, truncation) and the three buttons',
    'input-mouse-keys': 'mouse motion and keys stack',
    'input-pause': 'P pauses (the "Paused" frame), Ctrl alone does not resume, Space does; a click resumes the second pause',
    'input-help-f1': 'F1 help overlay and the frame restart',
    'input-esc-menu': 'in-game menu from Esc',
    'input-gamma': 'F11 cycles gamma, palette in the frame hash',
    'input-cheats': 'F2+F3+F4 zeroes armour; F2+F3+F6 toggles back',
    'input-gameover-key': 'game-over wait: a key press ends the level',
    'input-gameover-fire': 'game-over wait: held fire ends the level at once (stale button[0])',
  };
  for (const [name, what] of Object.entries(FULL)) {
    it.skipIf(!hasOracle(name))(`${name}: ${what}`, () => expectSessionMatches(name, INPUT_SCENARIOS[name]!), 120000);
  }
});

describe('input scenarios', () => {
  it('all start with the shop prefix and record HASH + STATE2', () => {
    for (const [name, sc] of Object.entries(INPUT_SCENARIOS)) {
      expect(sc.keys.slice(0, 10), name).toHaveLength(10);
      expect(sc.hash && sc.state2, name).toBe(true);
    }
  });
});
