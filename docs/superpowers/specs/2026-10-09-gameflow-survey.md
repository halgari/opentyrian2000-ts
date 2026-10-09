# Game-flow survey (sub-project 4): new game -> episodes -> shop -> death/end -> title, vs the C oracle

Scope: everything a single-player session does that is not already covered by the demo-playback core: title "New Game / Load /
High Scores / Instructions / Setup", episode+difficulty select, `JE_main` non-demo path, the `levelsN.dat` script parser, the
shop (`JE_itemScreen`), data cubes, level end / next level / game over, episode end + credits, save/load, in-level keyboard+mouse
control, pause, in-game menu. Two-player and network are out of scope (arcade 2-player noted as optional).

`C/` = `reference/opentyrian2000/src` (the oracle is this tree plus `tools/oracle/dump-frames.patch`, commit aad5aca). All line
numbers are `C/` unless a `src/` path is given. Types: `JE_byte`=u8, `JE_shortint`=s8, `JE_integer`=s16, `JE_word`=u16, `JE_longint`=s32,
`uint`=u32, **`ulong` = 64-bit** (player cash, scores). The survey `.superpowers/survey-gameplay.md` and
`.superpowers/sdd/2026-10-09-gameplay/final-review.md` are assumed read.

Numbers below that were *measured* (data scans, an oracle experiment) are marked **[measured]**.

---------------------------------------------------------------------------------------------------

## 0. Where we are (what sp4 builds on)

Already in `src/` and reused as-is: `game/level.ts` (`levelSetup`, `levelFrame`, `runLevel` demo path), `player.ts`, `shots.ts`
(weapon-sim in the shop reuses `player_shot_create`/`simulate_player_shots`), `enemies/events/explosions/hud/specials/backgrounds`,
`game/world.ts` (all C globals incl. `scratch` temp/temp2/temp3/tempW, `varz.mouseX/Y/XB/YB`, `config.saveFiles` *subset*),
`game/config.ts` (`loadConfigurationDefaults` = the no-save-file branch only, `initPlayerData`, `initProcessorType`,
`setNewGameSpeed`), `screens/title.ts` (all 7 items; items 1-5 and the 3 hidden codes are `stubScreen`), `data/level.ts`
(`analyzeLevel`, `loadLevelRecord`), `data/itemdat.ts` (episodes 1-3 only), `game/episodes.ts` (`initEpisode`),
`video/mouse.ts`, `platform/input.ts` (`Input`: no `mouse_pressed[]`, no relative mouse, no modifier state, no focus state),
`platform/wait.ts`, `audio` (song/sample/fade).

Unported throws sp4 hits in ordinary play (from the final review): `level.ts:85` (loadMap non-demo), `:735` (JE_main non-demo),
`:678` (in-level keyboard/pause/menu), `player.ts:162` (input), `hud.ts:357` (game-over wait), `events.ts:614` (event 64),
`level.ts:137/138/530` (smoothie filters, `starShowVGA` codes 1/2), `level.ts:654` (random explosions), `itemdat.ts:90` (episode 4+5
item data). Arcade-only throws: `hud.ts:192`, `enemies.ts:255`, `collide.ts:187`, `player.ts:173/266/707/766` (two-player/galaga).

Missing platform pieces (none exist today): any persistent storage; `windowHasFocus`; pointer lock; `SDL_GetModState`;
`SDL_GetScancodeName`; PCX loader (`pcxload.c`, 76 lines); LPF animation player (`animlib.c`, 397 lines); `JE_outCharGlow`,
`JE_outTextGlow`, `JE_updateWarning`, `JE_helpBox/JE_HBox` (fonthand.c / mainint.c); `JE_barDrawShadow` (nortvars.c:63);
`blit_sprite2x2_clip`-style cursor already exists. Note `src/data/archive` already contains every data file (all packed), so
`levelsN.dat`, `cubetxtN.dat`, `tyrian.cdt`, `tyrend.anm`, `tshp2.pcx`, `estsc.shp` need no packer change.

---------------------------------------------------------------------------------------------------

## 1. Call graph

### 1.1 main loop and title (opentyr.c:749-896, tyrian2.c:3283)

```
main                                          opentyr.c:749
  JE_loadConfiguration  :779  (reads tyrian.cfg/tyrian.sav, or the 174-draw defaults)       config.c:777-1004
  loop :833
    JE_initPlayerData :851  (1 mt_rand: secretHint)                                          mainint.c:1042
    JE_sortHighScores :852  (no RNG)                                                         mainint.c:1092
    titleScreen :868                                                                         tyrian2.c:3283
       NEW GAME   -> newGame                                                                 tyrian2.c:3625
       LOAD GAME  -> JE_loadScreen -> JE_operation -> JE_loadGame                            mainint.c:628 / 2940 / config.c:433
       HIGH SCORES-> JE_highScoreScreen                                                      mainint.c:1118-1350
       INSTRUCTIONS-> JE_helpSystem(1)                                                       mainint.c:191-580
       SETUP      -> setupMenu (Graphics/Sound/Jukebox/Done)                                 opentyr.c:100-~740
       DEMO / idle 30 s (SDL_GetTicks) -> play_demo=true                                     tyrian2.c:3384-3396
       typed codes (specialName[]): DESTRUCT -> loadDestruct; ENGAGE -> JE_whoa + newSuperTyrianGame;
                  others -> newSuperArcadeGame(i)                                            tyrian2.c:3511-3560, 3676, 3721, 5221
    if loadDestruct -> JE_destructGame (destruct.c, 2746 lines: NOT in scope)
    else JE_main :883 ;  if trentWin -> break -> JE_tyrianHalt (exit)                       tyrian2.c:621
```

TS today: `src/game.ts` loops title -> `runLevel` (demo only) / stubs.

### 1.2 newGame (tyrian2.c:3625-3674) and the select screens (menus.c)

```
newGame
  gameplaySelect      menus.c:42-246   items: 1P full / 1P arcade / 1P timed battle / 2P arcade / (network, disabled)
                                       result (menus.c:214-222): onePlayerAction, timedBattleMode, twoPlayerMode
  timedBattleMode ? timedBattleSelect (menus.c:678-858; JE_initEpisode(sel==0?1:5) at :846)
                    : episodeSelect   (menus.c:247-433; JE_initEpisode(sel+1) :415, initial_episode_num = episodeNum :416,
                                       episodeAvail[] gates the action, disabled -> S_SPRING)
  difficultySelect    menus.c:434-677  difficultyLevel = EASY/NORMAL/HARD/IMPOSSIBLE/SUICIDE/ZINGLON by index (:640-660)
                      hidden rows: shift+']' -> 5th row (Suicide), shift+'G' -> 4th (Impossible reveal), typed/held L,O,R,D -> 6th
                      (menuItemsVisibleCount 3 -> 4 -> 5 -> 6; uses SDL_GetModState() & KMOD_SHIFT :541, keysactive[] :517-535)
  gameLoaded = true on success; initialDifficulty = difficultyLevel (:3637, runs even on cancel)
  cash/ship: onePlayerAction  -> cash 0, ship 8 (Stalker)           :3640-3645
             twoPlayerMode    -> cash 0/0, ship[0]=11, difficultyLevel++, inputDevice = {1,2}
             richMode         -> 1,000,000 (command-line flag; irrelevant)
             full game        -> cash = {10000,15000,20000,30000,20000}[episodeNum-1]   :3661-3669
  returns gameLoaded -> titleScreen returns true -> main() calls JE_main
```
Every select screen is the same pattern as the (ported) title menu: restart/redraw loop, `SDL_Delay(16)` poll until key/mouse/
motion, hover-select with `S_CURSOR`, `S_SELECT`/`S_SPRING`, `fade_palette/fade_black`. They share `shopSpriteSheet` for the cursor.

### 1.3 JE_main state machine (tyrian2.c:621-2397)

