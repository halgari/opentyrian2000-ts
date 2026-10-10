# Testing

    pnpm test             # unit tests, plus data and golden tests when their inputs exist
    pnpm typecheck
    pnpm oracle           # build the patched C original and record every golden
    pnpm soak             # headless soak, a few minutes
    pnpm build:single     # then pnpm test also checks dist-single/tyrian.html
    pnpm test:e2e         # headless Chromium smoke tests

Tests live under `test/`, mirroring `src/`. Most of them need nothing but the source. Tests that read the
game data look in `data/tyrian2000/` (written by `pnpm data`) and skip when it is absent. Golden tests also
need the oracle output in `test-data/oracle/` and skip without it. Both directories are git-ignored, so a
fresh clone runs only the unit tests.

With the data and the oracle output in place, the whole suite takes about a minute and `pnpm oracle` about
two minutes after the one-off C build.

## Unit tests

`test/core`, `test/data`, `test/video`, `test/audio`, `test/platform`, `test/game` and `test/screens` test
modules on synthetic input or on the real data files: integer helpers, the Mersenne Twister against known
outputs, the loaders, every blitter's bounds and row-wrap behaviour, palette fades, the OPL and LDS player,
the input queue, save encryption and round trips, the script parser, the economy, and so on. Tests build a
fresh context with a `VirtualClock`, a `NullPresenter` and in-memory storage (`test/helpers/ctx.ts`).

`test/guards.test.ts` scans `src/` and fails on any `unported:` throw that is not on its allow-list.

## The C oracle

The oracle is the original C game at the pinned commit, built with a patch that records what it does.

    pnpm oracle:build     # clone, patch and build only
    pnpm oracle           # oracle:build, then tsx tools/oracle/run.ts all

`pnpm oracle:build` (`tools/oracle/build.sh`) needs git, gcc, make, pkg-config and the SDL2 development
headers (SDL2_net is not needed). It clones the upstream repository into `reference/opentyrian2000/`, makes
a working copy in `reference/oracle/`, applies `tools/oracle/dump-frames.patch` and builds with
`WITH_NETWORK=false` and `VCS_IDREV='echo oracle'`, so the version string on the title screen is `oracle`.
The tests set the same version string in the TS port. It also builds `reference/oracle/audio-render`, a
small harness (`tools/oracle/audio-render.c`) that links the C `opl.c` and `lds_play.c` and writes music PCM
without an audio device.

The runner (`tools/oracle/run.ts`) starts the oracle headless with SDL's dummy video and audio drivers, a
fresh empty `HOME` per scenario, and the data from `data/tyrian2000/`. The dummy drivers mean the oracle
never sees a joystick.

### What the patch adds

The patch forces Christmas mode off, seeds `mt_srand` from `OT_SEED` (default 1), counts `mt_rand` calls,
and adds these environment variables. The block comment at the top of `src/oracle.c` in the patch is the
reference.

| Variable | Effect |
|---|---|
| `OT_DUMP=path` | Appends a raw record per `JE_showVGA`: u32 frame, 768 palette bytes, 64000 pixels. |
| `OT_RAW_EVERY=n`, `OT_RAW_FRAMES=a,b-c` | With `OT_DUMP`, dump only every n-th frame and/or the listed frames. |
| `OT_HASH=path` | Appends u32 frame and the CRC-32 of palette and pixels per frame. |
| `OT_STATE=path` | Appends a 16 x u32 state record per frame. |
| `OT_STATE2=path` | Appends a 36 x 32-bit record per frame: RNG call count, cash, weapon power, items, level and menu state, the scratch globals, player 1 position. |
| `OT_STATE3=path` | Appends a 16 x 32-bit record per frame: player 2, the mode flags (two-player, linked, galaga, timed battle, SuperTyrian, super arcade), the link-gun angle, galaga and timer state. |
| `OT_SEED=n` | RNG seed (default 1). |
| `OT_DEMO=n` | The next demo played is `demo.n`. |
| `OT_FAST=1` | Virtual clock: `SDL_GetTicks` and `SDL_Delay` never block. Frame content is unchanged. |
| `OT_MAX_FRAMES=n` | Exit after n frames. |
| `OT_KEYS=frame:scancode[:hold],...` | After the given frame is presented, press a key. Hold 0 (or none) is a tap; hold h releases it after frame + h. |
| `OT_MOUSE=frame:m:dx:dy`, `frame:d:btn`, `frame:u:btn` | Relative mouse motion, button down, button up (SDL buttons: 1 left, 2 middle, 3 right). |
| `OT_TEXT=frame:scancode:code` | A typed character: key down, a text input event, key up. Used for name entry and title codes. |
| `OT_IDLE_POLLS=n` | See below (default 2000). |
| `OT_IDLELOG=path` | Logs the last presented frame each time the idle rule fires (used by the discovery runner). |
| `OT_SAVEDUMP=dir` | At exit, copies `tyrian.sav`, `tyrian.cfg` and `opentyrian.cfg` into `dir`. |

