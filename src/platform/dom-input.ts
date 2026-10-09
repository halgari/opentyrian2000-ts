// SPDX-License-Identifier: GPL-2.0-or-later
// Browser replacement for SDL's event source: DOM events → Input queue.
import { KMOD_LALT, KMOD_LCTRL, KMOD_LSHIFT, scancodeFromCode } from './scancodes';
import type { Input } from './input';

/** Same rounding as mapWindowPointToScreen (video.c), with the canvas rect as the output rect. */
export function mapToScreen(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): [number, number] {
  const x = Math.trunc(((2 * (clientX - rect.left) + 1) * 320) / (2 * rect.width));
  const y = Math.trunc(((2 * (clientY - rect.top) + 1) * 200) / (2 * rect.height));
  return [x, y];
}

const DOM_TO_SDL_BUTTON: Record<number, number> = { 0: 1, 1: 2, 2: 3 };

export function attachDomInput(opts: {
  target: EventTarget;
  canvas: { getBoundingClientRect(): DOMRect };
  input: Input;
  onToggleFullscreen: () => void;
}): () => void {
  const { target, canvas, input } = opts;
  const listeners: [string, EventListener][] = [];
  const on = <E extends Event>(type: string, fn: (e: E) => void) => {
    const l = fn as unknown as EventListener;
    target.addEventListener(type, l);
    listeners.push([type, l]);
  };

  on<KeyboardEvent>('keydown', (e) => {
    if ((e.altKey && e.code === 'Enter') || e.code === 'F11') {
      e.preventDefault();
      opts.onToggleFullscreen();
      return;
    }
    const sc = scancodeFromCode(e.code);
    if (sc === undefined) return;
    if (!e.metaKey) e.preventDefault();
    const mod = (e.shiftKey ? KMOD_LSHIFT : 0) | (e.ctrlKey ? KMOD_LCTRL : 0) | (e.altKey ? KMOD_LALT : 0);
    input.push({ type: 'keydown', scancode: sc, mod });
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) input.push({ type: 'text', text: e.key });
  });
  on<KeyboardEvent>('keyup', (e) => {
    const sc = scancodeFromCode(e.code);
    if (sc === undefined) return;
    input.push({ type: 'keyup', scancode: sc });
  });
  on<MouseEvent>('mousemove', (e) => {
    const [x, y] = mapToScreen(e.clientX, e.clientY, canvas.getBoundingClientRect());
    input.push({ type: 'mousemove', x, y, moved: e.movementX !== 0 || e.movementY !== 0 });
  });
  on<MouseEvent>('mousedown', (e) => {
    const button = DOM_TO_SDL_BUTTON[e.button];
    if (button === undefined) return;
    const [x, y] = mapToScreen(e.clientX, e.clientY, canvas.getBoundingClientRect());
    input.push({ type: 'mousedown', button, x, y });
  });
  on<MouseEvent>('mouseup', (e) => {
    const button = DOM_TO_SDL_BUTTON[e.button];
    if (button === undefined) return;
    const [x, y] = mapToScreen(e.clientX, e.clientY, canvas.getBoundingClientRect());
    input.push({ type: 'mouseup', button, x, y });
  });
  on('contextmenu', (e) => e.preventDefault());
  on('blur', () => input.releaseAll());

  return () => {
    for (const [type, l] of listeners) target.removeEventListener(type, l);
  };
}
