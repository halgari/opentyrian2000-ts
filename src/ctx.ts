// SPDX-License-Identifier: GPL-2.0-or-later
import type { Assets } from './assets';
import { createGameWorld, type GameWorld } from './game/world';
import { MersenneTwister } from './core/mtrand';
import { NullAudio, type Audio } from './platform/audio';
import type { Clock } from './platform/clock';
import { DelayTimer } from './platform/delay';
import { Input } from './platform/input';
import { memoryAdapter, type StorageAdapter } from './platform/storage';
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
  /** The user directory (tyrian.sav / tyrian.cfg / opentyrian.cfg); in-memory unless a browser adapter is passed. */
  storage: StorageAdapter;
  /** All C gameplay globals (spec §2.1). */
  game: GameWorld;
}

export function createCtx(opts: {
  assets: Assets; clock: Clock; presenter: Presenter; audio?: Audio; versionString?: string; seed?: number;
  storage?: StorageAdapter;
}): Ctx {
  const rng = new MersenneTwister();
  rng.srand(opts.seed ?? (Date.now() / 1000) >>> 0); // main(): mt_srand(time(NULL))
  const game = createGameWorld();
  const input = new Input();
  input.mouseSettings = game.config.mouseSettings; // service_SDL_events reads the live config
  return {
    clock: opts.clock,
    delay: new DelayTimer(opts.clock),
    input,
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
    storage: opts.storage ?? memoryAdapter(),
    game,
  };
}
