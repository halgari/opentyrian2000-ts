// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { attachDomInput, mapToScreen, type PointerLockDoc } from '../../src/platform/dom-input';
import { Input } from '../../src/platform/input';

function keyEvent(type: string, init: { code: string; key?: string; repeat?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) {
  const e = new Event(type, { cancelable: true }) as Event & typeof init;
  Object.assign(e, { key: init.key ?? '', repeat: false, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...init });
  return e;
}

function setup() {
  const target = new EventTarget();
  const input = new Input();
  const onToggleFullscreen = vi.fn();
  const rect = { left: 0, top: 0, width: 640, height: 400 } as DOMRect;
  attachDomInput({ target, canvas: { getBoundingClientRect: () => rect }, input, onToggleFullscreen });
  return { target, input, onToggleFullscreen };
}

describe('dom-input', () => {
  it('maps window points to 320x200 like mapWindowPointToScreen', () => {
    const rect = { left: 10, top: 0, width: 640, height: 400 } as DOMRect;
    expect(mapToScreen(10, 0, rect)).toEqual([0, 0]);
    expect(mapToScreen(649, 399, rect)).toEqual([319, 199]);
    expect(mapToScreen(-100, 0, rect)[0]).toBeLessThan(0);
  });
  it('prevents browser defaults for game keys and queues keydown + text', () => {
    const { target, input } = setup();
    const e = keyEvent('keydown', { code: 'Space', key: ' ' });
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    input.serviceEvents(false);
    expect(input.lastkeyScan).toBe(44);
  });
  it('does not swallow browser shortcuts but still delivers the key', () => {
    const { target, input } = setup();
    const f5 = keyEvent('keydown', { code: 'F5' });
    target.dispatchEvent(f5);
    expect(f5.defaultPrevented).toBe(false);
    const ctrlR = keyEvent('keydown', { code: 'KeyR', key: 'r', ctrlKey: true });
    target.dispatchEvent(ctrlR);
    expect(ctrlR.defaultPrevented).toBe(false);
    const zoom = keyEvent('keydown', { code: 'Equal', key: '=', metaKey: true });
    target.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(false);
    const plainR = keyEvent('keydown', { code: 'KeyR', key: 'r' });
    target.dispatchEvent(plainR);
    expect(plainR.defaultPrevented).toBe(true);
    const down = keyEvent('keydown', { code: 'ArrowDown' });
    target.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    input.serviceEvents(false);
    expect(input.newkey).toBe(true);
  });
  it('prevents Ctrl+P (print) because Ctrl is a default fire key and P pauses', () => {
    const { target } = setup();
    const e = keyEvent('keydown', { code: 'KeyP', key: 'p', ctrlKey: true });
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
  it('releases a held mouse button on blur', () => {
    const { target, input } = setup();
    const down = new Event('mousedown') as Event & Record<string, number>;
    Object.assign(down, { button: 0, clientX: 10, clientY: 10 });
    target.dispatchEvent(down);
    input.serviceEvents(false);
    expect(input.mousePressed[0]).toBe(true);
    target.dispatchEvent(new Event('blur'));
    input.serviceEvents(false);
    expect(input.mousePressed[0]).toBe(false);
  });
  it('delivers auto-repeat keydowns (SDL2 does too)', () => {
    const { target, input } = setup();
    target.dispatchEvent(keyEvent('keydown', { code: 'ArrowDown' }));
    target.dispatchEvent(keyEvent('keydown', { code: 'ArrowDown', repeat: true }));
    input.serviceEvents(true);
    expect(input.newkey).toBe(true);
    input.serviceEvents(true);
    expect(input.newkey).toBe(true);
  });
  it('Alt+Enter and plain F11 toggle fullscreen and are not delivered', () => {
    const { target, input, onToggleFullscreen } = setup();
    target.dispatchEvent(keyEvent('keydown', { code: 'Enter', altKey: true }));
    target.dispatchEvent(keyEvent('keydown', { code: 'F11' }));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(2);
    input.serviceEvents(false);
    expect(input.newkey).toBe(false);
  });
  it('releases held keys on blur', () => {
    const { target, input } = setup();
    target.dispatchEvent(keyEvent('keydown', { code: 'ArrowRight' }));
    input.serviceEvents(false);
    input.serviceEvents(false); // an empty poll re-arms the pump (see Input.pollEvent)
    target.dispatchEvent(new Event('blur'));
    input.serviceEvents(false);
    expect([input.keydown, input.keysactive[79]]).toEqual([false, 0]);
  });
  it('prevents the context menu', () => {
    const { target } = setup();
    const e = new Event('contextmenu', { cancelable: true });
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

/** Review Focus 1 (browser keys vs game keys) and the pointer-lock / focus plumbing. */
function lockSetup() {
  const target = new EventTarget();
  const input = new Input();
  let locked: unknown = null;
  const canvasEl = {};
  const doc = new EventTarget() as unknown as PointerLockDoc & { exitPointerLock: ReturnType<typeof vi.fn> };
  Object.defineProperty(doc, 'pointerLockElement', { get: () => locked });
  doc.exitPointerLock = vi.fn(() => { locked = null; });
  const requestPointerLock = vi.fn(() => { locked = canvasEl; return undefined; });
  const rect = { left: 0, top: 0, width: 640, height: 400 } as DOMRect;
  let t = 1000;
  attachDomInput({
    target, canvas: { getBoundingClientRect: () => rect, requestPointerLock }, input, onToggleFullscreen: vi.fn(), doc, now: () => t,
  });
  const lose = (): void => { locked = null; doc.dispatchEvent(new Event('pointerlockchange')); };
  return { target, input, doc, requestPointerLock, lose, advance: (ms: number) => { t += ms; }, isLocked: () => locked !== null };
}
const drain = (i: Input): number[] => {
  const out: number[] = [];
  for (let n = 0; n < 8; n++) { i.serviceEvents(true); if (i.newkey) out.push(i.lastkeyScan); }
  return out;
};

describe('dom-input: browser keys vs game keys (Review Focus 1)', () => {
  it('lets Alt+S and Alt+L (shop quick save/load) reach the game with the Alt key held', () => {
    const { target, input } = setup();
    target.dispatchEvent(keyEvent('keydown', { code: 'AltLeft', altKey: true }));
    input.serviceEvents(false);
    input.serviceEvents(false); // an empty poll re-arms the pump (see Input.pollEvent)
    for (const [code, key, sc] of [['KeyS', 's', 22], ['KeyL', 'l', 15]] as const) {
      const e = keyEvent('keydown', { code, key, altKey: true });
      target.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true); // otherwise the browser opens a menu
      input.serviceEvents(true);
      expect(input.keysactive[sc]).toBe(1);
      expect(input.keysactive[226]).toBe(1);
      expect(input.newText).toBe(false); // Alt chords do not type
      target.dispatchEvent(keyEvent('keyup', { code, altKey: true }));
      input.serviceEvents(false);
      input.serviceEvents(false);
      input.serviceEvents(false);
    }
  });
  it('prevents the default of Alt keydown and keyup (a bare Alt release focuses the menu bar)', () => {
    const { target } = setup();
    const down = keyEvent('keydown', { code: 'AltLeft', altKey: true });
    const up = keyEvent('keyup', { code: 'AltLeft' });
    target.dispatchEvent(down);
    target.dispatchEvent(up);
    expect([down.defaultPrevented, up.defaultPrevented]).toEqual([true, true]);
  });
  it('prevents page scrolling keys: Space, arrows, PageUp/Down, Home/End, Tab', () => {
    const { target } = setup();
    for (const code of ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Tab', 'F1', 'F6', 'F10']) {
      const e = keyEvent('keydown', { code });
      target.dispatchEvent(e);
      expect(e.defaultPrevented, code).toBe(true);
    }
  });
  it('keyup of a browser shortcut is left alone', () => {
    const { target } = setup();
    const e = keyEvent('keyup', { code: 'F5' });
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
  it('Shift+F11 reaches the game as the gamma key; plain F11 stays fullscreen', () => {
    const { target, input, onToggleFullscreen } = setup();
    const e = keyEvent('keydown', { code: 'F11', shiftKey: true } as never);
    target.dispatchEvent(e);
    expect(onToggleFullscreen).not.toHaveBeenCalled();
    input.serviceEvents(false);
    expect([input.newkey, input.lastkeyScan]).toEqual([true, 68]);
  });
  it('mouse movement carries the integer SDL xrel/yrel', () => {
    const { target, input } = setup();
    input.mouseSetRelative(true);
    const e = Object.assign(new Event('mousemove'), { clientX: 10, clientY: 10, movementX: 6.6, movementY: -2.2 });
    target.dispatchEvent(e);
    target.dispatchEvent(e);
    // canvas is 640x400: (2*12+1)*320/1280 = 6.25 -> 6 ; (2*-4+1)*200/800 = -1.75 -> -1
    expect(input.mouseGetRelativePosition()).toEqual([6, -1]);
  });
  it('reports the canvas size to Input for the relative-motion scale', () => {
    const { target, input } = setup();
    target.dispatchEvent(Object.assign(new Event('mousemove'), { clientX: 1, clientY: 1, movementX: 0, movementY: 0 }));
    expect(input.outputRect).toEqual({ w: 640, h: 400 });
  });
});

describe('dom-input: pointer lock', () => {
  it('locks when the game asks for relative mode and releases when it stops asking', () => {
    const { input, requestPointerLock, doc, isLocked, lose } = lockSetup();
    input.mouseSetRelative(true);
    expect(requestPointerLock).toHaveBeenCalledTimes(1);
    expect(isLocked()).toBe(true);
    input.mouseSetRelative(false);
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    lose(); // the pointerlockchange that answers the game's own exit
    expect(drain(input)).toEqual([]); // not mistaken for Esc
  });
  it('the game-initiated unlock/relock pair (Esc menu) is not read as an Esc press', () => {
    const { input, lose } = lockSetup();
    input.mouseSetRelative(true);
    input.mouseSetRelative(false); // doInGameSetup start
    input.mouseSetRelative(true); // doInGameSetup end, before the browser reports the unlock
    lose();
    expect(drain(input)).toEqual([]);
  });
  it('Esc ending the lock (keydown swallowed by the browser) is delivered as an Esc key press', () => {
    const { input, lose } = lockSetup();
    input.mouseSetRelative(true);
    lose();
    expect(drain(input)).toEqual([41]);
  });
  it('Esc ending the lock with the keydown delivered (Firefox) is not doubled', () => {
    const { input, target, lose, advance } = lockSetup();
    input.mouseSetRelative(true);
    target.dispatchEvent(keyEvent('keydown', { code: 'Escape' }));
    advance(5);
    lose();
    expect(drain(input)).toEqual([41]);
  });
  it('losing the lock because the window lost focus does not press Esc', () => {
    const { input, target, lose } = lockSetup();
    input.mouseSetRelative(true);
    target.dispatchEvent(new Event('blur'));
    lose();
    expect(drain(input)).toEqual([]);
  });
  it('a click or key press re-requests the lock that a gesture-less request could not get', () => {
    const { input, target, requestPointerLock, lose } = lockSetup();
    input.mouseSetRelative(true);
    lose();
    drain(input); // the Esc
    expect(requestPointerLock).toHaveBeenCalledTimes(1);
    target.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0, clientX: 5, clientY: 5 }));
    expect(requestPointerLock).toHaveBeenCalledTimes(2);
  });
  it('does not request a lock while the game is not in relative mode', () => {
    const { target, requestPointerLock } = lockSetup();
    target.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0, clientX: 5, clientY: 5 }));
    expect(requestPointerLock).not.toHaveBeenCalled();
  });
});

describe('dom-input: window focus (Review Focus 3)', () => {
  it('blur releases held keys, then reports FOCUS_LOST; focus reports FOCUS_GAINED', () => {
    const { target, input } = setup();
    target.dispatchEvent(keyEvent('keydown', { code: 'ArrowRight' }));
    input.serviceEvents(false);
    input.serviceEvents(false); // an empty poll re-arms the pump (see Input.pollEvent)
    target.dispatchEvent(new Event('blur'));
    input.serviceEvents(false); // the keyup (a key event ends one pass)
    expect(input.keysactive[79]).toBe(0);
    input.serviceEvents(false);
    expect(input.windowHasFocus).toBe(false);
    target.dispatchEvent(new Event('focus'));
    input.serviceEvents(false);
    expect(input.windowHasFocus).toBe(true);
  });
  it('blur turns off the lock request (SDL_SetRelativeMouseMode(enable && windowHasFocus))', () => {
    const { input, target, doc } = lockSetup();
    input.mouseSetRelative(true);
    target.dispatchEvent(new Event('blur'));
    input.serviceEvents(false);
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
  });
});
