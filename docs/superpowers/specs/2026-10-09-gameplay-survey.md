# Gameplay-core survey: demo.1-demo.5 replay vs the C oracle

Scope: everything between "title screen chooses Demo" and "back at title", in
`reference/opentyrian2000/src` (call it `C/`). Line numbers are for that tree (the oracle is the same tree plus
`tools/oracle/dump-frames.patch`, which only adds `oracle_frame()` inside `JE_showVGA`, fixed seed, `xmas=false`).
Data shown below was measured from `data/tyrian2000/`.

Legend: C types per `opentyr.h:41-52`: `JE_byte`=u8, `JE_shortint`=s8, `JE_integer`=s16, `JE_word`=u16, `JE_longint`=s32,
`JE_real`=float32, `uint`=u32, `ulong`=**64-bit on the Linux oracle**.

---------------------------------------------------------------------------------------------------

## 0. What already exists in `src/` (TS)

| File | Exports (brief) |
|---|---|
| `core/int.ts` | `u8 s8 u16 s16 u32 s32 idiv` |
| `core/mtrand.ts` | `MersenneTwister.srand/rand/rand1/randLt1` (= mt_srand, mt_rand, mt_rand_1, mt_rand_lt1; float32 via fround) |
| `core/binary-reader.ts` | `BinaryReader` (u8/u16/s32/seek/pos...) |
| `ctx.ts` | `Ctx { clock, delay, input, audio, presenter, frameSink, rng, palette, vga{screen,screen2,gameScreen}, assets, shopSpriteSheet, mouse, state{versionString,moveTyrianLogoUp,xmas,playDemo,loadDestruct} }`, `createCtx({seed})` (`rng.srand(seed)` = `mt_srand`) |
| `game.ts` | `runGame` = intro_logos + title loop; `playDemo` currently goes to `stubScreen('Demo')`; **no JE_initPlayerData / JE_main** |
| `assets.ts` | `loadAssets` -> `{archive, palettes, pics, shapes, helpText, music, tyrianSnd, voicesSnd}` |
| `data/archive.ts, pak.ts` | `DataArchive.get(name)` over `tyrian2000.t2kpak` (all data files are packed; lower-cased basenames) |
| `data/helptext.ts` | `loadHelpText` -> `HelpText` incl. `miscText, miscTextB, outputs, pName, inGameText, specialName, superShips, defaultHighScoreNames, defaultTeamNames, episode1DataLoc` |
| `data/palette-file.ts` / `data/pic.ts` / `data/pcxmast.ts` | `loadPalettes`, `PicFile`, `loadPic(pics, palette, surface, picNo, storePal)`, `PCX_PAL, FACE_PAL` |
| `data/shapes.ts` | `loadMainShapeTables` -> `MainShapes{tables[8], spriteSheet8,9,10,11,12,T2000}`; `loadCompShapes(archive,'6')` (= `JE_loadCompShapes`, reads `newsh<c>.shp`) |
| `video/surface.ts` | `Surface{w,h,pitch,pixels}`, `createSurface, copySurface, clearSurface(=JE_clr256), fillRect(=SDL_FillRect)` |
| `video/vga256d.ts` | `pix pix3 rectangle fillRectangleXY/WH barShade barBright drawSegmentedGauge` |
| `video/sprite.ts` | table sprites: `blitSprite, blitSpriteBlend, blitSpriteHv(+Unsafe,+Blend), blitSpriteDark`, `spriteWidth/Height` |
| `video/sprite2.ts` | **all** sprite2 blits are ported incl. 2x2: `blitSprite2, ...Clip, ...Blend, ...Darken, ...Filter, ...FilterClip, blitSprite2x2*` (bounds behaviour copied from C: no left/right clip, wrap into next row, early `p>=ul` return). `Sprite2Sheet={data}` |
| `video/font.ts, fonthand.ts` | `drawFontHv*`, `dString, textWidth, fontCenter, outText, outTextModify, outTextAdjust, outTextAndDarken, textShade` (+ `PART_SHADE..TRICK`) |
| `video/palette.ts, fade.ts` | `PaletteState`, `fadePalette, fadeSolid, fadeBlack, fadeWhite` (each step calls `showVGA` = one oracle frame) |
| `video/video.ts` | `showVGA(ctx)` = `frameSink(ctx.vga.screen, palette)` + present. NOTE it always dumps `ctx.vga.screen` (=VGAScreenSeg) |
| `video/mouse.ts` | mouse cursor draw (menus only) |
| `platform/delay.ts` | `DelayTimer.setDelay/setDelay2/getDelayTicks/remaining/setDelaySpeed` (float32 maths as C) |
| `platform/wait.ts` | `waitDelay` (= **service_wait_delay**, not plain `wait_delay`), `waitDelayOrInput`, `waitInput`, `waitNoInput` |
| `platform/input.ts` | `Input{keysactive[512], newkey, newmouse, mousedown, lastkeyScan, lastmouse*, newText, serviceEvents(clearNew), push}` |
| `platform/audio.ts` | `Audio{playSong, stopSong, fadeSong, setVolume, multiSamplePlay(soundIdx0, chan, vol), playSample, playing, songlooped}`; `audio/ids.ts` has all `S_*`/`V_*`/`SONG_*` |
| `screens/title.ts` | `titleScreen` (port of tyrian2.c:3283-3623; demo path sets `state.playDemo=true`, returns true) |
| `screens/intro.ts, stub.ts` | `introLogos`, `stubScreen`, `quitScreen` |

NOT present (needed by this sub-project): any level/enemy/player/shot/event/background/explosion code; `JE_loadItemDat`
(weapons/ships/enemyDat tables from `tyrian.hdt`); `config.c` state; plain `wait_delay`; `JE_dBar3`; `JE_gammaCorrect`;
`windowTextSamples` (sndmast.c:67) and `randomEnemyLaunchSounds` (varz.c:105) tables; `shapeFile[]` (lvlmast.c:23).

`runGame` does NOT consume the ~174 `mt_rand` draws that `JE_loadConfiguration` makes before the title (see sec. 4) - the RNG
phase at demo start will not match the oracle until that is added.

---------------------------------------------------------------------------------------------------

## 1. Exact call path: title idle -> demo -> back to title

### 1.1 Boot prefix (state that must match before the demo starts)
`opentyr.c main()` (749-896):
1. `:750 mt_srand(oracle_seed)` (oracle: `OT_SEED`, default 1; TS harness uses `seed:1`).
2. `:776 JE_loadHelpText()`, `:779 JE_loadConfiguration()` (config.c:777). With an empty HOME (oracle runner uses empty `home-*` dirs) there is
   no `tyrian.cfg`/`tyrian.sav`, so defaults apply: `soundEffects=1, background2=true, tyrMusicVolume=fxVolume=191, gammaCorrection=0,
   processorType=3, gameSpeed=4, versionNum=3` (config.c:821-828); then **the "no save file" branch burns 174 `mt_rand()` calls** (config.c:965-996),
   then `JE_initProcessorType()` (config.c:511, called at :1001) -> for processorType 3: `smoothScroll=false, wild=false, superWild=false, explosionTransparent=true,
   filtrationAvail=false, background2=true, displayScore=true`; gameSpeed 4 -> `fastPlay=0`.
