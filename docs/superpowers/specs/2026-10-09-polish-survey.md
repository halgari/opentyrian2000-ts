# Polish/ship survey (sub-project 5): secret modes, timed battle, two-player, joystick, single-file build, hosting

Scope: everything left after sub-project 4 (game flow). Format follows `2026-10-09-gameflow-survey.md`.

`C/` = `reference/opentyrian2000/src` (pinned at aad5aca; the oracle is this tree plus `tools/oracle/dump-frames.patch`).
All C line numbers are `C/` unless a `src/` path is given. TS paths are relative to the repo root.
Numbers marked **[measured]** were measured on this machine (script decode, `node:zlib`, `gzip`/`brotli`/`xz`/`zstd`).
Cloudflare facts marked **[docs]** were read from developers.cloudflare.com on 2026-10-09.

Sizes: S = under about half a day, M = about a day, L = several days or a new subsystem.

---------------------------------------------------------------------------------------------------

## 0. Where we are

- Branch `polish` is master after the final-review fixes (`de1c5f6`).
- `grep -rn "TODO(sp5)" src` gives 24 hits. They fall into six clusters:
  - two-player: `flow.ts:23`, `endlevel.ts:41`, `shop.ts:64/259/541/543/550`, `highscores.ts:171`, `loadscreen.ts:185`, `ingame-setup.ts:307`, `select.ts:125`;
  - timed battle: `flow.ts:24`, `script.ts:437/442`, `endlevel.ts:41`, `highscores.ts:171`, `select.ts:125`;
  - secret modes: `script.ts:125/133/266`;
  - script reveals: `script.ts:364/368`;
  - joystick: `input-level.ts:240`;
  - misc: `glow-text.ts:147`, `input-level.ts:92`.
- `grep -rn "unported" src` gives about 45 sites. All are listed in section 11.
- Review items I1 (galaga and ENGAGE crash) and M1, M3, M4, M7, M8, M11, M13 are already fixed:
  - `UnavailableModeError` (`src/game/unported.ts`) is caught in `gameLoop` (`src/game.ts:46`);
  - blur releases held mouse buttons (`dom-input.ts:149`);
  - `main.ts` detaches input and exits pointer lock on a crash.
- Still open from the review: M2, M5, M6 and M12 (section 8).
- Much of the in-level two-player and galaga code is already ported, because it sits inside code that single player shares.
  Examples: HUD in `hud.ts`; enemy hits, `searchFor` and event 25 for galaga; `playerCollide` text; sidekick positions; `calcPurpleBallsNeeded`; `economy.ts`; `save.ts` slots 12-22.
  Only the pieces listed in section 3.2 throw.
- The oracle already supports everything needed except a second keyboard and a gamepad (sections 3.1 and 6.4):
  - `OT_KEYS` (held keys), `OT_MOUSE` (relative motion and buttons), `OT_TEXT` (typed characters, usable for title codes);
  - `OT_SEED`, `OT_STATE2`, `OT_SAVEDUMP`, and `homeSeed` (a TS-written `tyrian.sav` copied into the oracle HOME);
  - SDL's dummy video and audio drivers, so `joysticks == 0` always.

### Verification pattern used throughout

1. **Seed a save with `tools/oracle/ts-save.ts`.** The C `JE_loadGame` sets everything the mode needs from the save:
   - `items.super_arcade_mode` -> `superArcadeMode`, `superTyrian`, `onePlayerAction` (config.c:449-456);
   - slot > 11 -> `twoPlayerMode` (config.c:444);
   - `saveFiles[slot].level` -> `mainLevel`, so a seed can start at any script section.
2. **Author the scenario** with `ts-scenario.ts` (keys, text, mouse). Run `pnpm oracle:run <name>`.
3. **Compare** HASH, STATE2 and the save bytes with `test/golden/session.test.ts`.

The C therefore decides whether the TS timeline was right. Only the title-screen and new-game paths need the real menus.

---------------------------------------------------------------------------------------------------

## 1. Secret modes reachable in story play: `]e` ENGAGE, `]g` galaga, SuperTyrian completion

### 1.1 Which shipped scripts reach them **[measured: decrypted levels1..5.dat]**

| script cmd | where | how a player gets there |
|---|---|---|
| `]e` | ep1 section 41 (`*41SECTION - Extra MiniGame`, then `]g`, then `]L[ 9999 026 ** ALE **41 18`) | Ep1 sec 40 is the shop (`]b` backup, `]x`, `]G[ 01 2 05 041  21 026`). It offers planet 5 -> sec 41 (ALE) or planet 21 -> sec 26 (the end). Sec 42 (`]2 026[`, `]J 040[`) feeds sec 40. |
| `]e` | ep4 sec 40 (`]e`, `]L[ 9999 041 TIME WAR 37 17`) | Ep4 sec 38 (`]w 038`: jumps only when ship == 13) -> sec 39 shop (`]b`, `]G[ 01 2 05 040  21 042`) -> planet 5 = sec 40 TIME WAR. |
| `]e` + `]g` | ep4 sec 45 (`]e`, `]g`, `]L[ 9999 043 SQUADRON 37 18`) | Ep4 sec 44 shop (`]b`, `]G[ 01 2 05 045  21 042`). Every normal ending goes `]J 048` -> `]J 044`. |
| `]g` | ep1 sec 41, ep4 sec 45 | Same as above. |
| `]Q` with `superTyrian` and `jumpBackToEpisode1` | ep5 sec 19 | Only a SuperTyrian run that reaches the end of episode 5 (see 1.4). |

So the shipped scripts have three `]e` sections and two `]g` sections. Both `]g` sections also carry `]e`, so galaga is always played with ENGAGE items.
Everyone who completes episode 1 or 4 in the full game is offered them as an ordinary planet on the map.
The count of `]e` and `]g` lines in all five files is 3 and 2.

Other mode-related commands in the data:
- `]2` x4 (ep1 sec 42; ep4 secs 23, 32, 37; jump only when `twoPlayerMode || onePlayerAction`);
- `]x` x3 (`extraGame`);
- `]T` x2 and `]q` x2 (timed battle, section 2);
- `]w` x1 (jump when ship == 13);
- `]t` x2 (ep4 secs 32 and 34, timer jumps).

### 1.2 C call path

```
JE_loadMap (tyrian2.c:2399)  script loop, case 'e' :2523, case 'g' :2510
  'e': doNotSaveBackup=true; constantDie=false; onePlayerAction=true; superTyrian=true; twoPlayerMode=false; cash=0;
       ship=13; front weapon 39 (power 3); rear 0 (power 1); sidekicks 0; generator 2; shield 4; special 0   :2523-2542
  'g': galagaMode=true; player[1].items = player[0].items; player[1] rear weapon id 15; player[1] sidekicks 0 :2510-2517
  'L' then reads the level; JE_main plays it (tyrian2.c:2623)
start_level (tyrian2.c:641):
   win : mainLevel = nextLevel; JE_endLevelAni              :683-690  -> next script section (26 in ep1; 43 in ep4)
   lose: JE_loadGame(11) restores the backup from `]b`; since doNotSaveBackup:
         superTyrian=false; onePlayerAction=false; super_arcade_mode=SA_NONE   :700-709
   doNotSaveBackup=false afterwards                          :714
   galagaMode: `if (galagaMode) twoPlayerMode = false`       :645
```

### 1.3 Globals touched

`doNotSaveBackup`, `constantDie` (always false: it is set only by the command line, params.c:206/249), `onePlayerAction`, `superTyrian`,
`twoPlayerMode`, `galagaMode`, `player[0/1].items`, `player[0].cash`, `extraGame`, `levelWarningLines`.
At level start: `galagaLife = 10000`, `galagaShotFreq = 0` (tyrian2.c:1073-1079; already in `level.ts:245/482`), and `difficultyLevel = NORMAL` for galaga (`level.ts:481`).

### 1.4 Quirks

- **A win does not undo ENGAGE.**
  - Only the death path restores the backup and clears `superTyrian`.
  - After beating ALE in ep1, `mainLevel = nextLevel = 26`, which is `]Q` (end of episode 1).
  - `superTyrian` and the ENGAGE loadout are still set. `JE_nextEpisode` then runs, and `JE_highScoreCheck` runs because `episodeNum == initial_episode_num && !gameHasRepeated` (mainint.c:979).
  - Episode 2 then starts with the ENGAGE ship, `superTyrian` and `onePlayerAction` still true, so `JE_itemScreen` shows `MENU_SUPER_TYRIAN` (game_menu.c:254).
  - This is what the C does. The oracle must confirm it, and the TS must not "fix" it.
  - `save.ts` already handles `superTyrian` in the save mapping (:401).
- **`]Q` completion screens (tyrian2.c:2685-2740)** only run when `jumpBackToEpisode1` (set by `JE_findNextEpisode` when episode 5 ends, episodes.c:253) and `!twoPlayerMode`. They are reached from episode 5 only:
  - A SuperTyrian run started from the title ENGAGE code (section 4) plays the episodes in order from the chosen one.
  - The `]e` stages in ep1 and ep4 never reach this branch, because there `jumpBackToEpisode1` is false.
  - `superArcadeMode = (initialDifficulty == ZINGLON) ? 8 : 1` (:2694).
  - `if (superArcadeMode < SA_ENGAGE)` shows "next ship" text from `SANextShip[]` and sets `trentWin = true` when `SANextShip == SA_NORTSHIPZ` (:2715).
  - Then `jumpSection = true`; `if (superTyrian) { fade_black(10); mainLevel = 0; return; }` (:2733-2740).
  - The `superTyrian` block is missing in `script.ts:265-268`; the non-SuperTyrian arcade branch (:270-295) is ported.
  - With `superArcadeMode` 8 and `SANextShip[8] = 9`, `specialName[8]` is "PRETZEL".
