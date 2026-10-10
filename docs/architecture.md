# Architecture

The port follows the C code closely. Game logic is translated function by function, with the same control
flow, the same globals (moved into one object) and the same integer and float32 arithmetic. The platform
layer (SDL video, audio, events, files and timers) is not emulated: it is rewritten for the browser behind
small interfaces, so that the game code can call it in the same places the C calls SDL.

The source of truth is [KScl/opentyrian2000](https://github.com/KScl/opentyrian2000) at commit
`aad5aca01af139c0b089237c38ef765f7a84355d`. `pnpm ref` clones it into `reference/opentyrian2000/`
(git-ignored), and every ported function names the C function it came from, usually with a line number in
that tree.

## Layout of src/

| Directory | Contents |
|---|---|
| `src/core/` | C integer helpers (`int.ts`), float32 and libm helpers (`cmath.ts`), the Mersenne Twister (`mtrand.ts`), `BinaryReader`. |
| `src/data/` | Loaders for the original data files: the pak archive, palettes, pictures, shapes, help text, item data, level files, episode scripts, demos, PCX and the `tyrend.anm` animation. `inline.ts` reads the data embedded in the single-file build. |
| `src/video/` | 8-bit surfaces, the `vga256d` primitives, sprite and sprite2 blitters, fonts, glow text, palette fades, the mouse cursor, the jukebox starfield and the canvas presenter. |
| `src/audio/` | The OPL2 emulator, the LDS music player, the mixer (`engine.ts`), sound file loading, the glibc `rand()` port the OPL noise needs, and the AudioWorklet processor. |
| `src/platform/` | Clock, delay timer, wait loops, the input queue, DOM input, gamepads, storage, fullscreen, scaling and the Web Audio host. |
| `src/game/` | Gameplay: `world.ts` (all C globals), level loop, player, shots, enemies, events, backgrounds, explosions, HUD, the episode script parser, the `JE_main` state machine (`flow.ts`), saves and the economy. |
| `src/screens/` | Everything outside the level loop: intro, title, selection menus, shop, load screen, high scores, help, setup, jukebox, end-of-level tally, episode end and credits. |

The top level holds `main.ts` (browser boot), `ctx.ts` (the `Ctx` type), `game.ts` (the port of the
`main()` loop from `opentyr.c`), `assets.ts` (what `main()` loads before the title) and `licence.ts` (the
notice on the start overlay).

`tools/` holds the data packer, the single-file build and the C oracle tooling (see [testing.md](testing.md)).

## Control flow

The C is written as nested blocking loops: `fade_palette`, `wait_input`, the title and shop menus and the
level loop all spin until something happens, calling `setDelay`, `service_wait_delay` and `JE_showVGA`
along the way. The port keeps that structure. Every function that blocks in C is an `async` function in TS,
and every blocking wait becomes an `await`:

| C | TS |
|---|---|
| `setDelay(n)` | `ctx.delay.setDelay(n)` (records a target time) |
| `service_wait_delay()` | `await waitDelay(ctx)`: services input in 10 ms steps until the target |
| `wait_delay()` | `await waitDelayPlain(ctx)`: sleeps without servicing input |
| `wait_delayorinput()` | `await waitDelayOrInput(ctx)` |
| `wait_input()`, `wait_noinput()` | `await waitInput(ctx, ...)`, `await waitNoInput(ctx, ...)` |
| `SDL_Delay(ms)` | `await ctx.clock.sleep(ms)` |
| `SDL_GetTicks()` | `ctx.clock.now()` |
| `JE_showVGA()` | `showVGA(ctx)` (synchronous) |

Time comes from a `Clock` (`src/platform/clock.ts`) with two methods, `now()` and `sleep(ms)`.
`BrowserClock` uses `performance.now()` and `setTimeout`. `VirtualClock` advances its own counter in
`sleep` and resolves at once, so tests run whole sessions in milliseconds with the same polling pattern as
the browser. It throws after an hour of virtual time, which catches a test waiting for input that never
comes. `requestAnimationFrame` is not used: the C paces frames by delays, and a frame is presented
synchronously when the game calls `showVGA`.

The delay timer (`src/platform/delay.ts`) keeps the C's float32 arithmetic: one delay unit is
`speed * 12 / 14318180 * 1000` ms, about 14.37 ms at the default speed `0x4300`.

Gotos are restructured but keep their statement boundaries. `JE_main` is `jeMain` in `src/game/flow.ts`,
a loop over `levelSetup` (`start_level_first`), `levelFrame` (one pass of `level_loop`) and the
`start_level` epilogue. `levelFrame` returns `'next'`, `'restart'` (the C's `goto level_loop` from the F1
help path, which reruns the frame logic without presenting) or `'end'`. `JE_drawEnemy`'s gotos are early
returns from an inner function.

## State

All mutable state lives in a `Ctx` object (`src/ctx.ts`) passed as the first argument to every ported
function. There is no module-level mutable state; module-level constants and lookup tables are fine.
This keeps tests independent: each test builds a fresh context with `createCtx` and gets the C's
start-up state.

`Ctx` holds the platform objects (`clock`, `delay`, `input`, `audio`, `presenter`, `storage`), the RNG,
the palette state, the loaded assets and the screens:

- `ctx.vga.screen` is `VGAScreenSeg` (the visible screen), `screen2` is `VGAScreen2` and `gameScreen` is
  `game_screen`. `ctx.vga.cur` mirrors the C `VGAScreen` pointer, which the drawing code retargets
  (the smoothie filters draw into `screen2` and filter into `gameScreen`). `gameScreen` persists across
  frames and starts zeroed, because the filters read last frame's pixels.
- `ctx.game` is a `GameWorld` (`src/game/world.ts`): every C gameplay global, grouped by the C file it
  came from (`config`, `varz`, `scratch`, `map`, `backgrounds`, `players`, `enemies`, `enemyShots`,
  `playerShots`, `explosions`, `events`, `demo`, `items`, `sprites`, `tables`, `text`). Field names are
  the C names, camelCased where the C uses snake_case. `createGameWorld()` returns the C's
  static-initialiser state.
- `ctx.game.scratch` holds the C's shared scratch globals (`temp`, `temp2`, `temp3`, `tempW`, `b`, `x`,
  `y`). Many C functions clobber them and their callers read the result, so they are written with the
  C type's wrapping in the same statement order.
