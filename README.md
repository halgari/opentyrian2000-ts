# OpenTyrian2000-TS

A TypeScript/browser port of [OpenTyrian2000](https://github.com/KScl/opentyrian2000),
itself a port of the DOS shoot-'em-up Tyrian 2000. Goal: behaviour-exact, playable in a
browser.

## Setup

    pnpm install
    pnpm data ~/Downloads/tyrian2000.zip   # unpack the freeware game data (not in git)
    pnpm dev

`tyrian2000.zip` is the freeware Tyrian 2000 data release
(https://www.camanis.net/tyrian/tyrian2000.zip).

## Tests

    pnpm test             # unit tests; data tests run if `pnpm data` was run
    pnpm oracle           # build the patched C original and record every golden (see "Regenerating the oracle outputs")
    pnpm test             # now also runs the golden comparisons
    pnpm soak             # headless soak (opt-in, ~1 min), see below

`pnpm oracle` needs git, gcc, make, pkg-config and the SDL2 development headers
(SDL2_net is not needed). Golden tests skip when their oracle files (`test-data/`, gitignored) are absent.

Runtime: the whole suite takes about 1 minute (98 files, ~865 tests) and `pnpm oracle` about 2 minutes (after the
one-off C build). The long golden `test/golden/session-long.test.ts` (episode 1, levels 1-4, ~5100 frames) takes about 2 s.

### Regenerating the oracle outputs

One command rebuilds the C oracle and records everything under `test-data/oracle/`:

    pnpm oracle                       # = pnpm oracle:build && tsx tools/oracle/run.ts all

`run.ts all` writes the TS-made save seeds (`test-data/ts-save/`, see `tools/oracle/ts-save.ts`), then runs every scenario
of `scenarios.ts` (demos, shop, `session-*`, episode end), `scenarios-input.ts` (in-level input), `scenarios-shopc.ts` (shop
options, saves) and the 70 + 7 level demos, and renders the audio references. Single scenarios, e.g. after editing one:

    pnpm oracle:run session-long-ep1          # any name from the scenario files (HASH, STATE2, save dump)
    pnpm oracle:run levels                    # only the level demos, listing crashes at the end
    pnpm oracle:build                         # rebuild the patched C binary only

Session scenarios (`session-*`, `ts-save-load`) are authored from the TS port's own timeline and then checked by the C:

    pnpm tsx tools/oracle/ts-scenario.ts session-long-ep1   # rewrites the `<discovered>` region of scenarios.ts
    pnpm oracle:run session-long-ep1                         # the C records HASH + STATE2 + sav/cfg bytes
    pnpm vitest run test/golden/session-long.test.ts         # TS must match all three

Oracle environment variables (set by `tools/oracle/run.ts`; see `tools/oracle/dump-frames.patch`):
`OT_DUMP` raw frames, `OT_HASH` per-frame CRC-32 of palette+pixels, `OT_STATE` per-frame 16 x u32
state record, `OT_DEMO=n` plays `demo.n` next, `OT_RAW_EVERY`/`OT_RAW_FRAMES` select raw frames,
`OT_FAST=1` virtual clock (no real-time waits; frame content is identical). The `demo-1`..`demo-5`
scenarios write `test-data/oracle/<name>.hash` and `.state`. To dump a raw window for debugging:

    pnpm oracle:run demo-1 --raw 1200-1260    # -> test-data/oracle/demo-1.dbg.frames

Oracle v2 inputs and records (details in `tools/oracle/dump-frames.patch`, header of `src/oracle.c`):
`OT_KEYS=frame:scancode[:hold]` (hold 0 = tap; hold h = keydown after frame, keyup after frame+h),
`OT_MOUSE=frame:m:dx:dy | frame:d:btn | frame:u:btn`, `OT_STATE2` 36 x 32-bit record (layout in
`test/helpers/state-trace.ts`), `OT_STATE3` 16 x 32-bit record (player 2, mode flags, galaga/timer globals; scenarios
with `state3: true`), `OT_SAVEDUMP=dir` (copies `tyrian.sav`/`tyrian.cfg` at exit),
`OT_IDLE_POLLS` (default 2000). Screens that draw once and then block (gameplay/episode/difficulty select, load,
high scores) never present another frame, so a key scheduled for a later frame would hang the process. If no frame
is presented for `OT_IDLE_POLLS` delay polls, the next pending input (and all with the same frame number) is injected
anyway. Concrete scenarios should use the exact last frame of the blocking screen, found with the discovery runner:

    pnpm oracle:discover tools/oracle/specs/newgame-ep1-first-shop-to-level.json   # writes scenarios.ts
    pnpm oracle:run newgame-ep1-first-shop-to-level

Scenarios may also set `mouse`, `state2`, `saveDump` (-> `<name>.save/`), `homeSeed` (a `tyrian.sav` copied into the
oracle HOME) and `dataDir` (alternate `-t` data dir).

Session goldens (`test/golden/session.test.ts`) run `runGame` from boot with the scenario's input and compare every
frame and STATE2 record. `session-ep1-easy` came from the discovery runner; the other `session-*` scenarios and
`ts-save-load` are authored from the TS port's own timeline (`pnpm tsx tools/oracle/ts-scenario.ts <name>`, then
`pnpm oracle:run <name>`): the C oracle and the session test decide whether that timeline was right. `ts-save-load` seeds the oracle HOME with a save written by the TS port
(`pnpm tsx tools/oracle/ts-save.ts` makes `test-data/ts-save/tyrian.sav` first).

Add `--fixture` to write `<name>.raw.frames` instead; the tests read those as fixtures
(`demo-1 --raw 213-215 --fixture`, `demo-4 --raw 213-240 --fixture`).

## Build & deploy

    pnpm build            # type-check, then produce a static dist/

`dist/` includes `data/tyrian2000.t2kpak`; serve it with any static host.

## Status

Sub-project 1 (Foundation) — intro, title screen and main menu, pixel-identical to the
C original (verified by golden frame tests). Menu items other than navigation show
placeholder screens. Sub-project 2 (Audio) — music (OPL2/LDS) and sound effects, verified
against the C oracle and played in the browser through an AudioWorklet. Gameplay and the
rest arrive in later sub-projects; see `docs/superpowers/specs/`.
Sub-project 3 (Gameplay) — the five built-in demos play from the title menu (Demo) with music
and sound effects, frame-exact against the C oracle (pixels and a per-frame state trace),
including aborting a demo with a key and playing the next one. Starting a new game, the
shop/menus and the other level types arrive in later sub-projects.
Sub-project 4 (Game flow) - the whole story/arcade loop is playable in the browser:

- Title: New Game, Load Game, High Scores, Instructions, Setup (web-lite: volumes and toggles), Demo, Quit.
- 1 Player Full Game (episodes 1-5, Easy to the hidden difficulties) and 1 Player Arcade: episode scripts, story text,
  data cubes, the shop (ship, weapons with power, shield, generator, sidekicks, specials, options, key/mouse
  configuration, save/load), planet maps, levels with keyboard and mouse control, pause, the in-game menu, the end-of-level
  tally, game over with restore from the level-start backup, episode end with high-score entry and the credits.
- Saves, configuration and high scores live in browser localStorage (bytes identical to the C `tyrian.sav`/`tyrian.cfg`);
  a corrupt blob is kept under a backup key, a blocked localStorage falls back to memory.
- Verified against the C oracle frame by frame (pixels and a per-frame state record) for whole sessions from boot, including
  the long run through four levels with shops and purchases; a headless soak plays every level of every episode with random
  held keys and walks every episode script through its shops (`pnpm soak`); a headless-Chromium smoke test (new game, buy,
  play, pause, in-game menu, quit, load the backup save, reload with the save still in localStorage) passed.

Not ported yet (they throw `unported:` or are refused on the menu): two-player modes, 1 Player Timed Battle, Galaga/ENGAGE
bonus modes, Super Arcade / SuperTyrian, network play, joystick, Destruct, the Jukebox and the graphics scaler setup.

### Headless soak

`pnpm soak` (= `SOAK=1 vitest run test/soak`; skipped without `SOAK=1`) starts every level record of every episode from a
synthetic demo header with a random loadout (all ships, weapons, sidekicks, specials), hands the ship to a bot with seeded random
held keys (two runs in three are immortal so the late events are reached) and checks: no throws, no `MegaData.oobReads`,
and item/cash invariants after every frame; a second test walks each episode script with random keys through its
story screens, shops and planet maps. Knobs: `SOAK_ROUNDS`, `SOAK_SEED`, `SOAK_FRAMES` (frames per level, default 8000),
`SOAK_SCRIPT_FRAMES`. One round takes about 45 s. Known C-undefined case, reported but not failed: episode 5 level 1,
when the level never ends (boss not killed), scrolls layer 3 past the top of its map (the C then reads neighbouring globals).


## Architecture (short)

- `src/core` – C integer semantics, binary reader, Mersenne Twister.
- `src/data` – loaders for the original data files.
- `src/video` – 8-bit surfaces, blitters, fonts, palette fades, canvas presenter.
- `src/platform` – clock, delays, input, audio interface.
- `src/screens` – ported game screens. Blocking C loops are `async` functions.
- `tools/oracle` – builds the original C with a frame-dump patch; golden tests compare.
  It also builds `reference/oracle/audio-render` (OPL + LDS music from the C sources) and writes reference PCM to `test-data/oracle/audio/`.

## Credits & licence

Code: GPL-2.0-or-later (see COPYING). Ported from OpenTyrian (© The OpenTyrian
Development Team) and OpenTyrian2000 (© Kaito Sinclaire). Tyrian © Jason Emery / Eclipse
Software; art by Daniel Cook; music by Alexander Brandon. Tyrian 2000 data was released
as freeware in 2004 and is not included in this repository.