- **`trentWin`** makes `main()` leave the loop (opentyr.c:885) and `JE_tyrianHalt(0)` print the "Sleep well, Trent" console text (varz.c:487-500).
  The TS sets the flag (`script.ts:287`) but nothing reads it (section 7).
- **`]e` ordering is stable.** `]e` is read before `]L` in the same section. `onePlayerAction` is therefore true while `JE_loadMap` finishes the level setup, and this affects:
  - `JE_loadMap` tail;
  - events 33, 45, 46, 80 and 85 (already ported);
  - the HUD (`hud.ts:228`).
- **Galaga changes `twoPlayerMode` during the level.**
  - The purple ball (evalue 30000) sets `twoPlayerMode = true; twoPlayerLinked = true`, `player[1].armor = 10`, `is_alive = true` (mainint.c:4756-4762). On death `twoPlayerMode` goes back to false (mainint.c:3579/3604, tyrian2.c:1154).
  - So galaga needs the entire two-player in-level machinery (section 3.2) and cannot be ported before it.
  - The dragonwing's "ship" is `shipGr2 == 0`/`1` sprite variants (mainint.c:4015).

### 1.5 What exists in TS

Already ported, though never reached for galaga:
- `events.ts:306` (event 25 galaga armor), `enemies.ts:798` (`searchFor`), `collide.ts:207` (cash to player 1), `player.ts:114-138` (respawn), `level.ts:481`.
- `script.ts:229/260` (`]Q` two-player text).
- `hud.ts:86-115` solo/two split.
- `events.ts:375-387/466` (superTyrian branches); `input-level.ts:76/89/102`; `specials.ts:51` (`shipCombosB`).
- The non-SuperTyrian part of `]Q`.

Stubbed or throwing:

| site | C | status |
|---|---|---|
| `script.ts:125` `]g` | tyrian2.c:2510 | throws `UnavailableModeError` |
| `script.ts:133` `]e` | tyrian2.c:2523 | throws `UnavailableModeError` |
| `script.ts:266` `]Q` superTyrian | tyrian2.c:2689 | throws `unported: ]Q after SuperTyrian` |
| `flow.ts:23` | tyrian2.c:645 | `twoPlayerMode \|\| galagaMode` -> throw |
| `hud.ts:193` | tyrian2.c:1147-1170 | galaga shield/life block throws |
| `enemies.ts:255` | tyrian2.c:376 | `galagaMode && (eyc==0 \|\| rand%400 >= galagaShotFreq)` throws |
| `player.ts:787` | mainint.c:4756 | galaga dragonwing spawn throws |
| `collide.ts:187` | tyrian2.c:1654-1665 | super-arcade power-up substitution (`superArcadePowerUp` counter, `egr[0]`, `evalue`) throws |
| `player.ts:203/296/728` | mainint.c:3868, 4047, 4676 | two-player linking, linked ship, two-player movement (section 3.2) |
| `shop.ts:259/541/543` | game_menu.c:735, MENU_SUPER_TYRIAN | `MENU_SUPER_TYRIAN` (13) and `MENU_2_PLAYER_ARCADE` (9) are not in `PORTED_MENUS` (`shop.ts:55`), so an ENGAGE run reaching a shop throws `unportedMenu`; the super-arcade ship panel (game_menu.c:735) throws at `shop.ts:543` |
| `shop-draw.ts:159` | varz.c:354 | custom ship graphic (ship > 90), unreachable |

`constantDie` is not a gap. It is a command-line cheat flag that is always false (`player.ts:143` documents this).

### 1.6 Verification

- **`]e`.**
  - Seed a save: `ts-save.ts` with `saveFiles[0].level = 41`, ep1, ship loadout irrelevant, `p0.items.super_arcade_mode = 0`.
  - Load it from the title screen. This runs the real `JE_loadGame` -> `JE_main` -> script `]e` -> ALE. The ALE level is a normal level, so the existing key stream tooling applies.
  - STATE2 (cash, power, items) shows the ENGAGE loadout.
  - A second scenario holds still until death, to exercise the restore (`doNotSaveBackup` branch) and compare the save bytes.
  - A third scenario with `immortal`-style synthetic input (as used by `survive.ts`) reaches `]Q` and so the episode 2 start with ENGAGE items (the quirk above).
- **Completion screens.** Seed `super_arcade_mode = SA_SUPERTYRIAN` (value in `world.ts`), ep5, level 19, difficulty ZINGLON, `initial_episode_num` 5. Then run `]Q` for two difficulty variants.
- **Galaga** needs the same method after the two-player core exists (section 3).
- **Super-arcade collide (collide.ts:187).** The demo header's `super_arcade_mode` byte is stored in `items`, but the global `superArcadeMode` is not set from it. Level demos therefore cannot cover it. Use a seeded save (above) with `super_arcade_mode` 1-9 instead. This covers the `onePlayerAction` arcade path too.

### 1.7 Size

- `]e` + `MENU_SUPER_TYRIAN` shop + `]Q` completion screens + `trentWin`: **S-M** (about 150 lines).
- `collide.ts:187` super-arcade branch: **S** (about 15 lines).
- `]g`/galaga: **M**, but only after the two-player core (item 3). Its own code is the HUD block, the enemy shot gating, the dragonwing spawn and `]g`: about 100 lines.

---------------------------------------------------------------------------------------------------

## 2. 1-player Timed Battle

### 2.1 C call path

```
titleScreen -> newGame (tyrian2.c:3625)
  gameplaySelect (menus.c:42) sets timedBattleMode = (selectedIndex == 2)   menus.c:224
  timedBattleMode: onePlayerAction = true; timedBattleSelect() && difficultySelect() -> gameLoaded   tyrian2.c:3629
  timedBattleSelect  menus.c:678-858: 3 items (names helpText.timedBattleName[1..3] = Deliani / Space Station / Savara)
      action -> fade_black(10); JE_initEpisode(selectedIndex == 0 ? 1 : 5); timeBattleSelection = selectedIndex + 1   :846
  newGame then: onePlayerAction -> cash 0, ship 8 (Stalker)
JE_main -> JE_loadMap script:
  ']T' (tyrian2.c:3004): if timedBattleMode: mainLevel = atoi(s + timeBattleSelection*3); jumpSection
        ep1: ]T[ 43 44 45 46 47    (sel 1 -> 43, sel 2 -> 44, sel 3 -> 45)
        ep5: ]T[ 03 03 04 05 06    (sel 2 -> 3 STATION, sel 3 -> 4 SAVARA)
  the section's ]L plays a level (ep1 sec 43: DELI; ep5 secs 3 and 4; nextLevel 48 / 8)
  ']q' (tyrian2.c:3015): if timedBattleMode: JE_highScoreCheck(); mainLevel = 0; return
level:
  events 84 (levelTimer on, tyrian2.c:5184) and 85 (enemy-from-enemy for timed battle only) - ported (events.ts:747-756)
  timer: tyrian2.c:2127-2155 (no sound effects in timed battle) - ported (hud.ts:319)
  JE_main start_level: death -> `if (timedBattleMode) { mainLevel = 0; return; }` (no restore, no high score)   tyrian2.c:697
  JE_saveGame backup skipped (`!timedBattleMode`) at level start tyrian2.c:934 - already in level.ts:444
  win -> JE_endLevelAni timed branches (mainint.c:2763-2776, 2778-2815): bonus = (levelTimerCountdown/10)*100 ("miscTextB[6]"),
        lives bonus animation with OPTION_SHAPES[46] blitted via blit_sprite_hv, +1000 per life ("miscTextB[7]"); skips the cubes block
  JE_highScoreCheck (mainint.c:2022): score = player[0].cash; table = timeBattleSelection - 1 (tables 0..2);
        no song 33 (:2077); loads PIC 13 first (:2094); name entry cannot be cancelled (:2212); "episode" caption is
        timed_battle_name[timeBattleSelection] (:2224)
JE_highScoreScreen already draws the three timed battle boards (highscores.ts:72)
```

### 2.2 Globals

`timedBattleMode`, `timeBattleSelection`, `onePlayerAction`, `levelTimer`, `levelTimerCountdown`, `levelTimerJumpTo`, `episodeNum`, `initial_episode_num`,
`t2kHighScores[0..2]` (first three tables), `mainLevel`, `player[0].cash`, `*player[0].lives`.

### 2.3 Quirks

- **`initial_episode_num` changes.** `JE_initEpisode(1|5)` in `timedBattleSelect` sets `initial_episode_num` through `episodeNum`; for Space Station/Savara it is 5 (episodes.c). The timed battle high score table is not indexed by it, though.
- **Section 45 of ep1** (Savara in ep1 data) has no `]L`. The ep1 selection "Savara" is index 2 and goes to ep5, so it is never used. The ep1 table `]T[ 43 44 45 46 47` has 5 slots for 3 selections.
- **`atoi(s + sel*3)`** reads at columns 3 and 6 and 9. These land on a space; atoi skips blanks. The TS `atoiAt` handles it (same helper the other commands use).
- **No high score on death.** Dying in the timed battle goes straight to the title (`mainLevel = 0; return`), so no name entry.
- **Word `temp_score` is `Sint32`** and name entry uses `difficultyLevel` as the stored difficulty (mainint.c:2216).
- **`highscores.ts:171` throws before `sortHighScores`.** The C calls `JE_sortHighScores` at the top of every loop iteration (:2031). The ported single-player path does too.
- **The timer HUD "x.y" display** (`levelTimerCountdown/100`.`(…/10)%10`, tyrian2.c:2152) is ported (`hud.ts:335`). Nothing else is needed for the in-level HUD.
- **`endlevel.ts:64`** already has the `V_LEVEL_END`/song 21 condition that reads `levelTimer`.