3. `:781 JE_scanForEpisodes`, `:796 JE_loadMainShapeTables`, `:829 JE_loadExtraShapes` (reads `newsh$.shp` from the **user** dir, absent in oracle; only matters for ship>90, not demos).
4. `:846 intro_logos()` (only `#ifdef NDEBUG`).
5. Main loop `:849-889`:
   ```
   for(;;){ JE_initPlayerData();        // mainint.c:1042  (1 mt_rand: secretHint, :1069)
            JE_sortHighScores();        // mainint.c:1092
            play_demo=false; stopped_demo=false; gameLoaded=false; jumpSection=false;
            if(!titleScreen()) break;   // tyrian2.c:3283
            if(loadDestruct){...} else { JE_main(); if(trentWin) break; } }
   ```

### 1.2 Title -> demo selection (already in TS)
`tyrian2.c titleScreen` (3283-3623): demo is chosen by either
- idle 30 s: `:3389-3395` (`SDL_GetTicks()-idleStartTick > 30000` -> `fade_black(15); play_demo=true; return true`), or
- menu item MENU_ITEM_DEMO (5): `:3598-3603` (`fade_black(15); play_demo = true; return true`).
Secret-name codes etc. are irrelevant.
The oracle title wait uses real `SDL_GetTicks` (30 s wall clock, zero frames dumped while idle); the TS port uses `ctx.clock`. For a scenario, prefer
keys: Down x5 (SDL scancode 81 each) + Return (40) to reach item 5 - or just idle.

### 1.3 Demo number selection (NOT random)
`mainint.c:2337 load_next_demo()`: `if (++demo_num > 5) demo_num = 1;` - `demo_num` is a file-static-like global (`varz.c:222`, `Uint8 demo_num = 0`).
So the 1st demo is `demo.1`, then 2,3,4,5,1,... Each trip through title->demo advances it. No RNG involved. (To test demo.k independently the oracle needs an env hook to preset `demo_num`;
otherwise k-1 earlier demos must play first - and the RNG state carries over between them.)

### 1.4 JE_main (tyrian2.c:621-2397) flow when `play_demo`
```
JE_main()                                     tyrian2.c:621
  goto start_level_first                      :632
start_level_first:                            :721
  set_volume; endLevel=reallyEndLevel=playerEndLevel=extraGame=false
  JE_loadMap()                                :2399  (demo path, see below)
     lastCubeMax=cubeMax; songBuy=...; saveLevel=mainLevel
     new_game: galagaMode=false; useLastBank=false; ... gameLoaded=false
     if(!play_demo){ ...episode script scan lines 2429-3034... }   // SKIPPED for demos
     if(play_demo) load_next_demo();  else fade_black(50)          // :3036-3039
        -> mainint.c:2337: demo_num++, open data_dir/"demo.N", difficultyLevel=NORMAL, bonusLevelCurrent=false,
           JE_initEpisode(ep byte)  (episodes.c:228: no-op if same episode; else sets levelFile/episode_file/cube_file,
                                      JE_analyzeLevel (lvllib.c:29) + JE_loadItemDat (episodes.c:54) from tyrian.hdt)
           read levelName[10], lvlFileNum, items (see 3.1), levelSong, initial demo_keys_wait
     read level record from levelFile at lvlPos[(lvlFileNum-1)*2]   :3041-3042   (NOTE the *2)
     events, mapSh, shapes%c.dat, 3 map layers                      :3044-3200
  (mainLevel stays 1, so `if(mainLevel==0)return` is not taken)
  fade_song(); player[].is_alive=true; difficulty bookkeeping; player x/y/old_x/old_y init   (before :770)
  JE_loadPic(VGAScreen, 3, false)  (HUD, pic 3)                                :770
  JE_drawOptions()  (varz.c:396; sidekick HUD)                                 :772
  JE_outText(VGAScreen, 268, 118, levelName, 12, 4)                            :774
  JE_showVGA()  <-- oracle frame                                               :776
  JE_gammaCorrect(&colors, gammaCorrection); fade_palette(colors, 50, 0, 255)  :777-778  (50 frames)
  load explosionSpriteSheet ('6') :781; map pointer/scroll init :787-810 (mapYPos = &megaData1.mainmap[mapY][0] - 1 at :787); level vars init to :925
  JE_drawTextWindow(miscText[20]); shield/armor init + JE_drawShield/JE_drawArmor
  play_song(levelSong-1); JE_drawPortConfigButtons(); initialize_starfield() (300 mt_rand)
  JE_setNewGameSpeed()   (config.c:571: fastPlay 0 -> speed 0x4300, smoothScroll=true, frameCountMax=2)
  (record_demo / save-backup branches skipped)
  per-level reset of enemies/shots/explosions/etc.                             :1019-1087
level_loop:                                   :1088   -> per-frame, see sec. 6
  ... until reallyEndLevel
  goto start_level                            :2393
start_level:                                  :641
  mouseSetRelative(false); free enemy sprite sheets; fastPlay!=0 handling
  if(play_demo||record_demo){ fclose(demo_file);
      if(play_demo){ moveTyrianLogoUp=true; stop_song(); fade_black(10); wait_noinput(true,true,true); } }   :663-681
  difficultyLevel = oldDifficultyLevel
  if(play_demo) return;                       :718-719   -> back to main loop, JE_initPlayerData, titleScreen
```

### 1.5 How the demo file is read/fed (mainint.c)
- `load_next_demo` (2337-2391): header, 32 bytes (all little-endian bytes, no u16 except wait): `[0]episode, [1..10]levelName (10 bytes, NUL-padded), [11]lvlFileNum,
  [12]front weapon id, [13]rear weapon id, [14]super_arcade_mode, [15]left sidekick, [16]right sidekick, [17]generator, [18]sidekick_level, [19]sidekick_series,
  [20]initial_episode_num, [21]shield, [22]special, [23]ship, [24]front weapon power, [25]rear weapon power, [26-28]unused, [29]levelSong, [30-31] initial wait (u16 big-endian)`.
  Then records of 3 bytes `keys(u8), wait(u16 BE)`. A short/odd tail is normal: each demo file has 1 trailing byte; the last `fread` of the wait fails -> `feof` -> `replay_demo_keys` returns false.
- `replay_demo_keys` (2393-2430), called once per frame from `JE_playerMovement` (mainint.c:3672) when `play_demo`:
  `while(demo_keys_wait==0){ demo_keys=0; read keys byte; read 2 wait bytes; if(feof) return false; }  demo_keys_wait--;`
  then bit0/1 -> `player[0].y -= / += 1` (CURRENT_KEY_SPEED=1), bit2/3 -> `x -= / += 1`, `button[0]=bit4, button[3]=bit5, button[1]=bit6, button[2]=bit7`.
  (Bit order = KEY_SETTING order in config.h:63: UP DOWN LEFT RIGHT FIRE CHANGE_FIRE LEFT_SIDEKICK RIGHT_SIDEKICK.)
  Return false => `endLevel=true; levelEnd=40` (mainint.c:3672-3676), then ~40 frames of end-of-level warp, then `reallyEndLevel`.
- Mouse/joystick/keyboard are all bypassed: `inputDevice=1` forced (3666-3667) and the keyboard branch has `&& !play_demo` (3729).
- Demo abort: `tyrian2.c:2201-2211`: `service_SDL_events(false); if(newkey||newmouse){reallyEndLevel=true; stopped_demo=true;}`.
- Demo content measured: 

| demo | levelName | lvlFileNum | ship | front/rear wpn (power) | special | sidekicks | shield | song | sum of waits (~frames) | tyrian1.lvl events |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | TYRIAN | 9 | 1 | 7 (1) / 29 (1) | 0 | 21,20 | 6 | 18 | 7134 | 1010 |
| 2 | SAVARA | 12 | 6 | 5 (10) / 29 (11) | 2 | 21,21 | 8 | 33 | 5043 | 832 |
| 3 | SOH JIN | 13 | 4 | 19 (3) / 0 (1) | 0 | 21,23 | 6 | 16 | 4798 | 379 |
| 4 | MINES | 7 | 4 | 19 (10) / 0 (1) | 0 | 19,19 | 9 | 16 | 1702 | 517 |
| 5 | DELIANI | 5 | 3 | 19 (10) / 0 (1) | 0 | 19,19 | 9 | 14 | 2950 | 552 |