```
JE_main
  goto start_level_first                                                                    :632
start_level:                                                                                :641
  mouseSetRelative(false); free enemy sprite sheets; fastPlay reset (:652-657)
  play_demo/record_demo: close demo file; if play_demo { moveTyrianLogoUp, stop_song, fade_black(10), wait_noinput }   :663-679
  difficultyLevel = oldDifficultyLevel                                                      :681
  if !play_demo:                                                                            :683-712
     if (!all_players_dead() || normalBonusLevelCurrent || bonusLevelCurrent) && !playerEndLevel
          mainLevel = nextLevel; JE_endLevelAni(); fade_song()                             (mainint.c:2689-2903)
     else fade_song; fade_black(10); if timedBattleMode {mainLevel=0; return}
          JE_loadGame(twoPlayerMode?22:11)   <- restores the "LAST LEVEL" backup (death AND in-game-menu quit)
          if doNotSaveBackup {superTyrian=false; onePlayerAction=false; super_arcade_mode=SA_NONE}
          if bonusLevelCurrent && !playerEndLevel: mainLevel = nextLevel
  doNotSaveBackup=false; if play_demo return                                                :714-720
start_level_first:                                                                          :721
  set_volume; endLevel/reallyEndLevel/playerEndLevel/extraGame=false
  JE_loadMap()                         <- the script parser; may run the shop, text, cutscenes            :730
  if mainLevel == 0 return             <- "quit itemscreen" / timed battle end / SuperTyrian end         :732
  if !play_demo mouseSetRelative(true) :737
  player init, loadPic(3 or 6), JE_drawOptions, level name, JE_gammaCorrect, fade_palette(50)   :743-780
  ... (the ported setup, 780-1087) ...
  :933-938  if !play_demo && !doNotSaveBackup && !timedBattleMode: JE_saveGame(twoPlayerMode?22:11, "LAST LEVEL    ")
  :940-995  record_demo header writer (see sec. 6)
level_loop:                                                                                 :1088
  ... ported frame body ...
  2156-2200 game over (non-demo: JE_dString "GAME OVER", play_song(SONG_GAMEOVER), then wait any key/button/mouse)
  2201-2252 demo: any input kills demo.  Non-demo: service_SDL_events(false); if newkey {skipStarShowVGA=false;
            JE_mainKeyboardInput(); newkey=false; if skipStarShowVGA goto level_loop}                      :2213-2223
            if pause_pressed || !windowHasFocus -> JE_pauseGame                                           :2226-2234
            if ingamemenu_pressed -> yourInGameMenuRequest=true; JE_doInGameSetup(); skipStarShowVGA=true :2236-2250
  2328 filterScreen; 2332 drawBossBar; 2334 inGameDisplays; 2338 JE_starShowVGA
  2386-2395 if reallyEndLevel goto start_level;  goto level_loop
```
`goto level_loop` at 2223 re-runs the whole frame body (events, enemy spawn RNG, movement) without presenting: `levelFrame`
needs a tri-state return {continue, restart-frame, end}; `skipStarShowVGA` is cleared in `JE_starShowVGA` (:149-150).

### 1.4 JE_loadMap episode-script parser (tyrian2.c:2399-3034 parser, 3041-3200 level file read = already ported)

Prologue 2399-2428: `lastCubeMax=cubeMax; songBuy=DEFAULT_SONG_BUY; saveLevel=mainLevel;` `new_game:` (2425) resets galagaMode,
useLastBank, extraGame, haltGame, gameLoaded=false. Then `do { fopen(episode_file); jumpSection=false; loadLevelOk=false;
skip lines until mainLevel '*'-lines have been seen; do { if gameLoaded {fclose; mainLevel==0 ? return : goto new_game};
read line; if ']' switch(s[1]) ... } while(!(loadLevelOk||jumpSection)); fclose } while(!loadLevelOk)`.
Lines are **encrypted Pascal strings** (`read_encrypted_pascal_string`, helptext.c:83-126; TS has `decryptString` in data/helptext.ts).
`ESCPressed` is declared (keyboard.c:33) but **never set true anywhere** - dead; drop it.

Commands present in the shipped data (**[measured]**, count across all 5 files; `V`, `R`, `B` do not occur at all):

| cmd | line | what it does | in data | needs |
|---|---|---|---|---|
| `A` | 2475 | `JE_playAnim("tyrend.anm",0,7)` | ep3 x1 | animlib.c port |
| `G` | 2479 | `mapOrigin=atoi(s+4); mapPNum=atoi(s+7); mapPlanet[i]=atoi(s+1+(i+1)*8); mapSection[i]=atoi(s+4+(i+1)*8)` | 67 | state only |
| `?` | 2489 | `temp=atoi(s+4); cubeList[i]=atoi(s+3+(i+1)*4); if cubeMax>temp cubeMax=temp` | 67 | state |
| `!` | 2499 | `cubeMax=atoi(s+4)` | 29 | state |
| `+` | 2503 | `cubeMax+=atoi(s+4)` capped 4 | 7 (ep4) | state |
| `g` | 2510 | galagaMode + copy p1 items | 2 | galaga (optional) |
| `x` | 2519 | extraGame=true | 3 | state (shop shows text miscText[67]) |
| `e` | 2523 | ENGAGE loadout, doNotSaveBackup, superTyrian | 3 | state |
| `J` | 2545 | `mainLevel=atoi(s+3); jumpSection` | 17 | - |
| `2` | 2551 | jump if twoPlayerMode\|\|onePlayerAction | 4 | - |
| `w` | 2560 | jump if ship==13 | 1 | - |
| `t` | 2569 | jump if levelTimer && countdown==0 | 2 | - |
| `l` | 2578 | jump if !all_players_alive() | 1 | - |
| `s` | 2587 | `saveLevel=mainLevel` | 11 | - |
| `b` | 2591 | `JE_saveGame(11,"LAST LEVEL    ")` (**always slot 11**; the `temp = twoPlayer?22:11` above it is dead) | 3 | persistence |
| `i` | 2599 | `songBuy=atoi(s+3)-1` | 1 | - |
| `I` | 2604 | clear itemAvail[9][10]; read **9 more lines**; per line `strncpy(buf, strlen(s)>8 ? s+8 : "")`, `str_pop_int` loop -> `itemAvail[i][j++]`, `itemAvailMax[i]=j`; then **`JE_itemScreen()`** | 66 | shop |
| `L` | 2623 | `nextLevel=atoi(s+9); levelName=strlcpy(s+13,10); levelSong=atoi(s+22); (nextLevel==0 -> mainLevel+1); lvlFileNum=atoi(s+25); loadLevelOk; bonusLevelCurrent=(strlen(s)>28)&(s[28]=='$'); normalBonusLevelCurrent=(strlen(s)>27)&(s[27]=='$'); gameJustLoaded=false` | 76 | - |
| `@` | 2638 | `useLastBank=!useLastBank` (text glow bank) | 1 | - |
| `Q` | 2642 | end of episode: `temp=secretHint+(mt_rand()%3)*3` (**1 RNG draw**), builds score+hint text (levelWarningText[0]="miscText[37] <JE_totalScore>"), `frameCountMax=4`, JE_displayText, fade_black(15), **JE_nextEpisode()**, then the jumpBackToEpisode1/superTyrian block (2697-2740: superArcadeMode reveal screens, `trentWin`, `mainLevel=0; return`) | 5 | text screens, nextEpisode |
| `P` | 2744 | pic: >900 -> palette only (`palettes[pcxpal[x-1-900]]`, clr, fade 1 step); 0 -> `JE_loadPCX("tshp2.pcx")`; else `JE_loadPic`; fade_palette(10) | 38 | pcxload |
| `U` | 2768 | scroll-up reveal of pic (z=0..199, `setDelay(1)`, abort on newkey) | 1 (ep1) | - |
| `V` / `R` | 2819 / 2870 | scroll-down / scroll-left reveal | 0 | skip (or port, 50 lines each) |
| `C` | 2917 | fade_black, clr, `palettes[7]` | 2 (ep3) | - |
| `B` | 2928 | fade_black(10) | 0 | - |
| `F` | 2934 | fade_white(100), fade_black(30), clr | 9 | - |
| `W` | 2944 | warning/text screen: `levelWarningDisplay=(s[2]=='y')`, `frameCountMax=atoi(s+4)` split into `warningRed=/10`, `%10`; read lines to `#` into `levelWarningText[12][61]`; `JE_displayText()` | 34 | glow text |
| `H` | 2977 | `if initialDifficulty < HARD: mainLevel=atoi(s+4); jump` | 2 | - |
| `h` | 2985 | `if initialDifficulty > NORMAL: read (discard) the NEXT line` | 1 (ep1) | - |
| `S`,`n`,`M`,`T`,`q` | 2992-3022 | net sync / (noop) / `play_song(atoi(s+3)-1)` / timed-battle jump `atoi(s+timeBattleSelection*3)` / timed battle `JE_highScoreCheck; mainLevel=0; return` | 23 `M`, 2 `T`, 2 `q` | - |