### 2.4 TS state

- Already there: events 84/85, timer HUD and countdown, `levelTimer` reset (`level.ts:237`, `damage.ts:37`), backup-save skip, `t2kHighScores` boards and the high score screen's timed battle pages, helptext `timedBattleName`, and the `gameplaySelect` row (drawn, but refused with `S_SPRING`, `select.ts:125`).
- Missing:
  - `timedBattleSelect` (~180 lines of menu code, the same pattern as `episodeSelect`);
  - the `newGame` branch (`select.ts:341`);
  - `]T` and `]q` (`script.ts:437/442`);
  - the death branch in `flow.ts` (`flow.ts:24/65`);
  - the two `endlevel.ts:42-43` throws and the two timed battle blocks;
  - the `highScoreCheck` timed battle variant (`highscores.ts:172`).

### 2.5 Verification

All of it can be driven through the real menus with `OT_KEYS`. The scenario is: title -> New Game -> item 3 -> Deliani -> difficulty -> level (hold fire/keys) -> end tally -> name entry (`OT_TEXT`) -> title.
Add a second scenario that dies, and a third that picks Space Station (episode 5). Compare HASH, STATE2 and the save dump (the high score table is in `tyrian.sav`, bytes 2502-4721).

### 2.6 Size: **M** (about 350 lines, no new subsystem).

---------------------------------------------------------------------------------------------------

## 3. Two-player arcade on a shared keyboard

### 3.1 The C does not support two keyboards

`inputDevice[2]` defaults to `{1, 2}` (config.c:176, `0:any 1:keyboard 2:mouse 3+:joystick`).
`JE_playerMovement(.., inputDevice, ..)` is called once per player (mainint.c:4677-4685).
Per device, input is read like this:
- mouse: `inputDevice == 0 || 2` (mainint.c:3714);
- keyboard: `inputDevice == 0 || 1` (:3730), using the single `keySettings[8]` array;
- joystick: `inputDevice == 0 || >= 3` (:3680).

The MENU_2_PLAYER_ARCADE menu (game_menu.c:2925-2948) cycles devices so the two players are never the same (`while (inputDevice[temp] == inputDevice[other])`).
When there are no joysticks, a swap keeps keyboard + mouse. So the real game is **keyboard + mouse**, or keyboard + joystick, or mouse + joystick.

**"Two players on one keyboard" is therefore a new feature, not a port.** It needs:
- a second key map (`keySettings2[8]`; default WASD + Space/Ctrl/Shift/Q or similar);
- a new device id. Use 5, the first id above the maximum 2 + joysticks; or a joystick-count-independent id such as 100 to avoid collision with `inputDevice >= 3` meaning joystick `inputDevice - 3`;
- a branch in `readPlayerInput` (`input-level.ts:237`) that is a copy of the keyboard branch with `keySettings2`;
- UI in the 2-player menu to select it (device names list is `inputDevices[]` from helptext);
- a persisted second map (opentyrian.cfg JSON, `save.ts:282`) and a second remap screen. The existing KEYBOARD_CONFIG screen edits 8 keys.

Verification of the second keyboard can reuse the C: add 8-10 lines to `dump-frames.patch` that treat device 5 as a keyboard reading `keysactive[keySettings2[]]` with an env var for the second map, or just verify the **mouse + keyboard** pair against the oracle and unit-test the keyboard2 branch by checking that it is the mirror of the keyboard branch.
Recommended: port exactly the C (keyboard + mouse, keyboard + gamepad), verified against the oracle, then add the second keyboard behind the device id as an explicit web extension with a unit test.

### 3.2 Every `twoPlayerMode` branch

C sites (the `grep` of all `.c` files): done in TS = ported already, TODO = throws or missing.

**Input and movement**

| C | what | TS |
|---|---|---|
| mainint.c:4677-4685 `JE_mainGamePlayerFunctions` | two calls to `JE_playerMovement` with `inputDevice[0/1]`, `mouseX/Y` and `mouseXB/YB`, `shipGr/shipGr2` | **TODO** `player.ts:728` (throws). The `MouseKeys` type already has `mouseXB/YB`. |
| mainint.c:4695-4699 | map scroll uses `(player[0].x + player[1].x)/2` | **TODO** (`player.ts:733` uses p0 only) |
| mainint.c:3507 | `playerNum == 2 \|\| !twoPlayerMode` weapon-mode clamp | done (`player.ts:88`) |
| mainint.c:3903-3948 | linking: `twoPlayerLinked` set when both ships overlap within 8 px, both alive, not galaga; unlink on button 2/3 of player 1; link-gun direction `linkGunDirec` update on player 2 fire; `link_gun_analog` | **TODO** `player.ts:203` throws. About 50 lines, float math (`M_PI_2`, `fabsf`, 0.2f steps; use `f32`). |
| mainint.c:4013-4105 | sidekick x/y and friction block; `else /*twoPlayerLinked*/` branch: player 2 follows player 1 (`x = p0.x - 1 or p0.x`, `y = p0.y + 8`), 3 `SHOT_MISC` direction markers with `sinf/cosf`, rear gun `linkGunWeapons[]` and `player_shot_set_direction` | **TODO** `player.ts:296` throws. Needs `player_shot_set_direction` (check `shots.ts`) and `sinf`/`cosf` float32 exactness (`roundf(sinf(x)*26)`; verify with `f32` and the oracle). |
| mainint.c:4325-4400 | firing: `!(twoPlayerLinked && playerNum == 2)`, charge | done (`player.ts:456-507`) |
| mainint.c:4544, 4577, 4595, 4625 | sidekicks and `hud_sidekick_y[2P]` | done |
| mainint.c:4806, 4893, 4932, 4978-4997, 5025 | pickups: `twoPlayerMode` text prefixes, power-ups to player 2, `twoPlayerLinked` cases | done (`player.ts:819-956`) |
| mainint.c:3568-3604 | respawn/lives with two players | done (`player.ts:114-138`) |
| mainint.c:3077-3092 | draw loops `for (i < 2P ? 2 : 1)` | done (`collide.ts:258`) |

**Level loop and HUD**

| C | TS |
|---|---|
| tyrian2.c:645 galaga resets twoPlayerMode | n/a (galaga) |
| tyrian2.c:770-774 PIC 6 and name position | done (`level.ts:296/300`) |
| tyrian2.c:753 `player[1].x = 190, y = 180` | done (`level.ts:282`) |
| tyrian2.c:936 backup slot 22; 703 restore slot 22 | done (`level.ts:445`, `flow.ts:66`) |
| tyrian2.c:1111-1112 lives/armor warning, 1174 shield regen, 1209-1216 weapon bars at x 286, 1991/2013 low-armor flash, 398-510 enemy hits on player 2 | done (`level.ts:562`, `hud.ts`, `enemies.ts:271-361`) |
| varz.c:401/422/437/1021/1030/1085-1095/1109-1137 HUD and explosions | done (`hud.ts`, `damage.ts:52`) |
| tyrian2.c:5020, 5168 (events 80, 61?) | done (`events.ts:613/730`) |
| mainint.c:174 `JE_drawPortConfigButtons` | done (`hud.ts:44`) |
| mainint.c:3275, 3299-3321 (cheat keys disabled) | done (`input-level.ts:76`) |
| tyrian2.c:2528 `]e` clears it; 2553 `]2` jump; 2592 and 2646 `]b` slot and `]Q` text | done |

**Screens**

| C | TS |
|---|---|
| menus.c:42-246 `gameplaySelect` and 214-225 | drawn but refused (`select.ts:125`) |
| tyrian2.c:3646-3656 `newGame`: cash 0/0, ship 11 (Silver Ship), `difficultyLevel++`, `inputDevice = {1,2}` | **TODO** (`select.ts:341`) |
| game_menu.c:248 `curMenu = MENU_2_PLAYER_ARCADE` | done (`shop.ts:481`) |
| game_menu.c:763-776 device names (`inputDevices[]`, `"Joystick N"` when more than one) | **TODO** |
| game_menu.c:1154-1165 mouse row remap (`selection > 5 -> --`, `> 3 -> --`) | **TODO** |
| game_menu.c:1451-1470 and 1544-1565 Left/Right on rows 3/4: cycle devices, skip same device, clamp to `2 + joysticks`; `S_CURSOR` | **TODO** |
| game_menu.c:1954-1966 row spacing (extra 16 px after rows 3 and 4) | **TODO** |
| game_menu.c:2925-2958 Enter handler: 2 = play (`mainLevel = mapSection[mapPNum-1]`), 3/4 swap/cycle, 5 = options, 6 = quit | **TODO** (`shop.ts:259` throws via `unportedMenu`) |
| game_menu.c:626, 645-657 left panel: two cash lines (`miscText[40+i]`) instead of cash/ship bars | **TODO** `shop.ts:541` |
| game_menu.c:338-346 and 2884 load/save slots 13-24 (offset 11) | done (`save-ui.ts:33/294`) |
| game_menu.c:954 weapon power index `[twoPlayerMode ? port : 0]` | done (`economy.ts:68`) |
| mainint.c:1936-1969 `JE_inGameHelp` two-player page (8 `JE_HBox` calls) | **TODO** `ingame-setup.ts:307` (throws) |
| mainint.c:2753-2763 `JE_endLevelAni`: two cash lines at (30, 50+20i), `temp2 = 150` for the cube row | **TODO** `endlevel.ts:42` |
| mainint.c:2286-2310 `adjust_difficulty` two-player thresholds | done (`economy.ts:109-113`) |
| mainint.c:2029-2118 `JE_highScoreCheck` per player: highest scorer first, table `+1` (two-player board), prompt text `miscText[58+p]` / `"%s %s"` with `miscText[48+p]` | **TODO** `highscores.ts:172` |
| `JE_highScoreScreen` two-player boards | done (`highscores.ts:120`) |
| `JE_loadScreen` for slots 12-22 | refuses (`loadscreen.ts:185`) |
| mainint.c:3077 `JE_playerMovement` loops, `JE_pauseGame`, `JE_inGameSetup` | no two-player branches |
| tyrian2.c:2685 `]Q` second `jumpBackToEpisode1 && !twoPlayerMode` | done |