All five: episode byte 1 (-> `tyrian1.lvl`, `levels1.dat` unused), generator 5, `super_arcade_mode` 0. Total frames per demo ~ sum of waits + ~41 (end warp) + 1 + 50 (start) + 10 (fade_black at exit) + title fades.
That is ~21.5k frames x 64,772 B = **~1.4 GB** if all frames are dumped raw; use per-frame hash/CRC goldens (or run-length/delta) rather than the existing 64,772-byte-per-frame `.frames` format.

---------------------------------------------------------------------------------------------------

## 2. C files/functions needed, not yet ported, grouped into port modules

Total C in play: tyrian2.c (5349), mainint.c (5109), varz.c (1196), shots.c (508), backgrnd.c (525), config.c (1166), episodes.c (277), lvllib.c (40), nortvars.c (89), player.c (55), editship.c (91; skip), starlib.c (468; NOT on path - only jukebox uses it).

### M1. Config/state defaults & shared tables  (config.c, varz.c top, episodes.c, lvllib.c, lvlmast.c, sndmast.c, player.h, nortvars.c, episodes.h, config.h)
Owns globals (config.c:100-205): `smoothies[9]`, `starShowVGASpecialCode`, `cubeMax/lastCubeMax/cubeList`, `gameHasRepeated`, `difficultyLevel/oldDifficultyLevel/initialDifficulty`,
`power/lastPower/powerAdd`, `shieldWait/shieldT`, `shotRepeat[11]/shotMultiPos[11]`, `portConfigChange/Done`, `lastLevelName/levelName[11]`, `mainLevel/nextLevel/saveLevel`, `levelFilter/levelFilterNew/levelBrightness/levelBrightnessChg`,
`filtrationAvail/filterActive/filterFade/filterFadeStart`, `galagaMode, extraGame, twoPlayerMode, twoPlayerLinked, onePlayerAction, timedBattleMode, superTyrian, trentWin, superArcadeMode, superArcadePowerUp`,
`linkGunDirec`, `inputDevice[2]={1,2}`, `secretHint`, `background3over/background2over`, `gammaCorrection`, `explosionTransparent, youAreCheating, displayScore, background2, smoothScroll, wild, superWild, starActive, topEnemyOver, skyEnemyOverAll, background2notTransparent`,
`fastPlay, pentiumMode, gameSpeed, processorType`, `tyrMusicVolume/fxVolume/fxPlayVol`. varz.c:28-330 owns the big tables/globals listed in varz.h (SANextShip, SAShip, SAWeapon, PGR, PAni, linkGunWeapons, chargeGunWeapons, shipCombos(B), keyboardCombos, optionSelect, superTyrianSpecials, randomEnemyLaunchSounds, `enemy[100]`, `enemyAvail`, `enemyShot[60]`, `explosions[200]`, `rep_explosions[20]`, `superpixels[101]`, `megaData1/2/3`, `soundQueue[8]`, `globalFlags[10]`, and the **scratch globals `temp, temp2, temp3 (u8), tempW (u16), x, y (u16), b (s16)`**).

Functions needed: `JE_loadConfiguration` default branch only (config.c:821-828 + RNG burn 947-1000 + `JE_initProcessorType` 511-569) ~150 lines; `JE_setNewGameSpeed` (571-616); `JE_initEpisode/JE_analyzeLevel/JE_loadItemDat` (episodes.c:54-240, lvllib.c:29-38) ~200 lines (parse `weapons[]`, `weaponPort[]`, `special[]`, `powerSys[]`, `ships[]`, `options[]`, `shields[]`, `enemyDat[]`); `JE_initPlayerData` (mainint.c:1042-1090); `JE_dBar3`, `JE_wipeKey` (nortvars.c); `Player` struct (player.h 60-115).
NOT needed: network, joystick, `JE_saveGame/JE_loadGame`, `save/load opentyrian cfg`, high-score screens, `JE_scanForEpisodes`, `JE_findNextEpisode`, editship.c.

### M2. Demo + level loader  (mainint.c:2337-2430; tyrian2.c:2399-2424, 3036-3200)
`load_next_demo`, `replay_demo_keys`, level-record parse (events, `levelEnemy[40]`, `mapSh[3][128]`), `shapes<c>.dat` (600 entries: u8 blank flag then 24*28 bytes when 0), three tile maps (14x300, 14x600, 15x600).
~330 lines. Skip the 600-line episode-script scan (tyrian2.c:2429-3034) and `JE_displayText/JE_readTextSync`.

### M3. Backgrounds & starfield  (backgrnd.c 525)
Needed: `blit_background_row` (63), `draw_background_1/2/2_blend/3` (155-256), `JE_filterScreen` (257), `JE_checkSmoothies` (315), `initialize_starfield/update_and_draw_starfield` (481-525), `JE_darkenBackground` (45, superWild only).
Port as stubs/later: `lava_filter, water_filter, iced_blur_filter, blur_filter` (320-470) - smoothie events (type 64) do NOT occur in any of the 5 demo levels (verified by parsing; processorType=3 anyway).
Owns: `backPos/2/3, backMove/2/3, mapX..mapX3/mapY..mapY3, mapYPos/mapY2Pos/mapY3Pos (pointers), mapXPos/mapXOfs/mapX2Ofs/mapX2Pos/mapX3Pos/mapX3Ofs/oldMapXOfs/oldMapX3Ofs/tempMapXOfs, mapXbpPos/mapX2bpPos/mapX3bpPos, map1YDelay(Max)/map2YDelay(Max), anySmoothies, smoothie_data[9], starfield_stars[100], starfield_speed`.
Do NOT port `starlib.c` (jukebox only).

### M4. Player ship, movement, collision  (mainint.c, varz.c, player.c)
mainint.c: `JE_playerMovement` 3497-4660 (**1164 lines**, includes ship draw, shadow, banking, sidekicks, firing, special, charge, super-bomb, linked 2P), `JE_mainGamePlayerFunctions` 4662-4720 (parallax x offsets), `JE_playerCollide` 4732-5109 (378), `JE_SFCodes` 2432-2520 (90), `JE_inGameDisplays` 3072-3146 (75), `JE_drawTextWindow` 75-83, `JE_drawPortConfigButtons` 172-186, `JE_gammaCorrect` 1351-1372.
varz.c: `JE_getShipInfo` 330-384, `JE_SGr` 385, `JE_drawOptions/JE_drawOptionLevel` 396-445, `JE_specialComplete` 507-681, `JE_doSpecialShot` 682-873, `JE_playerDamage` 1041-1106, `JE_portConfigs`, `JE_drawShield/JE_drawArmor` 1113-1146, `JE_wipeShieldArmorBars` 1019-1040. player.c (55): `calc_purple_balls_needed, power_up_weapon, handle_got_purple_ball`.
Skip: network blocks, joystick/mouse input blocks, `record_demo` blocks, galaga/two-player paths may be ported late (demo has `twoPlayerMode=false`, `galagaMode=false`, `onePlayerAction=false`) but stub carefully.

