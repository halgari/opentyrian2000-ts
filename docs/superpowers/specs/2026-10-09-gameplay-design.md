# OpenTyrian2000-TS — Sub-project 3 (Gameplay core)

Date: 2026-10-09
Status: approved to proceed autonomously ("continue, merge as needed")
Parent: `2026-10-09-foundation-design.md` (architecture rules in §3 apply)
Survey: `2026-10-09-gameplay-survey.md`. This is the authoritative map of the C code, its
call path, quirks and draw order; section numbers below refer to it.

## 1. Goal

Port the in-level game of OpenTyrian2000 at the pinned commit (levels, backgrounds,
starfield, player, shots, enemies, events, explosions and HUD) so that the built-in demos
play in the browser.

**Done** means:
- In the golden test, `demo.1`–`demo.5` replay frame-identically to the C oracle: every
  frame's palette and pixels hash-equal, from the title's "Demo" fade-out, through the level
  and the end-of-level warp, back to the title.
- In the browser, choosing **Demo** on the title menu, or idling 30 s, plays the demos in
  sequence. Any key returns to the title, as in the C.

**Out of scope** (sub-project 4 and later):
- episode script parsing (`JE_loadMap` lines 2429–3034)
- shops and menus
- player keyboard and mouse control in a real game
- save/load
- two-player, galaga, arcade and super-arcade modes
- smoothie filters (lava/water/ice/blur)
- events that never occur in the demo levels

These are ported only where the demo path needs their code to exist (for example a
`twoPlayerMode` branch that has to evaluate to false). Unported branches are marked with
`// TODO(sp4): <C ref>`, and the code fails loudly (throws) if one is ever reached, rather
than silently diverging.

## 2. Architecture

### 2.1 State
All C globals involved go into `ctx.game: GameWorld`, defined in `src/game/world.ts`. One
typed object holds the globals of `config.c`, `varz.c`, `tyrian2.c`, `mainint.c`,
`backgrnd.c`, `shots.c`, `episodes.c` and `lvllib.c`. It is grouped in sub-objects that
mirror the C files:
`config`, `varz`, `level`, `map`, `backgrounds`, `players[2]`, `enemies`, `enemyShots`,
`playerShots`, `explosions`, `events`, `demo`, `items`, `scratch`.

Field names are the C names in camelCase. Fixed-size C arrays become typed arrays or
arrays of plain classes. `createGameWorld()` returns the C's static-initialiser state.

The scratch globals `temp`, `temp2`, `temp3`, `tempW`, `b`, `x` and `y` (survey §5.1) live
in `ctx.game.scratch` and are written with explicit `u8`/`u16`/`s16` wrapping, so the C's
cross-function clobbering is reproduced.

`ctx.state.playDemo` and friends stay in `ctx.state`. The foundation fields are not moved.

### 2.2 Modules (`src/game/`)

| file | C source |
|---|---|
| `world.ts` | globals and struct types (`Player`, `Enemy`, `EnemyShot`, `PlayerShot`, `Explosion`, `EventRec`, …) |
| `config.ts` | `JE_loadConfiguration` defaults + RNG burn, `JE_initProcessorType`, `JE_setNewGameSpeed`, `JE_initPlayerData` |
| `../data/itemdat.ts` | `JE_loadItemDat` (weapons, ports, specials, power systems, ships, options, shields, enemyDat) |
| `../data/level.ts` | `JE_analyzeLevel`, the level-record parse, the shapes file and the three maps |
| `demo.ts` | `load_next_demo`, `replay_demo_keys` |
| `backgrounds.ts` | backgrnd.c: rows, layers 1–3, starfield, `JE_filterScreen`, `JE_checkSmoothies` |
| `explosions.ts` | `JE_setupExplosion(Large)`, `JE_doSP`, `JE_drawSP`, and the explosion passes of `JE_main` |
| `hud.ts` | shield, armor and power bars, `JE_dBar3`, `JE_drawTextWindow`, `JE_inGameDisplays`, `JE_drawOptions`, port-config buttons, warning/timer text |
| `shots.ts` | shots.c minus `simulate_player_shots`, plus `JE_getShipInfo`, `JE_portConfigs` |
| `enemies.ts` | `JE_drawEnemy`, `blit_enemy`, `JE_newEnemy`, `JE_makeEnemy`, `JE_createNewEventEnemy`, `JE_searchFor`, boss bar, and the enemy-shot pass of `JE_main` |
| `events.ts` | `JE_eventSystem`, `JE_eventJump` |
| `player.ts` | `JE_playerMovement`, `JE_mainGamePlayerFunctions`, `JE_playerCollide`, `JE_playerDamage`, player.c |
| `specials.ts` | `JE_SFCodes`, `JE_specialComplete`, `JE_doSpecialShot` |
| `level.ts` | `JE_main` (level start, `level_loop`, `start_level` epilogue), `JE_starShowVGA` |