- `ctx.state` holds a few boot-level flags (`playDemo`, `moveTyrianLogoUp`, `loadDestruct`, the version
  string drawn on the title).
- `ctx.saveSync`, `ctx.display` and `ctx.starlib` hold web-only state: the multi-tab save merge, the
  fullscreen and scaling hooks, and the jukebox backdrop.

A C pointer that aliases another field becomes an accessor. For example `player[p].lives` is a pointer to
`items.weapon[p].power` in the C, and `Player.lives` reads and writes that power.

## C integer helpers

`src/core/int.ts` gives the fixed-width conversions: `u8`, `s8`, `u16`, `s16`, `u32`, `s32`, and `idiv`
for C division (truncation toward zero). Scalar fields in `GameWorld` are plain numbers and the code that
assigns them applies the helper wherever the C narrows. Fixed-size C arrays are typed arrays
(`Uint8Array`, `Int16Array` and so on) and wrap on store by themselves. Pixel and palette buffers are
`Uint8Array`.

`src/core/cmath.ts` covers the rest of the C numeric semantics:

- `f32` is `Math.fround`. Any `float` arithmetic in the C is written with `f32` after every operation.
- `roundf32` is C `roundf` (half away from zero, after reducing to float32). `Math.round` is wrong for
  negative halves and must not be used.
- `sinf`, `cosf` and `atanf` are the float32 of the double results.
- `rngMod(r, m)` is `mt_rand() % m` where `mt_rand()` returns a 64-bit `unsigned long` and `m` is a
  signed `int`. A negative `m` converts to a huge unsigned value, so the result is `r` itself.