The record layouts are mirrored in `test/helpers/state-trace.ts`.

Inputs are keyed to presented frames. That is a problem for screens that draw once and then block
(gameplay, episode and difficulty select, the load screen, high scores, some text screens): they never
present another frame, so a key scheduled for a later frame would hang the process. The idle rule covers
this: if no frame is presented for `OT_IDLE_POLLS` delay polls, the next pending input, and every other
input with the same frame number, is injected anyway. Scenarios should still use the exact last frame of
the blocking screen, and the discovery runner finds it.

### Scenarios

A scenario is a frame budget, the inputs, and flags for the outputs to record. They are defined in:

- `tools/oracle/scenarios.ts`: boot and menu navigation, the five demos and aborting one, shop sessions,
  and a generated `<discovered>` region holding the `session-*`, `polish-*` and `ts-save-load` scenarios.
  It also defines the per-level demo scenarios and the audio scenarios.
- `tools/oracle/scenarios-input.ts`: in-level keyboard, mouse, pause, menu and game-over input on level 1.
- `tools/oracle/scenarios-shopc.ts`: shop options, key and mouse configuration, help, save and load,
  data cubes.

Besides `keys`, `text` and `mouse`, a scenario can set `hash`, `state`, `state2`, `state3`, `saveDump`
(outputs go to `test-data/oracle/<name>.save/`), `homeSeed` (a `tyrian.sav` copied into the oracle's
`HOME` first), `dataDir` (an alternate data directory), `demo` (`OT_DEMO`) and `idlePolls`.

`run.ts all` writes the TS-made seed saves, runs every scenario from all three files, the 70 per-level
demos and 7 long level demos, and renders the audio references into `test-data/oracle/audio/`. Single
scenarios:

    pnpm oracle:run session-long-ep1          # any scenario name
    pnpm oracle:run levels                    # only the level demos; lists crashing runs at the end
    pnpm oracle:run title-raw                 # an audio scenario

To dump raw frames for debugging:

    pnpm oracle:run demo-1 --raw 1200-1260    # writes test-data/oracle/demo-1.dbg.frames

`--raw-every n` selects every n-th frame instead. Add `--fixture` to write `<name>.raw.frames`, which some
tests read (`demo-1 --raw 213-215 --fixture`, `demo-4 --raw 213-240 --fixture`).

### Synthetic level demos

The five shipped demos only cover five levels of episode 1. To cover every level, the tools write
synthetic demo files: any episode, level and loadout in the header, and a seeded key stream.
`tools/oracle/demo-levels.ts` describes them (one `lvl-<ep>-<nn>` per level record, 70 in all, plus seven
`lvlx-<ep>-<nn>` long runs whose key streams in `long-keys.ts` keep the ship alive long enough to reach the
late smoothie, flip, lighting and random-explosion events). `gen-demos.ts` writes each demo and an
alternate data directory whose `demo.1` is that file; the scenario points the oracle at it with `dataDir`
and `OT_DEMO=1`. `survive.ts` is the search that produced the long-run key streams.

### Discovery runner

    pnpm oracle:discover tools/oracle/specs/newgame-ep1-first-shop-to-level.json
    pnpm oracle:run newgame-ep1-first-shop-to-level

`tools/oracle/discover.ts` turns a list of intended inputs ("press Return when the next screen is idle")
into exact frame numbers by running the oracle repeatedly, then writes the scenario into the `<discovered>`
region of `scenarios.ts`. The header of `discover.ts` documents the spec format. It needs a few oracle runs
per step, which gets slow for long sessions.

### Session scenarios authored from the TS port

Long sessions are written the other way round. `tools/oracle/ts-scenario.ts` runs a key script
(`test/helpers/script-input.ts`: steps fire on idle screens, after a number of frames, or when a predicate
holds) through the TS port's `runGame`, records the frame of every key, and writes the scenario into the
`<discovered>` region. The C then checks it: if the TS timeline was wrong, a key lands while the C is in a
different state and the frames diverge.

    pnpm tsx tools/oracle/ts-scenario.ts session-long-ep1   # rewrite the scenario
    pnpm oracle:run session-long-ep1                         # the C records HASH, STATE2 and the save files
    pnpm vitest run test/golden/session-long.test.ts         # the TS must match all three

The specs live in `ts-scenario.ts` and, for the `polish-*` modes, in `tools/oracle/ts-specs-polish.ts`
(steps in `ts-steps.ts`). `session-ep1-easy` came from the discovery runner instead.

