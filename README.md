# OpenTyrian2000-TS

A TypeScript port of [OpenTyrian2000](https://github.com/KScl/opentyrian2000) that runs in the browser.
OpenTyrian2000 is itself a C port of the DOS shoot-'em-up Tyrian 2000. The aim is behaviour-exact play: the
same game logic, RNG, integer and float32 maths and draw order as the C, checked frame by frame against a
patched build of the original.

Play it at https://halgari.github.io/opentyrian2000-ts/

## Status

What works:

- Intro, title screen, all title menu items, and the five built-in demos.
- 1 Player Full Game (episodes 1 to 5, every difficulty including the hidden ones), 1 Player Arcade,
  1 Player Timed Battle and 2 Player Arcade, with linked ships.
- Episode scripts, story text, data cubes, planet maps, every level, the shop (ship, weapons, shields,
  generators, sidekicks, specials, key and mouse configuration, save and load), end-of-level tally, game over
  and restore, episode end, high scores and credits.
- Super Arcade ships and SuperTyrian through the title codes, the ENGAGE and galaga bonus sections, and the
  "Sleep well, Trent" ending.
- Setup: music and sound volume, fullscreen, scaling mode (Fit 4:3, Fit 8:5, Integer) and the Jukebox.
- Music (OPL2 emulation and the LDS player, sample-exact against the C) and sound effects, in an AudioWorklet.
- Keyboard, mouse (pointer lock) and gamepads through the Gamepad API.
- A web-only shared-keyboard mode for 2 Player Arcade (off by default, Setup > Controls).
- Saves, configuration and high scores in `localStorage`, byte-identical to the C `tyrian.sav` and `tyrian.cfg`.

Not ported:

- Destruct (the `DESTRUCT` title code shows a notice).
- Network play and the ship editor.
- The shop's Joystick configuration page (it is drawn but inert; pads use the default mapping).
- The pixel-art scalers (Scale2x, HQ2x and so on).
- The `]V` and `]R` script reveals, which no shipped script uses.

Sound effects are resampled to the browser's output rate, so they are not sample-exact against the C. See
[docs/porting-notes.md](docs/porting-notes.md) for this and the other known differences.

## Quick start

You need Node 22 or newer and pnpm. The game data is the freeware Tyrian 2000 release
(https://www.camanis.net/tyrian/tyrian2000.zip). It is not in this repository.

    pnpm install
    pnpm data ~/Downloads/tyrian2000.zip
    pnpm dev

`pnpm data` unpacks the zip into `data/tyrian2000/` (used by tests and the oracle) and writes a
content-hashed pak to `public/data/` (served by the dev server and the build). Both directories are
git-ignored.

`pnpm test` runs the unit tests. Tests that need the game data or the C oracle's output skip when it is
missing. See [docs/testing.md](docs/testing.md).

## Build outputs

    pnpm build            # type-check, then a static multi-file site in dist/
    pnpm build:single     # dist-single/tyrian.html: code, worklet and compressed game data in one file

- `dist/`: the multi-file site. The data pak has a content hash in its name
  (`data/tyrian2000.<hash8>.t2kpak`), so `public/_headers` can serve `/assets/*` and `/data/*` as
  `immutable` and `index.html` as `no-cache`. `_headers` also sets a Content-Security-Policy and a
  `Permissions-Policy`. There are no COOP/COEP headers because nothing uses `SharedArrayBuffer`.
- `dist-single/tyrian.html`: one file of about 6 MB that also works from `file://`. Chromium shares one
  `localStorage` between all local files, so saves are shared with any other local copy. Firefox keeps one
  per file.
- `wrangler.jsonc`: a Cloudflare Workers static-assets config that serves `./dist`, with no Worker code.

Set `OT_SOURCE_URL` to the public URL of this repository for both `pnpm build` and `pnpm build:single`.
It goes into the licence notice on the start screen. When it is unset, the notice says "source URL not
configured" and the build prints a warning.

## Deploy

No script in this repo deploys, and no CI job does either (a test checks that `package.json` has no
`wrangler deploy` script). Deploys are manual.

### GitHub Pages

The public build lives at https://halgari.github.io/opentyrian2000-ts/ and is served from the `gh-pages`
branch. The game data is not in git, so CI cannot build the site. Build it locally and push `dist/` by
hand:

    OT_SOURCE_URL=https://github.com/halgari/opentyrian2000-ts pnpm build
    touch dist/.nojekyll
    git -C dist init -b gh-pages && git -C dist add -A && git -C dist commit -m deploy
    git -C dist push -f https://github.com/halgari/opentyrian2000-ts.git gh-pages

GitHub Pages ignores `_headers`. The data pak name carries a content hash, so a new build is never served a
stale pak.

### Cloudflare

`wrangler.jsonc` and `public/_headers` are ready for Cloudflare Workers static assets, where the cache and
security headers do apply. Deploying there means running `pnpm build` and then `wrangler deploy` by hand on a
machine that has the data (wrangler is not a dependency of this repo).

## Data licence

The engine code is GPL-2.0-or-later. The Tyrian 2000 data is different: the zip has no licence file, and its
`readme.txt` says "All Rights Reserved", although the release itself is freeware. The hosted build serves it,
but it is never committed: `public/data/` and `data/` are git-ignored.

## Documentation

- [docs/architecture.md](docs/architecture.md): how the port is organised and the rules for porting code.
- [docs/testing.md](docs/testing.md): unit tests, the C oracle, golden tests, the soak and the browser tests.
- [docs/porting-notes.md](docs/porting-notes.md): C quirks, undefined behaviour and known differences.

## Credits and licence

Code: GPL-2.0-or-later (see COPYING). Ported from OpenTyrian (© The OpenTyrian Development Team) and
OpenTyrian2000 (© Kaito Sinclaire). The OPL emulator is the DOSBox one (LGPL-2.1). Tyrian © Jason Emery /
Eclipse Software; art by Daniel Cook; music by Alexander Brandon. Tyrian 2000 data was released as freeware
in 2004 and is not included in this repository.
