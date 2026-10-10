import { describe, expect, it } from 'vitest';
import { Joysticks, analogAngle, axisReduce, axisThreshold, defaultAssignments, type PadLike } from '../../src/platform/gamepad';
import { Input } from '../../src/platform/input';

const btns = (n = 17) => Array.from({ length: n }, () => ({ pressed: false, value: 0 }));
const pad = (over: Partial<PadLike> = {}): PadLike => ({ index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: btns(), ...over });
const src = (pads: (PadLike | null)[]) => ({ getGamepads: () => pads });
const press = (b: { pressed: boolean; value: number }[], ...idx: number[]) => { for (const i of idx) b[i] = { pressed: true, value: 1 }; return b; };

describe('axis arithmetic (joystick.c:51-80)', () => {
  it('threshold: values inside threshold*1000 are 0', () => {
    expect(axisThreshold({ threshold: 5 }, 4999)).toBe(0);
    expect(axisThreshold({ threshold: 5 }, -4999)).toBe(0);
    expect(axisThreshold({ threshold: 5 }, 5000)).toBe(0);
    expect(axisThreshold({ threshold: 5 }, 20000)).toBe(15000);
    expect(axisThreshold({ threshold: 5 }, -20000)).toBe(-15000);
  });
  it('reduce divides by 3000 - 200 * sensitivity after the threshold', () => {
    expect(axisReduce({ sensitivity: 5, threshold: 0 }, 20000)).toBe(Math.trunc(20000 / (3000 - 200 * 5)));
    expect(axisReduce({ sensitivity: 5, threshold: 5 }, -20000)).toBe(-7); // -15000 / 2000 truncates toward zero
    expect(axisReduce({ sensitivity: 5, threshold: 5 }, 3000)).toBe(0);
  });
  it('analogAngle accumulates into the angle and reports centred axes', () => {
    const a = { v: 0 };
    expect(analogAngle({ threshold: 5, x: 0, y: 0 }, a)).toBe(false);
    expect(analogAngle({ threshold: 5, x: 20000, y: 0 }, a)).toBe(true);
    expect(a.v).toBeCloseTo(Math.PI / 2, 6);
    const b = { v: 0 };
    expect(analogAngle({ threshold: 5, x: 0, y: -20000 }, b)).toBe(true);
    expect(b.v).toBeCloseTo(Math.PI, 6);
  });
});

