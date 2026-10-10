# Porting notes

C behaviour that is easy to get wrong, the places where the C has undefined behaviour and the port had to
choose, and the known differences from the original. Line numbers refer to the pinned C tree in
`reference/opentyrian2000/src`.

C types, from `opentyr.h`: `JE_byte` u8, `JE_shortint` s8, `JE_integer` s16, `JE_word` u16, `JE_longint`
s32, `JE_real` float32, `uint` u32. `ulong` is 64 bits on the Linux oracle, which matters for player cash
and for `mt_rand()`.

## Known differences

- Sound effects are not sample-exact. The C converts the 8-bit 11025 Hz samples with `SDL_ConvertAudio`,
  whose resampler varies between SDL versions. The port expands each sample with `v << 8` and resamples
  by linear interpolation to `round(n * rate / 11025)` samples (exactly 4n at 44100 Hz). The mixer itself
  (channels, volumes, clamping) is exact, and music is sample-exact.
- If the browser will not open the `AudioContext` at 44100 Hz, everything runs at the device rate. The C
  allows this too (SDL may return a different rate), but the output then no longer matches the oracle.
- Audio state the game reads back (`playing`, `songlooped`) lags by one message from the worklet, as it
  lags behind the audio thread in the C. Only the level's game-over music, the high-score screen and the
  jukebox read it.
- The RNG is seeded from the clock at boot, like `mt_srand(time(NULL))`. Tests and the oracle use seed 1.
- Quitting from the title returns to the title, since a page cannot exit. The `trentWin` ending, where the
  C leaves its main loop and prints "Sleep well, Trent" to the console, shows that text on screen and
  returns to the title.
- Christmas mode is never on. The oracle forces it off too.
- A corrupt `tyrian.sav` makes the C exit with status 255. The port keeps a copy under a backup key and
  starts with defaults.
- SuperTyrian at Suicide difficulty needs Scroll Lock held while typing `ENGAGE`
  (`newSuperTyrianGame`). Many laptop keyboards have no Scroll Lock key.

## The RNG

All gameplay randomness is `mt_rand` (`src/core/mtrand.ts`), a straight port of the C Mersenne Twister.
The port is exact only if every draw happens in the same order, so treat each `ctx.rng` call as part of
the behaviour.

- `JE_loadConfiguration` makes 174 draws when there is no save file (made-up high scores), and none when a
  save exists. A fresh browser and a fresh oracle `HOME` both take the 174-draw path.
- `JE_initPlayerData` makes one draw (`secretHint`) on every pass of the main loop, so before every title
  screen, including after each demo.
- `initialize_starfield` makes 300 draws at every level start and every time the shop's weapon simulator
  opens. The simulator also fires shots that draw, so the time spent in the upgrade screen moves the RNG.
- In-level draws happen in a fixed order within the frame: enemy acceleration (only when the enemy has
  one, because of `&&` short-circuiting), enemy shot and launch sounds, the random enemy spawn (one draw
  every frame while enemies are active), particles, explosions, specials, random explosions (one draw per
  frame while enabled, then two more on a hit).
- `mt_rand()` returns `unsigned long`. `mt_rand() % m` with a negative `int m` converts `m` to a huge
  unsigned value, so the result is the draw itself. This happens in `JE_makeEnemy` with negative start
  ranges. Use `rngMod` from `src/core/cmath.ts`.
- Function arguments are unsequenced in C. GCC on x86-64 evaluates call arguments right to left, so in
  `JE_setupExplosionLarge(false, 20, mt_rand() % 280, mt_rand() % 180)` the y coordinate is drawn first.
  In the starfield's `mt_rand() % 320 + mt_rand() % 200 * pitch` the left operand is drawn first (checked
  with the oracle's compiler at -O0 and -O2). When in doubt, the oracle decides.
- The OPL emulator's percussion noise uses glibc `rand()`, never seeded, so seed 1. It is ported separately
  in `src/audio/crand.ts` and never touches the game RNG.

## Integers and floats

- Pay attention to every narrowing. Map positions and `backPos` are `JE_word` and wrap at 16 bits.
  `shotAvail[]` is a u8 countdown. `enemy.armorleft` is u8 with 255 meaning invulnerable. `enemy.xaccel`
  is u8 loaded from a signed byte, so negative values arrive as 128 to 255, and the comparison
  `xaccel - 89u > mt_rand() % 11` is unsigned.
- The timed battle time bonus is `JE_word x = (levelTimerCountdown / 10) * 100` (mainint.c:2691), so it
  wraps at 16 bits for countdowns above 6553.
