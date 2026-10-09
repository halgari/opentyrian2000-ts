// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { attachDomInput, mapToScreen } from '../../src/platform/dom-input';
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
  it('delivers auto-repeat keydowns (SDL2 does too)', () => {
    const { target, input } = setup();
    target.dispatchEvent(keyEvent('keydown', { code: 'ArrowDown' }));
    target.dispatchEvent(keyEvent('keydown', { code: 'ArrowDown', repeat: true }));
    input.serviceEvents(true);
    expect(input.newkey).toBe(true);
    input.serviceEvents(true);
    expect(input.newkey).toBe(true);
  });
  it('Alt+Enter and F11 toggle fullscreen and are not delivered', () => {
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