## Platform mapping

### Video and palette

A `Surface` is a 320x200 `Uint8Array` of palette indices with a pitch. The blitters write through linear
offsets exactly as the C does: they clip against the start and end of the buffer but not against the left
and right edges, so a sprite drawn off the side wraps onto the neighbouring row.

`PaletteState` holds the current 256-colour palette and the C's `colors` array. Palettes from
`palette.dat` are expanded from 6 to 8 bits with `(c << 2) | (c >> 4)`. Fades change the palette one step
at a time and call `showVGA` after each step, so every fade step is a frame, as in the C.

`showVGA` reports the frame to `ctx.frameSink` (tests and tools use it to hash frames) and hands it to the
`Presenter`. `CanvasPresenter` owns a 320x200 canvas, maps indices through a 256-entry RGBA lookup into an
`ImageData` and calls `putImageData`. The page scales the canvas with CSS and
`image-rendering: pixelated`. Setup > Graphics offers Fit 4:3 (the default), Fit 8:5 and Integer; Integer
picks a whole multiple in device pixels (`src/platform/scaling.ts`).

### Input

`src/platform/dom-input.ts` turns DOM events into SDL-style events and pushes them into `ctx.input`.
Keys are identified by SDL scancodes derived from `KeyboardEvent.code`, so the layout does not matter.
Mouse motion while the level runs comes from pointer lock (`movementX/Y`), scaled to 320x200 units with
the C's integer formula. The DOM layer also handles what SDL did for the C: it releases held keys and
mouse buttons on blur, reports focus changes, turns an unexpected loss of pointer lock into an Esc press,
and calls `preventDefault` on every key except browser shortcuts such as F5, F12 and Ctrl+R (unless the
shortcut's key is bound in the game). Alt+Enter and F11 toggle fullscreen; Shift+F11 is the game's gamma key.

`Input` (`src/platform/input.ts`) ports `keyboard.c`. `serviceEvents` is `service_SDL_events`, including
its habit of returning after a single key event. The queue also reproduces when SDL makes new events
visible to `SDL_PollEvent`, which affects which frame a key lands on (see
[porting-notes.md](porting-notes.md)).

Gamepads are read through the Gamepad API by `src/platform/gamepad.ts`, a port of `joystick.c` with the C's
default assignments, thresholds and 300 ms repeat. Menus see the pad as arrow, Return and Escape keys
(`push_joysticks_as_keyboard`). Keyboard map B for the shared-keyboard mode is a web-only input device,
id `0x80`, valid only while that mode is enabled.

### Audio

`AudioEngine` (`src/audio/engine.ts`) is plain TypeScript with no Web Audio dependency. It holds the state
of `opl.c`, `lds_play.c` and the mixer from `loudness.c`, and `render()` is the port of the SDL audio
callback. The OPL percussion noise uses glibc `rand()` with its default seed (`src/audio/crand.ts`), which is
separate from the game's Mersenne Twister.

In the browser the engine runs inside an AudioWorklet (`src/audio/worklet.ts`). `WebAudio`
(`src/platform/web-audio.ts`) implements the game's `Audio` interface by posting commands to the worklet.
The C state the game reads back (`playing`, `songlooped`, `song_playing`) is mirrored from status messages.
Effects the C applies synchronously on the caller's thread are applied locally at call time. Each command
carries a sequence number so a stale status cannot overwrite newer local state.

The `AudioContext` is created inside the start click or key press, at 44100 Hz (the C's rate); if the
browser refuses that rate, the engine runs at the device rate. If the worklet cannot load, the game runs
with `NullAudio`, which is the C's `audio_disabled` path.

### Storage

The C user directory becomes a synchronous `StorageAdapter` (`src/platform/storage.ts`), backed by
`localStorage` in the browser and by a `Map` in tests. Each C file has one key:

| Key | Content |
|---|---|
| `opentyrian.tyrian.sav` | the 4722-byte `tyrian.sav` image, base64 |
| `opentyrian.tyrian.cfg` | the 28-byte `tyrian.cfg` image, base64 |
| `opentyrian.opentyrian.cfg.json` | key and mouse bindings, keyboard map B, shared-keyboard flag, scaling mode, as JSON |

If `localStorage` is blocked or a write fails, the adapter keeps the data in memory for the session and the
page shows a notice. When a stored save fails to decrypt, a copy goes to an `opentyrian.tyrian.sav.corrupt.<n>`
key and the defaults are used (the C exits instead).

Several tabs share one save. `src/game/save-sync.ts` merges another tab's writes slot by slot, keeping this
tab's own changes, when a `storage` event arrives and again before each write. `tyrian.cfg` and
`opentyrian.cfg` (never `tyrian.sav`) are also written when the page is hidden or closed.

## Save format compatibility

`src/game/save.ts` ports `JE_saveGame`, `JE_loadGame`, the `tyrian.sav` encryption and the `tyrian.cfg`
layout byte for byte. A save written by the port loads in the C game and the other way round: the golden
tests compare the stored bytes against the oracle's files, and one oracle scenario boots the C with a save
written by the TS port. To move a save between the two, copy the bytes in and out of the base64 value.

`opentyrian.cfg` is the one file stored differently. The C writes an INI-style text file with key names;
the port stores JSON with scancode numbers. It is not meant to be exchanged with the C.

`JE_loadConfiguration` makes 174 `mt_rand` draws when there is no save file (it makes up high-score
tables). The port makes them only in the same case, so the RNG phase at the title matches the C whether or
not a save exists.

## Builds

`vite build` produces the multi-file site in `dist/`. The data pak is fetched at run time from a
content-hashed URL that `vite.config.ts` finds in `public/data/`; the build fails without one. The
AudioWorklet is a separate bundle loaded through Vite's `?worker&url`.

`pnpm build:single` (`tools/build-single.ts`) runs `vite build --mode single` and stitches one HTML file:

- the app bundle in an inline `<script type="module">` (with `</script` escaped);
- the worklet source in `<script id="worklet" type="text/plain">`, loaded from a Blob URL, with a `data:`
  URL fallback for Chromium on `file://`;
- the game data, gzip-compressed and base64-encoded, in `<script id="data" type="text/plain">`, decoded
  with `DecompressionStream`.

Data files the game never reads (the Christmas-mode files, `readme.txt` and a few others) are left out. The
build fails if the result is over 8 MiB. The `__SINGLE__` define selects the inline loaders in `main.ts`.

## Porting rules

These apply to every change under `src/`:

- Keep the C's structure. One TS function per C function where practical, in a module named after the C
  file, with a `// port of JE_foo (file.c:123)` comment. Keep statement order, including the order of RNG
  draws and of writes to the scratch globals.
- No module-level mutable state. State goes on `ctx` (gameplay globals on `ctx.game`).
- Apply the integer helpers wherever the C narrows a value: on assignment to a narrower type, on
  `JE_word` and `JE_byte` arithmetic, and on division (`idiv`). Use `f32` after every float operation and
  `roundf32` for `roundf`.
- Platform calls go through the `Ctx` interfaces (`clock`, `delay`, `input`, `audio`, `storage`,
  `presenter`). Game code never touches the DOM.
- Do not fix C bugs. If the C behaves oddly in a way the player can see, the port does the same. The
  exceptions are undefined behaviour the port cannot reproduce, which is listed in
  [porting-notes.md](porting-notes.md).
- C paths that cannot run with the shipped data, or that would read outside an array, throw an
  `Error('unported: ...')` instead of guessing. `test/guards.test.ts` holds the list of allowed sites, and
  the soak fails if any of them is reached.
- Web-only behaviour (shared keyboard, multi-tab saves, scaling modes, the licence notice) is marked as such
  in a comment and kept out of the C paths' defaults.
- Every ported file starts with the GPL header and a `// Ported from: src/<file>.c` line.
