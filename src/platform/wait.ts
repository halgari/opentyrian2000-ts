// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/nortsong.c
// and src/keyboard.c (wait_input, wait_noinput)
import type { Ctx } from '../ctx';
import { SDL_POLL_INTERVAL } from './delay';

// port of service_wait_delay
export async function waitDelay(ctx: Ctx): Promise<void> {
  for (;;) {
    ctx.input.serviceEvents(false);
    const delay = ctx.delay.remaining();
    if (delay <= 0) return;
    await ctx.clock.sleep(Math.min(delay, SDL_POLL_INTERVAL));
  }
}

// port of wait_delay (nortsong.c): sleeps out the remaining delay, no input servicing
export async function waitDelayPlain(ctx: Ctx): Promise<void> {
  const delay = ctx.delay.remaining();
  if (delay > 0) await ctx.clock.sleep(delay);
}

// port of wait_delayorinput (nortsong.c:95)
export async function waitDelayOrInput(ctx: Ctx): Promise<void> {
  for (;;) {
    ctx.input.serviceEvents(false);
    ctx.input.pollJoysticks();
    if (ctx.input.newkey || ctx.input.mousedown || ctx.input.joydown) {
      ctx.input.newkey = false;
      return;
    }
    const delay = ctx.delay.remaining();
    if (delay <= 0) return;
    await ctx.clock.sleep(Math.min(delay, SDL_POLL_INTERVAL));
  }
}

// port of wait_input
export async function waitInput(ctx: Ctx, keyboard: boolean, mouse: boolean, joystick: boolean): Promise<void> {
  const i = ctx.input;
  i.serviceEvents(false);
  while (!((keyboard && i.keydown) || (mouse && i.mousedown) || (joystick && i.joydown))) {
    await ctx.clock.sleep(SDL_POLL_INTERVAL);
    i.pushJoysticksAsKeyboard();
    i.serviceEvents(false);
  }
}

// port of wait_noinput
export async function waitNoInput(ctx: Ctx, keyboard: boolean, mouse: boolean, joystick: boolean): Promise<void> {
  const i = ctx.input;
  i.serviceEvents(false);
  while ((keyboard && i.keydown) || (mouse && i.mousedown) || (joystick && i.joydown)) {
    await ctx.clock.sleep(SDL_POLL_INTERVAL);
    i.pollJoysticks();
    i.serviceEvents(false);
  }
}
