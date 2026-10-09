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

// port of wait_delayorinput (joysticks arrive in a later sub-project: joydown is always false)
export async function waitDelayOrInput(ctx: Ctx): Promise<void> {
  for (;;) {
    ctx.input.serviceEvents(false);
    if (ctx.input.newkey || ctx.input.mousedown) {
      ctx.input.newkey = false;
      return;
    }
    const delay = ctx.delay.remaining();
    if (delay <= 0) return;
    await ctx.clock.sleep(Math.min(delay, SDL_POLL_INTERVAL));
  }
}

// port of wait_input
export async function waitInput(ctx: Ctx, keyboard: boolean, mouse: boolean, _joystick: boolean): Promise<void> {
  const i = ctx.input;
  i.serviceEvents(false);
  while (!((keyboard && i.keydown) || (mouse && i.mousedown))) {
    await ctx.clock.sleep(SDL_POLL_INTERVAL);
    i.serviceEvents(false);
  }
}

// port of wait_noinput
export async function waitNoInput(ctx: Ctx, keyboard: boolean, mouse: boolean, _joystick: boolean): Promise<void> {
  const i = ctx.input;
  i.serviceEvents(false);
  while ((keyboard && i.keydown) || (mouse && i.mousedown)) {
    await ctx.clock.sleep(SDL_POLL_INTERVAL);
    i.serviceEvents(false);
  }
}
