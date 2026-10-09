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

    pnpm oracle:run demo-1 --raw 1200-1260    # -> test-data/oracle/demo-1.raw.frames

## Build & deploy

    pnpm build            # type-check, then produce a static dist/

`dist/` includes `data/tyrian2000.t2kpak`; serve it with any static host.

## Status

Sub-project 1 (Foundation) — intro, title screen and main menu, pixel-identical to the
C original (verified by golden frame tests). Menu items other than navigation show
placeholder screens. Sub-project 2 (Audio) — music (OPL2/LDS) and sound effects, verified
against the C oracle and played in the browser through an AudioWorklet. Gameplay and the
rest arrive in later sub-projects; see `docs/superpowers/specs/`.

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
