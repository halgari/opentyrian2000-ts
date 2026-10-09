import { describe, expect, it } from 'vitest';
import { Input, SDL_BUTTON_LEFT } from '../../src/platform/input';
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
      .toEqual([11, 21, true, 'e', true, true, 11, false]);
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
