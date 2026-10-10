// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/keyboard.c
import type { Joysticks } from './gamepad';

export const SDL_BUTTON_LEFT = 1;
export const SDL_BUTTON_MIDDLE = 2;
export const SDL_BUTTON_RIGHT = 3;

export type InputEvent =
  | { type: 'keydown'; scancode: number; mod: number }
  | { type: 'keyup'; scancode: number }
  /** dx/dy: SDL xrel/yrel in window pixels (integers); `moved` is `xrel != 0 || yrel != 0`. */
  | { type: 'mousemove'; x: number; y: number; moved: boolean; dx?: number; dy?: number }
  | { type: 'mousedown'; button: number; x: number; y: number }
  | { type: 'mouseup'; button: number; x: number; y: number }
  | { type: 'text'; text: string }
  /** SDL_WINDOWEVENT_FOCUS_GAINED / FOCUS_LOST */
  | { type: 'focus'; gained: boolean };

/** config.c defaultMouseSettings: left = fire main, right = both sidekicks, middle = change rear mode. */
export const DEFAULT_MOUSE_SETTINGS = [1, 4, 5] as const;

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
  /** keyboard.c: initial false in the C; SDL delivers FOCUS_GAINED at window creation, so true here (survey 4). */
  windowHasFocus = true;
  /** keyboard.c mouse_pressed[4]: fire main, left sidekick, right sidekick, change rear mode. */
  readonly mousePressed: boolean[] = [false, false, false, false];
  /** config.c mouseSettings[3] (left, right, middle); createCtx points this at game.config.mouseSettings. */
  mouseSettings: ArrayLike<number> = DEFAULT_MOUSE_SETTINGS;
  /** video.c last_output_rect size: the canvas in CSS pixels (320x200 until the DOM layer reports it). */
  outputRect = { w: 320, h: 200 };
  /** Platform hook: SDL_SetRelativeMouseMode(enable && windowHasFocus) == pointer lock on/off. */
  onRelativeMode: ((enable: boolean) => void) | null = null;
  /** The gamepad layer (joystick.c); created by main.ts, null in tests and the oracle (no joysticks, as under SDL's dummy drivers). */
  joysticks: Joysticks | null = null;
  private mouseRelativeEnabled = false;
  private mouseWindowXRelative = 0;
  private mouseWindowYRelative = 0;
  /** Events pushed since the last pump (the platform side of SDL's queue); `visible` is what SDL_PollEvent can return. */
  private readonly staged: InputEvent[] = [];
  private readonly visible: InputEvent[] = [];
  private lastPollEmpty = true;

  push(e: InputEvent): void {
    this.staged.push(e);
  }

  /**
   * SDL_PollEvent as the oracle (SDL2 through sdl2-compat) behaves: events pushed by the platform only become visible when the pump
   * runs, and the pump runs on a poll only if the previous poll found nothing. service_SDL_events returns after every key event
   * without polling again, so in a loop that calls it once per frame an event pushed right after one that was just handled arrives one
   * frame late (measured: keys on consecutive frames, one service call per frame, tools/oracle session-skip-levels).
   */
  private pollEvent(): InputEvent | null {
    if (this.lastPollEmpty && this.staged.length > 0) {
      this.visible.push(...this.staged);
      this.staged.length = 0;
    }
    const ev = this.visible.shift() ?? null;
    this.lastPollEmpty = ev === null;
    return ev;
  }

  /** joystick.c `joydown`: any pad button down as of the last poll; false without pads. */
  get joydown(): boolean { return this.joysticks?.joydown ?? false; }

  /** poll_joysticks (joystick.c:211) */
  pollJoysticks(): void { this.joysticks?.poll(); }

  /**
   * port of push_joysticks_as_keyboard (joystick.c:234): polls, then queues keydown + keyup for Return (confirm), Escape (cancel)
   * and the arrows, like push_key. A no-op without pads.
   */
  pushJoysticksAsKeyboard(): void {
    const js = this.joysticks;
    if (!js) return;
    js.poll();
    js.pushAsKeyboard((scancode, down) => {
      this.push(down ? { type: 'keydown', scancode, mod: 0 } : { type: 'keyup', scancode });
    });
  }

  /** SDL releases held keys when the window loses focus; the DOM does not. */
  releaseAll(): void {
    for (let sc = 0; sc < this.keysactive.length; sc++) {
      if (this.keysactive[sc]) this.push({ type: 'keyup', scancode: sc });
    }
  }

  // port of mouseSetRelative (keyboard.c:109). Resets the accumulated motion.
  mouseSetRelative(enable: boolean): void {
    this.onRelativeMode?.(enable && this.windowHasFocus);
    this.mouseRelativeEnabled = enable;
    this.mouseWindowXRelative = 0;
    this.mouseWindowYRelative = 0;
  }

  get relativeEnabled(): boolean { return this.mouseRelativeEnabled; }

  // port of JE_mousePosition (keyboard.c:120): returns the held button or 0; mouseX/mouseY are the fields
  mousePosition(): number {
    this.serviceEvents(false);
    return this.mousedown ? this.lastmouseBut : 0;
  }

  // port of mouseGetRelativePosition (keyboard.c:127) + scaleWindowDistanceToScreen (video.c:418): C int math
  mouseGetRelativePosition(): [x: number, y: number] {
    this.serviceEvents(false);
    const x = Math.trunc(((2 * this.mouseWindowXRelative + 1) * 320) / (2 * this.outputRect.w)) | 0; // |0: no -0
    const y = Math.trunc(((2 * this.mouseWindowYRelative + 1) * 200) / (2 * this.outputRect.h)) | 0;
    this.mouseWindowXRelative = 0;
    this.mouseWindowYRelative = 0;
    return [x, y];
  }

  // port of service_SDL_events (Alt+Enter fullscreen is handled by the DOM layer)
  serviceEvents(clearNew: boolean): void {
    if (clearNew) {
      this.newkey = false;
      this.newmouse = false;
      this.newText = false;
    }
    for (let ev = this.pollEvent(); ev !== null; ev = this.pollEvent()) {
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
          if (this.mouseRelativeEnabled && this.windowHasFocus) {
            this.mouseWindowXRelative += ev.dx ?? 0;
            this.mouseWindowYRelative += ev.dy ?? 0;
          }
          if (ev.moved) this.mouseInactive = false;
          break;
        case 'mousedown':
          this.mouseInactive = false;
          this.newmouse = true;
          this.lastmouseBut = ev.button;
          this.lastmouseX = ev.x;
          this.lastmouseY = ev.y;
          this.mousedown = true;
          this.setMousePressed(ev.button);
          break;
        case 'mouseup':
          // C: only clears mousedown (no mouseInactive change, no position update)
          this.mousedown = false;
          this.setMousePressed(ev.button);
          break;
        case 'focus':
          this.windowHasFocus = ev.gained;
          this.mouseSetRelative(this.mouseRelativeEnabled);
          break;
        case 'text':
          this.lastText = ev.text;
          this.newText = true;
          break;
      }
    }
  }

  /** The `mouseSettings[whichMB]` switch of service_SDL_events (keyboard.c:233-262), using the current `mousedown`. */
  private setMousePressed(button: number): void {
    const which = button === SDL_BUTTON_LEFT ? 0 : button === SDL_BUTTON_RIGHT ? 1 : button === SDL_BUTTON_MIDDLE ? 2 : -1;
    if (which < 0) return;
    const d = this.mousedown;
    const mp = this.mousePressed;
    switch (this.mouseSettings[which]) {
      case 1: mp[0] = d; break; // Fire Main Weapons
      case 2: mp[1] = d; break; // Fire Left Sidekick
      case 3: mp[2] = d; break; // Fire Right Sidekick
      case 4: mp[1] = d; mp[2] = d; break; // Fire BOTH Sidekicks
      case 5: mp[3] = d; break; // Change Rear Mode
    }
  }
}