Shape of the script (**[measured]**): 48/24/25/51/20 sections in episodes 1-5; typical section = `]?[ ]![ ]G[ ]I[`+9 item lines (shop) or
`]L[` lines. E.g. ep1 section 1 is `]T[ ]J 002[` (jump to 2), section 2 is the first shop, section 3 is `]h[ ]L[ ... TYRIAN 18 09 / ]L[ ... 18 15`
(on Hard+ the first `]L` is skipped by `]h`). `]L` field offsets are fixed columns; atoi must be C's (skip leading blanks, optional sign,
stop at junk, e.g. `atoi("002[")==2`). ep4 `]L` lines carry trailing `>> comments`; the `$$` bonus markers are at s[27]/s[28].
Per-level data: `lvlFileNum` is 1-based into the level file pair table (ep4 max 20, ep5 max 8). `itemAvail` rows hold <= 4 ids
(**[measured]**) so the `itemAvail[9][10]` overflow in `]I` (`j++` unbounded) is not reachable with shipped data.
`levelWarningText[12][61]` overflow: `]Q` blocks write `2+N+1` rows, max N=7 -> fine; one ep5 `]W` line is 61 chars (1-byte strcpy overflow into the
next row's byte 0, which is overwritten or unused) -> benign **[measured]**.

After the loop (3036-3200): `if play_demo load_next_demo else fade_black(50)`, then the level-file read = `loadLevelRecord` (ported). So the
non-demo `loadMap` = the ported tail + this command loop. The shop and text screens run *inside* this call; `gameLoaded`
(set by shop load/quit and by `JE_nextEpisode`) makes the loop restart from `new_game:` with the new `mainLevel`/episode file.

### 1.5 The shop: JE_itemScreen (game_menu.c:157-1662) and helpers

```
JE_itemScreen                                        game_menu.c:157
  prologue :157-240   load_cubes(); play_song(songBuy); loadPic(1); curMenu=FULL_GAME (1P arcade->MENU_1_PLAYER_ARCADE,
                      2P->2_PLAYER_ARCADE, superTyrian->SUPER_TYRIAN :245-254); itemAvail merge of last_items + bubble sort
  do { (:242-1612)
     draw: header/choices per menu (:250-805)  [full game, upgrades, options, next-level map, upgrade sub w/ item cards,
           keyboard/mouse/joystick config, load/save, data cubes (list/sub)]
     inner animation+poll loop :808-1085  (setDelay(2|3) wait_delay; push_joysticks_as_keyboard; service_SDL_events;
           JE_mousePosition; Alt+S / Alt+L quicksave/quickload :1002-1030; data-cube scroll keys/mouse :1032-1083)
     mouse handler :1088-1250 (click rows via mouseSelectionY[], power +/- buttons, volume sliders in OPTIONS)
     key handler   :1253-1612 (SLASH rear-mode, ENTER->JE_menuFunction, ESC, F1 help, UP/DOWN/LEFT/RIGHT per menu, PAGE...)
  } while (!(quit || gameLoaded || jumpSection))     :1612
  if gameLoaded fade_black(10)                       :1660
```
Menus (enum game_menu.c:46-62): FULL_GAME 0, UPGRADES 1, OPTIONS 2, PLAY_NEXT_LEVEL 3, UPGRADE_SUB 4, KEYBOARD_CONFIG 5, LOAD_SAVE 6,
DATA_CUBES 7, DATA_CUBE_SUB 8, 2_PLAYER_ARCADE 9, 1_PLAYER_ARCADE 10, LIMITED_OPTIONS 11, JOYSTICK_CONFIG 12, SUPER_TYRIAN 13, MOUSE_CONFIG 14.
Exits: "Next level" -> `JE_menuFunction` sets `mainLevel=mapSection[sel-2]; jumpSection=true` (:2774-2781); arcade "play" the same with the
last planet (:2963, 3088); "Quit" -> `JE_quitRequest` -> `gameLoaded=true; mainLevel=0` (:2717, 2973, 3095, ESC at :1293).
Helpers (all in game_menu.c unless noted):

| function | lines | purpose / globals |
|---|---|---|
| `JE_menuFunction` | 2669-3128 | per-menu Enter handler; ends with `old_items[0]=player[0].items` (:3126). Writes keySettings (key capture loop :2812-2860), inputDevice, mouseSettings |
| `JE_drawMenuHeader/Choices` | 1917-1991 | header/title, choice rows |
| `JE_drawItem/genItemMenu/drawScore` | 1869-1916, 2601-2644, 2659 | item cards; `menuInt[5]/[4]` strings are *mutated at runtime* (strcpy) |
| `JE_updateNavScreen`,`drawLines/NavLines/Dots/Planet`,`computeDots`,`partWay`,`scaleBitmap` | 1992-2255, 2282-2317 | planet map (`planetX/Y[21]`, `navX..`, dots with `roundf(sqrtf(sqrtf()))`, float math) |
| `JE_doShipSpecs`,`JE_drawShipSpecs`,`JE_scaleInPicture`,`draw_ship_illustration` | 2318-2343, 3129-3235, 2645-2658, 1663-1756 | ship-spec zoom screen (uses game_screen + VGAScreen2 as scratch) |
| `JE_initWeaponView`,`JE_weaponSimUpdate`,`JE_weaponViewFrame` | 2256-2281, 3236-3420 | in-shop weapon simulator: **`initialize_starfield()` (300 mt_rand)**, `player_shot_create`, `simulate_player_shots`, power bar; globals `power,lastPower,shotRepeat,shotMultiPos,shotAvail,player[0].x/y/sidekick[]` |
| `load_cubes/load_cube` | 1757-1868 | reads `cubetxtN.dat` (word-wrap into `cube[4]`: text[90][36], 150 px width in TINY_FONT) |
| `JE_saveRequest/JE_quitRequest` | 2381-2486, 2487-2600 | yes/no dialogs with own loops (`setDelay(4)`, mouse regions) |
| `JE_cashLeft` | 133-154 | `tempL` is `JE_longint`; **`tempW` global written**; result assigned back into `ulong cash` |
| (mainint.c) `JE_getCost`,`weapon_upgrade_cost`,`JE_getValue`,`JE_totalScore` | 581-627, 924-974 | `upgradeCost/downgradeCost` globals written by `JE_getCost` (:612-614) |
| (mainint.c) `JE_operation` | 2940-3071 | save-name text entry / load; **reads the stale mouse.c `mouseButton` global (:3012)** |
| (mainint.c) `JE_helpSystem`,`JE_helpBox`(helptext.c:128) | 191-580 | F1 / Instructions |

### 1.6 Level end, game over, episode end

```
level ends: reallyEndLevel -> start_level (1.3) -> JE_endLevelAni                     mainint.c:2689-2903
   grants shipedit privileges into saveTemp[SAVE_FILES_SIZE + ...] (:2697-2714), adjust_difficulty (:2268-2335, float32 math),
   last_items=items, lastLevelName=levelName, V_LEVEL_END sample / song 21, glow text lines, cube award animation (JE_drawCube),
   "press a key"; wait_noinput(joystick only); fade_black(15); clr256
 -> back at start_level_first: JE_loadMap reads on from mainLevel (script continues: next ]I shop, text, ...)
death (allPlayersGone): "GAME OVER" (tyrian2.c:2173), wait any key/button/mouse (2182-2192) -> reallyEndLevel -> start_level
   else-branch -> JE_loadGame(11) -> mainLevel=saveFiles[10].level (= saveLevel) -> JE_loadMap -> shop of that section
in-game menu "Quit": JE_inGameSetup()==true -> reallyEndLevel=playerEndLevel=true (mainint.c:1421-1425) -> same restore path
episode end: script `]Q` -> JE_displayText -> JE_nextEpisode                          mainint.c:975-1040
   highscore check if episodeNum==initial_episode_num && !gameHasRepeated (JE_highScoreCheck mainint.c:2022-2267, name entry)
   JE_findNextEpisode (episodes.c:253: ep+1, wraps 5->1 with jumpBackToEpisode1/gameHasRepeated, skips !episodeAvail)
   if jumpBackToEpisode1: JE_playCredits if episodeNum>2 (mainint.c:2521-2688); 1-in-6 mt_rand: SuperCarrot loadout (:995)
   JE_initEpisode(new) (reloads item tables!), gameLoaded=true, mainLevel=saveLevel=1, play_song(26), "episode name" screen, wait key
   -> loadMap loop sees gameLoaded -> new_game -> section 1 of the new episode file
SuperTyrian/ENGAGE end, timed battle end: mainLevel=0; return -> title.
```
Title return after JE_main: next `main` iteration re-runs `JE_initPlayerData` (1 draw) and `JE_sortHighScores`.

---------------------------------------------------------------------------------------------------

## 2. Port modules (not yet ported), with C sizes

