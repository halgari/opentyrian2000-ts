# OpenTyrian2000-TS — Overall Architecture & Sub-project 1 (Foundation)

Date: 2026-10-09
Status: draft for review

## 1. Goal

A browser port of OpenTyrian2000 (C, GPL-2.0) to TypeScript, hosted as a static site
(eventually a single HTML file on Cloudflare) so people can play Tyrian 2000 in a browser.

**Fidelity requirement:** behaviour-exact. Same game logic, same RNG, same fixed-point
math, same quirks, same draw order — the look and feel of the DOS original.
**Non-requirement:** DOS emulation. We port *behaviour*, not *platform*. Platform plumbing
(SDL video/audio/events, files, wall-clock timers) is re-implemented in clean browser terms.
The one emulated chip is the OPL2 synth (music depends on it); it is a self-contained module.

**Source of truth:** `https://github.com/KScl/opentyrian2000` at commit
`aad5aca01af139c0b089237c38ef765f7a84355d` (2026-02-22). Every ported TS function names
the C function it came from (`// port of JE_loadPic (picload.c)`), so behaviour can be
cross-checked line by line.

## 2. Roadmap (sub-projects)

Each sub-project gets its own spec → plan → build cycle.

1. **Foundation** (this spec): tooling, data packing, loaders, 8-bit framebuffer + canvas
   presenter, palette fades, sprites, fonts, async frame loop, input, reference oracle.
   Done = intro logos + title screen + main menu render pixel-exact vs. the C oracle.
2. **Audio**: OPL emulator + LDS music player in an AudioWorklet; SFX/voice samples.
3. **Gameplay core**: levels, backgrounds, player, shots, enemies, events.
   Done = `demo.1`–`demo.5` replay identically to the oracle.
4. **Game flow**: episode scripts, shop/upgrade menus, datacubes, save/load
   (browser storage), arcade + 2-player.
5. **Polish & ship**: ending animation, help, setup menu, gamepad, single-file HTML build,
   Cloudflare deploy.

Parked: network play, Destruct minigame, hqNx scalers (CSS does scaling).

## 3. Architecture decisions (apply to all sub-projects)

### 3.1 Toolchain
- pnpm, TypeScript (strict, `noUncheckedIndexedAccess` off — hot array code), Vite for
  dev server and build, vitest for tests, `fflate` for reading the data zip in tooling.
- Node ≥ 22 for tooling/tests. Target modern evergreen browsers (ES2022).
- No UI framework. The page is a `<canvas>` plus a minimal start overlay.

### 3.2 Async control flow
The C code is full of blocking loops (`fade_palette`, `wait_input`, the title menu loop,
later the gameplay loop) that call `setDelay` / `service_wait_delay` / `JE_showVGA`.
We keep that structure 1:1 by making those functions `async` and turning each blocking
wait into an `await`:

| C | TS |
|---|---|
| `setDelay(n)` | `clock.setDelay(n)` (sync, records target time) |
| `service_wait_delay()` | `await waitDelay(ctx)` — services input, resolves when target reached |
| `wait_delayorinput()` | `await waitDelayOrInput(ctx)` |
| `wait_input(k,m,j)` / `wait_noinput` | `await waitInput(ctx, …)` / `await waitNoInput(ctx, …)` |
| `SDL_Delay(ms)` | `await clock.sleep(ms)` |
| `SDL_GetTicks()` | `clock.now()` |
| `JE_showVGA()` | `showVGA(ctx)` (sync; presents `VGAScreen` with current palette) |

Timing constants are kept exact: `delayPeriod = speed * 12 / 14318180 * 1000` ms with
default speed `0x4300` (~14.37 ms per delay unit).

**Clock interface** (`src/platform/clock.ts`):
```ts
interface Clock { now(): number; sleep(ms: number): Promise<void>; }
```
- `BrowserClock`: `performance.now()`; `sleep` resolves via `setTimeout`
  (`requestAnimationFrame` is not used for timing — C timing is delay-based, presentation
  happens synchronously in `showVGA`).
- `VirtualClock` (tests): `sleep` advances virtual time and resolves immediately
  (microtask), making whole screens run in milliseconds and deterministically.