### 3.3 Other things to remember

- **Persisted state.** `inputDevice[2]` is already stored in `tyrian.cfg` (`save.ts`, 28-byte image). Check that the byte survives a round trip for the new device id.
- **Mouse look in two-player.** Player 2 on the mouse uses `mouseXB/YB` and `mouseGetRelativePosition`, so pointer lock must be on while a player uses device 2 (`ctx.input.mouseSetRelative(true)` at level start is already unconditional).
- **Shop top-level.** Planet map and `Next level` are skipped in 2P-arcade; only 2 rows ("Play next level" …). The 2P menu has `menuChoices[9]` = 6 (check `menuChoices` init in `shop.ts`).
- **Second player loadout** is whatever `JE_initPlayerData` left; `player[1].items.ship` is set in `JE_initPlayerData` (check `config.ts initPlayerData` covers it, it is the same function that draws the 1 RNG value).
- **`difficultyLevel++`** in `newGame` and `adjust_difficulty` use `initialDifficulty`. The `highScoreCheck` stores `difficultyLevel` as is.

### 3.4 Verification

- Sessions through the real menus: title -> New Game -> item 4 (2 Player Arcade) -> episode -> difficulty -> shop (2P arcade menu) -> level. Keyboard events drive player 1; `OT_MOUSE` relative motion plus buttons drive player 2 (the existing `scenarios-input.ts` already has mouse sessions).
- The `ts-save.ts` seed can place slot 12 (two-player) for a direct level start with both ships, linking, and the link-gun.
- `STATE2` already has `player[1]` fields? The record layout is in `test/helpers/state-trace.ts` (36 x u32). **Check it covers player 2 x/y/armor, `twoPlayerLinked` and `linkGunDirec`** before relying on it; extend with a new field group if not (patch change: `oracle.c`).
- Oracle gaps: none for keyboard + mouse. For keyboard2, see 3.1.

### 3.5 Size

| part | size |
|---|---|
| in-level input + movement + linking + linked ship + map scroll | **M-L** (float-exactness work; the largest risk) |
| `newGame` branch + `gameplaySelect` accept | **S** |
| shop menu 9 (draw, keys, mouse, device cycling, left panel) | **M** |
| endlevel 2P block, highscore 2P, in-game help page | **M** |
| load screen for slots 12-22 | **S** |
| keyboard2 extension (device id, mapping, remap screen, persistence) | **M** |
| **total** | **L** |

---------------------------------------------------------------------------------------------------

## 4. Super-arcade and SuperTyrian title codes; other secret codes

### 4.1 Title codes (tyrian2.c:3499-3535, 3676-3775, `JE_whoa` 5221)

Codes come from `specialName[]` **[measured]**: `STEALTH, STORMWIND, TECHNO, ENEMY, WEIRD, UNKNOWN, NORTSHIPZ, LIZARD, PRETZEL, DESTRUCT, ENGAGE`.
The matcher reads typed text (`new_text` / `last_text`). `title.ts:171-197` already ports the matcher exactly (`>= 9` progress bound).

| code (index+1) | C action | TS |
|---|---|---|
| 1-9 (STEALTH ... PRETZEL) | `fade_black(10); newSuperArcadeGame(i)` | `stubScreen(superShips[i+1])` (`title.ts:194`) |
| 10 DESTRUCT | `fade_black(10); loadDestruct = true; return true` | done; the game shows `stubScreen('Destruct')` (`game.ts:41`) |
| 11 ENGAGE | `JE_playSampleNum(V_DANGER); JE_whoa(); set_colors(0..255 black); newSuperTyrianGame()` | `stubScreen('SuperTyrian')` (`title.ts:190`) |

`newSuperArcadeGame(i)` (tyrian2.c:3676):
- ship = `SAShip[i]`; `episodeSelect() && difficultySelect()`;
- pic 1, `superShips[0]` title (FONT_SHAPES), `superShips[i+1]`, ship graphic via `spriteSheetT2000` if `shipgraphic > 500`, `wait_input`;
- sets `onePlayerAction = true; superArcadeMode = i+1; timedBattleMode = false; gameLoaded = true; initialDifficulty = ++difficultyLevel; cash = 0; front weapon = SAWeapon[i][0]; special = SASpecialWeapon[i];`
- Nort-Ship Z gets sidekick 24 twice.
- Quirk: `initialDifficulty = ++difficultyLevel` makes the game one level harder than selected, and cancelling out of the episode or difficulty select returns `gameLoaded` unchanged (false).

`newSuperTyrianGame()` (tyrian2.c:3719):
- `initialDifficulty = keysactive[SCROLLLOCK] ? SUICIDE : ZINGLON`;
- six lines of `superTyrianText[]` via `JE_outText`; the "cheat codes disabled" text; `play_song(16)`; `V_GOOD_LUCK`;
- `wait_noinput` then `wait_input`; then `episodeSelect()` (free episode choice);
- sets `superTyrian = true; onePlayerAction = true; difficultyLevel = initialDifficulty; cash = 0; ship = 13; front weapon = 39;`
- on cancel: `play_song(SONG_TITLE); return false`.
- **Browser quirk:** Scroll Lock reads `keysactive[SCROLLLOCK]`. `scancodes.ts` maps `ScrollLock` (71), but many keyboards and laptops lack the key. Provide an alternative (a modifier) only if the user wants parity; otherwise note as unreachable on laptops.

`JE_whoa()` (tyrian2.c:5221-5296): the feedback "bleeding" fade.
- It uses `game_screen` (TempScreen1) and `VGAScreen2` (TempScreen2) as ping-pong buffers, with a per-pixel loop over 64000 - borders: `offset = j + i/8192 - 4` (reads, with `i` counting **down** and `j` up);
- `color = (T2[offset]*12 + T1[offset-pitch] + T1[offset-1] + T1[offset+1] + T1[offset+pitch]) / 16`;
- 300 iterations or any button; `setDelay(1)`/`wait_delay` each frame; sets `levelWarningLines = 4`.
- This is pure integer code, so frame-exact verification works with `OT_TEXT`. Quirks: the top 4 lines and bottom 7 lines are cleared first; the first read touches `TempScreen1` bytes that are zero only if `game_screen` is zeroed (the TS `game_screen` persists bit-exactly and is zero-initialised, per the gameflow design); `VGAScreen2` content comes from whatever the title screen left there.
- The `JE_anyButton` call polls `newkey` etc., so the oracle's key at a given frame ends the loop at a known frame.

SuperTyrian run rules elsewhere in the C (for reference; already in TS): `mainint.c:3156/3199/3275/3299/3321` (cheat keys disabled), `specials.ts:51` (shipCombosB), `events.ts` (superTyrian specials 829+).

### 4.2 Other secret codes on the title or in menus

- **Difficulty-select hidden rows** (Suicide: Shift+`]`... `G`/`L O R D`): ported (`select.ts`; menus.c:517-660).
- **Super-arcade-only unlock text** appears in the `]Q` completion screens (section 1).
- **In-level**: F2+F6+F7/F8 (invulnerability cheat) and `youAreCheating` (`input-level.ts:102`); the street-fighter codes (`sfCodes`); Tab/CapsLock "extra ships" for `extraAvail` only. All ported or dead.
- **DESTRUCT**: `destruct.c` is 2746 lines, a separate mini-game with its own menus, AI, physics, network. **L, optional**. The `loadDestruct` plumbing exists. Recommend leaving it as the `stubScreen` unless the user wants it.
- **`xmas.c`** (Christmas mode by date, `xmas_time()` at opentyr.c:774): the oracle patch forces `xmas = false`, so it cannot be verified. Leave unported.
- No other title-screen codes exist in this C tree (the title `new_text` loop is the only text reader besides name entry).

### 4.3 Verification

`OT_TEXT=frame:scancode:char` types a character (`scenarios.ts:8` `text:` entries). A scenario types the code letter by letter on the title screen, then continues with keys through the episode and difficulty selects. For ENGAGE, the frame after `JE_whoa` ends is the discovery runner's job (the wait loops present frames, so the idle rule is not needed).

### 4.4 Size

| part | size |
|---|---|
| `newSuperArcadeGame` + hook | **S** |
| `newSuperTyrianGame` + hook | **S** |
| `JE_whoa` | **S** (one tight loop) |
| shop `MENU_SUPER_TYRIAN` + SA ship panel (`shop.ts:543`) | **S-M** (see 1.5) |
| DESTRUCT | **L**, not recommended |

---------------------------------------------------------------------------------------------------

## 5. Full setup menu vs our web-lite setup

### 5.1 The C setup menu (opentyr.c:100-740)

