# OpenTyrian2000-TS — Sub-project 5 (Polish/ship)

Date: 2026-10-09
Status: approved to proceed autonomously ("continue, merge as needed"). Public deployment is gated separately, see §5.
Parent: `2026-10-09-foundation-design.md` §3, `2026-10-09-gameplay-design.md` §2, `2026-10-09-gameflow-design.md` §2.
Survey: `2026-10-09-polish-survey.md`. It is the authoritative map, and section numbers below refer to it.

## 1. Goal

Finish the port so that every mode a single machine can play in the C game works in the browser, then ship it as a static site.

**Done means:**
1. **No unported code is reachable.** No `unported:` throw or `UnavailableModeError` can be reached from any menu, script or title code in shipped data (except Destruct, see Out of scope). The soak fails on any `unported:` error.
2. **Secret and alternate modes play like the C:**
   - ENGAGE/SuperTyrian (`]e`), including its completion screens and the "trentWin" ending;
   - galaga (`]g`);
   - 1-player Timed Battle;
   - 2-player arcade;
   - the title codes (super-arcade, SuperTyrian, `JE_whoa`).

   Each is verified by an oracle golden (HASH + STATE2, plus save bytes where it saves) where the oracle can drive it (survey §0 verification pattern).
3. **Gamepads work.** The browser Gamepad API drives the C's joystick paths (`inputDevice >= 3`) in levels and menus. In 2-player arcade, player 2 can use a gamepad.
4. **Shared-keyboard 2-player.** As a web-only extension, 2-player arcade can also run on one keyboard with a second key map. It is clearly marked as not in the C and is off by default, so C-faithful device assignment stays the default.
5. **Setup.** The Graphics page (the parts meaningful in a browser) and the Jukebox are ported. Scaler options are skipped.
6. **Browser robustness:**
   - pointer-lock-loss and blur ordering (M2);
   - config saved on `pagehide` (M5);
   - two tabs no longer silently clobber each other's saves (M6). The save state is reloaded on a `storage` event before any write.
7. **Single-file build.** `pnpm build:single` emits one `tyrian.html`. It inlines the game data compressed (gzip, decoded by `DecompressionStream`) and the AudioWorklet (Blob URL). It works from `file://` and from any static host. A size-budget test keeps it under 8 MB.
8. **Cloudflare config.** A Workers static-assets config (`wrangler.jsonc`) and `_headers` with cache headers are committed, along with a README deploy section. Nothing is deployed by the agents.

## 2. Out of scope
- Destruct.
- Network play.
- The ship editor.
- The scaler options.
- `]V`/`]R` script reveals: no shipped script uses them, so they stay as throws documented as dead.
- The joystick calibration UI beyond a simple button-mapping page.

## 3. Architecture additions
- **Two-player:** `ctx.game.players[1]` becomes live. Input routing follows the C's device model, where `inputDevice[p]` is 1 for keyboard, 2 for mouse and 3+ for joystick. Web device 0x80 is "keyboard map B" (the shared-keyboard extension), handled only in `src/platform` and the device-select UI.
- **Gamepads:** `src/platform/gamepad.ts` polls `navigator.getGamepads()` once per input pump. It exposes the C `joystick[]` struct (axes, buttons, analog) to `Input`. The mapping uses the C's default button assignments (survey §6).
- **Single-file build:** `src/platform/assets.ts` gains an inline source. A build step writes the needed data files (survey §9.2) into one gzip blob plus a JSON index, and inlines both into the HTML. The worklet is built separately and inlined as a string.
- **Rules:** all earlier rules apply: no module-level mutable state, C integer helpers, and `TODO(sp6)` is not allowed. Anything left unported must be unreachable, and must be documented as such.

## 4. Verification
- **Mode goldens** use the existing oracle session machinery. They seed saves with `tools/oracle/ts-save.ts` (for example a slot at the ep1 section 41 shop, a `super_arcade_mode` save, slots 12-22 for two-player), then drive the real menus with injected keys.
- **Two-player** goldens drive player 2 through the C's keyboard/mouse split. Any oracle patch additions (for example an `OT_MOUSE` stream for player 2) are allowed.
- **Gamepads** cannot be checked against the oracle (it has no joystick) unless an `OT_JOY` patch is cheap. Otherwise they get unit tests of the mapping plus a Playwright smoke test with a synthetic gamepad.
- **Single-file build** gets a Playwright smoke test over `file://`: boot, title, start a game, play 10 s, save, reload, load. It also gets a size-budget test.
- **Soak:** it is extended to the new modes, and fails on `unported:`.

## 5. Deployment and licensing gate
The freeware Tyrian 2000 data has no licence file, and its `readme.txt` says "All Rights Reserved". The engine code is GPL2.
- Building the single file and the Cloudflare config is in scope.
- **Deploying publicly, or publishing the data, requires the user's explicit go-ahead.** The final report asks for it.