### M5. Player shots & weapons  (shots.c 508, minus simulate_player_shots)
`player_shot_move_and_draw` 162-307, `player_shot_create` 308-508, `player_shot_set_direction` 122-161. Owns `playerShotData[82]`, `shotAvail[81]`. (`simulate_player_shots` 30-121 is only called by game_menu.c:3364.)

### M6. Enemies  (tyrian2.c)
`JE_drawEnemy` 175-619 (~445; movement, animation, enemy shot spawning, launching, 9 gotos), `blit_enemy` 157-173, `JE_newEnemy/JE_makeEnemy` 3885-4189 (~305), `JE_createNewEventEnemy` 4191-4260, `JE_searchFor` 4282-4307, `JE_eventJump` 4261-4281, `draw_boss_bar`+`JE_barX` 5297-5349. Enemy-shot update/draw and player-shot-vs-enemy collision live inside JE_main (1439-1751 and 1777-1860).
Owns `enemy[100]`, `enemyAvail[100]`, `enemyShot[60]`, `enemyShotAvail`, `boss_bar[2]`, `enemySpriteSheets[4]`, `enemySpriteSheetIds[4]` (sprite.c:35-36), `totalEnemy/enemyKilled/enemyOnScreen`.

### M7. Event system  (tyrian2.c:4308-5219, 912 lines)
~85 event types, all in one `switch`. Events present in the 5 demo levels (union): **2,3,4,5,6,7,8,9,10,11,12,13,15,16,18,19,20,21,24,25,26,27,28,29,31,32,33,34,35,36,40,41,42,45,46,48,60,61,62,79,84**. Not present (can be ported last or stubbed with a "not reached" assertion): 14,17,22,23,30,37-39,43,44,47,49-59,63-83 (except 79,84),85,99 - note 64 (smoothies), 77/81 (map pointer arithmetic), 71, 75 absent.
Owns `eventRec[]` (mutated at runtime!), `eventLoc, curLoc, maxEvent, returnLoc, returnActive, newPL[10]`, `levelEnemy[40]/levelEnemyMax/levelEnemyFrequency`.

### M8. Explosions / particles  (varz.c:874-1018, 1148-1196; loops in JE_main)
`JE_setupExplosion` (874-969, 54-entry table), `JE_setupExplosionLarge` (970-1018), `JE_doSP/JE_drawSP` (1148-1196, uses `mt_rand_lt1/mt_rand_1` + `sinf/cosf/roundf`); repeating-explosion and explosion draw loops inside JE_main (1897-1965).

### M9. HUD / status drawing  (varz.c, mainint.c, tyrian2.c)
Pieces: `JE_drawShield/JE_drawArmor`, `JE_wipeShieldArmorBars`, `JE_dBar3`, weapon-power bar and power bar (tyrian2.c:1146-1252), `JE_inGameDisplays`, `JE_drawTextWindow`, `JE_drawPortConfigButtons`, `JE_drawOptions`, warning bar (1989-2045), level timer text. Most draw directly on `VGAScreenSeg` (visible screen), not on `game_screen`.

### M10. Main loop + frame presentation  (tyrian2.c JE_main 621-2397 = 1777 lines; JE_starShowVGA 75-155)
Orchestration, `JE_starShowVGA` (copy 264x184 window game_screen(24,0)->screen(0,0) + `JE_showVGA`), `start_level` epilogue. Plus a new plain `wait_delay` and `Game.runGame` wiring (`JE_initPlayerData`, `JE_main`).

Not needed for demo path (confirmed): `JE_loadMap` episode-script switch (2429-3034), `networkStartScreen`, `newGame/newSuperArcade/newSuperTyrian`, `JE_whoa`, `JE_displayText`, `JE_readTextSync`, `JE_mainKeyboardInput` (3147-3390), `JE_pauseGame` (3391), `JE_doInGameSetup/JE_inGameSetup/JE_inGameHelp`, `JE_helpSystem`, `JE_highScoreScreen/Check`, `JE_endLevelAni`, `JE_playCredits`, `JE_operation`, destruct.c, network.c, menus.c, game_menu.c, jukebox.c, starlib.c, joystick.c, xmas.c, animlib.c.

---------------------------------------------------------------------------------------------------

## 3. Data files on the path

| File | Format (brief) | Loader |
|---|---|---|
| `demo.1-5` | see 1.5 | `load_next_demo` mainint.c:2337 (`dir_fopen_die(data_dir(),...)`) |
| `tyrian1.lvl` (episode 1; all five demos) | `u16 lvlNum(=37)`, `s32 lvlPos[lvlNum]`; level record at `lvlPos[(lvlFileNum-1)*2]` (verified: offset *1 lands in garbage): `u8 mapFile, u8 shapeFile` (char; demos: 'Z' or 'Y'), `u16 mapX,mapX2,mapX3`, `u16 levelEnemyMax`, `u16 levelEnemy[levelEnemyMax]`, `u16 maxEvent`, `maxEvent x 11B {u16 time,u8 type,s16 dat,s16 dat2,s8 dat3,s8 dat5,s8 dat6,u8 dat4}`, `3x128 u16 mapSh` (read LE then `SDL_Swap16`, i.e. effectively BE), `14*300 B` map1, `14*600 B` map2, `15*600 B` map3 (bytes index into `ref[layer][]`) | `JE_analyzeLevel` lvllib.c:29; level parse tyrian2.c:3041-3200 |
| `shapes<c>.dat` (c = lower-case shapeFile char; `shapesz.dat`, `shapesy.dat` in demos) | 600 x { u8 isBlank; if 0: 24*28=672 B 8-bit tile }. Map-1 tiles copied for `x<=71`; map-2 for `x<71` (non-blank only, also computes `fill` flag); map-3 for `x<70`. File has ~520 trailing unused bytes | tyrian2.c:3084-3160 |
| `tyrian.hdt` (episodes 1-3) | `s32 episode1DataLoc`; at that offset `u16 itemNum[7]` then packed weapons/weaponPort/special/powerSys/ships/options/shields/enemyDat records (formats in episodes.c:73-210; `enemyDat` has two banks 0..ENEMY_END1 and ENEMY_START2..ENEMY_NUM) | `JE_loadItemDat` episodes.c:54 (called via `JE_initEpisode` from `load_next_demo`; first demo only, `episodeNum` caches). Text part already read by `helptext.ts` |
| `tyrian.shp` | main shape tables + `spriteSheet8,9,10,11,12,T2000` | ported (`assets.shapes`) |
| `newsh<c>.shp` | sprite2 sheet per enemy bank (`shapeFile[]` = `"247 8ABCDEFGHIJKLMNOPQRSTU5#V0@3^59'%"`, lvlmast.c:23), 4 slots loaded by event 5; `'6'` explosions (tyrian2.c:781); `'1'` mouse pointers (titleScreen) | `JE_loadCompShapes` (ported `loadCompShapes`) |
| `tyrian.pic` | pic 3 = in-game HUD frame | ported `loadPic` |
| `palette.dat` | 24 palettes | ported |
| `music.mus` / `tyrian.snd` / `voices.snd` | `play_song(levelSong-1)`, `soundQueue` -> `multiSamplePlay` | ported audio |
| `tyrian.cfg`, `tyrian.sav`, `opentyrian.cfg`, `newsh$.shp` (user dir) | absent in the oracle HOME; defaults are baked in (sec. 0/1.1) | n/a |

Not read for demos: `levels1.dat`, `cubetxt*.dat`, `tyrian.cdt`, `tyrian.hdt` text for episodes>3, `shipedit.pcx`.

---------------------------------------------------------------------------------------------------

## 4. Randomness and time/frame dependence

