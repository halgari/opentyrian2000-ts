# OpenTyrian2000-TS — Sub-project 4 (Game flow)

Date: 2026-10-09
Status: approved to proceed autonomously ("continue, merge as needed")
Parent: `2026-10-09-foundation-design.md` (§3 architecture rules) and `2026-10-09-gameplay-design.md` (world/module rules).
Survey: `2026-10-09-gameflow-survey.md`. It is the authoritative map of call paths, formats, quirks and verification hooks, and the section numbers below refer to it.

## 1. Goal

A player in the browser can do everything the single-player C game allows:
- start a new game (episode 1–5, any difficulty);
- play every level with keyboard and mouse;
- go through the episode scripts (briefings, data cubes, level select maps);
- use the shop/upgrade screen;
- die, get game over, and continue from the restore point;
- finish episodes (end-of-level tallies, credits, high scores);
- save and load games, which persist in browser storage;
- pause, use the in-level Esc menu and help, and change volumes and settings.

Behaviour stays frame-exact versus the C oracle wherever a golden scenario can drive it.

**Done:**
- All shipped levels (every `]L` entry of episodes 1–5) replay frame-identically to the oracle under synthetic demos. This includes the smoothie (screen-filter) levels and the random-explosion levels.
- Scripted oracle sessions are frame- and state-identical in TS, covering title → new game → shop → level with held input → death → game over → restore → shop, plus episode end → credits → high score.
- `tyrian.sav` written by TS is byte-identical to the C's for the same session.
- The browser plays a full game with no unported throws on the single-player path.

**Out of scope** (later or never): two-player, network, super-arcade/SuperTyrian/galaga codes, timed battle, Destruct, joystick (the Gamepad API is optional polish in sub-project 5), the ship editor, and screenshot/debug keys.

## 2. Architecture additions

- **Screens:** `src/screens/` gains select menus, shop (split across files), load, high scores, help/instructions, setup-lite, end-level tally, credits and episode end.
- **Game modules:** `src/game/` gains `script.ts` (episode script parser), `flow.ts` (the `JE_main` state machine), `save.ts`, `economy.ts`, `smoothies.ts` and `input-level.ts`.
- **Platform:**
  - `src/platform/storage.ts` is a storage adapter: localStorage, plus an in-memory double for tests.
  - The `tyrian.sav` image is stored as the exact 4722-byte encrypted blob, base64, so format tests compare bytes with the C. The config is JSON.
  - The 174 startup RNG draws happen only when there is no stored save, as in the C.
- **Video:** `ctx.vga.cur` mirrors the C global `VGAScreen`. Every gameplay draw site uses it instead of a cached `gameScreen`, which the smoothie filters require. `game_screen` persists bit-exactly across frames and is zero-initialised.
- **Input:** `Input` gains `mouse_pressed[4]` mapped through `mouseSettings`, a relative-mouse accumulator fed by DOM pointer lock (scaled as in video.c:418), `windowHasFocus` (initially true, from focus/blur; blur pauses), modifier state, and `mouseButton`.
  - Browser keys that the game uses are `preventDefault`ed: arrows, Space, Alt, Ctrl, F1, F11 and Esc while locked.
  - Losing pointer lock counts as an Esc press.
- **Restart frame:** `levelFrame` gets a tri-state result (present, skipStarShowVGA, restart-frame) for the C's `goto level_loop` and `skipStarShowVGA`.

## 3. Verification

### 3.1 Oracle v2 (survey §6)
- **Held keys:** `frame:sc:holdFrames`.
- **Mouse events:** motion with relative movement, and button down/up.
- **Blocking screens:** a discovery runner for screens that block without presenting frames.
- **`OT_STATE2`:** an extended state record with cash, power, items, mainLevel, saveLevel, episodeNum, difficulty, levelEnd, endLevel, gameLoaded, curMenu and mtCalls.
- **Save files:** `OT_SAVEDUMP` copies `tyrian.sav`/`tyrian.cfg` at exit, and HOME can be pre-seeded with a save.
- **Synthetic demos:** an alternate data dir lets synthetic demo files stand in for the shipped ones.

### 3.2 Synthetic-demo level goldens
Generated demo files use a seeded key stream, and cover every level of every episode with varied loadouts. They run in both implementations and are compared by HASH and STATE. This is the main regression net for the in-level code.

### 3.3 Session goldens
These are key-injected oracle scenarios for the shop, script, menus, death and restore, and episode end, compared by HASH, STATE2 and save BYTES.

### 3.4 Unit tests
Every module gets unit tests: parser commands, economy math, save encryption and round-trip, input mapping, and the filters on synthetic buffers.
