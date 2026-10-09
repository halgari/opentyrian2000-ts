// SPDX-License-Identifier: GPL-2.0-or-later
import type { Ctx } from '../../src/ctx';

/**
 * A key script that does not depend on absolute frame numbers (for sessions that start mid-run): the head step fires when
 *  - `when(ctx)` is true, or
 *  - `after` presented frames have passed since the previous step fired (animated screens), or
 *  - the screen has been idle (no frame) for `idleLimit` clock sleeps (blocking menus; the title screen plays its demo after
 *    30 s = 1875 sleeps of 16 ms, so the limit must stay below that).
 * A step with `when` set waits for it only (never idle-fires).
 */
export interface ScriptStep { sc: number; /** a typed printable character: key down, SDL_TEXTINPUT, key up (OT_TEXT) */ ch?: string; /** scenario authoring only: the key is meant for the oracle's idle rule (frame = frames presented, not the last one) */ idle?: boolean; hold?: number; after?: number; when?: (ctx: Ctx) => boolean; onFire?: (ctx: Ctx) => void }

export class Stop extends Error {}

export interface ScriptRun {
  frames: number;       // presented frames so far
  fires: number[];      // frame count at which each step fired
  stopAfterIdle: number; // consecutive idle sleeps with an exhausted script that end the run
}

export function installScript(
  ctx: Ctx, steps: ScriptStep[], opts: { idleLimit?: number; stopIdle?: number; onFrame?: (i: number) => void; maxFrames?: number } = {},
): ScriptRun {
  const idleLimit = opts.idleLimit ?? 1000;
  const run: ScriptRun = { frames: 0, fires: [], stopAfterIdle: opts.stopIdle ?? 1500 };
  const queue = [...steps];
  const releases: { at: number; sc: number }[] = [];
  let idle = 0;
  let sinceFire = 0;
  const fire = (): void => {
    const s = queue.shift()!;
    s.onFire?.(ctx);
    ctx.input.push({ type: 'keydown', scancode: s.sc, mod: 0 });
    if (s.ch !== undefined) ctx.input.push({ type: 'text', text: s.ch });
    if (!s.hold) ctx.input.push({ type: 'keyup', scancode: s.sc });
    else releases.push({ at: run.frames + s.hold, sc: s.sc });
    run.fires.push(run.frames);
    sinceFire = 0;
    idle = 0;
  };
  const sleep = ctx.clock.sleep.bind(ctx.clock);
  ctx.clock.sleep = async (ms: number) => {
    ++idle;
    const head = queue[0];
    if (head && !head.when && idle >= idleLimit) fire();
    else if (!head && idle >= run.stopAfterIdle) throw new Stop();
    return sleep(ms);
  };
  ctx.frameSink = () => {
    idle = 0;
    const i = run.frames++;
    sinceFire++;
    opts.onFrame?.(i);
    for (let k = releases.length - 1; k >= 0; k--) {
      if (releases[k]!.at <= run.frames) { ctx.input.push({ type: 'keyup', scancode: releases[k]!.sc }); releases.splice(k, 1); }
    }
    const head = queue[0];
    if (head && (head.when ? head.when(ctx) : head.after !== undefined && sinceFire >= head.after)) fire();
    if (opts.maxFrames !== undefined && run.frames >= opts.maxFrames) throw new Stop();
  };
  return run;
}