### 4.1 `mt_rand` / `rand()` call sites reachable on the demo path
`rand()` (libc) is **never** used on the gameplay path (only audio helper in TS `crand.ts`). Every random source is `mt_rand`, `mt_rand_1`, `mt_rand_lt1`.

Boot / outside the level (RNG phase before demo - must be replayed):
- config.c:965, 969, 970, 974, 983, 984, 992, 994, 996 -> **exactly 174 draws** at startup with no save file (22 save slots: 10x3 draws + 12x2; then 30x2 timed-battle; 30x2 main-game).
- mainint.c:1069 `secretHint` in `JE_initPlayerData` -> 1 draw **per main-loop iteration** (before every title screen, so also after each demo).
- tyrian2.c's titleScreen: none. opentyr.c: none besides `mt_srand`.

Level start:
- backgrnd.c:485-487 `initialize_starfield`: 3 draws x 100 stars, **iterated i=99..0**: position (`%320`, then `%200` - evaluation order of `a + b*pitch`: left operand `mt_rand()%320` and `mt_rand()%200` are unsequenced in C; GCC/x86-64 evaluates... **verify against oracle**), speed, color.

Per frame (in order of occurrence inside the loop):
- tyrian2.c:185 / 199 (inside `JE_drawEnemy`): `enemy.xaccel && xaccel-89u > mt_rand()%11` and same for y - drawn only when the left operands are true (short-circuit).
- tyrian2.c:448 (enemy shot sound `do{temp=mt_rand()%8}while(temp==3)`), 518 (`twoPlayerMode` aim only), 376 (`galagaMode`), 583 (launch X jitter), 601-603 (launch sound: `mt_rand()%8` loop then `mt_rand()%3`).
- tyrian2.c:1393-1395 `enemiesActive && mt_rand()%100 > levelEnemyFrequency` then `levelEnemy[mt_rand()%levelEnemyMax]` - **one draw every frame** when `enemiesActive`.
- varz.c:1152-1154 `JE_doSP` (3 draws per particle: `mt_rand_lt1`, `mt_rand_1`, `mt_rand_1` in that statement order).
- tyrian2.c:1912-1924 sequenced explosions, 2005 (warning ship), 2050-2051 (`randomExplosions`, event 99; absent in demos).
- mainint.c:3551-3559 (player death explosions), 4250 (NortShip sparks only for ship 12/13).
- varz.c:794-832 `JE_doSpecialShot` (special weapons; demo.2 has special=2).
- tyrian2.c:4006, 4011 (`JE_makeEnemy` random start x/y when `startxc/startyc != 0`), 4217 (event enemy X when `eventdat2 == -200`), 4751/4754/4758/4851/4853 (events 33/45: `mt_rand()%15 < lives` with `lives = *player[0].lives` - see sec. 5 aliasing), 5121 (event 75).
- mainint.c:2584-2606 credits, 3387 debug key, 995 `JE_nextEpisode`: not reached.
Everything is stack-position dependent only through call order - port to a single `ctx.rng` and keep the **call order exactly**, including the double draw in `events 45`.

### 4.2 Time / frame dependence
- `JE_starShowVGA` (tyrian2.c:90-93): `if(smoothScroll) { wait_delay(); setDelay(frameCountMax); }` - pacing only, no game state depends on it. `wait_delay` (nortsong.c:73) is the plain blocking one (no event servicing), distinct from the TS `waitDelay` (= `service_wait_delay`). Need to add `waitDelayPlain` (sleep `max(0, target-now)`).
- Speed constants: gameSpeed 4 -> fastPlay 0 -> `JE_setNewGameSpeed` (config.c:576-585): `setDelaySpeed(0x4300); smoothScroll=true; frameCountMax=2` (tyrian2.c:929). `pentiumMode=false` (the `frameCountMax` toggle at tyrian2.c:2121-2123 is inert). No frame skipping exists; one simulation tick per rendered frame.
- `JE_main` start (tyrian2.c:655-661) `if(fastPlay!=0){...}` inert.
- Real-time reads that could leak into state: title idle (`SDL_GetTicks`, tyrian2.c:3389) - only chooses whether the demo starts; `debugTime = SDL_GetTicks()` at tyrian2.c:2085 (debug only, but `tempW = lastmouse_but;` at :2086 **clobbers the global scratch `tempW` every frame** - harmless unless something later in the same frame reads `tempW` before reassigning; port it as a no-op assignment of 0 for the demo).
- `else if(!playing && firstGameOver) play_song(levelSong-1)` (tyrian2.c:1133): `playing` comes from the audio thread (lds_play.c:86); only affects music, not video. Keep as best effort.
- Smoothies / `processorType`: processorType = 3 (defaults). Consequences used in the loop: `anySmoothies=(pt>2 && (sm[0]||sm[1])) || (pt>1 && (sm[2]||sm[3]||sm[4]))` (backgrnd.c:317), `starShowVGASpecialCode = smoothies[8] + (smoothies[5]<<1)` (:1099) is 0 for demos, `wild=false` so `draw_background_2_blend` is never used (`wild && !background2notTransparent`), `explosionTransparent=true`, `filtrationAvail=false` (so the colour half of `JE_filterScreen` is skipped but the brightness half runs).
- Level-start brightness fade (filterFade): `levelBrightness=-14, levelBrightnessChg=1, filterFade=true, levelFilter=-99` (tyrian2.c:870-880) -> `JE_filterScreen` (backgrnd.c:257) darkens the play window for the first ~14 frames; same `levelBrightness` uses `JE_shortint` wraparound compare semantic.
- Frame counts: one oracle frame per `level_loop` iteration (single `JE_showVGA` in `JE_starShowVGA`), see 6.

---------------------------------------------------------------------------------------------------

## 5. Hot spots and quirks likely to bite the port

1. **Scratch globals shared across functions** (`varz.c:296-300`): `temp, temp2, temp3` are `u8`, `tempW` is `u16`, `b` is `s16`, `x, y` are `u16`. They are written by callees and read by callers:
   - `JE_doSP` (varz.c:1150) uses global `temp` as its loop counter, and is called from inside the player-shot/enemy collision block (shots.c via tyrian2.c:1554 `JE_doSP(...)`) *after* `temp = enemy[b].linknum` -> `temp` becomes `num` (`damage/2+3` truncated to u8) and later comparisons `temp==254`, `temp!=255`, `temp-100==linknum`, `/20` use the clobbered value. Same for `JE_drawOptionLevel`, `JE_portConfigs` (`tempW`), `JE_getShipInfo` (local temp, safe).
   - `JE_drawEnemy` stores `temp = enemy[i].enemytype` (u8 truncation of a 16-bit type) at tyrian2.c:342 and reuses `temp` for sound/aim.
   - `b` doubles as the "last spawned enemy / shot" return and is read after calls (`JE_newEnemy`, `player_shot_create`, event code `if(b>0)`).
   Port as one module-level mutable `scratch` object with explicit `u8()/u16()/s16()` on every assignment, in the same statement order.
