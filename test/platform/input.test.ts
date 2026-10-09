import { describe, expect, it } from 'vitest';
import { DEFAULT_MOUSE_SETTINGS, Input, SDL_BUTTON_LEFT, SDL_BUTTON_MIDDLE, SDL_BUTTON_RIGHT } from '../../src/platform/input';
import { Scancode, scancodeFromCode } from '../../src/platform/scancodes';

describe('scancodes', () => {
  it('maps KeyboardEvent.code to SDL scancodes', () => {
    expect(scancodeFromCode('KeyA')).toBe(4);
    expect(scancodeFromCode('Digit0')).toBe(39);
    expect(scancodeFromCode('Enter')).toBe(40);
    expect(scancodeFromCode('Space')).toBe(44);
    expect(scancodeFromCode('ArrowDown')).toBe(Scancode.Down);
    expect(Scancode.Down).toBe(81);
    expect(scancodeFromCode('ScrollLock')).toBe(71);
    expect(scancodeFromCode('ControlLeft')).toBe(224);
    expect(scancodeFromCode('Nonsense')).toBeUndefined();
  });
});

describe('Input.serviceEvents (port of service_SDL_events)', () => {
  it('returns after one key event, leaving the rest queued', () => {
    const i = new Input();
    i.push({ type: 'keydown', scancode: 81, mod: 0 });
    i.push({ type: 'keyup', scancode: 81 });
    i.serviceEvents(false);
    expect([i.newkey, i.keydown, i.lastkeyScan, i.keysactive[81]]).toEqual([true, true, 81, 1]);
    i.serviceEvents(true);
    expect([i.newkey, i.keydown, i.keysactive[81]]).toEqual([false, false, 0]);
  });
  it('processes all mouse/text events before a key event in one call', () => {
    const i = new Input();
    i.push({ type: 'mousemove', x: 10, y: 20, moved: true });
    i.push({ type: 'text', text: 'e' });
    i.push({ type: 'mousedown', button: SDL_BUTTON_LEFT, x: 11, y: 21 });
    i.serviceEvents(false);
    expect([i.mouseX, i.mouseY, i.newText, i.lastText, i.newmouse, i.mousedown, i.lastmouseX, i.mouseInactive])
      .toEqual([10, 20, true, 'e', true, true, 11, false]);
  });
  it('keydown makes the mouse inactive', () => {
    const i = new Input();
    i.mouseInactive = false;
    i.push({ type: 'keydown', scancode: 4, mod: 0 });
    i.serviceEvents(false);
    expect(i.mouseInactive).toBe(true);
  });
  it('releaseAll queues keyups for held keys', () => {
    const i = new Input();
    i.push({ type: 'keydown', scancode: 79, mod: 0 });
    i.serviceEvents(false);
    i.releaseAll();
    i.serviceEvents(false);
    expect([i.keydown, i.keysactive[79]]).toEqual([false, 0]);
  });
});

