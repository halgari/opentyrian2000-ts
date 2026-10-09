// SPDX-License-Identifier: GPL-2.0-or-later
import { loadAssets } from '../../src/assets';
import { createCtx, type Ctx } from '../../src/ctx';
import { runGame } from '../../src/game';
import { VirtualClock } from '../../src/platform/clock';
import { NullPresenter } from '../../src/video/presenter';
import { SCENARIOS, type ScenarioName } from '../../tools/oracle/scenarios';
import { testArchive } from '../helpers/data';
import { frameCrc } from '../helpers/hash-frames';
import { STATE_FIELDS, type StateRecord } from '../helpers/state-trace';

class StopScenario extends Error {}

/**
 * The oracle's state record (write_state() in tools/oracle/dump-frames.patch) built from the TS world.
 * Live counts: enemyAvail != 1, shotAvail != 0, enemyShotAvail == 0 (false), explosions with ttl != 0.
 */
export function stateRecord(ctx: Ctx, frame: number): StateRecord {
  const g = ctx.game;
  const p0 = g.players[0];
  let liveEnemies = 0, livePlayerShots = 0, liveEnemyShots = 0, liveExplosions = 0;
  for (const a of g.enemies.enemyAvail) if (a !== 1) liveEnemies++;
  for (const a of g.playerShots.shotAvail) if (a !== 0) livePlayerShots++;
  for (const a of g.enemyShots.enemyShotAvail) if (!a) liveEnemyShots++;
  for (const x of g.explosions.explosions) if (x.ttl !== 0) liveExplosions++;
  const rec: StateRecord = {
    frame, mtCalls: ctx.rng.calls, curLoc: g.events.curLoc, eventLoc: g.events.eventLoc,
    p0x: p0.x, p0y: p0.y, p0shield: p0.shield, p0armor: p0.armor, p0cash: p0.cash,
    enemyOnScreen: g.enemies.enemyOnScreen, liveEnemies, livePlayerShots, liveEnemyShots, liveExplosions,
    backPos: g.backgrounds.backPos, mapY: g.backgrounds.mapY,
  };
  for (const f of STATE_FIELDS) rec[f] = rec[f] >>> 0; // the oracle writes u32
  return rec;
}

/**
 * Runs the TS game through a scenario's keys (like test/golden/harness.ts) and records, per presented frame,
 * the frame CRC (palette || pixels) and the state record. `maxFrames` defaults to the scenario's.
 */
export async function runDemoScenario(
  name: ScenarioName, maxFrames: number = SCENARIOS[name].maxFrames,
): Promise<{ hashes: Uint32Array; states: StateRecord[] }> {
  const scenario = SCENARIOS[name];
  const ctx = createCtx({
    assets: loadAssets(testArchive!), clock: new VirtualClock(), presenter: new NullPresenter(),
    versionString: 'oracle', seed: 1,
  });
  const hashes: number[] = [];
  const states: StateRecord[] = [];
  ctx.frameSink = (screen, palette) => {
    const index = hashes.length;
    hashes.push(frameCrc(palette, screen.pixels));
    states.push(stateRecord(ctx, index));
    for (const k of scenario.keys) {
      if (k.frame === index) {
        ctx.input.push({ type: 'keydown', scancode: k.scancode, mod: 0 });
        ctx.input.push({ type: 'keyup', scancode: k.scancode });
      }
    }
    if (hashes.length >= maxFrames) throw new StopScenario();
  };
  try {
    await runGame(ctx);
  } catch (e) {
    if (!(e instanceof StopScenario)) throw e;
  }
  return { hashes: Uint32Array.from(hashes), states };
}