### 3.3 State: explicit context, no module globals
All mutable state lives in a `Ctx` object passed as the first argument to ported
functions. Foundation's `Ctx`:
```ts
interface Ctx {
  clock: Clock;           // timing
  delay: DelayTimer;      // setDelay/setDelay2 targets, delay speed
  video: Video;           // VGAScreen, VGAScreen2, game_screen surfaces; presenter
  palette: PaletteState;  // palettes[24], current palette, `colors`
  input: Input;           // keysactive, newkey, lastkey_scan, mouse state, event queue
  audio: Audio;           // interface; Foundation ships a no-op implementation
  assets: Assets;         // loaded sprite tables, sprite2 sheets, text, pics
  rng: MersenneTwister;   // mt_rand port
  state: { versionString: string; xmas: boolean; moveTyrianLogoUp: boolean; /* … */ };
}
```
Later sub-projects add typed game-state objects (`player[]`, level state, …) to `Ctx`.
Reason: deterministic tests need fresh state per test; globals make that fragile.
Naming: ported functions keep their C names in camelCase-ish form where that aids
cross-referencing (`loadPic`, `blitSprite2`, `fadePalette`), grouped into modules that
mirror the C files.

### 3.4 Numeric fidelity
- Pixel/palette buffers are `Uint8Array`, so byte wraparound happens naturally on store.
- Integer division uses `Math.trunc` (C truncates toward zero) — e.g. palette fade deltas.
- Signed-byte params (`Sint8 value`) are normalised with a helper `s8(x)`; 16-bit with
  `u16`/`s16` in `src/core/int.ts`.
- `mt_rand` is ported exactly with `Uint32Array` state and `Math.imul`/`>>> 0`.

### 3.5 Surfaces and drawing
- `Surface = { w: 320, h: 200, pitch: 320, pixels: Uint8Array }`. All C blitters write
  through a linear offset (`y * pitch + x`) and **do not clip horizontally** (sprites wrap
  onto the next row); only buffer lower/upper bounds are checked. We preserve this exactly.
- Ported modules: `vga256d` (pix, rectangle, barShade, barBright, fill), `sprite`
  (sprite tables + all `blit_sprite*` variants), `sprite2` (all `blit_sprite2*` variants
  incl. x2), `font`/`fonthand` (draw_font_hv*, JE_dString, JE_textWidth, JE_outText*, …),
  `mouse` cursor draw/restore.

### 3.6 Presentation
- `Presenter` owns a 320×200 `<canvas>`; `present(surface, palette)` maps indices through
  a `Uint32Array(256)` RGBA lookup into one `ImageData` and `putImageData`s it.
- The palette lookup is rebuilt only when the palette changes (dirty flag).
- The canvas is CSS-scaled with `image-rendering: pixelated`, default aspect 4:3
  (DOS 320×200 on a 4:3 monitor), fit to window, black letterbox.
- Every `present` call is also reported to an optional `FrameSink` (tests/oracle compare).

### 3.7 Input
- DOM `keydown`/`keyup`/mouse events are pushed into a queue; `serviceEvents(ctx, clearNew)`
  drains it exactly like `service_SDL_events` — including the C quirk that it **returns
  after processing a single key-down/key-up event**.
- Keys are identified by an SDL-scancode-compatible enum mapped from `KeyboardEvent.code`
  (layout-independent, matches SDL scancodes).