Many scenarios start from a save written by the TS port. `tools/oracle/ts-save.ts` builds them (`SEEDS`,
with the polish seeds registered by `registerPolishSeeds()` in `ts-specs-polish.ts`), the scenario's
`homeSeed` copies the file into the C's `HOME`, and the golden test loads the same bytes into storage. A
seed save can place the game at any script section, in any mode (super arcade, two-player slots), so the
C's own `JE_loadGame` sets up the mode. `ts-save-load` checks that the C loads a TS-written save at all;
`pnpm tsx tools/oracle/ts-save.ts` writes `test-data/ts-save/tyrian.sav` on its own.

## Golden tests

`test/golden/` runs the TS port under a `VirtualClock` with `NullAudio`, injects the scenario's input with
the oracle's idle rule (`test/helpers/inject.ts`), and compares every presented frame's CRC and, where
recorded, every STATE, STATE2 and STATE3 record and the saved files. On a mismatch the report names the
first differing frame and field, and frame tests write side-by-side PNGs to `test-output/golden/<name>/`.

| Test | Covers |
|---|---|
| `boot`, `menu-nav` | intro, title and menu navigation, raw frames |
| `demo`, `demo-abort` | the five demos and aborting one with a key, HASH and STATE |
| `levels` | the 77 synthetic level demos, HASH and STATE |
| `level-start`, `hud-region`, `player`, `ship-info`, `input-movement` | smaller slices of the level code |
| `shop`, `shop-upgrades`, `shop-c`, `script` | shop sessions and the script parser |
| `session`, `session-long`, `episode-end` | whole sessions from boot, including the four-level episode 1 run (about 5100 frames, 2 s) and the episode endings |
| `polish` | ENGAGE, galaga, SuperTyrian endings, title codes, timed battle, two-player |
| `oracle-v2` | the oracle itself: determinism and held keys |
| `audio-raw`, `audio-mixed` | OPL and LDS output sample for sample, the mixer at reduced volume and during a fade, the volume table |

`SESSION=name1,name2 pnpm vitest run test/golden/session.test.ts` (or `polish.test.ts`) runs only the named
sessions.

Gamepad input and the shared-keyboard mode have no oracle (the C has neither under the dummy driver); they
are covered by unit tests and the e2e smoke test. The event 66 difficulty gate reads the initial
difficulty, which demos never set, so only the session goldens can reach it.

## Soak

    pnpm soak             # SOAK=1 vitest run test/soak; skipped without SOAK=1

`test/soak/soak.test.ts` has four tests:

1. Every level record of every episode, started from a synthetic demo header with a random loadout (any
   ship, weapon, sidekick and special), played by a bot holding seeded random keys. Two runs in three are
   immortal so the late events are reached.
2. Every episode script, walked with random keys through its story screens, shops and planet maps.
3. The galaga section (episode 1, section 41).
4. Whole sessions from the `polish-engage`, `polish-galaga` and `polish-2p` seed saves.

It fails on any throw (every `unported:` error counts, except the dead `]V` and `]R` reveals), on any
`MegaData.oobReads`, and on broken item or cash invariants after any frame. Two cases are reported without
failing: out-of-range pickup values in galaga (`varz.oobPickupReads`), and layer-3 map reads past the top
of the map when a level runs out of events because the bot never kills the boss (episode 5 level 1 does
this). Both are C undefined behaviour; see [porting-notes.md](porting-notes.md).

Knobs: `SOAK_ROUNDS`, `SOAK_SEED`, `SOAK_FRAMES` (frames per level, default 8000), `SOAK_SCRIPT_FRAMES`
(per episode, default 6000). One round takes about 45 s.

## Browser tests

    pnpm test:e2e         # vitest with vitest.e2e.config.ts

These drive Chromium through Playwright. They use `PW_CHROMIUM`, then `/usr/bin/chromium`, then
Playwright's own download, and skip if none exists. `pnpm test` never launches a browser.

- `test/e2e/single.e2e.test.ts` opens `dist-single/tyrian.html` from `file://` (run `pnpm build:single`
  first): boot, the Blob worklet, a game, a save, a reload and a load; the licence notice; play with
  `localStorage` blocked; the error shown without `DecompressionStream`.
- `test/e2e/gamepad.e2e.test.ts` rebuilds `dist/` if `src/` is newer, serves it with `vite preview` on port
  4173, and plays with a synthetic gamepad and with the shared keyboard.

## Build checks

`test/build/` runs with `pnpm test`:

- `hosting.test.ts`: `wrangler.jsonc` serves `./dist` with no Worker, no script in `package.json` deploys,
  `public/_headers` has the cache rules and stays within Cloudflare's limits, and `README.md` documents the
  deploy and the data licence.
- `single.test.ts`: the script escaping, and, when `dist-single/tyrian.html` exists, its size (under
  8 MiB), its three script elements, that it references nothing external, the gzip payload and the licence
  notice.