| TS module (proposed) | C source & lines | purpose | globals it owns / writes |
|---|---|---|---|
| `game/flow.ts` (JE_main state machine) | tyrian2.c:621-720, 2386-2395; level.ts `runLevel` | start_level/start_level_first/level_loop; restart-frame tri-state; backup save; death restore | `doNotSaveBackup, mainLevel, nextLevel, saveLevel, gameLoaded, jumpSection, oldDifficultyLevel` |
| `game/script.ts` (loadMap commands) | tyrian2.c:2399-3034 (~640) + `JE_displayText` 3832-3884, `str_pop_int` mainint.c:2917 | script parser, text/pic/fade commands | `levelWarningText/Lines/Display, warningRed, warningCol*, itemAvail/Max, mapOrigin/PNum/Planet/Section, cubeList/cubeMax, songBuy, useLastBank, levelName, levelSong, lvlFileNum, bonus*, extraGame` |
| `video/glow-text.ts` | mainint.c:84-170 (`JE_outCharGlow`), fonthand.c:259-285 (`JE_updateWarning`), 287-320 (`JE_outTextGlow`), helptext.c:128-186 (`JE_helpBox`) , nortvars.c:63 (`JE_barDrawShadow`) | glowing text, red warning bars | `textGlowFont, frameCountMax` side effects |
| `data/pcx.ts`, `data/anim.ts` | pcxload.c (76), animlib.c (397) | `tshp2.pcx` (ep4 `]P 000`), `tyrend.anm` (`]A`) | `colors[]` |
| `screens/select.ts` | menus.c:42-858 (~800) | gameplay/episode/difficulty/timed-battle selects + newGame/newSuperArcade/newSuperTyrian | `onePlayerAction,timedBattleMode,twoPlayerMode,initialDifficulty,difficultyLevel,episodeNum,initial_episode_num,player[0].cash/items` |
| `screens/shop.ts` (+`shop-draw.ts`, `shop-nav.ts`, `shop-weapon.ts`, `shop-cubes.ts`) | game_menu.c:1-3420 | the whole item screen | `curMenu, curSel[15], curItem*, cursor, menuChoices, itemAvail*, old_items[2], cube[4], yLoc, yChg, col/colC, planetDots*, nav*, weaponSimTime, lastDirection, quikSave, performSave, newPal/curPal/oldPal, keyboardUsed, leftPower/rightPower, upgradeCost/downgradeCost`; **writes scratch `temp/temp2/temp3/tempW`** |
| `game/economy.ts` | mainint.c:581-627, 924-974, 2268-2335; game_menu.c:133 | cost/value/score/difficulty adjust | - |
| `game/save.ts` + `platform/storage.ts` | config.c:344-510, 618-739, 777-1004, 1005-1170; mainint.c:2940 (`JE_operation` UI in shop) | `JE_saveGame/JE_loadGame`, tyrian.sav (de)serialiser, tyrian.cfg, opentyrian.cfg -> JSON, storage adapter | `saveFiles[22]`(full struct), `saveTemp[2502]` (item-avail 100 bytes!), `editorLevel`, `t2kHighScores[20][3]`, `keySettings`, `mouseSettings`, `inputDevice`, volumes, processorType, gameSpeed, gammaCorrection |
| `game/input-level.ts` | mainint.c:3147-3390 (`JE_mainKeyboardInput`), 3391-3490 (`JE_pauseGame`), 3585-3860 (movement input), 1351-1388 (gamma), 1389-1919 (`JE_doInGameSetup/JE_inGameSetup`), 1920-2021 (`JE_inGameHelp`) | in-level control, pause, F1, Esc menu | `pause_pressed, ingamemenu_pressed, superPause, youAreCheating, fastPlay, gammaCorrection, processorType, gameSpeed, yourInGameMenuRequest, haltGame` |
| `platform/input.ts` additions | keyboard.c:30-286, mouse.c:35 | `mouse_pressed[4]` + `mouseSettings` mapping (keyboard.c:233-262), relative mouse accumulator + `scaleWindowDistanceToScreen` (video.c:418), `windowHasFocus`, modifier state, `has_mouse`, `mouseButton/JE_mousePosition`, DOM pointer lock | see sec. 4 |
| `game/smoothies.ts` | backgrnd.c:315-431, tyrian2.c:96-148, 1265-1410, 5009-5030, 5209, 2049-2051 | lava/water/ice/blur filters, flip+lighting present, VGAScreen-pointer refactor, random explosions | `smoothies[9], smoothie_data[9], anySmoothies, starShowVGASpecialCode, randomExplosions` |
| `screens/endlevel.ts` | mainint.c:2689-2903 (`JE_endLevelAni`) | level-complete tally | `saveTemp` item-avail bytes, `editorLevel`, `lastLevelName` |
| `screens/episode-end.ts` | mainint.c:975-1040 (`JE_nextEpisode`), 2022-2267 (`JE_highScoreCheck`), 2521-2688 (`JE_playCredits`), episodes.c:253 | ending flow | `gameHasRepeated, jumpBackToEpisode1, t2kHighScores` |
| `screens/loadscreen.ts`, `highscores.ts`, `help.ts`, `setup.ts` | mainint.c:628-923, 1118-1350, 191-580; opentyr.c:100-740 | title items 2-5 | none new (help uses `helpTxt`/`topicName`) |
| `data/itemdat.ts` (extend) | episodes.c:54-224, 228-241 | ep4/5 item data from level file | `weapons, weaponPort, special, powerSys, ships, options, shields, enemyDat, episode1DataLoc` |
| optional: `arcade.ts`, `galaga`, `two-player` | tyrian2.c:3676-3775, `JE_whoa` 5221-5296, player.ts throws | super arcade, galaga, 2P | `superArcadeMode, SA*` |

Not needed: `network.c`, `destruct.c`, `jukebox.c`, `joystick.c`/`push_joysticks_as_keyboard` (Gamepad API is optional polish;
treat `joydown`=false), `editship.c` (user file `newsh$.shp` is looked up in the *user* dir, so `extraAvail` stays false; ship ids > 90
never occur in shipped item lists **[measured]**), `xmas.c`, `video_scale*.c` (except the 2 coordinate-scaling formulas).

---------------------------------------------------------------------------------------------------

## 3. Data files and formats

| file | format / use | status |
|---|---|---|
| `levelsN.dat` (N=1..5; 9600/5534/6052/11116/4257 bytes) | sequence of Pascal strings (u8 len + bytes), each decrypted with `key={204,129,63,255,71,19,25,62,1,99}`: `for i=len-1..0: s[i]^=key[i%10]; if i>0 s[i]^=s[i-1]` (helptext.c:83). Section = line starting `*`. 481/277/311/683/184 lines | in archive; **new parser** |
| `tyrianN.lvl` | `u16 lvlNum; s32 lvlPos[lvlNum]; lvlPos[lvlNum]=EOF` (`JE_analyzeLevel`, lvllib.c:29; `lvlPos` array is 43 entries). Level record of `lvlFileNum` at `lvlPos[(lvlFileNum-1)*2]` (odd entries unused). **Episodes 4 and 5 store the item tables at `lvlPos[lvlNum-1]`** (ep4 663408 of 937303, ep5 247242 of 521137; for ep1-3 `lvlPos[lvlNum-1]==EOF`) **[measured]** | record parser ported; item parser needs the offset (see below) |
| `tyrian.hdt` | help text + item data for ep1-3 at `episode1DataLoc` (first s32) | ported |
| item data block (`JE_loadItemDat`, episodes.c:54-224) | `u16 itemNum[7]`, weapons (banks 0..WEAP_END1 and WEAP_START2..WEAP_NUM), weaponPort, special, powerSys, ships, options, shields, enemyDat (two banks). Identical layout for ep4/5 at the level-file offset. **`JE_initEpisode` reloads *all* of it on every episode change** (episodes.c:228-241), so `ships/weapons/enemyDat` change between episodes; the early `return if newEpisode==episodeNum` skips the reload. Note `src/game/episodes.ts` currently discards `analyzeLevel`'s result and `loadItemDat` takes only the hdt bytes -> must take (bytes, offset) | extend |
| `cubetxtN.dat` | encrypted Pascal strings; cube k = lines after the k-th `*` line; first line holds the face sprite id at `buf[4]`, then title (80), header (12), body (paragraph = empty line; 2 empty lines in a row = 4 blank lines), terminated by `*` (game_menu.c:1767-1868) | in archive; new |
| `tyrian.cdt` (1078 B) | 126 encrypted Pascal strings = credits; char 0 = colour (`c-65`), `.` = blank | in archive; new |
| `tyrend.anm` (3.3 MB) | LPF animation: header `"LPF "`, nlps u16 @6, nRecords u32 @8, palette @0x100, page headers @0x500, data @0xB00, page stride 0x10000, run-skip-dump delta frames (animlib.c:152-260) | in archive; new |
| `tshp2.pcx`, `estsc.shp` | 320x200 PCX with 769-byte trailing palette (pcxload.c); `estsc.shp` = EXTRA_SHAPES for credits (`load_sprites_file`) | new |
| `tyrian.pic`, `palette.dat`, `pcxpal[]` | pictures 1,2,3,6,13,... used by shop/menus; `pcxpal` = `{0,7,5,8,10,5,18,19,19,20,21,22,5,23}` (pcxmast.c) | ported |
| `demo.1..5` | see sec. 6 | ported |
| `tyrian.sav` (user dir) | **4722 bytes**: `saveTemp[2502]` encrypted + T2K high scores plain. `saveTemp` = 22 save records x 109 bytes (2398) + 100 item-availability bytes (shipedit privileges `saveTemp[2398+idx]`, seeded from `initialItemAvail[]` config.c:101-109; the last two bytes hold `editorLevel` big/little at [2496],[2497] (`SIZEOF_SAVEGAMETEMP-6/-5`)) + 4 checksum bytes. Encryption (config.c:618-662): sum, difference, `y=y*s+1`, xor checksums into [2498..2501], then `s[x]^=cryptKey[(x+1)%10]; s[x]^=s[x-1]` in place; decrypt reverses and **`exit(255)` on a bad checksum (config.c:664-737)**. Record (config.c:826-870 & 1017-1062): `encode u16, level u16, items[12], score s32, score2 s32, levelName pascal(10), name[14], cubes, power[2], episode, lastItems[12], difficulty, secretHint, input1, input2, gameHasRepeated, initialDifficulty, highScore1 s32, highScore2 s32, highScoreName pascal(30), highScoreDiff`. Items[12] order (config.c:344-374): front id, rear id, super_arcade_mode, left sk, right sk, generator, sidekick_level, sidekick_series, initial_episode_num, shield, special, ship. Plain tail: 10 tables x3 x `{s32 score, u8 len, char[29], u8 difficulty}` (35 B), then 10 x3 x `{s32 score, s32 0x12345678, u8 len, char[29], u8 difficulty}` (39 B) | **new (T5)** |
| `tyrian.cfg` (user dir, 28 B) | `bool background2, u8 gameSpeed, inputDevice_, jConfigure, versionNum, processorType, midiPort, soundEffects, gammaCorrection, s8 difficultyLevel, u8 joyButtonAssign[4], u16 tyrMusicVolume, u16 fxVolume, u8 inputDevice[2], u8 dosKeySettings[8]` (config.c:787-811, 1139-1160) | new |
| `opentyrian.cfg` | INI-ish: video (fullscreen, scaler, scaling_mode), keyboard (`up, down, left, right, fire, change fire, left sidekick, right sidekick` = SDL scancode *names*), mouse (`left/right/middle mouse` = `fire main weapon`, `fire left sidekick`, `fire right sidekick`, `fire both sidekicks`, `change rear mode`) (config.c:211-340). For the browser: store JSON with scancode ints; the key-config screen needs `SDL_GetScancodeName` text ("Up","Space","Return","Left Ctrl","Left Alt") | new |

