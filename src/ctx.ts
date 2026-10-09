// SPDX-License-Identifier: GPL-2.0-or-later
import type { Assets } from './assets';
import { MersenneTwister } from './core/mtrand';
import { NullAudio, type Audio } from './platform/audio';
import type { Clock } from './platform/clock';
import { DelayTimer } from './platform/delay';
import { Input } from './platform/input';
import { createMouseCursor, type MouseCursor } from './video/mouse';
import { PaletteState } from './video/palette';
import type { Presenter } from './video/presenter';
import type { Sprite2Sheet } from './video/sprite2';
import { createSurface, type Surface } from './video/surface';
import { VERSION } from './version';

export type FrameSink = (screen: Surface, palette: Uint8Array) => void;

export interface GameState {
  versionString: string;
  moveTyrianLogoUp: boolean;
  xmas: boolean;
  playDemo: boolean;
  loadDestruct: boolean;
}

export interface Ctx {
  clock: Clock;
  delay: DelayTimer;
  input: Input;
  audio: Audio;
  presenter: Presenter;
  frameSink: FrameSink | null;
  rng: MersenneTwister;
  palette: PaletteState;
  vga: { screen: Surface; screen2: Surface; gameScreen: Surface };
  assets: Assets;
  shopSpriteSheet: Sprite2Sheet | null;
  mouse: MouseCursor;
  state: GameState;
}

export function createCtx(opts: {
  assets: Assets; clock: Clock; presenter: Presenter; audio?: Audio; versionString?: string; seed?: number;
}): Ctx {
  const rng = new MersenneTwister();
  rng.srand(opts.seed ?? (Date.now() / 1000) >>> 0); // main(): mt_srand(time(NULL))
  return {
    clock: opts.clock,
    delay: new DelayTimer(opts.clock),
    input: new Input(),
    audio: opts.audio ?? new NullAudio(),
    presenter: opts.presenter,
    frameSink: null,
    rng,
    palette: new PaletteState(opts.assets.palettes),
    vga: { screen: createSurface(), screen2: createSurface(), gameScreen: createSurface() },
    assets: opts.assets,
    shopSpriteSheet: null,
    mouse: createMouseCursor(),
    state: { versionString: opts.versionString ?? VERSION, moveTyrianLogoUp: false, xmas: false, playDemo: false, loadDestruct: false },
  };
}