- Mouse coordinates are mapped from canvas CSS pixels to 320×200 space.
- Text input (`new_text`, `last_text`) from `KeyboardEvent.key` for printable keys
  (used by the title screen's secret-name codes).
- Browser-reserved keys (arrows, space, Tab, F-keys the game uses) get `preventDefault`.
- Fullscreen: Alt+Enter / F11 toggles `canvas.requestFullscreen()`.
- Gamepad: Sub-project 5.

### 3.8 Game data
- Never committed. `pnpm data <path-to-tyrian2000.zip>` (default
  `~/Downloads/tyrian2000.zip`) runs `tools/pack-data.ts`, which:
  1. reads the zip with `fflate`,
  2. keeps only data files (drops `*.exe`, `*.pif`, `*.ico`, `*.ovl`, `setup.box`),
     lower-cases names,
  3. writes `public/data/tyrian2000.t2kpak` (format below), gzip-compressed,
  4. writes the uncompressed files to `data/tyrian2000/` for Node tests and the oracle.
- PAK format (little-endian): `"T2KP"` magic, `u32 count`, then per entry
  `u8 nameLen, name (ASCII), u32 size`, then all file bodies concatenated in entry order.
- Runtime: `fetch` → `DecompressionStream('gzip')` → parse PAK → `DataArchive`
  (`get(name): Uint8Array`, case-insensitive). Loaders take a `Uint8Array` and use a
  `BinaryReader` (`u8/u16/s16/u32/s32`, `pascalString`, `seek/tell`) — no file handles.
- The future single-file build inlines the gzipped PAK as base64 (~6 MB HTML).

### 3.9 Reference oracle (verification)
- `tools/oracle/` holds a patch + build script for the C source: `pnpm oracle:build`
  clones the pinned commit into `reference/` (gitignored), applies
  `tools/oracle/dump-frames.patch`, and builds with the system SDL2.
- The patch: when env `OT_DUMP` is set, every `JE_showVGA()` appends a record
  (`u32 frameIndex, 768 bytes palette (8-bit RGB), 64000 bytes VGAScreen`) to that file;
  `mt_srand` uses a fixed seed (env `OT_SEED`, default 1); xmas mode is forced off;
  env `OT_MAX_FRAMES` exits after N frames. The build uses `WITH_NETWORK=false` (no
  SDL2_net needed) and `VCS_IDREV='echo oracle'`, so the version string drawn on the title
  screen is `oracle` (the TS port draws `ctx.state.versionString`, set to `oracle` in tests).
  The patch was verified during planning: it produces the full intro → title → menu
  sequence (142 frames) and responds to injected keys.
- `pnpm oracle:run <scenario>` runs it headless (`SDL_VIDEODRIVER=dummy`,
  `SDL_AUDIODRIVER=dummy`) against `data/tyrian2000/` and writes
  `test-data/oracle/<scenario>.frames`. Scenarios may inject scripted key presses at given
  frame indices (patch reads `OT_KEYS="frame:scancode,…"`).
- Golden tests run the TS port under `VirtualClock` with the same scripted input and
  compare each presented frame (indices + palette) to the oracle. On mismatch they write
  side-by-side PNGs to `test-output/` and report the first differing frame and pixel.
- Tests needing game data or oracle output `skip` with a clear message when absent.

### 3.10 Licensing
- Repo licensed GPL-2.0-or-later (`COPYING` from upstream); README credits OpenTyrian
  developers, Kaito Sinclaire (OpenTyrian2000), Jason Emery / Eclipse (Tyrian),
  Daniel Cook (art), Alexander Brandon (music).
- Ported files carry the upstream GPL header plus "TypeScript port, 2026".
- OPL emulator (Sub-project 2) is LGPL-2.1 (DOSBox) — compatible.
- Tyrian 2000 data is freeware (2004), not CC; it is not in git. The site serves the
  freeware data alongside the engine with a credits/licence page (Sub-project 5).

## 4. Sub-project 1 — Foundation scope

### In scope
1. Project scaffold (pnpm, Vite, TS, vitest), `COPYING`, README, `.gitignore`.
2. `tools/pack-data.ts` + runtime `DataArchive`, `BinaryReader`.
3. Core: `int.ts` helpers, `mtrand.ts` (exact MT19937 port incl. default-seed behaviour).
4. Loaders: `palette.dat` (24 palettes, 6→8-bit expansion `(c<<2)|(c>>4)`),
   `tyrian.pic` (RLE pics + `pcxpal` mapping), main shape tables from `tyrian.shp`
   (7 sprite tables + sprite2 sheets 8–12 + T2000), `newsh?.shp` compressed shapes,
   `tyrian.hdt` help text (encrypted pascal strings: `decrypt_string` walks the string
   from the last byte down, XOR-ing with key `[204,129,63,255,71,19,25,62,1,99]` (index
   mod 10) and then with the previous *encrypted* byte; ported exactly), incl. the
   OpenTyrian2000 "Setup" menu override.
   Only the text sections needed by the title/menu must be *used*, but the whole
   `JE_loadHelpText` is ported since later sub-projects need it.
5. Video: `Surface`, `vga256d` primitives, all sprite/sprite2 blitters, fonts, mouse
   cursor, `Presenter`, `showVGA`.
6. Palette: `setPalette`, `setColors`, `initStepFade*`, `stepFadePalette`,
   `fadePalette`, `fadeSolid`, `fadeBlack`, `fadeWhite` — exact integer behaviour.
7. Timing: `DelayTimer`, `BrowserClock`, `VirtualClock`, wait functions.
8. Input: event queue, `serviceEvents`, scancode mapping, mouse mapping, text input.
9. Screens: `intro_logos` and `titleScreen` ported. Menu actions that need later
   sub-projects (New Game, Load, High Scores, Instructions, Setup, Demo) show a
   "Not yet implemented" text screen then return (`restart = true`); Quit fades to black
   and shows a "Thanks for playing" screen with a restart prompt. The 30 s idle → demo
   path returns to the title (demo not yet available). Secret-name codes are parsed but
   their targets are stubs.
10. Audio: `Audio` interface (`playSample(n)`, `playSong(n)`, `stopSong()`,
    `setVolume`) with a no-op implementation; calls are placed exactly where the C makes
    them so Sub-project 2 only swaps the implementation.
11. Boot page: "Click or press any key to start" overlay (also needed later to unlock
    audio), data loading progress text, errors shown on the page.
12. Oracle tooling + golden tests for two scenarios: `boot` (intro sequence, title logo
    slide-up, menu fade-in, idle menu — frames 0–141) and `menu-nav` (Down ×3, Up ×1).

### Out of scope
Config file (`tyrian.cfg`) loading/saving (defaults are hard-coded for now), xmas mode
(flag kept, always false), setup menu, all gameplay, audio output, gamepad, single-file
build.

### Module layout
```
src/
  main.ts                 boot: overlay, load data, build Ctx, run game loop
  ctx.ts                  Ctx type + createCtx()
  core/  int.ts  mtrand.ts  binary-reader.ts
  data/  archive.ts  pak.ts  palette-file.ts  pic.ts  shapes.ts  helptext.ts  pcxmast.ts
  video/ surface.ts  vga256d.ts  sprite.ts  sprite2.ts  font.ts  fonthand.ts
         mouse.ts  presenter.ts  palette.ts  video.ts (showVGA)
  platform/ clock.ts  delay.ts  input.ts  scancodes.ts  audio.ts
  screens/ intro.ts  title.ts  stub-screen.ts
tools/  pack-data.ts  oracle/{build.sh, run.ts, dump-frames.patch}
test/   unit tests mirror src/; golden/*.test.ts; helpers/ (data loading, frame compare, PNG)
data/ public/data/ reference/ test-data/ test-output/   ← all gitignored
```

### Testing
- **Unit (no data):** BinaryReader, PAK round-trip, MT19937 vs known reference outputs
  (seed 5489 → first outputs 3499211612, 581869302, …), palette expansion and fade step
  math, each blitter on hand-built sprite bytes (incl. row-wrap and lower/upper bound
  behaviour), RLE pic decoder, helptext decrypt, `serviceEvents` single-event quirk,
  VirtualClock/DelayTimer.
- **Data (real files, skip if absent):** palette count = 24; `tyrian.shp` table counts;
  helptext `menuText` (after override) equals exactly
  `["Start New Game","Load Game","High Scores","Instructions","Setup","Demo","Quit"]`; every pic decodes to exactly 64000 pixels.
- **Golden (oracle, skip if absent):** frame-by-frame equality for both scenarios.
- **Manual:** `pnpm dev`, title screen in Chromium/Firefox; keyboard + mouse menu nav.

### Done criteria
- `pnpm test` green (with data + oracle present, golden tests run and pass).
- `pnpm dev` shows intro logos → title (logo slide, fades, menu, highlight, mouse cursor)
  matching the original; arrow keys / mouse navigate; stub screens return to title.
- `pnpm build` produces a static `dist/` that works when served.