Browser storage: one key for the sav blob (store the *encrypted* 4722-byte image base64/IndexedDB so format tests against the C file are byte-exact),
one JSON for cfg. `JE_saveConfiguration` runs on every `JE_saveGame` (i.e. **at every level start**, backup slot 11), so the adapter must be sync-fast
(localStorage) or write-behind.
`JE_loadConfiguration` with an existing save does **not** make the 174 RNG draws (config.c:955-996); today's `loadConfigurationDefaults` always does -
make the draws conditional on "no stored save".

---------------------------------------------------------------------------------------------------

## 4. Player input in normal play

**Single player always calls `JE_playerMovement(&player[0], 0, 1, ...)`** (mainint.c:4688-4691): `inputDevice==0` = "any", so joystick,
mouse AND keyboard are merged every frame. (`inputDevice[]` {1,2} only matters in two-player, mainint.c:4678-4684.) Demo/record force `inputDevice=1` (:3667).

`JE_playerMovement` non-demo input block (mainint.c:3656-3853; TS stub `player.ts:161-164`):
1. Joystick (3679-3711): skipped (`joysticks==0`). Gamepad optional.
2. `service_SDL_events(false)` (:3711).
3. Mouse (3713-3726), `has_mouse`: `button[0..3] |= mouse_pressed[0..3]`; `mouseGetRelativePosition` -> `mouseXC/YC += rel`.
   `mouse_pressed[]` is set in `service_SDL_events` per `mouseSettings[whichMB]` (keyboard.c:233-262): value 1 -> `[0]` (fire main), 2 -> `[1]` (left sidekick),
   3 -> `[2]`, 4 -> `[1]` and `[2]`, 5 -> `[3]` (change rear mode); default `{1,4,5}` = left fire, right both sidekicks, middle change mode.
   Relative motion exists only while `mouseSetRelative(true)` (level) and `windowHasFocus`; it is *reset to 0* on each `mouseSetRelative` call (keyboard.c:109-117) and consumed by
   `mouseGetRelativePosition` (keyboard.c:127-137): `rel = (2*x+1)*320/(2*outputRect.w)` (video.c:418; C truncation toward 0, 0 stays 0 for outputRect.w>=160).
   Browser: Pointer Lock `movementX/Y` (CSS px) -> multiply into 320x200 units with the same formula, accumulate between frames.
4. Keyboard (3728-3790): `keysactive[keySettings[UP/DOWN/LEFT/RIGHT]]` -> `x,y +/-= 1` (CURRENT_KEY_SPEED, varz.h:48); `button[0] ||= FIRE`, `button[3] ||= CHANGE_FIRE`,
   `button[1] ||= LEFT_SIDEKICK`, `button[2] ||= RIGHT_SIDEKICK` (**note the order: [0]=fire, [3]=change fire, [1]=left, [2]=right**).
   Defaults (config.c:61-70) `{Up 82, Down 81, Left 80, Right 79, Space 44, Return 40, LCtrl 224, LAlt 226}` (SDL scancodes; matches `world.ts defaultKeySettings`).
   `constantPlay` and `record_demo` sub-blocks: dead.
5. `if smoothies[9-1]`: `*mouseY_ = p.y - (*mouseY_ - p.y); mouseYC = -mouseYC` (:3785-3790). The TS demo path has only the first half; the `mouseYC` flip must be added when the mouse code lands.
6. `accelXC += x - *mouseX_` ... then mouse delta clamped to +/-30, applied as `(m+3)/4` / `(m-3)/4` (C int division), and `accelXC++` when `mouseXC>3` / `accelXC--` when `< -2`, `accelYC` thresholds `>2 / < -2` (:3792-3851) - all after the key movement, so mouse+keyboard stack.

`JE_mainKeyboardInput` (3147-3390) runs only `if (newkey)` after `service_SDL_events(false)` at tyrian2.c:2214-2224 (`newkey` stays true from any earlier service call in the frame until cleared there):
F11 gamma (`JE_gammaCheck` 1374-1387: `gammaCorrection=(g+1)%4`, palette 3, `JE_gammaCorrect`), F1 in-game help (sets `skipStarShowVGA` -> `goto level_loop`), the Nort-ship code (F2+F4+F6+F7+F9+\\+/), cheats (F2+F3+F6 toggles `youAreCheating`; F2+F3+F4/F5 zero armour; F2+F6+F7/F8 skip level via `levelTimer=true,levelTimerCountdown=0,endLevel,levelEnd=40`), `pause_pressed |= keysactive[P]`, `ingamemenu_pressed |= keysactive[ESC]`,
Backspace combos (screenshot pause, smoothie toggles with F12+ScrollLock, filter colour cycle `-`, hyper-speed `1`, random music on ScrollLock = `mt_rand()%MUSIC_NUM`). The TAB/CapsLock edited-ship blocks need `extraAvail` (false). Debug (F10+Backspace) skip. Port gamma/F1/pause/menu/skip/Nort; the rest is optional and RNG-free except the ScrollLock music.

`JE_pauseGame` (3391-3490): `mouseSetRelative(false)`, draws `miscText[22]` ("Paused") on VGAScreenSeg unless `superPause`, `set_volume(tyrMusicVolume/2, fxVolume)`, `wait_noinput(false,false,true)`, loop `setDelay(2); service_SDL_events(true); done = (newkey && key not LCtrl/RCtrl/LAlt/RAlt) || JE_mousePosition()>0; wait_delay()`, then volume restored and `mouseSetRelative(true)`.
**Initial `windowHasFocus` is `false`** (keyboard.c:43) and the level loop pauses when `!windowHasFocus` (tyrian2.c:2226): the TS port must initialise it `true` (SDL delivers FOCUS_GAINED at window creation - **[measured]**: the dummy-driver oracle does not pause) and set it from DOM focus/blur; blur -> pause until key/click.

