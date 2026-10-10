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

// KeyP is deliberately absent: LCtrl is a default sidekick key and P is pause, so Ctrl+P would open the print dialog mid-level.
const MODIFIED_BROWSER_CODES = new Set(['KeyR', 'KeyL', 'KeyF', 'KeyW', 'KeyT', 'Equal', 'Minus', 'Digit0']);

/** Keys the browser keeps for itself (reload, devtools, zoom, ...); still delivered to the game. */
function isBrowserShortcut(e: KeyboardEvent): boolean {
  if (e.code === 'F5' || e.code === 'F12') return true;
  return (e.ctrlKey || e.metaKey) && MODIFIED_BROWSER_CODES.has(e.code);
}

const DOM_TO_SDL_BUTTON: Record<number, number> = { 0: 1, 1: 2, 2: 3 };

/** The parts of `document` the pointer-lock handling needs (injectable for tests). */
export interface PointerLockDoc extends EventTarget {
  pointerLockElement: unknown;
  exitPointerLock(): void;
  hasFocus?(): boolean;
  visibilityState?: string;
}

/** A pointerlockchange that follows an Escape keydown by less than this is the same keypress. */
const ESC_DEDUPE_MS = 250;
const SC_ESCAPE = 41, SC_F11 = 68;

export function attachDomInput(opts: {
  target: EventTarget;
  canvas: { getBoundingClientRect(): DOMRect; requestPointerLock?(): unknown };
  input: Input;
  onToggleFullscreen: () => void;
  /** Defaults to `document` when present; without it pointer lock is disabled. */
  doc?: PointerLockDoc;
  now?: () => number;
}): () => void {
  const { target, canvas, input } = opts;
  const doc = opts.doc ?? (typeof document !== 'undefined' ? (document as unknown as PointerLockDoc) : undefined);
  const now = opts.now ?? (() => performance.now());
  const listeners: [EventTarget, string, EventListener][] = [];
  const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void) => {
    const l = fn as unknown as EventListener;
    t.addEventListener(type, l);
    listeners.push([t, type, l]);
  };

  const updateOutputRect = (): DOMRect => {
    const rect = canvas.getBoundingClientRect();
    // last_output_rect (video.c): integer size; keep the divisor non-zero for a hidden canvas
    input.outputRect = { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) };
    return rect;
  };
  updateOutputRect();

  // ---- pointer lock: SDL_SetRelativeMouseMode(enable && windowHasFocus) ----
  let wantRelative = false;
  let hasFocus = true;
  let pendingUnlocks = 0; // exitPointerLock() calls whose pointerlockchange has not arrived yet
  let lastEscDown = -Infinity;
  let lastSyntheticEsc = -Infinity;
  const heldButtons = new Map<number, [number, number]>(); // SDL button -> last position, for the release on blur

  const tryLock = (): void => {
    if (!doc || !wantRelative || !hasFocus || doc.pointerLockElement || !canvas.requestPointerLock) return;
    try {
      const r = canvas.requestPointerLock();
      // Browsers reject without a user gesture: the next click or key retries (see below).
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    } catch { /* not allowed right now */ }
  };
  input.onRelativeMode = (enable) => {
    wantRelative = enable;
    if (!doc) return;
    if (enable) tryLock();
    else if (doc.pointerLockElement) {
      pendingUnlocks++;
      doc.exitPointerLock();
    }
  };
  if (doc) {
    on(doc, 'pointerlockchange', () => {
      if (doc.pointerLockElement) return;
      if (pendingUnlocks > 0) { // the game released it; it may have asked for it back before this event arrived
        pendingUnlocks--;
        tryLock();
        return;
      }
      // The browser took the lock away. On focus loss the blur path handles it; otherwise the player pressed
      // Esc (Chrome swallows that keydown while locked): deliver it as the in-game-menu key unless the
      // keydown arrived anyway (Firefox).
      // Decide focus at event time: Chrome may fire this before the window's blur event.
      const windowLostFocus = doc.hasFocus?.() === false || doc.visibilityState === 'hidden';
      if (!hasFocus || windowLostFocus || !wantRelative) return;
      if (now() - lastEscDown < ESC_DEDUPE_MS) return;
      lastSyntheticEsc = now();
      input.push({ type: 'keydown', scancode: SC_ESCAPE, mod: 0 });
      input.push({ type: 'keyup', scancode: SC_ESCAPE });
    });
  }

  on<KeyboardEvent>(target, 'keydown', (e) => {
    if ((e.altKey && e.code === 'Enter') || (e.code === 'F11' && !e.shiftKey)) {
      e.preventDefault();
      opts.onToggleFullscreen();
      return;
    }
    // Shift+F11 is the game's gamma key (JE_gammaCheck); plain F11 stays the browser's fullscreen key.
    const sc = e.code === 'F11' ? SC_F11 : scancodeFromCode(e.code);
    if (sc === undefined) return;
    if (!isBrowserShortcut(e)) e.preventDefault();
    if (sc === SC_ESCAPE) {
      // The real keydown arriving just after a synthetic Esc is the same keypress.
      if (now() - lastSyntheticEsc < ESC_DEDUPE_MS) return;
      lastEscDown = now();
    }
    tryLock();
    const mod = (e.shiftKey ? KMOD_LSHIFT : 0) | (e.ctrlKey ? KMOD_LCTRL : 0) | (e.altKey ? KMOD_LALT : 0);
    input.push({ type: 'keydown', scancode: sc, mod });
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) input.push({ type: 'text', text: e.key });
  });
  on<KeyboardEvent>(target, 'keyup', (e) => {
    const sc = e.code === 'F11' ? SC_F11 : scancodeFromCode(e.code);
    if (sc === undefined) return;
    // A bare Alt release focuses the menu bar on Windows/Linux browsers; Alt is a default sidekick key.
    if (!isBrowserShortcut(e)) e.preventDefault();
    input.push({ type: 'keyup', scancode: sc });
  });
  on<MouseEvent>(target, 'mousemove', (e) => {
    const rect = updateOutputRect();
    const [x, y] = mapToScreen(e.clientX, e.clientY, rect);
    const dx = Math.trunc(e.movementX || 0), dy = Math.trunc(e.movementY || 0);
    input.push({ type: 'mousemove', x, y, moved: dx !== 0 || dy !== 0, dx, dy });
  });
  on<MouseEvent>(target, 'mousedown', (e) => {
    const button = DOM_TO_SDL_BUTTON[e.button];
    if (button === undefined) return;
    tryLock();
    const [x, y] = mapToScreen(e.clientX, e.clientY, updateOutputRect());
    heldButtons.set(button, [x, y]);
    input.push({ type: 'mousedown', button, x, y });
  });
  on<MouseEvent>(target, 'mouseup', (e) => {
    const button = DOM_TO_SDL_BUTTON[e.button];
    if (button === undefined) return;
    const [x, y] = mapToScreen(e.clientX, e.clientY, updateOutputRect());
    heldButtons.delete(button);
    input.push({ type: 'mouseup', button, x, y });
  });
  on(target, 'contextmenu', (e) => e.preventDefault());
  // SDL releases held keys when the window loses focus and reports FOCUS_LOST / FOCUS_GAINED; the DOM does neither.
  on(target, 'blur', () => {
    hasFocus = false;
    input.releaseAll();
    for (const [button, [x, y]] of heldButtons) input.push({ type: 'mouseup', button, x, y });
    heldButtons.clear();
    input.push({ type: 'focus', gained: false });
  });
  on(target, 'focus', () => {
    hasFocus = true;
    input.push({ type: 'focus', gained: true });
  });

  return () => {
    for (const [t, type, l] of listeners) t.removeEventListener(type, l);
    input.onRelativeMode = null;
  };
}