- **Setup:** Graphics..., Sound..., Jukebox, (Destruct, commented out), Done.
- **Graphics:** Display (fullscreen/windowed/monitor picker), Scaler (pixel-art scaler list, `video_scale*.c`: None, Pixelate, Scale2x, HQ2x...), Scaling Mode (Center, Integer, Fit 8:5, Fit 4:3), Done.
- **Sound:** Music Volume, Sound Volume, Done.
- **Jukebox** (`jukebox.c`, 202 lines): song list, play/stop, volume.
- **Keyboard / mouse / joystick configuration** is not in this menu. It lives in the shop's OPTIONS menu and the in-game Esc menu (`MENU_KEYBOARD_CONFIG`, `MENU_MOUSE_CONFIG`, `MENU_JOYSTICK_CONFIG`). The same screens are reachable in the TS; keyboard and mouse are fully ported (`shop-options.ts`) and persisted in `opentyrian.cfg` JSON (`save.ts:282`).
- **"Detail/graphics options" in the original** are the in-game Esc menu rows: detail level (`JE_doInGameSetup`), gamma, `Alt+..` etc. Those are already in `ingame-setup.ts`.

### 5.2 Web-lite today (`src/screens/setup.ts`, 236 lines)

Sound... (music volume, sound volume) and Done. It persists via `saveConfiguration` from the title caller (`title.ts:230`).

### 5.3 What makes sense in a browser

| C feature | browser verdict |
|---|---|
| Display: fullscreen / window | Replace by a "Fullscreen" row calling `requestFullscreen` (Alt+Enter and F11 already do it, `dom-input.ts:96`). **S**. |
| Scaler (None / Scale2x / HQ2x ...) | Optional. `canvas` uses `image-rendering: pixelated` (`index.html`); a nicer scaler would be a presenter-side shader or a CPU scaler on the 320x200 buffer. Not needed for fidelity. **M, skip** unless the user asks. |
| Scaling mode (center / integer / fit 4:3 / fit 8:5) | Cheap with CSS on the canvas (`#screen` size rules). Integer scale plus a 4:3 vs 5:3 choice are the useful ones. **S**. Persist in `opentyrian.cfg` JSON. Mouse mapping: `mapToScreen` already uses the canvas rect. |
| Sound | done. Add mute-on-blur? Not in C; skip. |
| Jukebox | The audio engine plays any song index (`playSong`). A port is a list screen + volume. **M** (UI + the song-name table, `musmast.c`/helptext). Pure bonus feature. |
| Keyboard remap | done. Browser caveats: some keys cannot be bound (OS-reserved, Meta); `scancodeFromCode` returns undefined for unknown `e.code` values (`dom-input.ts:93`). Numpad and international layouts work through `code`. |
| Mouse buttons | done. |
| Joystick config | see section 6. |

Recommendation: add Graphics... with Fullscreen (toggle) and Scaling Mode (integer / fit 4:3 / fit 5:3-style), Jukebox only if time remains. Setup stays a one-screen change; the C layout (`MENUS` table) already mirrors the C so adding a third `MenuId` is mechanical.

### 5.4 Size: Graphics page **S**; Jukebox **M**; scaler **skip**.

---------------------------------------------------------------------------------------------------

## 6. Joystick (joystick.c) mapped to the Gamepad API

### 6.1 What the C does

State: `joysticks` (count), `joystick[]` (handle, `analog`, `sensitivity` 0-10 default 5, `threshold` 0-10 default 5, `assignment[10][2]`, `direction[4]`, `direction_pressed[4]`, `action[6]`, `action_pressed[6]`, `x`, `y`, `confirm`, `cancel`, `joystick_delay`), `joydown`, `joystick_repeat_delay = 300 ms` (joystick.c:42-47).

Poll (`poll_joystick`, :156): `check_assigned` returns 0..32767 for each of the 10 assignments (each has 2 alternatives, max wins):
- order: 0-3 = up, right, down, left; 4 = fire; 5 = change fire; 6 = left sidekick; 7 = right sidekick; 8 = menu; 9 = pause;
- `AXIS` (num, negative), `BUTTON`, `HAT` (num, x_axis, negative);
- digital threshold: value > 16383;
- press-repeat after 300 ms using `SDL_GetTicks`.

Defaults (`reset_joystick_assignments`, :319): directions = axes `(a+1)%2` with `negative_axis` for up and left, plus hat 0; actions = buttons 0..5 in order; `analog = false`, sensitivity 5, threshold 5.

Menus: `push_joysticks_as_keyboard()` (:234) turns presses into SDL key events RETURN (confirm = action[0]|action[4]), ESCAPE (cancel = action[1]|action[5]) and arrows. It is called from **24 sites** (grep: menus.c x4, mainint.c x9, game_menu.c x3, tyrian2.c x3, opentyr.c, jukebox.c, keyboard.c, xmas.c, network.c).
`joydown` joins `wait_input`/`wait_noinput`/`JE_anyButton` (keyboard.c:66-85, nortsong.c:99, nortvars.c:35).
`init_joysticks()` is at opentyr.c:785 and `deinit_joysticks()` in `JE_tyrianHalt` (varz.c:450); assignments live in `opentyrian.cfg` ("joystick" sections, joystick.c:376-446).

### 6.2 What `inputDevice >= 3` does in-level (mainint.c:3679-3708)

```
if ((inputDevice == 0 || inputDevice >= 3) && joysticks > 0):
    j     = inputDevice == 0 ? 0 : inputDevice - 3
    j_max = inputDevice == 0 ? joysticks : inputDevice - 3 + 1
    for each j: poll_joystick(j)
        analog: mouseXC += joystick_axis_reduce(j, x); mouseYC += ...(y)        (value / (3000 - 200*sensitivity), after threshold*1000)
                link_gun_analog = joystick_analog_angle(j, &link_gun_angle)     (adds to the angle: uses an accumulator, see quirks)
        digital: x += (left ? -1 : 0) + (right ? 1 : 0); y likewise   (CURRENT_KEY_SPEED = 1)
        button[0] |= action[0] (fire)            button[1] |= action[2] (left sidekick)
        button[2] |= action[3] (right sidekick)  button[3] |= action_pressed[1] (change fire; EDGE, not level)
        ingamemenu_pressed |= action_pressed[4]  pause_pressed |= action_pressed[5]
```

- `inputDevice == 0` merges **all** joysticks, mouse and keyboard (single player); `inputDevice` 3+ selects joystick `n - 3` only.
- The mouse and keyboard blocks follow, so the merge is additive within one frame: `button[]` ORs; positions add.
- Demo playback forces `inputDevice = 1` (`player.ts:163`).
- `inputDevice` counts: the 2P menu allows up to `2 + joysticks` (game_menu.c:767, 1465, 1557, 2941).
- Quirks: `link_gun_angle` is a local float that `joystick_analog_angle` adds into (`*angle += ...`) and the C does not initialise it before the call (mainint.c, local declaration), so linked-gun analog aiming starts from stack garbage. Keep that out of the port or zero it. `joystick_analog_angle` is only used for the two-player link gun.

### 6.3 Mapping to the Gamepad API

- Poll with `navigator.getGamepads()` once per `serviceEvents`/`poll_joysticks` call; a pad appears only after a button press, and `gamepadconnected` should refresh `joysticks`.
- Use the **standard mapping** (`gamepad.mapping === 'standard'`): axes 0/1 = left stick; buttons 12/13/14/15 = d-pad up/down/left/right; 0 = A (fire), 1 = B (change fire), 2 = X (left sidekick), 3 = Y (right sidekick), 9 = Start (menu), 8 = Back (pause).
  - Hat is replaced by the d-pad buttons; keep the C's two-alternatives-per-slot model with axis + button. `assignment.type` can stay `AXIS`/`BUTTON` and drop `HAT` (or map HAT to buttons 12-15).
  - Non-standard pads: expose generic axes/buttons with the C's default assignment.
- The thresholds, sensitivity and repeat logic are plain arithmetic. Use the injected `ctx.clock` instead of `performance.now`.
- The existing hooks: `Input.serviceEvents` (the pump), `readPlayerInput` (`input-level.ts:237`), the `wait*` functions (`wait.ts` ignore the `_joystick` parameter), and the 9 `push_joysticks_as_keyboard(): no joysticks` comments in `src/`. Easier than patching every site: inject the synthetic key events inside `serviceEvents`, which every loop already calls; this is not exactly the C ordering but works as a replacement for menus.
- Browser costs: Gamepad polling is per-frame and synchronous; there is no event stream. Vibration is not used. Focus: pads only update while the page is focused/visible.

### 6.4 Verification

The oracle runs with SDL's dummy drivers and has no joystick, so the **C cannot be driven with a joystick**. Options:
1. Unit-test the pure arithmetic against values computed from the C formulas (`joystick_axis_threshold/reduce`, direction thresholding, press-repeat).
2. Patch `dump-frames.patch` to inject a fake joystick state (a new `OT_JOY=frame:axisX:axisY:buttons` that sets `joystick[0]` fields) and call it from `poll_joystick`. About 40 lines of C, and enough to verify ship movement and buttons (the menu navigation through `push_key` too).
Recommended: do (1) and a manual browser test; do (2) only if goldens for the gamepad path are wanted.

### 6.5 Size

| part | size |
|---|---|
| Gamepad module + `joydown` + in-level `inputDevice` 0/>=3 + defaults | **M** |
| menus via `serviceEvents` injection | **S** |
| JOYSTICK_CONFIG screen + assignment detect/storage (`detect_joystick_assignment`, joystick.c:530-627) | **M** |
| **total** | **M-L**; skip the config screen first (auto-assign), then **M** |