`JE_doInGameSetup` (1389-1517) -> `JE_inGameSetup` (1518-1919): Esc menu: Music Volume, Effects Volume, Detail Level (processorType cycles 1..4; `W` -> 6 SuperWild; calls `JE_initProcessorType` + `JE_setNewGameSpeed`), Game Speed (gameSpeed 1..5), Return, Quit (returns true -> `reallyEndLevel=playerEndLevel=true`). Same hover/click/arrow pattern as the title menu; draws on `VGAScreenSeg` over the frozen frame (`VGAScreen = VGAScreenSeg` for the call); mouse sliders `(x - xValue)*255/(w-1)`. `JE_inGameHelp` (1920-2021) = static help overlay + wait key (needs `JE_HBox`/`helpBox`).
After `JE_doInGameSetup` the level sets `skipStarShowVGA=true` (tyrian2.c:2250) so that frame is not presented/paced.

"Restart frame" control flow: only the F1 path does `goto level_loop` (:2221-2223); Esc-menu falls through with `skipStarShowVGA` (frame not shown).

Key conflicts in a browser: Esc exits pointer lock (the keydown may not be delivered while locked - handle `pointerlockchange` as "Esc pressed" or draw the menu on lock loss), F1/F5/F11/F12/Ctrl/Alt combos need `preventDefault`, Alt alone focuses the menu bar on some OS, Space/arrows scroll the page; LAlt/LCtrl are default sidekick keys.

---------------------------------------------------------------------------------------------------

## 5. Smoothies (event 64), starShowVGA codes, random explosions

Event 64 (tyrian2.c:5019-5030): `if (!(dat==6 && twoPlayerMode && difficultyLevel>NORMAL)) { smoothies[dat-1]=dat2; k=dat; if k==5 k=3; smoothie_data[k-1]=dat3 }`
(kinds 3 and 5 **share `smoothie_data[2]`**). Used in shipped levels **[measured]** (47 records): kind 1 lava x16, 2 water x9, 4 blur x8, 6 lighting x7, 9 flip x4, 5 iced x2, 3 iced-blur x1; in ep1 lvlFile 15,16,17 and ep4 lvlFile 3-20.
Defaults here: `processorType=3` (config.c default) so `anySmoothies = (pt>2 && (s1||s2)) || (pt>1 && (s3||s4||s5))` (backgrnd.c:315-318, already ported as `checkSmoothies`).

Frame structure (tyrian2.c:1265-1410): `if (anySmoothies) VGAScreen = VGAScreen2` (draws go to screen2), then each filter is `filter(dst=game_screen, src=VGAScreen); VGAScreen = game_screen`:
- after BG1+starfield: smoothie 5 -> `iced_blur_filter` (1307-1311);
- after BG2 draws: `smoothies[0] && pt>2 && smoothie_data[0]==0` -> `lava_filter` (1332-1336), `smoothies[1] && pt>2` -> `water_filter` (1337-1341); water also changes how BG1/BG2 sample (backgrnd.c:171-180, ported);
- after ground enemies: lava with `smoothie_data[0]>0` (1357-1361);
- after BG3-over / before sky enemies: smoothie 3 `iced_blur_filter` (1401-1405), smoothie 4 `blur_filter` (1406-1410).
Everything drawn *before* a filter goes to screen2 and is filtered; everything after goes to game_screen. In TS every module caches `const gs = ctx.vga.gameScreen`
(17 sites: specials 254, backgrounds 126/219, shots 108, enemies 95/833, explosions 142/192, hud 250/303/364/414, level 129/448/449/484, player 80) -> introduce `ctx.vga.cur` (the `VGAScreen` global) and use it at those sites.