### 2.3 Control flow
- **`JE_main`** stays one async function with an inner `for(;;)` loop for `level_loop`.
  Its labels become explicit sub-steps; the goto-heavy parts follow survey §5.7.
- **`JE_drawEnemy`'s gotos** become an inner function returning early. The exact
  statement boundaries are kept.
- **Frame pacing:** `JE_starShowVGA` awaits a new `waitDelayPlain`, the plain `wait_delay`.
  It does not service input.
- **Demo abort:** `service_SDL_events(false)` runs at tyrian2.c:2201, as in the C.

### 2.4 Numeric semantics
These follow the survey:
- `mt_rand()` is 64-bit unsigned in C, so `%` against a negative signed int needs
  `rngMod(r, m)`, which emulates the C conversion (survey §5.5).
- `roundf` uses `roundHalfAway(Math.fround(...))`.
- float32 math uses `Math.fround` after each operation.
- `sinf`/`cosf` start as `Math.fround(Math.sin(...))`. If the golden tests diverge there,
  they switch to an exact table generated by the oracle.

### 2.5 Map memory model
The map layers are arrays of tile pointers that the C walks with pointer arithmetic, and
it reads outside the rows (survey §5.3). They are modelled as one flat `Int32Array` per
layer, where -1 means NULL, plus integer cursors.

`megaData` is reproduced as one flat "pointer slot" array in the C struct's field order,
so that out-of-range reads see the same neighbouring slots the C does. Tile pixel data
lives in a parallel store indexed by slot value.

## 3. Verification

### 3.1 Oracle extension
`tools/oracle/dump-frames.patch` is extended:
- **`OT_HASH=path`**: per `JE_showVGA` record, write `u32 frame, u32 crc32(palette ‖ pixels)`
  instead of the raw frame. Raw dumping (`OT_DUMP`) stays.
- **`OT_RAW_EVERY=n`** (with `OT_DUMP`): dump a raw frame only every n frames, plus any
  frame listed in `OT_RAW_FRAMES=a,b,c`. This is used for debugging diffs.
- **`OT_STATE=path`**: one fixed-size binary record per `JE_showVGA`:
  - `frame`, `mtCalls`
  - `curLoc`, `eventLoc`
  - player 0: `x`, `y`, `shield`, `armor`, `cash`
  - `enemyOnScreen`, count of live enemies, count of live player shots, count of live enemy
    shots, count of live explosions
  - `backPos`, `mapY`

  It is all u32. The exact layout is a struct, documented in the patch and mirrored in TS.
- **`mtCalls`**: a call counter in `mtrand.c`. `mt_rand_1`/`mt_rand_lt1` count through
  `mt_rand`. The TS `MersenneTwister` gains the same counter.
- **`OT_DEMO=n`**: presets `demo_num = n-1`, so the next demo played is `demo.n`.

Demo scenarios boot with the seed, navigate the title menu to **Demo**, and run until the
title's first idle frame after the demo. The menu key presses are injected at idle-menu
frames.

### 3.2 Golden tests
- **Level prefix:** compare the hash and state of the frames from boot to N level frames.
- **Full demos:** `demo-1` … `demo-5`, all frames hash-equal and all state records equal.
- **On mismatch** the report names the first differing frame and the first differing
  state field, which points at the subsystem. Dumping raw frames for that window is done
  manually with the oracle runner.
- **Speed:** goldens run the TS headless with `VirtualClock` and `NullAudio`. Five demos
  are about 22k frames, which must finish in under 60 s total in vitest.

### 3.3 Unit tests
Each module has focused tests against data or synthetic fixtures, listed per task in the
plan.

## 4. Browser
- `runGame` calls `initPlayerData`, then `JE_main` when `playDemo`. Music plays through
  the existing `Audio` interface: `play_song(levelSong-1)` and the sound queue go to
  `multiSamplePlay`.
- While the demo runs, any key or click returns to the title, as in the C.