---------------------------------------------------------------------------------------------------

## 7. Endings and animations

| piece | C | state |
|---|---|---|
| intro logos | tyrian2.c:3777 | done (`screens/intro.ts`) |
| `JE_playAnim` / `tyrend.anm` (`]A`, ep3) | animlib.c:152 | done (`screens/anim.ts`, `data/anim.ts`, `script.ts:94`) |
| credits | mainint.c:2521 | done (`screens/credits.ts`) |
| `JE_endLevelAni`, `JE_nextEpisode` | mainint.c:2689, 975 | done except the 2P and timed branches |
| `JE_displayText` / `]W` | tyrian2.c:3832 | done; `glow-text.ts:147` has the network-only `JE_tyrianHalt(5)` |
| `]P 000` `tshp2.pcx` | pcxload.c | done |
| `]U` scroll-up reveal | tyrian2.c:2768 | done |
| `]V` / `]R` scroll-down / scroll-left reveals | tyrian2.c:2819 / 2870 | throw. **Unused by the shipped data [measured]**; ~50 lines each, **S**, optional |
| **`trentWin` ending** | opentyr.c:885, varz.c:487-500 | **flag is set, nothing reads it.** In the C the game exits and prints "Sleep well, Trent, you deserve the rest...". For the web, show a final text screen then return to the title. **S** |
| `exitmsg.bin` ANSI exit message | varz.c:469 (`TODO?` in the C: not even called) | n/a |
| Jukebox | jukebox.c | not ported (section 5) |
| Destruct | destruct.c | stub (section 4) |
| xmas mode | xmas.c | skipped; the oracle forces xmas off |

`stubScreen` users (`grep`):
- `title.ts:190` SuperTyrian code and `:194` super-arcade codes;
- `game.ts:41` Destruct and `:51` the "mode not yet available" notice for `UnavailableModeError`;
- `stub.ts:32` `quitScreen` ("Thanks for playing!", the intended web version of the quit item).

After the work in sections 1-4 only Destruct and the `UnavailableModeError` fallback remain. The fallback in `game.ts:46-53` can stay as a safety net.

**Size: S** (trentWin screen) plus **S** each for `]V`/`]R` if wanted.

---------------------------------------------------------------------------------------------------

## 8. Browser robustness carried over from the review

State of `src/platform/dom-input.ts` and `main.ts` today: M3 (held mouse buttons released on blur) and M4 (detach, exit pointer lock on crash) are done. M1 is done. M7's `persistent` flag is fixed (`storage.ts:119`).

### M2: order of pointer-lock loss and blur

- Code: `dom-input.ts:86-100`. The `pointerlockchange` handler checks the tracked `hasFocus` flag, set by the `blur` handler (:149).
  - If the browser fires `pointerlockchange` **before** `blur` on Alt-Tab, `hasFocus` is still true and a synthetic Esc is queued. The player returns to the Esc menu, behind the pause.
  - The reverse order (Esc `keydown` arriving after the synthetic one) is not deduped: only "keydown, then lockchange" is (`lastEscDown`, 250 ms).
- Fix:
  - in the handler, use `document.hasFocus()` (and `document.visibilityState`) at event time instead of the flag;
  - suppress a real Esc `keydown` that arrives within `ESC_DEDUPE_MS` after a synthetic Esc (track `lastSyntheticEsc`);
  - add unit tests for both orders: `test/platform/dom-input.test.ts:213` covers blur-first only.
- Browser behaviour is not specified; Chrome swallows Esc while locked and fires `pointerlockchange`, Firefox delivers the keydown too (the existing comment). Test in both.
- **S**.

### M5: saving config on `pagehide`

- Today `saveConfiguration` runs only at the title (Setup), at backup saves (every level start) and on quit-to-title. Volume and key-binding changes in the shop or Esc menu are lost if the tab closes before the next level start.
- Fix: in `main.ts`, `addEventListener('pagehide', () => saveConfiguration(ctx))`, plus `visibilitychange` -> `hidden` (mobile browsers do not always fire `pagehide`; `beforeunload` is unreliable and blocks bfcache).
- The writes are synchronous `localStorage.setItem`, which is allowed in `pagehide`. It writes only `tyrian.cfg` and `opentyrian.cfg`, so it has no effect on determinism, but do **not** write `tyrian.sav` there: a half-finished level would overwrite the backup semantics.
- Test: dispatch a `pagehide` event on a fake window and check the storage adapter. **S**.

### M6: two tabs overwriting each other's saves

- Every `JE_saveGame` rewrites the whole 4722-byte image from the tab's in-memory copy, which was parsed once at boot (`save.ts`). Tab B's next level start erases tab A's new saves.
- Options:
  1. A `storage` event listener (fires in the **other** tabs on `setItem`): when `opentyrian.tyrian.sav` changes, re-read it into `c.saveFiles` / `t2kHighScores` (only when not in the middle of a save). Last-writer-wins but it converges after every write. Simple. Not instantaneous: the other tab must be a different document, which is true here.
  2. A `BroadcastChannel('opentyrian')` message "save written, stamp N" and a visible notice ("Another tab saved; reload to see it") when the stamp differs. No automatic merge.
  3. A stamp check before writing: store `{stamp}` alongside; if the stored stamp differs from the one this tab read, merge slot-by-slot (a slot is a 109-byte record; the tab that wrote the slot last wins) or ask the user.
- Recommended: option 1 plus a per-slot merge on write: read the stored image, replace only the slots this tab changed since its last read (track dirty slots in `saveGame`), then write. This keeps both tabs' saves. High scores are four bytes per entry; merge them by comparing with the stored copy.
- `localStorage` events do not fire in the same document. Tests can fake `StorageLike` and dispatch `StorageEvent`. **M**.
- Single-file build caveat (section 9): under `file://` Chrome shares one origin for all local files, Firefox does not; `storage` events work in neither if the pages are different origins.

### M12: integer semantics

- `highscores.ts:178`: `temp_score` is `Sint32`; `s32(totalScore(...))` is already applied (`highscores.ts:178`), so this part is done. **Check** that the displayed value in the name-entry prompt also uses the wrapped value (the C prints `%d` of the Sint32).
- `save.ts:480-481` `loadGame`: `player.cash = (s32)score` is stored in a `ulong` (64-bit) in the C, so a negative saved score becomes `2^64 - n`. TS keeps a negative number. Wrap with `BigInt.asUintN(64, ...)` or store cash as `number` below `2^53` and clamp. It is unreachable with the shipped data and TS-written saves; reachable only with a hand-edited import. **S**, low priority.
- Add a unit test for each.

### Further browser items worth listing (new)

- The quit path never exits the page; keep it.
- `visibilitychange` should pause audio (`AudioContext.suspend`) when hidden; `windowHasFocus` already pauses the game.
- iOS/mobile are out of scope (no keyboard).

**Section size: S-M (M5, M2, M12 are S; M6 is M).**

---------------------------------------------------------------------------------------------------

## 9. Single-file HTML build

### 9.1 How data loads today

- `pnpm data <zip>` (`tools/pack-data.ts`) unzips `~/Downloads/tyrian2000.zip` (5,051,363 bytes, 100 entries, 12,337,252 bytes raw), drops `.exe/.pif/.ico/.ovl/setup.box`, lower-cases names, writes `data/tyrian2000/*` for tests, and writes **`public/data/tyrian2000.t2kpak`** = gzip(level 9) of a simple pack (`src/data/pak.ts`, magic `T2KP`).
- Result: 84 files, 11,418,189 bytes raw, **4,624,976 bytes** gzip **[measured]**.
- `src/main.ts` calls `fetchArchive('data/tyrian2000.t2kpak')`; `DataArchive.fromPakBytes` gunzips with `DecompressionStream('gzip')` when the bytes start `1f 8b`. Vite copies `public/` into `dist/data/`.
- `vite build` output **[measured, existing dist/]**: `index.html`, `assets/index-*.js` 233,748 bytes (76,113 gzip; 64,371 brotli) and `assets/worklet-*.js` 30,282 bytes (9,475 gzip). `base: './'`, target es2022.
- The worklet comes from `import workletUrl from '../audio/worklet.ts?worker&url'` (`web-audio.ts:5`) and `ctx.audioWorklet.addModule(url)`. The built worklet is a single IIFE with no `import`s **[measured: 0 matches]**, so it can be inlined.

### 9.2 Which files are needed **[measured: `grep` of `archive.get(...)`]**

Used by the code: `tyrian.hdt, palette.dat, tyrian.shp, tyrian.pic, music.mus, tyrian.snd, voices.snd, estsc.shp, tyrian.cdt, tshp2.pcx, tyrend.anm, demo.1-5, shapes?.dat (5), newsh?.shp (39, by ship), cubetxt1-5.dat, levels1-5.dat, tyrian1-5.lvl`. That is **75 files, 10,484,506 bytes raw**.

Not used (9 files, 933,683 bytes raw): `estpa.shp, tyrianc.shp` (xmas), `voicesc.snd` (xmas), `exitmsg.bin, loudness.awe, user1.shp, user2.shp, shipedit.pcx, readme.txt`.
Pruning them is safe. Confirm with a run-time trace: log `archive.get` over `pnpm soak` plus the session goldens. (`has()` calls with `levelFileName` and `animfile` are existence checks.)

### 9.3 Compressed sizes of the needed set **[measured]**