describe('mouse_pressed[] (keyboard.c:233-262)', () => {
  const press = (i: Input, button: number, down = true): void => {
    i.push(down ? { type: 'mousedown', button, x: 0, y: 0 } : { type: 'mouseup', button, x: 0, y: 0 });
    i.serviceEvents(false);
  };
  it('default {1,4,5}: left fires, right fires both sidekicks, middle changes the rear mode', () => {
    const i = new Input();
    i.mouseSettings = DEFAULT_MOUSE_SETTINGS;
    press(i, SDL_BUTTON_LEFT);
    expect(i.mousePressed).toEqual([true, false, false, false]);
    press(i, SDL_BUTTON_LEFT, false);
    press(i, SDL_BUTTON_RIGHT);
    expect(i.mousePressed).toEqual([false, true, true, false]);
    press(i, SDL_BUTTON_RIGHT, false);
    press(i, SDL_BUTTON_MIDDLE);
    expect(i.mousePressed).toEqual([false, false, false, true]);
    press(i, SDL_BUTTON_MIDDLE, false);
    expect(i.mousePressed).toEqual([false, false, false, false]);
  });
  it('honours mouseSettings values 2 and 3 (single sidekicks)', () => {
    const i = new Input();
    i.mouseSettings = [2, 3, 1];
    press(i, SDL_BUTTON_LEFT);
    expect(i.mousePressed).toEqual([false, true, false, false]);
    press(i, SDL_BUTTON_RIGHT);
    expect(i.mousePressed).toEqual([false, true, true, false]);
    press(i, SDL_BUTTON_MIDDLE);
    expect(i.mousePressed).toEqual([true, true, true, false]);
  });
  it('mouseup uses the single global mousedown flag, like the C', () => {
    const i = new Input();
    i.mouseSettings = DEFAULT_MOUSE_SETTINGS;
    press(i, SDL_BUTTON_LEFT);
    press(i, SDL_BUTTON_MIDDLE);
    press(i, SDL_BUTTON_MIDDLE, false); // clears mousedown; only the middle mapping is updated
    expect(i.mousedown).toBe(false);
    expect(i.mousePressed).toEqual([true, false, false, false]);
  });
  it('ignores buttons other than left/right/middle', () => {
    const i = new Input();
    i.mouseSettings = DEFAULT_MOUSE_SETTINGS;
    press(i, 4);
    expect(i.mousePressed).toEqual([false, false, false, false]);
    expect(i.mousedown).toBe(true);
  });
});

describe('relative mouse (keyboard.c:109-137, video.c:418)', () => {
  const motion = (i: Input, dx: number, dy: number): void => {
    i.push({ type: 'mousemove', x: 0, y: 0, moved: dx !== 0 || dy !== 0, dx, dy });
    i.serviceEvents(false);
  };
  it('accumulates only while relative mode is on and the window has focus', () => {
    const i = new Input();
    motion(i, 5, 5);
    expect(i.mouseGetRelativePosition()).toEqual([0, 0]);
    i.mouseSetRelative(true);
    motion(i, 6, 4);
    motion(i, 6, 4);
    expect(i.mouseGetRelativePosition()).toEqual([12, 8]);
    expect(i.mouseGetRelativePosition()).toEqual([0, 0]); // consumed
    i.push({ type: 'focus', gained: false });
    i.serviceEvents(false);
    motion(i, 9, 9);
    expect(i.mouseGetRelativePosition()).toEqual([0, 0]);
  });
  it('mouseSetRelative resets the accumulated motion and drives the lock hook with focus', () => {
    const i = new Input();
    const calls: boolean[] = [];
    i.onRelativeMode = (e) => calls.push(e);
    i.mouseSetRelative(true);
    motion(i, 7, 7);
    i.mouseSetRelative(true);
    expect(i.mouseGetRelativePosition()).toEqual([0, 0]);
    i.push({ type: 'focus', gained: false });
    i.serviceEvents(false);
    i.push({ type: 'focus', gained: true });
    i.serviceEvents(false);
    // SDL_SetRelativeMouseMode(enable && windowHasFocus)
    expect(calls).toEqual([true, true, false, true]);
    expect(i.windowHasFocus).toBe(true);
  });
  it('scales window pixels with (2d+1)*320/(2w) in C integer math (truncation toward zero)', () => {
    const i = new Input();
    i.mouseSetRelative(true);
    const rel = (dx: number, dy: number): [number, number] => {
      motion(i, dx, dy);
      return i.mouseGetRelativePosition();
    };
    expect(rel(3, 3)).toEqual([3, 3]); // 7*320/640 = 3.5 -> 3 ; 7*200/400 = 3.5 -> 3
    expect(rel(-3, -3)).toEqual([-2, -2]); // -5*320/640 = -2.5 -> -2
    expect(rel(0, 0)).toEqual([0, 0]);
    i.outputRect = { w: 640, h: 400 };
    expect(rel(4, 4)).toEqual([2, 2]); // 9*320/1280 = 2.25
    expect(rel(1, 1)).toEqual([0, 0]); // 3*320/1280 = 0.75
    expect(rel(-1, -1)).toEqual([0, 0]); // -1*320/1280
  });
  it('windowHasFocus starts true (SDL delivers FOCUS_GAINED at window creation)', () => {
    expect(new Input().windowHasFocus).toBe(true);
  });
});
