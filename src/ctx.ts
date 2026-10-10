// SPDX-License-Identifier: GPL-2.0-or-later
import type { Assets } from './assets';
import { newSaveSync, type SaveSync } from './game/save-sync';
import { createGameWorld, type GameWorld } from './game/world';
import { MersenneTwister } from './core/mtrand';
import type { Starlib } from './video/starlib';
import type { ScalingMode } from './platform/scaling';
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
  /**
   * `screen` = VGAScreenSeg, `screen2` = VGAScreen2, `gameScreen` = game_screen (persistent across frames: the smoothie filters
   * read it before writing). `cur` is the C `VGAScreen` global that the drawing functions target.
   */
  vga: { screen: Surface; screen2: Surface; gameScreen: Surface; cur: Surface };
  assets: Assets;
  shopSpriteSheet: Sprite2Sheet | null;
  mouse: MouseCursor;
  state: GameState;
  /** The user directory (tyrian.sav / tyrian.cfg / opentyrian.cfg); in-memory unless a browser adapter is passed. */
  storage: StorageAdapter;
  /** All C gameplay globals (spec §2.1). */
  game: GameWorld;
  /** Web-only: multi-tab tyrian.sav merge state (src/game/save-sync.ts). */
  saveSync: SaveSync;
  /** Web-only display hooks: `main.ts` fills the two callbacks; tests leave them null. */
  display: { scalingMode: ScalingMode; onScalingChange: ((m: ScalingMode) => void) | null; toggleFullscreen: (() => void) | null };
  /** The jukebox backdrop (starlib.c statics); created on first use, kept for the session like the C statics. */
  starlib: Starlib | null;
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
  const vga = { screen: createSurface(), screen2: createSurface(), gameScreen: createSurface(), cur: null as unknown as Surface };
  vga.cur = vga.screen; // video.c:77 VGAScreen = VGAScreenSeg
  return {
    clock: opts.clock,
    delay: new DelayTimer(opts.clock),
    input,
    audio: opts.audio ?? new NullAudio(),
    presenter: opts.presenter,
    frameSink: null,
    rng,
    palette: new PaletteState(opts.assets.palettes),
    vga,
    assets: opts.assets,
    shopSpriteSheet: null,
    mouse: createMouseCursor(),
    state: { versionString: opts.versionString ?? VERSION, moveTyrianLogoUp: false, xmas: false, playDemo: false, loadDestruct: false },
    storage: opts.storage ?? memoryAdapter(),
    game,
    saveSync: newSaveSync(),
    display: { scalingMode: 'fit-4-3', onScalingChange: null, toggleFullscreen: null },
    starlib: null,
  };
}
