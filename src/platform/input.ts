// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/keyboard.c
export const SDL_BUTTON_LEFT = 1;
export const SDL_BUTTON_MIDDLE = 2;
export const SDL_BUTTON_RIGHT = 3;

export type InputEvent =
  | { type: 'keydown'; scancode: number; mod: number }
  | { type: 'keyup'; scancode: number }
  | { type: 'mousemove'; x: number; y: number; moved: boolean }
  | { type: 'mousedown'; button: number; x: number; y: number }
  | { type: 'mouseup'; button: number; x: number; y: number }
  | { type: 'text'; text: string };

export class Input {
  readonly keysactive = new Uint8Array(512);
  newkey = false;
  keydown = false;
  lastkeyScan = 0;
  lastkeyMod = 0;
  newmouse = false;
  mousedown = false;
  lastmouseBut = 0;
  lastmouseX = 0;
  lastmouseY = 0;
  mouseX = 0;
  mouseY = 0;
  newText = false;
  lastText = '';
  mouseInactive = true; // mouse.c
  private readonly queue: InputEvent[] = [];

  push(e: InputEvent): void {
    this.queue.push(e);
  }

  /** SDL releases held keys when the window loses focus; the DOM does not. */
  releaseAll(): void {
    for (let sc = 0; sc < this.keysactive.length; sc++) {
      if (this.keysactive[sc]) this.push({ type: 'keyup', scancode: sc });
    }
  }

  // port of service_SDL_events (Alt+Enter fullscreen is handled by the DOM layer)
  serviceEvents(clearNew: boolean): void {
    if (clearNew) {
      this.newkey = false;
      this.newmouse = false;
      this.newText = false;
    }
    while (this.queue.length > 0) {
      const ev = this.queue.shift()!;
      switch (ev.type) {
        case 'keydown':
          this.keysactive[ev.scancode] = 1;
          this.newkey = true;
          this.lastkeyScan = ev.scancode;
          this.lastkeyMod = ev.mod;
          this.keydown = true;
          this.mouseInactive = true;
          return;
        case 'keyup':
          this.keysactive[ev.scancode] = 0;
          this.keydown = false;
          return;
        case 'mousemove':
          this.mouseX = ev.x;
          this.mouseY = ev.y;
          if (ev.moved) this.mouseInactive = false;
          break;
        case 'mousedown':
          this.mouseInactive = false;
          // NOTE: C only updates mouse_x/y from motion events; the brief's test
          // requires the button position to update mouseX/Y too (harmless: SDL
          // always delivers a motion event first).
          this.mouseX = ev.x;
          this.mouseY = ev.y;
          this.newmouse = true;
          this.lastmouseBut = ev.button;
          this.lastmouseX = ev.x;
          this.lastmouseY = ev.y;
          this.mousedown = true;
          break;
        case 'mouseup':
          // C: only clears mousedown (no mouseInactive change, no position update)
          this.mousedown = false;
          break;
        case 'text':
          this.lastText = ev.text;
          this.newText = true;
          break;
      }
    }
  }
}
