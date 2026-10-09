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

## Build & deploy

    pnpm build            # type-check, then produce a static dist/

`dist/` includes `data/tyrian2000.t2kpak`; serve it with any static host.

## Status

Sub-project 1 (Foundation) — intro, title screen and main menu, pixel-identical to the
C original (verified by golden frame tests). Menu items other than navigation show
placeholder screens. Audio, gameplay and the rest arrive in later sub-projects; see
`docs/superpowers/specs/`.

## Architecture (short)

- `src/core` – C integer semantics, binary reader, Mersenne Twister.
- `src/data` – loaders for the original data files.
- `src/video` – 8-bit surfaces, blitters, fonts, palette fades, canvas presenter.
- `src/platform` – clock, delays, input, audio interface.
- `src/screens` – ported game screens. Blocking C loops are `async` functions.
- `tools/oracle` – builds the original C with a frame-dump patch; golden tests compare.

## Credits & licence

Code: GPL-2.0-or-later (see COPYING). Ported from OpenTyrian (© The OpenTyrian
Development Team) and OpenTyrian2000 (© Kaito Sinclaire). Tyrian © Jason Emery / Eclipse
Software; art by Daniel Cook; music by Alexander Brandon. Tyrian 2000 data was released
as freeware in 2004 and is not included in this repository.