- `JE_endLevelAni` computes the kill percentage with integer division first and stores it in a `JE_byte`.
  `editorLevel` accumulates in a `JE_word`.
- Player cash is `ulong`. `JE_saveGame` stores it truncated to s32. Loading a negative saved score would
  give a 64-bit wrapped value in C; the port keeps the negative number. Only a hand-edited save can reach
  this.
- Float maths is float32: `roundf(x * 0.75f)` for enemy values, `adjust_difficulty`, particle motion,
  sidekick orbits, the link gun, the planet map. Apply `f32` after every operation and use `roundf32`,
  which rounds half away from zero. `Math.round` rounds -2.5 to -2.
- `sinf` and `cosf` are `Math.fround(Math.sin(...))`, which may differ from glibc in the last ulp. Every
  current use rounds the result to an integer, and the goldens (particles, orbits, the linked ship and its
  gun) match the oracle.

## Shared globals and aliasing

- The scratch globals `temp`, `temp2`, `temp3` (u8), `tempW` (u16), `b` (s16), `x` and `y` (u16) are
  shared by everything. Callees clobber them and callers read the clobbered values. For example
  `JE_doSP` uses `temp` as its loop counter and is called inside the shot collision code after
  `temp = enemy[b].linknum`, so the following `temp == 254` checks see the particle count. The level loop
  also does `tempW = lastmouse_but` every frame. The shop and menu code leave values in them that the next
  level start reads. Port every write with the C type and keep the statement order.
- `player[p].lives` points at `items.weapon[p].power`. In single player the "lives" counter is the front
  weapon's power, so buying power in the shop changes it. `Player.lives` is an accessor for this.
- `JE_drawEnemy` shifts `player[0].x` by -25 at the start and back at the end, so everything it calls sees
  the shifted position.
- `JE_main`'s per-shot locals (`chain`, `playerNum`, `damage` and others) are uninitialised and keep their
  previous values between shot slots when the shot code does not set them. The port keeps them in a
  persistent object (`ShotOut`) for the same effect.
- `JE_operation` (save name entry) reads the stale `mouseButton` global that the shop loop last wrote.
- `menuInt` strings are rewritten at run time by the shop, so they are per-game state, not constants.
- The C `VGAScreen` pointer is retargeted between the visible screen, `game_screen` and `VGAScreen2`.
  Copy each draw site's target exactly: some HUD helpers draw on `VGAScreen`, others always on the visible
  screen, and `JE_playerDamage` switches the pointer temporarily.

## Undefined behaviour and how the port handles it

The rule is: reproduce it when the result is well defined in practice and shipped data reaches it; model
it as a no-op and count it when the C reads memory whose contents depend on the build; throw an
`unported:` error when shipped data cannot reach it at all.

- Map reads outside the array. The background layers are arrays of tile pointers that the C walks with
  pointer arithmetic. At a layer's edges it can read pointers from outside `mainmap`. In the oracle binary
  those slots are neighbouring globals and shape pixel data, which differ between builds and runs. The port
  stores each layer as a flat `Int32Array` of slots (-1 for NULL), treats out-of-range slots as NULL
  (nothing drawn) and counts them in `MegaData.oobReads` with a one-time warning. No golden reaches this.
  The soak fails on it, except in one case: when a level runs out of events without ending (the bot does
  not kill the boss), layer 3 eventually scrolls past the top of its map. Episode 5 level 1 does this.
  Real play ends the level first.
- Pickup values out of range. In galaga, each kill in a group doubles the pickup value of the others,
  so values such as 30720 occur in real play and index past the end of the weapon, option and special
  tables. The port frees the pickup, applies nothing, and counts it in `varz.oobPickupReads`. The soak
  reports these without failing.
- `egr[-1]`. `enemy.egr[enemycycle - 1]` with `enemycycle == 0` reads the struct bytes before `egr`.
  The port returns `ani` (the preceding field, with a zero pad byte), which is what the C layout gives.
- Uninitialised `ref[]`. `JE_loadMap` builds a tile reference table on the stack. A map byte that
  points at an unassigned entry, or at an index of 128 or more, would read garbage. No shipped level does
  this; the port throws.
- Script overflows. `]I` rows longer than `itemAvail[9][10]`, `]?` lists longer than `cubeList[4]`,
  `]G` with more than five planets and `levelWarningText` past 12 rows of 61 bytes all overflow in C. None
  occurs in shipped data; the port throws.
