// SPDX-License-Identifier: GPL-2.0-or-later
import type { Scenario } from '../../tools/oracle/scenarios';
import type { Ctx } from '../../src/ctx';
import type { InputEvent } from '../../src/platform/input';

export class Stop extends Error {}

/**
 * Oracle input injection (keys, typed characters, mouse) with the oracle's idle rule: after 2000 clock sleeps without a presented
 * frame the head pending entry fires. TS frame i is oracle frame frame0 + i. A typed character is key down, text, key up.
 */
export function injectOracleInput(
  ctx: Ctx, sc: Pick<Scenario, 'keys' | 'text' | 'mouse'>, frame0: number, crc: (pal: Uint8Array, px: Uint8Array) => number,
  onFrame: (i: number) => void,
): number[] {
  type Act = { frame: number; fire(): void };
  const acts: Act[] = [];
  const key = (scancode: number, down: boolean): InputEvent => (down ? { type: 'keydown', scancode, mod: 0 } : { type: 'keyup', scancode });
  for (const k of sc.keys) {
    if (k.frame < frame0) continue;
    acts.push({ frame: k.frame, fire: () => { ctx.input.push(key(k.scancode, true)); if (!k.hold) ctx.input.push(key(k.scancode, false)); } });
    if (k.hold) acts.push({ frame: k.frame + k.hold, fire: () => ctx.input.push(key(k.scancode, false)) });
  }
  for (const t of sc.text ?? []) {
    acts.push({ frame: t.frame, fire: () => { ctx.input.push(key(t.scancode, true)); ctx.input.push({ type: 'text', text: t.char }); ctx.input.push(key(t.scancode, false)); } });
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
    crcs.push(crc(pal, screen.pixels));
    onFrame(i);
    while (acts.length > 0 && acts[0]!.frame <= frame0 + i) acts.shift()!.fire();
  };
  return crcs;
}