Filters (backgrnd.c:320-431): sizes 40/40/22/22 lines. **They are history-dependent**: dst (game_screen) is read before being written - `lava`: `*(dst+waver-pitch)` (row above, still last frame's final composited picture) and `*(dst+waver+pitch)`; `water`: `*(dst+waver+pitch)`; iced/blur: `(src&15 + dst&15)/2`.
First processed row (y=184) reads row 185 of game_screen, never written by the level (stays whatever it was; SDL zero-inits). Out-of-row reads (`waver` -7..+7 at x edges) read neighbouring rows. `waver` comes from the running counter `w=320*185-1` decremented by 8 per 8-pixel group (`abs(((w>>9)&0xf)-8)-1` lava; `abs(((w>>10)&7)-4)-1` water). Lava forces hue 0x70; water `hue=smoothie_data[1]<<4`; iced hue 0x80; `value/4`, `/2` are unsigned-byte divides (`Uint8 value` can wrap: lava sums up to 15*2+15+15=60, fine).
**Therefore game_screen must persist across frames bit-exactly (including rows 184-199 and whatever the HUD/shop left there when the level starts) and be zero-initialised like SDL's.** `lava_filter` also guards `src_pixel+waver >= ll` and `dst-pitch >= ll` only at the top edge.

`JE_starShowVGA` codes (tyrian2.c:96-148): `starShowVGASpecialCode = smoothies[9-1] + (smoothies[6-1]<<1)` (:1099): 1 = vertical flip of the 264x184 window (copy rows bottom-up from `src+24+pitch*183`), 2 (and `processorType>=2`) = lighting: `lighty=172-p0.y; lightx=281-p0.x`; rows `y=184..1`; if `lighty>y` darken `(c&0xf0)|((c>>2)&3)`; else per pixel (x counts **down** 264..1) `dist=abs(lightx-x)+lighty`: `<y` unchanged, `dist-y<=5` -> `(c&0xf0)|(((c&0xf)+3*(5-(dist-y)))/4)`, else `(c&0xf0)|((c&0xf)>>2)`; row stride advance `56+pitch-320`. Code 3 (both) falls into code 1 (`if/else if`). Codes 1 and 2 are only produced by events 64 with dat 9 / 6 (ep1 15,16 / ep4 4,15,20 and 12,13).

Random explosions: event 99 (tyrian2.c:5209) `randomExplosions=(dat==1)` - shipped: ep4 lvlFile 15 (dat 1) and 18 (dat 0 x9) **[measured]**. Frame code (:2049-2051): `if (randomExplosions && mt_rand() % 10 == 1) JE_setupExplosionLarge(false, 20, mt_rand() % 280, mt_rand() % 180)` - one draw per frame while enabled (short-circuit), then **y drawn before x** (GCC right-to-left argument order; final review Important #1). `JE_setupExplosionLarge` is already ported (explosions.ts).

---------------------------------------------------------------------------------------------------

## 6. Determinism hooks and the C oracle

**RNG draws on these paths** (all `mt_rand`, same MT as gameplay):
- boot: 174 draws only in the no-save branch (config.c:965-996) - conditional in sp4.
- every `main` loop iteration: 1 draw in `JE_initPlayerData` (`secretHint`, mainint.c:1069).
- `]Q` (tyrian2.c:2646): 1 draw. `JE_nextEpisode` (mainint.c:995): 1 draw (`%6==0` -> SuperCarrot) *after* credits.
- `JE_playCredits` (mainint.c:2584-2606): ~3 draws every 200 ticks + 1 each time `shipxwait` hits 0.
- `initialize_starfield` (backgrnd.c; 300 draws): at every level start (ported) **and at every entry to the weapon-sim submenu** (`JE_initWeaponView`, game_menu.c:2279); `JE_weaponViewFrame` runs `player_shot_create`/`simulate_player_shots` which draw per weapon (so *time spent in the upgrade submenu* advances the RNG - frame-count exact).
- level frames: random explosions (3 draws when enabled), the already-ported spawn/shot/explosion draws; death explosions (mainint.c:3551-3559, ported).
- cheats: ScrollLock+Backspace random song (skip).
No RNG in menus, select screens, shop drawing (the planet map uses floats only), save/load, high scores, `JE_sortHighScores`.

**Time-based behaviour** (all through `SDL_GetTicks/SDL_Delay`, which the oracle redirects to a virtual clock with `OT_FAST=1`): title idle demo timer (30 s), `setDelay/wait_delay/service_wait_delay` pacing, `JE_outCharGlow` (polls `SDL_Delay(16)` until `getDelayTicks()==0`), `JE_displayText`, `JE_endLevelAni`, `JE_playCredits` (`getDelayTicks2`), joystick repeat, the debug FPS counter (`debug` only). Game *logic* is frame-counted; wall-clock only affects how many input polls happen between frames, which the virtual clock makes deterministic. `service_SDL_events` consumes **one key event per call** (returns after KEYDOWN/KEYUP, keyboard.c:183-195), already mirrored in `Input.serviceEvents`; the number of service calls per frame therefore matters for key latency and must be copied exactly.

**Can the oracle drive a real game? Yes - verified in this survey.** With `OT_KEYS` taps (down+up injected after the Nth *presented* frame) the oracle (seed 1, `OT_FAST`) walked
title (Return @141) -> gameplaySelect (Return @167) -> episodeSelect (Return @188) -> difficultySelect (Return @209) -> the first shop (cash 10000, from frame ~210, redrawn every ~2 ticks)
-> Down x4 + Return (Next Level) + Return (planet 1) -> level `TYRIAN` running from frame ~450 (player at 100,160; 2000+ frames, deterministic across 3 repeated runs, hash files identical).
Level state then follows `OT_STATE` (curLoc 575 enemies...). `windowHasFocus` is delivered by the dummy driver (no pause). The ship drifts under level mechanics (x/y velocity events), not input.
Limits found:
1. **Injection is keyed to `JE_showVGA` frames.** Screens that draw once and then block (gameplaySelect, episodeSelect, difficultySelect, load screen, high scores, text screens) cannot receive a key scheduled for a later frame: the process blocks forever (my first attempt hung at frame 167). Scenarios must use the *exact* frame of the last presented frame of each screen; add a **discovery runner** (run, read the last frame from the hash file, append the next key, repeat) or make injection fire from the `oracle_delay` hook after N polls without a new frame.
2. Taps are down+up in the same frame, so a key is held only until the next `service_SDL_events` call: fine for menus, **useless for holding fire/move keys in a level**. Needs `frame:scancode:holdFrames` (or separate down/up events) and mouse events (`SDL_MOUSEMOTION` with xrel/yrel, button down/up).
3. The 16-field state record has no `power/items/cash-derived/mainLevel/levelEnd/endLevel/curMenu/saveLevel/episodeNum/difficulty/gameLoaded`: add a v2 record (or `OT_STATE2`), plus `OT_SAVEDUMP=path` to copy `tyrian.sav`/`tyrian.cfg` from HOME at exit. Oracle HOME can be pre-seeded with a TS-written `tyrian.sav` to test the loader.
4. `mouseInactive` stays true without mouse events, so frame goldens contain no cursor sprite unless mouse events are injected - good for menus, but test the cursor once.

**record_demo as a golden source.** `-r`/`--record` sets `record_demo` (params.c:64, 210); at each level start (non-demo) JE_main writes `demorec.N` in the user dir (tyrian2.c:940-995): header `episodeNum u8, levelName[10], lvlFileNum, front id, rear id, super_arcade_mode, left sk, right sk, generator, sidekick_level, sidekick_series, initial_episode_num, shield, special, ship, front power, rear power, 3 unused, levelSong`, then `wait u16 BE, (keys u8, wait u16 BE)*` where `keys` bits 0-7 = up,down,left,right,fire,change fire,left sk,right sk of **player 0 keyboard only**; the writer also sets `inputDevice=1` (mouse/joystick not recorded; mainint.c:3667). The file is exactly the `demo.N` format (`load_next_demo`, mainint.c:2337-2391, `replay_demo_keys` 2393-2430).
So a recorded demo is **in-level only**: it carries no cash, difficulty (load_next_demo forces NORMAL), armor/shield state, cubes, saves, shop - it cannot replay a game. It *can* give goldens for the in-level mechanics of any level/loadout, which the existing demo harness already checks.
Better and cheaper: **synthetic demos** - write demo files directly (header = any episode/level/loadout; key stream from a seeded PRNG), run the oracle with `-t <tmpdir>` whose `demo.1..5` are replaced (symlink the rest), `OT_DEMO=n`, and give the TS archive the same bytes. That exercises every level (all 76 `]L` entries x ep4/5 data, smoothie and random-explosion levels, loadouts for all weapons/sidekicks/ships) under both implementations without shop/script code, using the existing `hash`/`state` comparison.
Not covered by demos: non-demo player input path, script parser, shop, saves, game over - these need injected-key scenarios (limits 1-3) and `tyrian.sav` byte comparison.

---------------------------------------------------------------------------------------------------

## 7. Hot spots and quirks

1. **`player[p].lives` aliases `items.weapon[p].power`** (mainint.c:1082; already modelled). In single player `*lives` is the front-weapon power; shop power edits therefore change "lives"; `JE_saveGame/JE_loadGame` read/write `weapon[twoPlayerMode?port:0].power` (config.c:425-430, 489-494); `adjust_difficulty` and `JE_getValue` use `player[twoPlayerMode?port:0]`.
2. **`goto level_loop` re-runs a frame's logic without presenting** (tyrian2.c:2223); `skipStarShowVGA` is cleared only inside `JE_starShowVGA` (:149).
3. **`JE_anyButton()` calls `service_SDL_events(true)`** (nortvars.c:33-38): it clears `newkey/newmouse`, so every glow-text and end-level wait loop destroys edge state; `JE_wipeKey` is a no-op.
4. **Game-over skip uses stale `button[]`**: `JE_playerMovement` returns early for a dead player (mainint.c:3595+) so `button[0..2]` keep the last live value; holding fire at death can end the game-over screen immediately (tyrian2.c:2189).
5. **`]b` ignores its own slot choice** (always slot 11, tyrian2.c:2591-2597). `JE_saveGame` is also the *death-restore point*: it is called with `saveLevel` (updated by `]s`), so the restore level is the last `]s` section, not the current one.
6. **`windowHasFocus` starts false** (see sec. 4). **`ESCPressed` is dead.** `levelWarningText` has 12 rows of 61 bytes; entries longer than 60 chars overflow by 1 (benign in shipped data).
7. **`ulong cash` vs `JE_longint`**: `JE_cashLeft` computes in s32 then `player[0].cash = JE_cashLeft()` converts a negative to ~2^64. UI prevents buying unaffordable items, so only negative-intermediate display (`JE_cashLeft` called while cursor moves) matters; `JE_saveGame` truncates cash to s32 (`saveFiles.score`). Use plain numbers but wrap on save; model `%lu` printing as unsigned 64.
8. `adjust_difficulty` (mainint.c:2268): `roundf(score*float32 multiplier)` - **float32 multiply** (`Math.fround`), then thresholds; `difficultyLevel=MAX(difficultyLevel,new)`; asserts `initialDifficulty` in 1..9. `JE_endLevelAni`: `temp=roundf(enemyKilled*100/totalEnemy)` is integer division first (`JE_word` promoted to int) and `temp` is a `JE_byte`; `editorLevel += temp/5` (u16 wrap).
9. `JE_nextEpisode`: `JE_findNextEpisode` sets `jumpBackToEpisode1` and `gameHasRepeated` as side effects; credits only when `jumpBackToEpisode1 && episodeNum>2` (i.e. after the *last* episode); ep5 -> 1 requires all episodes available.
10. **Item tables reload on episode change** (`JE_initEpisode` -> `JE_loadItemDat`); `JE_loadGame` of a save from another episode swaps `ships/weapons/enemyDat` mid-session; `JE_loadGame` increments the episode when `levelName=="Completed"` (config.c:497-505, wraps 5 -> 1).
11. **Scratch globals**: shop/menu code uses `temp,temp2,temp3,tempW` as loop vars and text-cursor state (`JE_operation` keeps the name cursor in `temp`, mainint.c:2959; `JE_cashLeft` writes `tempW`). Gameplay code later reads stale values of the same globals (the survey `tempW = lastmouse_but` and level.ts loop-counter emulation). Keep `scratch.*` writes in shop code faithful to the C types (u8/u16 wrap) so level starts from a real session see the same residues as the C.
12. `JE_operation` reads `mouseButton` (mouse.c:35), a *stale shared global* last written by the shop/menu loop (mainint.c:3012); `varz.mouseX/Y` are the mouse.c globals the shop writes (world.ts comment) and the level reads (stale values reach shots fired during `endLevel`).
13. `menuInt[4]`, `menuInt[5]` strings are rewritten at runtime by `JE_menuFunction/JE_genItemMenu`; `helpText.menuInt` must be mutable and *per game* (not shared module state across new games, though C never restores it).
14. `JE_itemScreen` merges `player[0].last_items` into `itemAvail` and bubble-sorts (:196-238) - sort has the `itemAvail==0` special case (0 sorts first).
15. `]I` row maxima are 4 in shipped data; `cubeList[4]` / `cubeMax<=4` caps; `]?` clamps `cubeMax` down to the list length only.
16. `JE_loadMap` (non-demo) re-`fopen`s the script and re-seeks from the top on every outer iteration, so `]J` lands on the *section start*, never mid-section; `]h` discards exactly one following line; `]H`/`]2`/`]w`/`]t`/`]l` set `jumpSection` and the inner loop stops reading immediately.
17. Pointer: `JE_mousePosition()` returns `mousedown ? lastmouse_but : 0` as `JE_word`; `mouse_x/mouse_y` are `Sint32` that can be negative or >=320 (title code relies on the u16 compare quirk, already preserved).
18. Smoothie filters read `game_screen` history (sec. 5); flip smoothie also negates `mouseYC` and mirrors the `mouseY_` used for acceleration.
19. `final-review` open items that sp4 makes reachable: out-of-range map-slot reads (backgrounds.ts oobReads - run all levels and log), NortSparks y-first RNG order, `background2over==3` blend bug (level.ts:550-553): fix these *before* adding real-level goldens.
20. `JE_pauseGame` ignores Ctrl/Alt key presses (so the sidekick keys don't unpause) but a mouse button does; resume restores `set_volume(tyrMusicVolume, ...)`.

---------------------------------------------------------------------------------------------------

## 8. Suggested task decomposition (dependency order)

Verification vocabulary: **HASH** = per-frame CRC32 of palette+pixels vs `OT_HASH` (as demo goldens), **STATE** = `OT_STATE` records, **BYTES** = byte-exact comparison of generated files.

1. **Oracle v2 (tools/oracle).** Extend `oracle.c`/`scenarios.ts`/`run.ts`: key holds (`frame:sc:hold`), mouse events, `OT_STATE2` (cash, power, items[12], mainLevel, saveLevel, episodeNum, difficulty, levelEnd, endLevel, gameLoaded, curMenu, `oracle_mt_calls`), `OT_SAVEDUMP`, HOME pre-seed, `-t` alt data dir support in `run.ts`, and the **discovery runner** (or delay-hook injection). Deliverable: scenario `newgame-ep1-lvl1-first-300` generated by the runner, committed hash/state; a `README` note on blocking screens. Test: TS can load the produced files; two oracle runs identical.
2. **Fixes from the gameplay review that real levels expose** (NortSparks order, `background2over==3`, OOB-slot counter + oracle flag). Deliverable: unit tests + `oobReads` assertion helper. Gate for 3-4.
3. **Episode 4/5 item data + episode helpers.** `loadItemDat(bytes, offset)` from `lvlPos[lvlNum-1]`, `episodeAvail` from the archive, `findNextEpisode`, complete `initEpisode` (keep `lvlNum/lvlPos` on the world). Test: ep1-3 tables unchanged (hdt), ep4/5 sanity (counts, ship names, a CRC of the tables vs an oracle `OT_ITEMCRC` dump after `JE_initEpisode`).
4. **Synthetic-demo harness + all-levels goldens.** `tools/oracle/gen-demos.ts` (seeded key streams, loadouts per episode/level), alt data dir, TS archive override, scenarios `lvl-<ep>-<file>` (or sampled: every level of every episode, one loadout each + extra loadouts for weapon coverage). Deliverable: HASH+STATE goldens for all ~76 levels; this is the main regression net for 5-6 and the ep4/5 enemy data. (Expect first failures in smoothie/random-explosion levels until 5.)
5. **Smoothies, flip/lighting present, random explosions** (`ctx.vga.cur` refactor; lava/water/iced/blur; `starShowVGA` 1/2; event 64; event 99 y-first). Verify: synthetic-demo goldens on ep1 lvlFile 15,16,17, ep4 lvlFile 3-20 (HASH exact incl. history-dependent filters).
6. **Persistence layer.** Full `SaveFile` model (22 slots, all fields), `saveTemp` image + item-avail bytes + editorLevel, `JE_encryptSaveTemp/decrypt`, tyrian.sav 4722-byte (de)serialiser, tyrian.cfg, opentyrian.cfg JSON, `platform/storage.ts` (localStorage adapter + in-memory test double), `JE_saveGame/JE_loadGame/JE_initEpisode` hookup, conditional 174-draw defaults, `JE_sortHighScores`. Verify: BYTES against a `tyrian.sav` written by the oracle (task-1 save dump after a scripted level start) and C-loads-a-TS-written file (pre-seeded HOME, load-screen HASH).
7. **Input + level control.** `Input` additions (mouse_pressed/mouseSettings, relative mouse, focus, modifiers, `mouseButton`), DOM pointer lock + focus/blur + key `preventDefault`, `JE_playerMovement` input block, `JE_mainKeyboardInput` (gamma, F1, pause, menu, skip, Nort), `JE_pauseGame`, `levelFrame` tri-state restart, game-over key wait, `JE_gammaCorrect`. Verify: oracle scenarios with holds: move/fire/sidekick/change-mode on level 1 (HASH+STATE), mouse motion/buttons, pause+resume (P, blur), Esc->menu->return (needs 8 first or stub the menu), F1 restart-frame, game-over wait with fire held (quirk 4).
8. **Text helpers + level-end/economy.** `JE_outCharGlow/outTextGlow/updateWarning/JE_displayText`, `JE_helpBox/HBox`, `JE_barDrawShadow`, `JE_getCost/getValue/totalScore/weapon_upgrade_cost/adjust_difficulty`, `JE_endLevelAni`, `JE_drawCube`, pcx loader, `JE_inGameSetup/doInGameSetup/inGameHelp`. Verify: unit tests for economy; HASH of the end-of-level screen and the in-game menu in oracle scenarios from 1/7.
9. **Episode script parser.** `script.ts` for all commands in the table (skip `V/R/B` or port), `]I` itemAvail, state commands, `]Q` text, `animlib` for `]A`; `loadMap` non-demo = parser + ported tail; shop call stubbed to "pick first planet" via a test hook. Verify: STATE (mainLevel/nextLevel/lvlFileNum/cubeMax/mapPNum) for a *scripted traversal* of ep1-5 sections vs oracle STATE2 at each level start; HASH of the ep1 briefing screens (`]P/]W/]U`), ep3 `]A/]C`, ep4 `]P 000` pcx.
10. **Shop A.** Skeleton + drawing core + FULL_GAME/NEXT_LEVEL (planet map, dots) / arcade menus / quit dialog / exit paths + inner animation loop with mouse+keyboard + `JE_loadScreen` hook. Verify: HASH for the full first-shop session (taps through Next Level -> planet), STATE (curMenu, mainLevel, jumpSection), `JE_quitRequest` via Esc.
11. **Shop B.** Upgrade menus (item cards, afford shading, power +/-, rear-mode `/`), weapon simulator (`initialize_starfield` 300 draws + shot sim), ship specs. Verify: HASH while sitting in the upgrade submenu N frames (RNG count in STATE proves the draws), purchase sequences changing cash/items (STATE2).
12. **Shop C.** Data cubes (`load_cubes`, list + reader, mouse/keyboard scroll), options (volume sliders, detail/speed), keyboard config (key capture), mouse config, load/save UI (`JE_operation`, `JE_saveRequest`), Alt+S/Alt+L quick save/load, F1 help, joystick screens as disabled stubs. Verify: HASH per screen; save slot BYTES after a named save; load round-trip.
13. **Menus + `JE_main` state machine.** `screens/select.ts` (gameplay/episode/difficulty incl. hidden rows), `newGame`, title wiring (replace `stubScreen`s), `flow.ts` (start_level/first/loop, backup save at level start, death restore, in-game quit restore), `runGame` integration, `JE_loadScreen`/High Scores/Instructions/Setup as simple screens (Setup web-lite: music/sound volume, Done). Verify: full-session scenario (title -> new game -> shop -> level -> die -> game over -> restore -> shop) HASH+STATE+save BYTES; episode/difficulty variants (Easy/Hard `]h` path, `]H`).
14. **Episode end + credits + high scores.** `JE_nextEpisode`, `JE_highScoreCheck` (text entry via `Input.lastText`), `JE_highScoreScreen`, `JE_playCredits` (`estsc.shp`, `tyrian.cdt`, RNG), `jumpBackToEpisode1` flow, `]q`/timed-battle end. Verify: scenario that jumps to the last section (injected save via pre-seeded `tyrian.sav` at level `]Q`) and runs end -> credits -> ep1 (HASH first N credit frames, STATE RNG count), high-score entry BYTES.
15. **Optional arcade family.** `newSuperArcadeGame`, `SA_*` codes, `JE_whoa`/SuperTyrian, timed battle select, galaga, collide.ts:187, hud.ts:192, enemies.ts:255; 2-player linking last. Verify with oracle taps via the title typed codes.
16. **Full-run goldens and soak.** Long scripted session across ep1 levels 1-4 with real input holds (HASH+STATE+sav BYTES), plus a headless soak that plays every level via synthetic demos and a bot (random keys) with `oobReads`, no-throw and shop invariants; update README/test docs.

Rough effort share: 9 (parser) ~ 600 C lines; 10-12 (shop) ~ 3400 C lines, the bulk; 13-14 ~ 1800; 5-8 ~ 900; 6 ~ 700. The oracle work (1,4) pays for itself: tasks 5, 9, 10-14 are verified with scenarios built on it.
