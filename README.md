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
    pnpm oracle           # build the patched C original and record golden frames
    pnpm test             # now also runs the golden frame comparisons

`pnpm oracle` needs git, gcc, make, pkg-config and the SDL2 development headers
(SDL2_net is not needed).

Oracle environment variables (set by `tools/oracle/run.ts`; see `tools/oracle/dump-frames.patch`):
`OT_DUMP` raw frames, `OT_HASH` per-frame CRC-32 of palette+pixels, `OT_STATE` per-frame 16 x u32
state record, `OT_DEMO=n` plays `demo.n` next, `OT_RAW_EVERY`/`OT_RAW_FRAMES` select raw frames,
`OT_FAST=1` virtual clock (no real-time waits; frame content is identical). The `demo-1`..`demo-5`
scenarios write `test-data/oracle/<name>.hash` and `.state`. To dump a raw window for debugging:

    pnpm oracle:run demo-1 --raw 1200-1260    # -> test-data/oracle/demo-1.dbg.frames

Oracle v2 inputs and records (details in `tools/oracle/dump-frames.patch`, header of `src/oracle.c`):
`OT_KEYS=frame:scancode[:hold]` (hold 0 = tap; hold h = keydown after frame, keyup after frame+h),
`OT_MOUSE=frame:m:dx:dy | frame:d:btn | frame:u:btn`, `OT_STATE2` 36 x 32-bit record (layout in
`test/helpers/state-trace.ts`), `OT_SAVEDUMP=dir` (copies `tyrian.sav`/`tyrian.cfg` at exit),
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
Sub-project 4 (Game flow) — a full session: New Game / Load / High Scores / Instructions / Setup from the title,
the gameplay, episode and difficulty selects (1 Player Full Game and 1 Player Arcade), episode scripts, the shop,
levels with keyboard and mouse control, the end-of-level tally, game over with restore from the level-start backup
save, and saves in browser storage. Two-player, timed battle, galaga, SuperTyrian and the episode-end credits are
not ported yet.

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
