// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/joystick.c (on the browser Gamepad API instead of SDL_Joystick)
import { atanf, f32 } from '../core/cmath';

/** The part of a browser `Gamepad` the port reads. */
export interface PadLike {
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}
/** `navigator` (or a stand-in). */
export interface PadSource { getGamepads(): ArrayLike<PadLike | null> }

export type AssignType = 'none' | 'axis' | 'button';
export interface Assignment { type: AssignType; num: number; negativeAxis: boolean }

export interface JoystickState {
  analog: boolean; sensitivity: number; threshold: number;
  /** [10][2]; 0-3 up/right/down/left, 4 fire, 5 change fire, 6 left sk, 7 right sk, 8 menu, 9 pause */
  assignment: Assignment[][];
  x: number; y: number;
  direction: boolean[]; directionPressed: boolean[]; action: boolean[]; actionPressed: boolean[];
  confirm: boolean; cancel: boolean;
  analogDirection: number[];
  inputPressed: boolean;
  /** joystick_delay: SDL_GetTicks() deadline for the press-repeat */
  joystickDelay: number;
}

export const JOYSTICK_ANALOG_MAX = 32767;
/** joystick_repeat_delay (joystick.c:42), milliseconds */
export const JOYSTICK_REPEAT_DELAY = 300;

// port of joystick_axis_threshold (joystick.c:51): eliminates axis movement below the threshold
export function axisThreshold(js: Pick<JoystickState, 'threshold'>, value: number): number {
  const negative = value < 0;
  if (negative) value = -value;
  if (value <= js.threshold * 1000) return 0;
  value -= js.threshold * 1000;
  return negative ? -value : value;
}

// port of joystick_axis_reduce (joystick.c:68)
export function axisReduce(js: Pick<JoystickState, 'sensitivity' | 'threshold'>, value: number): number {
  value = axisThreshold(js, value);
  if (value === 0) return 0;
  return Math.trunc(value / (3000 - 200 * js.sensitivity));
}

// port of joystick_analog_angle (joystick.c:82): `angle.v` accumulates like the C's `*angle +=`; false when the axes are centred
export function analogAngle(js: Pick<JoystickState, 'threshold' | 'x' | 'y'>, angle: { v: number }): boolean {
  const x = axisThreshold(js, js.x), y = axisThreshold(js, js.y);
  if (x !== 0) {
    angle.v = f32(angle.v + atanf(f32(-y / x)));
    angle.v = f32(angle.v + ((x < 0) ? -Math.PI / 2 : Math.PI / 2)); // float += double: summed in double, rounded once
    return true;
  } else if (y !== 0) {
    angle.v = f32(angle.v + (y < 0 ? Math.PI : 0));
    return true;
  }
  return false;
}

const none = (): Assignment => ({ type: 'none', num: 0, negativeAxis: false });

/**
 * port of reset_joystick_assignments (joystick.c:319). Non-standard pads: axes (a+1)%2 for the four directions and buttons 0..5.
 * Standard pads: the d-pad buttons 12-15 (up, right, down, left) in alternative 0 and the left stick in alternative 1 (the C's
 * axis + hat pair); fire/change fire/sidekicks A/B/X/Y, menu Start (9), pause Back (8).
 */
export function defaultAssignments(mapping: string, axisCount: number, buttonCount: number): Assignment[][] {
  const standard = mapping === 'standard';
  const dpad = [12, 15, 13, 14];
  const stdAction = [0, 1, 2, 3, 9, 8];
  const out: Assignment[][] = [];
  for (let a = 0; a < 10; a++) {
    const row: Assignment[] = [none(), none()];
    if (a < 4) {
      const axis: Assignment = { type: 'axis', num: (a + 1) % 2, negativeAxis: a === 0 || a === 3 };
      if (standard) {
        row[0] = { type: 'button', num: dpad[a]!, negativeAxis: false };
        if (axisCount >= 2) row[1] = axis;
      } else if (axisCount >= 2) {
        row[0] = axis;
      }
    } else if (standard) {
      row[0] = { type: 'button', num: stdAction[a - 4]!, negativeAxis: false };
    } else if (a - 4 < buttonCount) {
      row[0] = { type: 'button', num: a - 4, negativeAxis: false };
    }
    out.push(row);
  }
  return out;
}

function newState(): JoystickState {
  return {
    analog: false, sensitivity: 5, threshold: 5, assignment: defaultAssignments('', 0, 0), x: 0, y: 0,
    direction: [false, false, false, false], directionPressed: [false, false, false, false],
    action: [false, false, false, false, false, false], actionPressed: [false, false, false, false, false, false],
    confirm: false, cancel: false, analogDirection: [0, 0, 0, 0], inputPressed: false, joystickDelay: 0,
  };
}

function clearState(js: JoystickState): void {
  js.x = js.y = 0;
  js.direction.fill(false); js.directionPressed.fill(false); js.action.fill(false); js.actionPressed.fill(false);
  js.analogDirection.fill(0);
  js.confirm = js.cancel = js.inputPressed = false;
  js.joystickDelay = 0;
}

/** SDL_JoystickGetAxis: a finite axis scaled to -32767..32767; a missing or NaN axis reads as centred. */
function readAxis(pad: PadLike, num: number): number {
  const v = pad.axes[num];
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.trunc(Math.max(-1, Math.min(1, v)) * JOYSTICK_ANALOG_MAX);
}