| scheme (one solid stream) | bytes | base64 of it |
|---|---|---|
| raw | 10,484,506 | 13.98 MB |
| **gzip -9 / deflate-raw -9** (same within 18 bytes) | **4,161,438** | **5,548,584** |
| brotli q11, lgwin 24 | 3,319,647 | 4,426,196 |
| xz -9e (tar) | 3,237,556 | 4,316,741 |
| zstd -19 --long (tar) | 3,517,436 | 4,689,915 |
| gzip -9 without `tyrend.anm` | 2,445,437 | 3,260,584 |
| brotli without `tyrend.anm` | 1,829,779 | 2,439,705 |

- Largest contributors after gzip: `tyrend.anm` 1,715,947 (of 3,315,848), `tyrian.shp` 257k, `tyrian.snd` 201k, `tyrian4.lvl` 195k, `tyrian.pic` 187k, `shapesz.dat` 111k, `tyrian1.lvl` 92k.
- The 39 `newsh*.shp` = 1,268,393 raw -> 523,739 gzip; the five `shapes?.dat` = 1,034,432 -> 310,880.
- `tyrend.anm` is **40% of the compressed payload and is used by one `]A` command** (ep3 ending). A multi-file site could lazy-load it; a single file cannot. Alternative: brotli it (1.49 MB) or accept it.

**Total HTML size estimate** (data as base64 in a script tag, plus app):

| variant | size |
|---|---|
| gzip + CompressionStream, all needed files | 5.55 MB + 0.23 MB JS + 0.04 MB worklet + HTML = **about 5.85 MB** |
| same with `tyrend.anm` stripped (ep3 ending shows nothing) | about 3.55 MB (loses fidelity: not recommended) |
| brotli with a bundled WASM/JS decoder (decoder ~60-150 KB) | 4.43 MB + decoder + app = **about 4.8 MB** |
| base85 instead of base64 | saves another ~6% of the payload (about 0.3 MB) at the cost of a 20-line decoder |

All are far below the 25 MiB file limit of Cloudflare and below the 16 MB artifact limit of other hosts.

### 9.4 Compression option

- **CompressionStream / DecompressionStream** (`gzip`, `deflate`, `deflate-raw`): no code, already used for the pack. Supported in Chrome/Edge 80+, Safari 16.4+, Firefox 113+. Only `deflate`-family formats exist. Brotli is **not** available in `DecompressionStream`.
  - Use `deflate-raw` (no header) or keep `gzip` (current loader and format: no loader change, and `tools/pack-data.ts` already produces the gzip bytes). Equivalent size.
- **Bundled decoder** (brotli WASM, `fflate` for deflate, `fzstd`/xz in JS): brotli saves 0.84 MB of payload-after-base64 (1.12 MB vs gzip) for a decoder of 60-150 KB plus build complexity (a WASM blob also needs base64 and `WebAssembly.instantiate` from bytes, allowed on `file://`). Worth it only if the size target matters. Not for the first cut.
- **Recommended:** gzip via `DecompressionStream` (zero new runtime code), `pako`/`fflate` fallback is unnecessary for the browsers above. Decode cost: about 11 MB inflate, tens of ms.
- Memory: base64 string (5.5 MB) -> `atob` -> bytes (4.2 MB) -> inflate -> 11 MB. Peak about 25 MB; fine. Drop the string after decoding (`script.textContent = ''` or put it in a `<script type="application/octet-stream">`; both free after read).
- Encode choices in the HTML: a `<script id="d" type="text/plain">BASE64</script>` is parsed fast and is not executed. Read with `textContent`. Avoid putting 5 MB in a JS string literal inside the bundle (slower parse, and Vite/rolldown would try to minify it).
- Decode in streaming fashion: `Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')))` as `fromPakBytes` does. Reuse as is.
- Do not rely on HTTP `Content-Encoding` for this (section 10): under `file://` there is none, and base64 of raw data compresses much worse than base64 of gzip.

### 9.5 AudioWorklet inline

- `addModule` accepts a `blob:` URL. `new Blob([workletSource], {type: 'text/javascript'})` -> `URL.createObjectURL`. Works on `file://` in Chrome and Firefox (blob URLs are same-origin to the creating document). `data:` URLs are not allowed by all engines; use the Blob.
- Build step: the worklet source must be **built separately** (it is TS with imports of `audio/*`). Options:
  1. A small Vite plugin / pre-step that builds `src/audio/worklet.ts` as an IIFE string (the existing `?worker&url` already does this), then replaces the `workletUrl` import with `import workletSrc from '...?raw'` of the built file. Simplest: build in two passes: `vite build --config vite.worklet.config.ts` -> `dist-worklet/worklet.js`; the main build imports it with `?raw` (a Vite alias).
  2. Set `build.assetsInlineLimit: Infinity` so `?worker&url` becomes a `data:` URL; convert it to a Blob at run time (`fetch(dataUrl).then(r => r.blob())`). Less code but unverified for this Vite version (8.3, rolldown): test.
- `WebAudio.create` already takes `deps.workletUrl` (`web-audio.ts:52`); the Blob URL slots in with no engine change.
- **No SharedArrayBuffer**: the worklet protocol is `postMessage` with transferred buffers (`web-audio.ts`, `audio/protocol.ts`). `grep SharedArrayBuffer|Atomics|crossOriginIsolated` finds nothing. No COOP/COEP is needed.

### 9.6 Vite config

- Today: `export default defineConfig({ base: './', build: { target: 'es2022' } })`. `vite-plugin-singlefile` is **not installed** (checked `node_modules`).
- Options:
  1. `vite-plugin-singlefile` (inlines JS and CSS into `index.html` and sets `assetsInlineLimit`, `cssCodeSplit: false`, `inlineDynamicImports`): works for the app bundle; the worklet and data still need the steps above. Confirm it supports Vite 8 (rolldown); it is a small plugin, so a fork is easy.
  2. **A custom post-build script** (recommended, about 50 lines in `tools/build-single.ts`): run `vite build`; read `dist/index.html`, `dist/assets/index-*.js`, the worklet and the pak; write one `dist-single/opentyrian.html` with the JS inlined as `<script type="module">`, the worklet as `<script id="worklet" type="text/plain">`, and the data in `<script id="data" type="text/plain">`. No new dependency, full control of escaping (`</script` inside the payload must be split; base64 has no `<`, JS source may: replace `</script` with `<\/script`).
- Code changes: `fetchArchive` gets an inline variant (`DataArchive.fromBase64(text)`) chosen by a build-time define `__SINGLE__` (`import.meta.env`/`define`). `main.ts` reads `document.getElementById('data').textContent`.
- Module scripts and `file://`: Chrome blocks `<script type="module" src="file://...">` (CORS), but **inline** `type="module"` scripts work. External `src` is the only problem, which inlining removes. `fetch()` of `file://` fails; inlining removes that too.
- `file://` caveats to test:
  - `localStorage` works (Chrome: one shared origin per scheme; Firefox: per file). Saves from different copies of the file share storage in Chrome.
  - `requestPointerLock`, fullscreen, gamepad: allowed on `file://` in Chrome/Firefox; Gamepad API needs a secure context in some browsers (`file://` counts as potentially trustworthy in Chrome, Firefox treats it as secure) - test.
  - `AudioContext` needs the existing user gesture.
  - `DecompressionStream`: no restriction.
- Size of the repo output: add `pnpm build:single` -> `dist-single/opentyrian2000.html` (about 5.9 MB). Keep `dist/` for hosting.

### 9.7 Licensing

- The code is GPL-2.0-or-later (COPYING, README). A single HTML that embeds the data must ship with the GPL source offer / notice for the code, and it is a combination with non-GPL data (aggregate, not linked). Add a visible "About / licence" notice: the code licence and where the source is. The game data is separate content.
- **The data zip contains no licence file.** The 100 entries **[measured]** include only `readme.txt` (Tyrian 2000 release notes, 1999), whose last lines read "Tyrian 2000 Game Copyright (c) 1999, Eclipse Software / Tyrian 2000 Copyright (c) 1999, Stealth Productions, Inc. All Rights Reserved." Nothing in the zip grants redistribution.
- The README's statement ("released as freeware in 2004") is the project's belief. The zip comes from `camanis.net/tyrian`; I could not verify the wording of the freeware grant from the archive itself. OpenTyrian and its derivatives do not bundle the data and tell users to download it (the OpenTyrian2000 repo does the same).
- **Decision for the user:** hosting a page that serves the data (the current `dist/data/tyrian2000.t2kpak` already does) is redistribution. A single HTML with the data inlined is redistribution that is easy to copy. Keep the build script from committing the data (`public/data/` and `data/` are git-ignored), add a notice with the 2004 freeware statement and the source of the zip, and make the user decide before any public deploy. This survey does not decide it.

### 9.8 Size: **M** (build script, inline loader, worklet blob, `file://` smoke test in Chromium and Firefox, size budget test).

---------------------------------------------------------------------------------------------------

## 10. Cloudflare hosting (nothing deployed)

| | Workers static assets (`assets` in wrangler) | Pages |
|---|---|---|
| max file size | **25 MiB** [docs] | **25 MiB** [docs] |
| max files | 20,000 free / 100,000 paid (Wrangler >= 4.34.0) [docs] | 20,000 free / 100,000 paid [docs] |
| default `Cache-Control` | `public, max-age=0, must-revalidate` plus `ETag` [docs] | the same default |
| custom headers | `_headers` file in the assets dir, 100 rules, 2,000 chars/line, wildcards [docs] | `_headers` |
| config | `wrangler.jsonc`: `{ "name": ..., "compatibility_date": ..., "assets": { "directory": "./dist" } }`, no Worker script needed | dashboard / `wrangler pages` |
| status | the direction Cloudflare recommends for new static sites [docs, Pages limits page] | maintained, but docs point to Workers |

