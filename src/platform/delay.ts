// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/nortsong.c
import type { Clock } from './clock';

const f32 = Math.fround;

/** Period of the x86 PIT in milliseconds (C: float pitPeriod). */
export const PIT_PERIOD_MS = f32(f32(f32(12) / f32(14318180)) * f32(1000));
export const DEFAULT_DELAY_SPEED = 0x4300;
export const SDL_POLL_INTERVAL = 10;

export class DelayTimer {
  private target = 0;
  private target2 = 0;
  private delayPeriod = f32(DEFAULT_DELAY_SPEED * PIT_PERIOD_MS);

  constructor(private readonly clock: Clock) {}

  // C: target = SDL_GetTicks() + delay * delayPeriod (float math, stored to Uint32)
  private targetFor(d: number): number {
    return Math.trunc(f32(this.clock.now() + f32(d * this.delayPeriod)));
  }
  setDelay(d: number): void { this.target = this.targetFor(d); }   // port of setDelay
  setDelay2(d: number): void { this.target2 = this.targetFor(d); } // port of setDelay2
  getDelayTicks(): number { return Math.max(0, this.target - this.clock.now()); }   // port of getDelayTicks
  getDelayTicks2(): number { return Math.max(0, this.target2 - this.clock.now()); } // port of getDelayTicks2
  /** Signed ms until the setDelay target (<= 0 means elapsed). */
  remaining(): number { return this.target - this.clock.now(); }
  // port of setDelaySpeed
  setDelaySpeed(speed: number): void { this.delayPeriod = f32(speed * PIT_PERIOD_MS); }
}