// port of check_assigned (joystick.c:111): 0..32767; a missing axis or button is 0, never "down"
function checkAssigned(pad: PadLike, assignment: readonly Assignment[]): number {
  let result = 0;
  for (const a of assignment) {
    let temp = 0;
    switch (a.type) {
      case 'none': continue;
      case 'axis':
        temp = readAxis(pad, a.num);
        if (a.negativeAxis) temp = -temp;
        break;
      case 'button':
        temp = pad.buttons[a.num]?.pressed === true ? JOYSTICK_ANALOG_MAX : 0;
        break;
    }
    if (temp > result) result = temp;
  }
  return result;
}

/**
 * The joystick layer of joystick.c on the Gamepad API. A browser pad appears only after a button press and can vanish at any
 * time, so the pad list is read live on every poll (`getGamepads()` returns snapshots) and `count` is the number of connected
 * pads (the C's `joysticks`). Pad `j` is the j-th connected pad in slot order.
 */
export class Joysticks {
  readonly state: JoystickState[] = [];
  /** any joystick buttons down, updated by poll() (joystick.c `joydown`) */
  joydown = false;
  private readonly signature: string[] = [];
  private polled = 0;

  constructor(private readonly source: PadSource, private readonly now: () => number) {}

  private fetch(): PadLike[] {
    const out: PadLike[] = [];
    try {
      const list = this.source.getGamepads();
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p && p.connected) out.push(p);
      }
    } catch { /* no Gamepad API, or blocked by a permissions policy: no pads */ }
    return out;
  }

  get count(): number { return this.fetch().length; }

  /** Opens new pads (default assignments, as init_joysticks) and clears the state of pads that went away. */
  private sync(pads: PadLike[]): void {
    for (let j = 0; j < pads.length; j++) {
      const p = pads[j]!;
      const js = (this.state[j] ??= newState());
      const sig = `${p.mapping}|${p.axes?.length ?? 0}|${p.buttons?.length ?? 0}`;
      if (this.signature[j] !== sig) {
        this.signature[j] = sig;
        js.assignment = defaultAssignments(p.mapping, p.axes?.length ?? 0, p.buttons?.length ?? 0);
        clearState(js);
      }
    }
    for (let j = pads.length; j < this.state.length; j++) {
      clearState(this.state[j]!);
      this.signature[j] = '';
    }
    this.polled = pads.length;
  }

  // port of poll_joysticks (joystick.c:211)
  poll(): void {
    this.joydown = false;
    const pads = this.fetch();
    this.sync(pads);
    for (let j = 0; j < pads.length; j++) this.pollPad(j, pads[j]!);
  }

  // port of poll_joystick (joystick.c:156); an out-of-range j (the pad was unplugged) polls nothing
  pollOne(j: number): void {
    const pads = this.fetch();
    this.sync(pads);
    const pad = pads[j];
    if (pad) this.pollPad(j, pad);
  }

  private pollPad(j: number, pad: PadLike): void {
    const js = this.state[j]!;
    js.inputPressed = false;
    const repeat = js.joystickDelay < this.now();

    for (let d = 0; d < 4; d++) {
      const old = js.direction[d]!;
      js.analogDirection[d] = checkAssigned(pad, js.assignment[d]!);
      js.direction[d] = js.analogDirection[d]! > (JOYSTICK_ANALOG_MAX >> 1);
      if (js.direction[d]) this.joydown = true;
      js.directionPressed[d] = js.direction[d]! && (!old || repeat);
      if (js.directionPressed[d]) js.inputPressed = true;
    }
    js.x = -js.analogDirection[3]! + js.analogDirection[1]!;
    js.y = -js.analogDirection[0]! + js.analogDirection[2]!;

    for (let d = 0; d < 6; d++) {
      const old = js.action[d]!;
      js.action[d] = checkAssigned(pad, js.assignment[d + 4]!) > (JOYSTICK_ANALOG_MAX >> 1);
      if (js.action[d]) this.joydown = true;
      js.actionPressed[d] = js.action[d]! && (!old || repeat);
      if (js.actionPressed[d]) js.inputPressed = true;
    }
    js.confirm = js.action[0]! || js.action[4]!;
    js.cancel = js.action[1]! || js.action[5]!;

    if (js.inputPressed) js.joystickDelay = this.now() + JOYSTICK_REPEAT_DELAY;
  }

  // port of the loop of push_joysticks_as_keyboard (joystick.c:241); the caller polls first
  pushAsKeyboard(push: (scancode: number, down: boolean) => void): void {
    const RETURN = 40, ESCAPE = 41;
    const direction = [82, 79, 81, 80]; // UP, RIGHT, DOWN, LEFT
    const key = (sc: number): void => { push(sc, true); push(sc, false); }; // push_key
    for (let j = 0; j < this.polled; j++) {
      const js = this.state[j]!;
      if (!js.inputPressed) continue;
      if (js.confirm) key(RETURN);
      if (js.cancel) key(ESCAPE);
      for (let d = 0; d < 4; d++) if (js.directionPressed[d]) key(direction[d]!);
    }
  }
}