2. **Pointer aliasing - `lives`**: `player[p].lives = &player[p].items.weapon[p].power` (mainint.c:1082). So `*player[0].lives` IS the front-weapon power (demo header byte 24: 1,10,3,10,10) and `*player[1].lives` the rear power of player 2. Used in events 33/45 (`lives==11 || mt_rand()%15 < lives`), `allPlayersGone`, `JE_inGameDisplays`, respawn. Model `lives` as an accessor into `items.weapon[p].power`.
3. **Map as array of pointers** (`megaData*.mainmap` are `JE_byte *[300][14]`, `[600][14]`, `[600][15]`): `mapYPos = &mainmap[mapY][0] - 1` (tyrian2.c:787), `mapYPos -= 14` per scroll, `map = mapYPos + mapXbpPos - 12`, `map += 14` per row, `BKwrap` compare of pointers, events 71/77/81 do pointer<->index maths (`((mapYPos - mainmap)/sizeof)*2`). Port as flat `Int32Array` of tile indices (-1 = NULL) plus an integer cursor; reproduce the row-wrap behaviour (reads at `x-12..x+14` spill into neighbouring rows / before element 0 / after the last row = **out-of-bounds in C**; clamp only where C would read the adjacent member, document where it reads past `mainmap` into `megaData.shapes`).
   - `ref[3][128]` in `JE_loadMap` (tyrian2.c:2406) is **uninitialised stack**; map bytes referencing an unmatched shape index read garbage pointers. Real data should never do this - add an assertion in the loader test (every referenced index has a ref or maps to NULL).
   - `blit_background_row` (backgrnd.c:63) clips only by absolute pixel pointer limits (draws wrap to the next scanline when x is out of range) - copy exact `pixels_ll/ul` logic.
4. **Signed/unsigned narrowing**: `JE_word mapX..`, `backPos` etc. wrap at 16 bits; `shotAvail[]` is u8 decremented in `player_shot_move_and_draw` (shots.c:171) (0 = free, 1..255 duration); `enemy.armorleft` u8 with `255` = invulnerable sentinel and `armorleft -= damage` guarded by compare; `enemy.xaccel/yaccel` are **u8** but loaded from s8 `enemyDat` (so negative values arrive as 128-255 and `xaccel-89u > mt_rand()%11` is unsigned 32-bit); `exca` s8; `ex,ey` s16; `enemy.egr[20]` u16 with `egr[enemycycle-1]` reading index -1 when `enemycycle==0` (UB in C; ensure the first `aniactive==1` pass increments first).
   `JE_playerDamage(JE_byte temp,...)` truncates damage to u8; `player.shield/armor/exploding_ticks` are `uint` (underflow guarded by compares only).