describe('Joysticks', () => {
  it('standard d-pad and A button fill direction[] and action[]', () => {
    const j = new Joysticks(src([pad({ buttons: press(btns(), 14, 0) })]), () => 0);
    j.poll();
    expect(j.state[0]!.direction[3]).toBe(true);
    expect(j.state[0]!.action[0]).toBe(true);
    expect(j.joydown).toBe(true);
  });
  it('standard Start is menu (action 4) and Back is pause (action 5)', () => {
    const j = new Joysticks(src([pad({ buttons: press(btns(), 9, 8) })]), () => 0);
    j.poll();
    expect(j.state[0]!.action[4]).toBe(true);
    expect(j.state[0]!.action[5]).toBe(true);
  });
  it('left stick past the digital threshold (> 16383) is a direction', () => {
    const j = new Joysticks(src([pad({ axes: [-0.6, 0, 0, 0] })]), () => 0);
    j.poll();
    expect(j.state[0]!.direction[3]).toBe(true);
    expect(j.state[0]!.direction[1]).toBe(false);
    const k = new Joysticks(src([pad({ axes: [-0.5, 0, 0, 0] })]), () => 0); // -16383 is not > 16383
    k.poll();
    expect(k.state[0]!.direction[3]).toBe(false);
  });
  it('action_pressed is an edge, not a level', () => {
    let down = false;
    const j = new Joysticks({ getGamepads: () => { const b = btns(); b[1] = { pressed: down, value: down ? 1 : 0 }; return [pad({ buttons: b })]; } }, () => 0);
    j.poll(); down = true; j.poll();
    expect(j.state[0]!.actionPressed[1]).toBe(true);
    j.poll();
    expect(j.state[0]!.actionPressed[1]).toBe(false);
  });
  it('a held menu direction repeats only after 300 ms (joystick_repeat_delay)', () => {
    let t = 0;
    const j = new Joysticks(src([pad({ buttons: press(btns(), 13) })]), () => t);
    const sent: Array<[number, boolean]> = [];
    const push = (sc: number, down: boolean): void => { sent.push([sc, down]); };
    for (const now of [0, 100, 299, 350]) { t = now; j.poll(); j.pushAsKeyboard(push); }
    expect(sent.filter(([sc, d]) => sc === 81 && d).length).toBe(2);
  });
  it('confirm and cancel push Return and Escape as keydown + keyup', () => {
    const j = new Joysticks(src([pad({ buttons: press(btns(), 0, 1) })]), () => 0);
    j.poll();
    const sent: Array<[number, boolean]> = [];
    j.pushAsKeyboard((sc, d) => sent.push([sc, d]));
    expect(sent).toEqual([[40, true], [40, false], [41, true], [41, false]]);
  });

  describe('degenerate pads: nothing throws, the ship holds still, a missing pad is never "any button down"', () => {
    const cases: Array<[string, (PadLike | null)[]]> = [
      ['no pads', []],
      ['a null slot', [null]],
      ['a disconnected pad', [pad({ connected: false, buttons: press(btns(), 0, 14) })]],
      ['NaN axes', [pad({ axes: [NaN, NaN, NaN, NaN] })]],
      ['Infinity axes', [pad({ axes: [Infinity, -Infinity] })]],
      ['a pad with no buttons and no axes', [pad({ buttons: [], axes: [] })]],
      ['a pad with no buttons (non-standard)', [pad({ mapping: '', buttons: [], axes: [0, 0] })]],
      ['a non-standard pad with one axis', [pad({ mapping: '', buttons: btns(2), axes: [0.9] })]],
    ];
    for (const [name, pads] of cases) {
      it(name, () => {
        const j = new Joysticks(src(pads), () => 0);
        expect(() => { j.poll(); j.pollOne(0); j.pushAsKeyboard(() => {}); }).not.toThrow();
        expect(j.joydown).toBe(false);
        expect(j.state.every((s) => !s.direction.some(Boolean) && !s.action.some(Boolean) && s.x === 0 && s.y === 0)).toBe(true);
      });
    }
    it('a non-standard pad uses axes 0/1 and buttons 0..5', () => {
      const raw = pad({ mapping: '', axes: [0, 0.9], buttons: press(btns(8), 2, 5) });
      const j = new Joysticks(src([raw]), () => 0);
      j.poll();
      expect(j.state[0]!.direction).toEqual([false, false, true, false]); // axis 1 positive = down
      expect(j.state[0]!.action).toEqual([false, false, true, false, false, true]);
      expect(j.joydown).toBe(true);
    });
    it('a non-standard pad with fewer than 6 buttons leaves the later actions unassigned', () => {
      const j = new Joysticks(src([pad({ mapping: '', axes: [0, 0], buttons: press(btns(2), 0, 1) })]), () => 0);
      j.poll();
      expect(j.state[0]!.action).toEqual([true, true, false, false, false, false]);
    });
    it('unplugging mid-level drops the count and clears the state', () => {
      let pads: (PadLike | null)[] = [pad({ axes: [0.9, 0, 0, 0], buttons: press(btns(), 0) })];
      const j = new Joysticks({ getGamepads: () => pads }, () => 0);
      j.poll();
      expect(j.count).toBe(1);
      expect(j.state[0]!.direction[1]).toBe(true);
      pads = [];
      j.poll();
      expect(j.count).toBe(0);
      expect(j.joydown).toBe(false);
      expect(j.state[0]!.direction[1]).toBe(false);
      expect(j.state[0]!.action[0]).toBe(false);
      expect(j.state[0]!.x).toBe(0);
      expect(() => j.pollOne(0)).not.toThrow();
      let sent = 0;
      j.pushAsKeyboard(() => { sent++; });
      expect(sent).toBe(0);
    });
    it('a pad that disappears between count and pollOne holds still', () => {
      let pads: (PadLike | null)[] = [pad({ buttons: press(btns(), 14) })];
      const j = new Joysticks({ getGamepads: () => pads }, () => 0);
      j.poll();
      pads = [pad({ connected: false })];
      j.pollOne(0);
      expect(j.state[0]!.direction[3]).toBe(false);
    });
    it('a pad that appears later (after a button press) is picked up', () => {
      let pads: (PadLike | null)[] = [];
      const j = new Joysticks({ getGamepads: () => pads }, () => 0);
      j.poll();
      expect(j.count).toBe(0);
      pads = [null, pad({ buttons: press(btns(), 12) })];
      expect(j.count).toBe(1);
      j.poll();
      expect(j.state[0]!.direction[0]).toBe(true);
    });
    it('a throwing or missing getGamepads reads as no pads', () => {
      const j = new Joysticks({ getGamepads: () => { throw new Error('policy'); } }, () => 0);
      expect(() => j.poll()).not.toThrow();
      expect(j.count).toBe(0);
      const k = new Joysticks({} as never, () => 0);
      expect(k.count).toBe(0);
    });
  });

  it('defaultAssignments: standard pads use the d-pad buttons 12-15, others axes (a+1)%2 and buttons 0..5', () => {
    const std = defaultAssignments('standard', 4, 17);
    expect(std[0]![0]).toEqual({ type: 'button', num: 12, negativeAxis: false });
    expect(std[4]![0]).toEqual({ type: 'button', num: 0, negativeAxis: false });
    expect(std[8]![0]).toEqual({ type: 'button', num: 9, negativeAxis: false });
    expect(std[9]![0]).toEqual({ type: 'button', num: 8, negativeAxis: false });
    const raw = defaultAssignments('', 2, 6);
    expect(raw[0]![0]).toEqual({ type: 'axis', num: 1, negativeAxis: true });
    expect(raw[1]![0]).toEqual({ type: 'axis', num: 0, negativeAxis: false });
    expect(raw[4]![0]).toEqual({ type: 'button', num: 0, negativeAxis: false });
  });
});

describe('Input hooks', () => {
  it('without a gamepad layer everything is a no-op and joydown is false', () => {
    const i = new Input();
    expect(() => { i.pushJoysticksAsKeyboard(); i.pollJoysticks(); }).not.toThrow();
    expect(i.joydown).toBe(false);
    i.serviceEvents(false);
    expect(i.newkey).toBe(false);
  });
  it('pushJoysticksAsKeyboard queues the arrow and Return as key events', () => {
    const i = new Input();
    i.joysticks = new Joysticks(src([pad({ buttons: press(btns(), 13, 0) })]), () => 0);
    i.pushJoysticksAsKeyboard();
    expect(i.joydown).toBe(true);
    const seen: number[] = [];
    for (let n = 0; n < 4; n++) { i.serviceEvents(true); if (i.newkey) seen.push(i.lastkeyScan); }
    expect(seen).toContain(81);
    expect(seen).toContain(40);
  });
});
