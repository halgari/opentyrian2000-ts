// SPDX-License-Identifier: GPL-2.0-or-later
// Replaces SDL_GetTicks / SDL_Delay.
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export class BrowserClock implements Clock {
  now(): number {
    return Math.floor(performance.now());
  }
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }
}

export class VirtualClock implements Clock {
  private t = 0;
  constructor(private readonly limitMs = 3_600_000) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += Math.max(0, Math.ceil(ms));
    if (this.t > this.limitMs) throw new Error(`VirtualClock limit exceeded (${this.limitMs} ms) — is the game waiting for input that never comes?`);
  }
  async sleep(ms: number): Promise<void> {
    this.advance(ms);
  }
}