5. **`mt_rand()` is `unsigned long` (64-bit)** on the oracle: `mt_rand() % (startxc*2)` with negative `startxc` (tyrian2.c:4006/4011) converts the negative int to a huge `unsigned long`, so the result is `mt_rand()` itself (then `+startx - startxc + 1`, truncated to s16). `mt_rand() % 100 > levelEnemyFrequency` compares as unsigned long vs int. `e->ex += mt_rand() % ((launchtype-90)*4) - (launchtype-90)*2` (:583) similar (positive operand, fine). TS: implement `%` via explicit helper `umodSigned(r, m)`.
6. **float32 maths**: `roundf((float)aimX / maxMagAim * aim)` (tyrian2.c:534-535 and 594-595), `sinf/cosf/roundf` in `JE_doSP` and sidekick orbit (mainint.c:4451-4460) and linked-2P turret (mainint.c:4092-4105), `floorf((float)(260-(tempX-36))/(260-36)*(24*3)-1)` (mainint.c:4702), `roundf(player.shield*0.8f)`, `enemy.value * 0.75f/1.125f/2.5f` (tyrian2.c:4080-4110), `armor*0.5f+1 / *0.75f+1 / *1.2f / *1.5f / *1.8f` (4126-4160), event 20 `roundf(eventdat * (difficultyLevel / 2))` (4663). Use `Math.fround` after every operation; `roundf` is round-half-away-from-zero (not `Math.round`). `Math.sin/cos` can differ from glibc `sinf/cosf` in the last ulp - in `JE_doSP` the result is `roundf`'d to an integer (differences matter only at .5 boundaries) and `linkGunDirec`/orbit use 20-26 px radii; validate against oracle, fall back to a float32 sin/cos table if mismatches appear.
7. **goto-heavy control flow**: `JE_main` (labels `start_level`, `start_level_first`, `level_loop`, `draw_player_shot_loop_end`; gotos at 632,1265,1453,1494,1740,2223,2393,2395), `JE_drawEnemy` (`enemy_gone`, `enemy_still_exists`, `draw_enemy_end`; 12 gotos incl. jumps out of nested shot loops), `JE_loadMap` (`new_game`), `JE_playerMovement` (`redo:` at 3523, jumped from 3599 on respawn - it re-runs the whole movement function). Restructure into functions with `continue`-style early returns but keep the **exact statement boundary** (a `goto draw_enemy_end` skips the rest of that enemy's update, including its launch routine and `enemyOnScreen++` if jumped before it).
8. **Static / file-level state**: `static StarfieldStar starfield_stars[100]` (backgrnd.c:478), `static int diff[256][3]` in `fade_palette` (palette.c, already ported), `static` positions in `JE_playerMovement` none; per-demo persistent globals that survive across demos: `demo_num`, `episodeNum` (JE_initEpisode early-out), `textErase`, `explosionSpriteSheet` (loaded once), `shopSpriteSheet`, `enemySpriteSheetIds` (**memset to 0 at level start but sheets freed only at `start_level`**; enemy slots keep stale `sprite2s` pointers - `memset(enemy,0,...)` clears them at level start though), `tempVolume`, `lastPower`, `old_weapon_bar` (local to JE_main, reset every level), `player[].last_items`.
9. **`VGAScreen` global alias** (`video.c:43`): `VGAScreen` is reassigned between `VGAScreenSeg` (visible 320x200), `game_screen` (all level drawing), and `VGAScreen2` (when `anySmoothies`). HUD helpers draw on whichever is current: `JE_drawShield/JE_drawArmor/JE_dBar3` use `VGAScreen`, `JE_wipeShieldArmorBars`, `JE_drawTextWindow` use `VGAScreenSeg`. `JE_playerDamage` temporarily sets `VGAScreen=VGAScreenSeg` (varz.c:1092-1096). Pass the target `Surface` explicitly and copy the exact choice per call site; TS already has `vga.screen` (Seg), `vga.screen2`, `vga.gameScreen`.
10. **Window copy offset** (tyrian2.c:85-148): the level is composed in `game_screen` with a 24-px left margin; `JE_starShowVGA` copies `src = game_screen + 24`, `dst = VGAScreenSeg + 0`, 264 bytes x 184 rows, so the HUD at x>=264 and y>=184 on the visible screen survives. Special codes 1 (flip) and 2 (lighting) are smoothie-only (absent).
11. **Per-frame ordering side effects**: `JE_drawEnemy` temporarily does `player[0].x -= 25` ... `+= 25` (tyrian2.c:177, 616); everything that reads `player[0].x` inside it sees the shifted value. The enemy loop also reads `tempMapXOfs/tempBackMove` globals set by the caller before each of 4 calls.
12. **`eventRec[]` is mutated** during play (events 33/45/49-52 rewrite `eventdat*` temporarily or permanently; `JE_eventJump` (4261) rescans with `do..while(eventtime < curLoc)` and relies on the sentinel `eventRec[maxEvent].eventtime = 65500` set at load (tyrian2.c:3067)). The main loop condition reads `eventRec[eventLoc-1]` *before* testing `eventLoc <= maxEvent` (:1261) - needs the sentinel slot allocated.
13. **Uninitialised-but-benign reads**: `player_shot_move_and_draw` leaves its out-params unset for the last weapon slot (`z == MAX_PWEAPON-1`, Zinglon); `playerNum`, `damage`, `chain` are then uninitialised in the collision block (tyrian2.c:1439-1460). `temp2, chain, damage` are overwritten in the zinglon branch; **`playerNum` is not** (only used in `player[...playerNum-1].cash` on kill; Zinglon is a special - unlikely in demos). Initialise to 1.
14. **`JE_boolean`/`bool` bytes in `memset`** (`enemyAvail` memset to 1, `enemyShotAvail` set to 1, `shotRepeat` memset 1 (tyrian2.c:1027-1049)): the enemy `avail` values are tri-state (0 used, 1 free, 2 secret pickup), not boolean.
15. **`explosions[].ttl` is u8, `.y` s16**, new explosion type table at varz.c:874-969; the explosion pass runs *after* enemy shots and *before* background-2-over (see sec. 6).
16. **Sprite2 sheets for enemies**: `enemy.sprite2s` points at a *slot* (`&enemySpriteSheets[i]`) or `spriteSheet10/11`; a stale pointer is intentionally reused when a new enemy's bank isn't loaded (JE_makeEnemy sprite lookup, tyrian2.c:~3915-3935). Store a sheet *reference* (slot id), not the Uint8Array.
17. **`lvlFileNum` doubles at lookup** (`lvlPos[(lvlFileNum-1)*2]`) - the level file has paired entries.
18. **`demo_keys_wait`/`demo_keys` timing**: first `demo_keys_wait` frames run with `demo_keys=0`; per frame the wait is decremented *before* the key bits apply (so `wait=0` records apply on the frame they are read).
19. **Player movement integration order** in `JE_playerMovement`: keyboard delta (+-1) updates `x,y` immediately, then `accelXC += x - mouseX_` (where `*mouseX_ = this_player->x` was captured earlier in the same call), then velocity friction every 1 (x) / 2 (y) frames, clamp +-4, then position += velocity, then clamps `x in [40,256]`, `y in [10,160]` (mainint.c:4113-4135). Integer divisions `x_velocity/2 + (x-mouseX_)/6` are C-truncating (`idiv`).
20. **Text strings are `char[]` with NUL padding**: `levelName` is 10 raw bytes from the demo + NUL; `JE_outText` draws up to NUL. Spaces trailing ("TYRIAN   ") are drawn as spaces (width is not trimmed).
21. **`oracle_frame` uses the `VGAScreen` global at call time**: every frame in the loop is the visible screen only because `VGAScreen = VGAScreenSeg` is reset at tyrian2.c:2337 before `JE_starShowVGA`. Any `JE_showVGA` called while `VGAScreen == game_screen` would dump the wrong surface (none do on this path).

---------------------------------------------------------------------------------------------------

## 6. Per-frame drawing order and `JE_showVGA` points

`JE_showVGA` is `video.c:315` (`oracle_frame(VGAScreen)` then scale). TS `showVGA(ctx)` dumps `ctx.vga.screen`.

### 6.1 Frames emitted, in order, for one demo run
1. Title: `fade_black(15)` on selecting Demo (15 frames, tyrian2.c:3391 idle path, 3598-3603 menu item).
2. `JE_main` start (tyrian2.c:776) one `JE_showVGA` after HUD pic + sidekick HUD + level name; then `fade_palette(colors,50,0,255)` -> 50 frames (:777-778). (No `fade_black(50)` for demos: `JE_loadMap` takes the `play_demo` branch.)
3. Level loop: **exactly one** `JE_showVGA` per iteration: inside `JE_starShowVGA` (tyrian2.c:150) from the call at :2339. Skipped only if `playerEndLevel || skipStarShowVGA` (neither is set on the demo path), i.e. 1 frame per tick.
4. Exit: `fade_black(10)` (tyrian2.c:675) = 10 frames. Then title again (`moveTyrianLogoUp=true` -> logo slide frames, ported).

### 6.2 Draw order inside one `level_loop` iteration (tyrian2.c:1088-2397)
Surface key: **S** = VGAScreenSeg (visible), **G** = game_screen.
1. [S] Message-bar restore when `textErase` expires (:1143, `blit_sprite(OPTION_SHAPES 36)` at 16,189); shield regeneration + `JE_drawShield` (:1146-1204); weapon-power pips (:1206-1226, `fill_rectangle_xy` + `JE_rectangle`); power bar `fill_rectangle_xy` (:1228-1252).
2. [S/G] Events: `while(eventRec[eventLoc-1].eventtime <= curLoc && eventLoc <= maxEvent) JE_eventSystem()` (:1255) - may call `JE_drawTextWindow` (S) and spawn enemies/explosions.
3. Smoothie check; (none).
4. [G] `draw_background_1` (clears to 0 via `SDL_FillRect` then 8 tile rows) :1283; advance `curLoc/backPos/mapY` :1286-1303.
5. [G] `update_and_draw_starfield` :1305 (if `starActive`, which is true at level start).
6. [G] `draw_background_2` if `background2over==3` or `==0` (:1318-1335).
7. [G] ground enemies `JE_drawEnemy(50)` then `JE_drawEnemy(100)` (:1348-1352) (these also do enemy AI/shot-spawn/launch).
8. [G] `draw_background_2` if `background2over==1`; [G] `draw_background_3` if `background3over==2` (:1370-1388).
9. RNG: random enemy spawn (:1393-1398).
10. [G] Sky enemies `JE_drawEnemy(25)` (if `!skyEnemyOverAll`), `draw_background_3` if `background3over==0`, top enemies `JE_drawEnemy(75)` (if `!topEnemyOver`) (:1412-1440).
11. [G] Player shots: `player_shot_move_and_draw` for z in 0..80 (draws shot sprites, shadows via `blit_sprite2_darken` when `background2`) + collision with enemies / damage / chain (:1449-1751).
12. `last_x/y_shot_move` update; `JE_playerCollide` (:1760-1772, state only).
13. [G] `JE_mainGamePlayerFunctions` (:1775) -> `JE_playerMovement` (player ship, shadow, sidekicks, charge indicator, "INSERT COIN" `JE_dString(115,10, miscText[7])` in demos, shot firing) then parallax offsets.
14. [G] Enemy shots update + collision + draw (:1782-1860).
15. [G] `draw_background_3` if `background3over==1`; `JE_drawEnemy(75)` if `topEnemyOver`; `JE_drawEnemy(25)` if `skyEnemyOverAll` (:1870-1895).
16. [G] Repeating explosions (spawn only, :1897-1937), then explosion sprites `blit_sprite2[_blend]` (explosionTransparent=true -> blend) (:1939-1965).
17. [G] `draw_background_2` if `background2over==2` (:1971-1985).
18. [G] Low-armor warning bars + "WARNING" text, warning enemy (:1989-2045); random explosions (:2049).
19. Sound queue flush -> `multiSamplePlay` (:2058-2078) (audio only).
20. [G] displayTime text (:2111), level-timer text (:2126-2155), "GAME OVER" `JE_dString` (:2156-2200) if applicable.
21. Demo input kill-check (`service_SDL_events(false)`) :2201-2211.
22. [G] `JE_drawSP` (superpixels) :2325; [G] `JE_filterScreen` (:2330) (brightness fade-in); [G] `draw_boss_bar` (:2333); [G] `JE_inGameDisplays` (:2335: cash text via `JE_textShade`, special icon, lives/superbombs).
23. `VGAScreen = VGAScreenSeg; JE_starShowVGA();` (:2337-2339): [wait_delay + setDelay], copy 264x184 G(24,0)->S(0,0), `JE_showVGA()` **<- the per-frame oracle frame**.
24. End-of-level state machine (`stopBackgroundNum==9`, `readyToEndLevel`...) :2341-2390; `reallyEndLevel` -> `goto start_level`.

Frame-golden hints: compare `ctx.vga.screen` after step 23; the HUD half (x>=264, y>=184) is produced by steps 1/2/13/22 on S, the play window by G.

---------------------------------------------------------------------------------------------------

## 7. Suggested decomposition (dependency order)

Each task lists files (TS target, C source), approximate C lines, and a testable deliverable. Add an oracle patch early (T0) so that internal state, not just pixels, can be compared.

**T0. Oracle + golden harness extension** (`tools/oracle/dump-frames.patch`, `tools/oracle/scenarios.ts`, `test/golden/*`; ~150 TS/C lines new)
- Add `OT_DEMO=n` (preset `demo_num = n-1`), `OT_STATE=path` (per frame: `curLoc, player[0].x/y, shield/armor, enemyOnScreen, count of mt_rand calls / last mt_rand value`), and hashed frame output (CRC32 per frame instead of 64,772 B). Keep existing 64,772-byte frames for short scenarios.
- Deliverable: `pnpm oracle:run demo1` writes `.hash` + `.state`; a TS helper `loadHashes()` and a test skeleton that is `describe.skip` until T12.

**T1. Config defaults, RNG burn, scratch registers** (`src/game/state.ts`, `src/game/config.ts`; C: config.c:100-205, 511-616, 777-1003 (defaults + RNG), mainint.c:1042-1090, varz.c:28-330 tables; ~700 C lines mostly data)
- Deliverable: unit tests: after `createCtx(seed 1)` + `burnConfigRng(ctx)` (174 draws) + `initPlayerData` (1 draw), `rng.rand()` equals the first value the oracle prints (`OT_STATE`); `Player` struct with `lives` accessor; `setNewGameSpeed()` sets delay speed 0x4300 and `frameCountMax=2`.

**T2. Item data + level/demo loaders** (`src/data/itemdat.ts`, `src/data/level.ts`, `src/data/demo.ts`; C: episodes.c:54-240, lvllib.c, mainint.c:2337-2430, tyrian2.c:3036-3200; ~450 lines)
- Deliverable: tests that parse `tyrian.hdt` (spot-check weapon 1, ship 1, enemyDat[0]) and the five demo headers/levels (table in 1.5: names, lvlFileNum, event counts 1010/832/379/517/552, record counts 904/720/647/222/363) and assert every map byte resolves to a ref/NULL; `DemoPlayer.next()` replays keys with the wait semantics (unit test with synthetic bytes + demo.1 frame count 7134 + tail).

**T3. Map/backgrounds + starfield** (`src/game/backgrounds.ts`; C: backgrnd.c:45-256, 315, 481-525, tyrian2.c:1296-1312 snippets; ~300 lines)
- Deliverable: render golden of `draw_background_1/2/3` + starfield for a synthetic scroll sequence vs hand-computed pixels, plus `starfield` positions for seed 1 equal to oracle `OT_STATE` after `initialize_starfield`; pointer-math layer (`MapCursor`) unit tests incl. `BKwrap` and `mapXbpPos` spill behaviour.

**T4. Explosions, superpixels, shield/armor/HUD primitives** (`src/game/explosions.ts`, `src/game/hud.ts`; C: varz.c:874-1018, 1113-1196, 1019-1040, nortvars.c:40-62; ~330 lines)
- Deliverable: `setupExplosion/Large` table tests (ttl/sprite per type), `doSP/drawSP` determinism with seeded RNG, `drawShield/drawArmor/dBar3` pixel tests against surfaces built from oracle frame 0-of-level (first level frame HUD region).

**T5. Shots & weapons** (`src/game/shots.ts`; C: shots.c:122-508 + `JE_getShipInfo`, `JE_portConfigs`; ~400 lines)
- Deliverable: unit tests for `player_shot_create` against `weapons[]` for weapon ids used in demos (7, 5, 19, 29) per port/op, trace of shot positions for N frames (generated from C via `OT_STATE` extension or hand-derived), `shotAvail` u8 semantics.

**T6. Enemy creation + AI + enemy shots** (`src/game/enemies.ts`; C: tyrian2.c:157-619, 3885-4307, 5297-5349; ~850 lines)
- Deliverable: `makeEnemy` tests for enemy ids seen in demo 1 (difficulty NORMAL, scaling); `drawEnemy` step test on a small fixture (movement, accel with RNG draws counted, bounce, launch); enemy shot motion/collision test; draw-order unit test for the 4 layers.

**T7. Event system** (`src/game/events.ts`; C: tyrian2.c:4308-5219; ~900 lines)
- Deliverable: table-driven tests per event type present in the demos (list in M7) using synthetic `eventRec`s and asserting resulting globals (`backMove*`, `starfield_speed`, enemy spawns with `eventdat*`, `eventLoc` skips, `JE_eventJump`), plus "unknown event warns and increments".

**T8. Player: movement, ship draw, collision, SF codes, specials** (`src/game/player.ts`, `src/game/sf-codes.ts`; C: mainint.c:2432-2520, 3497-4660, 4662-5109, varz.c:330-384, 507-873, 1041-1106, player.c; ~2300 lines - split into two PRs: (a) movement/draw/collide; (b) weapons firing, sidekicks, specials, SF codes)
- Deliverable: (a) replaying demo.1 keys for the first ~300 frames reproduces oracle `player.x/y` (via `OT_STATE`) and ship-sprite pixels; (b) first 1000 frames of demo.2 reproduce shots/sidekick positions.

**T9. HUD text + in-game displays + level timer/warning** (`src/game/hud.ts` cont.; C: mainint.c:75-83, 172-186, 3072-3146, tyrian2.c:1975-2045, 2086-2160; ~250 lines)
- Deliverable: pixel tests for HUD of demo.1 level frame 0 and a frame with cash/lives/special icon; text uses `textShade/dString/outText`.

**T10. Main loop (`JE_main` + `JE_starShowVGA`) skeleton** (`src/game/level.ts`; C: tyrian2.c:75-155, 621-1087, 1088-1260, 2330-2397; ~1100 lines + new `waitDelayPlain`)
- Deliverable: run level start only (no enemies/events active: events disabled flag) and match oracle frames [title fade end .. level-start fade 50 frames .. first N level frames] by hash; the per-frame order of sec. 6.2 coded with explicit "no-op" slots for modules not yet wired.

**T11. Wire modules into the loop** (`src/game/level.ts`; C: tyrian2.c:1255-2330; ~1300 lines)
- Deliverable: demo.4 (shortest, ~1.7k frames) prefix of first 200 frames matches hashes; each divergence bisected via `OT_STATE` rng count.

**T12. Demo scenario end-to-end + title return** (`src/game.ts`, `src/screens/title.ts` tweak, `test/golden/demo.test.ts`; ~150 lines)
- `runGame` calls `initPlayerData`, `JE_main` for `playDemo`, then returns to title with `moveTyrianLogoUp`. Deliverable: golden tests `demo-1` ... `demo-5` (scenarios: boot -> select Demo via keys, or `OT_DEMO=n`), all frames hash-equal including end warp, `fade_black(10)`, and the first title logo-slide frames.

**T13. Stability pass** (no new files): fuzz-compare RNG counter at every frame against `OT_STATE` for all 5 demos; audit the quirk list in sec. 5 (items 1, 3, 5, 6, 13) with targeted unit tests; remove temporary asserts.

Rough sizing: T1-T4 ~1.8k C lines, T5-T9 ~4.7k, T10-T12 ~2.5k. Critical path: T0 -> T1 -> T2 -> T10 -> T3/T4 in parallel -> T5 -> T6/T7 -> T8 -> T9 -> T11 -> T12 -> T13. T3, T4, T5, T7 are independent of each other after T1+T2.