- Event 16 with `eventdat < 1` reads before `outputs[]`, and event 61 with an out-of-range index
  reads outside `globalFlags[]`. Unreachable; the port throws.
- Ship ids above 90 use custom ships from a user file the browser does not have. Unreachable; the port
  throws.
- `link_gun_angle` is an uninitialised local that `joystick_analog_angle` adds into. The port starts it
  at 0.
- `windowHasFocus` starts `false` in `keyboard.c`, and the level pauses while it is false. SDL delivers
  a focus-gained event at window creation, so the port starts it at `true`.

`test/guards.test.ts` lists every allowed `unported:` site; add to it only with a reason.

## Input timing

- `service_SDL_events` returns after handling a single key-down or key-up event. Loops that call it once
  per frame therefore see one key event per frame, and the number of calls per frame decides key latency.
  Keep every call the C makes, in the same place.
- SDL (through sdl2-compat, as in the oracle) only pumps new platform events into the queue when a poll
  finds the queue empty. `Input.pollEvent` reproduces this. The visible effect: in a loop that services
  events once per frame, a key pushed right after one that was just handled arrives a frame later.
- `JE_anyButton` calls `service_SDL_events(true)`, which clears `newkey` and `newmouse`. Every glow-text and
  end-of-level wait loop destroys edge state this way.
- A dead player's `JE_playerMovement` returns before resetting `button[]`. Holding fire at the moment of
  death can therefore end the game-over screen at once.
- `JE_pauseGame` ignores Ctrl and Alt (the default sidekick keys) but resumes on a mouse button.
- Relative mouse motion is scaled with `(2 * x + 1) * 320 / (2 * w)` in C integer arithmetic, where `w` is
  the output width in window pixels. In the browser `w` is the canvas width in CSS pixels.
- The title screen stores the old mouse position in a `Uint16` and compares it with the `int` position, so
  a negative coordinate always counts as mouse movement.

## Input devices

- `inputDevice` is 0 for "any", 1 keyboard, 2 mouse, 3 and up for joystick `n - 3`. Single player always
  uses 0, which merges every device each frame. Only two-player reads `inputDevice[0]` and `[1]`.
- The stored device pair (in `tyrian.cfg` and in saves) can be anything: a pad that is no longer connected,
  or two players on the same device. The C repairs the pair only when the 2 Player Arcade menu is drawn.
  The port never rewrites the stored bytes, so they survive a save, and resolves the pair at the point of
  use (`effectiveInputDevices` in `src/game/twoplayer.ts`) against the joystick count at that moment. A
  browser reports a pad only after a button press, and a pad can disappear at any time.
- Keyboard map B for the shared-keyboard mode is device `0x80`. It is legal only while that mode is on and
  is otherwise normalised away.
- The oracle has no joystick. Pad handling follows `joystick.c` (thresholds, sensitivity, 300 ms repeat,
  default assignments) but is verified only by unit tests and the e2e test.

## Game flow quirks

- `JE_main`'s `goto level_loop` (the F1 help path) reruns the whole frame body, including events and RNG,
  without presenting. `skipStarShowVGA` is cleared only inside `JE_starShowVGA`.
- `]b` always saves the backup to slot 11 (the two-player choice computed above it is dead code). The
  backup is written with `saveLevel`, which only `]s` updates, so a death restores to the last `]s`
  section, not the current one.
- `]h` (Hard or above) discards exactly the next script line. `]J` and the other jumps restart from the top
  of the script file and land on a section start.
- Winning an ENGAGE level does not undo ENGAGE. Only death restores the backup and clears `superTyrian`.
  After beating the ENGAGE stage at the end of episode 1, episode 2 starts with the ENGAGE ship and the
  SuperTyrian shop. The port does the same.
- `JE_initEpisode` reloads all item tables (ships, weapons, enemies) on every episode change. Episodes 4 and
  5 keep their item tables inside the level file, at `lvlPos[lvlNum - 1]`.
- Level records are at `lvlPos[(lvlFileNum - 1) * 2]`: the level file holds paired entries.
- The smoothie filters (lava, water, ice, blur) read `game_screen` before writing it, so their output
  depends on the previous frame, including rows the level never draws. `game_screen` must persist
  bit-exactly and start zeroed, as SDL allocates it. Event 64 kinds 3 and 5 share `smoothie_data[2]`.
- The level is composed in `game_screen` with a 24-pixel left margin and copied to the visible screen as a
  264x184 window, so the HUD on the visible screen survives.