- **Recommendation: Workers static assets.** One `wrangler.jsonc`, `assets.directory = "dist-single"` (single file) or `dist` (multi-file), `not_found_handling = "single-page-application"` not needed.
- **Limit check:** the single file (5.9 MB) and the multi-file pak (4.6 MB) are both well under 25 MiB, so no splitting.
- **Cache headers for the multi-file build** (`public/_headers`):
  ```
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  /data/*
    Cache-Control: public, max-age=31536000, immutable   (rename the pak per data version: tyrian2000.<hash>.t2kpak; today the name is fixed)
  /index.html
    Cache-Control: no-cache
  ```
  Vite already hashes `assets/*`. The pak name is fixed (`DATA_URL`), so either hash it or keep it at `no-cache` (revalidated by ETag).
- **Compression at the edge:** Cloudflare compresses text content types (brotli/gzip) on the fly. The `.t2kpak` is already gzip (extension unknown, served as `application/octet-stream`): leave it alone, and do not let a proxy double-compress. For the single HTML, edge compression recovers most of the base64 overhead (base64 text has 6 bits/char entropy, so brotli brings 5.5 MB back toward 4.2 MB). The user opening the file from disk gets no such benefit.
- **COOP/COEP:** not needed. The code uses no `SharedArrayBuffer`; the AudioWorklet runs on `postMessage`. Pointer lock, fullscreen and Gamepad need a **secure context**: Workers/Pages serve HTTPS. Do not set `Cross-Origin-Embedder-Policy` (it would break nothing here but adds risk with no benefit).
- **Other headers worth setting in `_headers`:**
  - `X-Content-Type-Options: nosniff`;
  - a `Content-Security-Policy` allowing `script-src 'self' blob: 'unsafe-inline'` (the single file needs inline script and a Blob worklet), `worker-src blob:`, `connect-src 'self'`;
  - `Permissions-Policy: gamepad=(self), fullscreen=(self)`.
- **Do not deploy.** The output of this task is a config in the repo (`wrangler.jsonc`, `public/_headers`) plus a README section. A deploy script must not run automatically.
- Licensing gate: see 9.7 before any deploy of data.

**Size: S.**

---------------------------------------------------------------------------------------------------

## 11. Everything else still unported on the single-player path

`grep -rn "unported" src`, grouped. "Reachable" means a player can hit it with shipped data.

| site | reason | reachable on 1P path? |
|---|---|---|
| `game/script.ts:125/133/266` | `]g`, `]e`, SuperTyrian `]Q` | **yes** (ep1 sec 41; ep4 secs 40, 45) -> section 1 |
| `game/script.ts:365/369` | `]V`, `]R` | no: unused by the data [measured] |
| `game/script.ts:44/47/100/109/199` | `levelWarningText[12]` and `mapPlanet[5]`, `cubeList[4]`, `itemAvail[9][10]` overflows | no [measured in the gameflow survey] |
| `game/script.ts:438/443` | `]T`, `]q` timed battle | not unless the select is enabled -> section 2 |
| `game/flow.ts:23/24` | two-player, galaga, timed battle | via sections 1-3 |
| `game/level.ts:74/76` | map byte >= 128 and uninitialised `ref[]` (C-undefined) | no (shipped levels pass the soak) |
| `game/events.ts:163/599` | event 16 with `eventdat < 1`, event 61 with `eventdat` out of range (C-undefined) | no |
| `game/shots.ts:28/29`, `screens/shop-draw.ts:159` | ship ids > 90 (`extraShips`, editship `newsh$.shp`) | no: ships > 90 never occur in shipped item lists [measured]. Keep throwing. |
| `game/hud.ts:193`, `game/enemies.ts:255`, `game/player.ts:203/296/728/787`, `game/collide.ts:187` | galaga and two-player and super-arcade | sections 1 and 3 |
| `screens/endlevel.ts:42/43`, `screens/highscores.ts:172`, `screens/ingame-setup.ts:308`, `screens/shop.ts:60-65/260/541/543` | two-player and timed battle screens, MENU 9 and 13 | sections 2, 3 |
| `game/input-level.ts:241` | joystick | section 6 |
| `video/glow-text.ts:148` | `haltGame` (network only) | no |
| `game/input-level.ts:92/98` | the `debug` FPS overlay | the F10+Backspace toggle no longer throws (M8 fixed); the overlay is not drawn. **S, optional** (C: mainint.c ~3180, draws `fps`). Could expose a web FPS counter instead. |

Other things that are not `unported` throws but are missing:
- **Destruct** (title code, `game.ts:41`), **Jukebox**, **Graphics setup** (section 5).
- **Network play** (`gameplaySelect` row 5, `network.c` 800 lines): drop. The row is drawn and refused.
- **Instructions / Help** is done; **Quit** is `quitScreen`.
- **Editship** (`editship.c`, 91 lines): the C looks in the user dir for `newsh$.shp`; not reachable in a browser.
- **Screenshots** (`F12`/`PrintScreen` in the C writes a PCX): not ported; a canvas `toBlob` download is a possible web feature (**S**, optional).
- **Recording demos** (`record_demo`): command-line only.
- **`richMode`, `constantPlay`, command-line options** (params.c): never set.
- The soak (`test/soak/soak.test.ts:82-85`) files every `unported:` error under "reported, not failed". Once sections 1-3 are ported, change it to fail on any `unported:` outside an allow-list (review recommendation 2). **S**.
- Goldens guard (review M9): assert `oracle.length === ts.length` in STATE2 and that every `SCENARIOS` entry has its `.hash`/`.state2` file. **S**.
- `README.md` "Not ported yet" sentence and "Status" need updating after each section. **S**.

---------------------------------------------------------------------------------------------------

## 12. Size summary

| # | item | size |
|---|---|---|
| 1 | `]e` ENGAGE + SuperTyrian menu + completion + trentWin | S-M |
| 1 | `]g` galaga | M (after item 3) |
| 2 | Timed Battle | M |
| 3 | Two-player in-level core (input, linking, linked ship, scroll) | M-L |
| 3 | Two-player menus (select, shop 9, endlevel, highscore, help, load) | M |
| 3 | Second keyboard extension | M |
| 4 | Title codes (super arcade, SuperTyrian, `JE_whoa`) | S-M |
| 4 | Destruct | L (not recommended) |
| 5 | Setup Graphics page (fullscreen, scaling mode) | S |
| 5 | Jukebox | M (optional) |
| 6 | Gamepad (in-level, menus, defaults) | M |
| 6 | Gamepad config screen | M (optional) |
| 7 | trentWin screen, `]V`/`]R` | S |
| 8 | Browser robustness (M2, M5, M12 = S; M6 = M) | S-M |
| 9 | Single-file build | M |
| 10 | Cloudflare config | S |
| 11 | Residual cleanup, soak and golden guards, README | S |

---------------------------------------------------------------------------------------------------

## 13. Recommended task ordering (13 tasks)

Principles: first the cheap wins that need no new subsystem; the two-player core before galaga; build and hosting last but independent, so they can run in parallel with feature work.

1. **Browser robustness** (section 8: M2, M5, M12, M6 with per-slot merge). Independent, S-M.
2. **Secret modes A: ENGAGE** - `]e`, `MENU_SUPER_TYRIAN` and the super-arcade ship panel in the shop, `collide.ts:187`, `]Q` SuperTyrian completion screens and the `trentWin` end screen. Goldens via `ts-save` seeds (sections 1.6 and 7). S-M.
3. **Title codes** - `newSuperArcadeGame`, `newSuperTyrianGame`, `JE_whoa`. Reuses task 2 for the in-level part. Goldens via `OT_TEXT`. S-M.
4. **Timed Battle** - select, `newGame` branch, `]T`/`]q`, death branch, endlevel and highscore variants. Goldens through the menus. M.
5. **Two-player core in-level** - `playerMovement` x2, device routing (keyboard + mouse), linking, linked ship, map scroll, `flow.ts`. Float32 care for `sinf/cosf/fabsf`. Verify with a seeded slot-12 save, keyboard + `OT_MOUSE`. M-L.
6. **Two-player screens** - `gameplaySelect` accept, `newGame` 2P, shop menu 9 (device cycling), left panel, endlevel 2P, highscore 2P, in-game help page, load screen for slots 12-22. M.
7. **Galaga** - `]g`, shield/life HUD block, shot gating, dragonwing spawn. Needs 5. M.
8. **Second keyboard** - the web extension: device id, `keySettings2`, remap screen, persistence, unit tests (plus an optional oracle patch). M. Skippable.
9. **Gamepad** - platform module, in-level merge, menu injection, default assignments, `wait*` `joydown`; config screen later. Unit tests; optional `OT_JOY` oracle patch. M.
10. **Setup polish** - Graphics page (fullscreen, scaling mode), Jukebox if wanted, `]V`/`]R`, FPS overlay, screenshot. S-M, all optional.
11. **Cleanup and guards** - soak fails on `unported:` outside an allow-list, goldens-present guard (M9), update the README status. S. Run after 2-7.
12. **Single-file build** - post-build script, inline loader, worklet Blob, `file://` smoke test, size budget, licence notice. M. Independent; can start any time; finish after 1 so `pagehide` is included.
13. **Cloudflare config** - `wrangler.jsonc`, `_headers`, hashed pak name, README. No deploy. S. Gate on the licence decision of 9.7.

Parallel groups: {1}, {2 -> 3}, {4}, {5 -> 6 -> 7 -> 8}, {9}, {12 -> 13}. Tasks 10 and 11 close the project.
Risk to watch: task 5 (float exactness in the link gun) and the `unported` allow-list in task 11.
