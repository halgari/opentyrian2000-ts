// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/mainint.c (JE_gammaCheck, JE_mainKeyboardInput, JE_pauseGame, the input block of JE_playerMovement)
// and src/tyrian2.c (the input/pause/menu tail of the level loop)
import { MUSIC_NUM } from '../audio/ids';
import { idiv } from '../core/int';
import type { Ctx } from '../ctx';
import { analogAngle, axisReduce } from '../platform/gamepad';
import type { LinkGunAnalog } from './twoplayer';
import { PCX_PAL } from '../data/pcxmast';
import { DEVICE_KEYBOARD_B } from '../platform/input';
import { Scancode } from '../platform/scancodes';
import { waitDelayPlain, waitNoInput } from '../platform/wait';
import { doInGameSetup, inGameHelp } from '../screens/ingame-setup';
import { dString } from '../video/fonthand';
import { FONT_SHAPES } from '../video/sprite';
import { showVGA } from '../video/video';
import { setNewGameSpeed } from './config';
import { drawTextWindow, gammaCorrect } from './hud';
import { SA_NONE, type Player } from './world';

// SDL scancodes used below (SDL_scancode.h)
const SC = {
  P: 19, Num1: 30, Num2: 31, Num9: 38, Num0: 39, Minus: 45, Backslash: 49, Slash: 56, ScrollLock: 71, NumLock: 83,
  F2: 59, F3: 60, F4: 61, F5: 62, F6: 63, F7: 64, F8: 65, F9: 66, F10: 67, F11: 68, F12: 69,
} as const;

/** What a key press of the level loop asks the frame to do. */
export type KeyResult = 'continue' | 'restart';

// port of JE_gammaCheck (mainint.c:1374)
export function gammaCheck(ctx: Ctx): boolean {
  const ks = ctx.input.keysactive;
  const temp = ks[SC.F11] !== 0;
  if (temp) {
    ks[SC.F11] = 0;
    ctx.input.newkey = false;
    const c = ctx.game.config;
    c.gammaCorrection = (c.gammaCorrection + 1) % 4;
    const ps = ctx.palette;
    ps.colors.set(ps.palettes[PCX_PAL[3 - 1]!]!); // memcpy(colors, palettes[pcxpal[3-1]])
    gammaCorrect(ps.colors, c.gammaCorrection);
    ps.setPalette(ps.colors, 0, 255);
  }
  return temp;
}

// port of JE_mainKeyboardInput (mainint.c:3147). Returns whether the frame must restart (skipStarShowVGA set by F1).
// Dead in this port (no network, no extraAvail, no constantPlay): the TAB/CapsLock edited-ship blocks,
// the isNetworkGame request branches and the `constantPlay` cheat toggle.
export async function mainKeyboardInput(ctx: Ctx): Promise<void> {
  const g = ctx.game;
  const c = g.config;
  const v = g.varz;
  const ks = ctx.input.keysactive;
  const p0 = g.players[0];

  gammaCheck(ctx);

  /* { In-Game Help } */
  if (ks[Scancode.F1]) {
    await inGameHelp(ctx);
    v.skipStarShowVGA = true;
  }

  /* {!Activate Nort Ship!} */
  if (ks[SC.F2] && ks[SC.F4] && ks[SC.F6] && ks[SC.F7] && ks[SC.F9] && ks[SC.Backslash] && ks[SC.Slash]) {
    p0.items.ship = 12; // Nort Ship
    p0.items.special = 13; // Astral Zone
    p0.items.weapon[0]!.id = 36; // NortShip Super Pulse
    p0.items.weapon[1]!.id = 37; // NortShip Spreader
    v.shipGr = 1;
  }

  /* {Cheating} */
  if (!c.twoPlayerMode && !c.superTyrian && c.superArcadeMode === SA_NONE) {
    if (ks[SC.F2] && ks[SC.F3] && ks[SC.F6]) {
      c.youAreCheating = !c.youAreCheating;
      ks[SC.F2] = 0;
    }

    if (ks[SC.F2] && ks[SC.F3] && (ks[SC.F4] || ks[SC.F5])) {
      for (const p of g.players) p.armor = 0;
      c.youAreCheating = !c.youAreCheating;
      drawTextWindow(ctx, ctx.assets.helpText.miscText[63 - 1] ?? '');
    }
  }

  if (c.superTyrian) c.youAreCheating = false;

  /* {DEBUG} */
  // The FPS overlay that `debug` enables is not ported (not reachable by a player); the toggle and its counters are, so the key combination is harmless.
  if (ks[SC.F10] && ks[Scancode.Backspace]) {
    ks[SC.F10] = 0;
    v.debug = !v.debug;
    v.debugHist = 1;
    v.debugHistCount = 1;
    // lastDebugTime = SDL_GetTicks(): only the unported overlay reads it
  }

  /* {CHEAT-SKIP LEVEL} */
  if (ks[SC.F2] && ks[SC.F6] && (ks[SC.F7] || ks[SC.F8]) && !ks[SC.F9] && !c.superTyrian && c.superArcadeMode === SA_NONE) {
    v.levelTimer = true;
    v.levelTimerCountdown = 0;
    v.endLevel = true;
    v.levelEnd = 40;
  }

  /* pause game */
  v.pauseGamePressed = v.pauseGamePressed || ks[SC.P] !== 0;

  /* in-game setup */
  v.ingamemenuPressed = v.ingamemenuPressed || ks[Scancode.Escape] !== 0;

  if (ks[Scancode.Backspace]) {
    /* toggle screenshot pause */
    if (ks[SC.NumLock]) c.superPause = !c.superPause;

    /* {SMOOTHIES} */
    if (ks[SC.F12] && ks[SC.ScrollLock]) {
      const sc = g.scratch;
      for (sc.temp = SC.Num2; sc.temp <= SC.Num9; sc.temp++) {
        if (ks[sc.temp]) c.smoothies[sc.temp - SC.Num2] = !c.smoothies[sc.temp - SC.Num2];
      }
      if (ks[SC.Num0]) c.smoothies[8] = !c.smoothies[8];
    } else if (ks[SC.Minus]) {
      /* {CYCLE THROUGH FILTER COLORS} */
      if (c.levelFilter === -99) {
        c.levelFilter = 0;
      } else {
        c.levelFilter++;
        if (c.levelFilter === 16) c.levelFilter = -99;
      }
    } else if (ks[SC.Num1]) {
      /* {HYPER-SPEED} */
      c.fastPlay++;
      if (c.fastPlay > 2) c.fastPlay = 0;
      ks[SC.Num1] = 0;
      setNewGameSpeed(ctx);
    }

    /* {IN-GAME RANDOM MUSIC SELECTION} */
    if (ks[SC.ScrollLock]) ctx.audio.playSong(ctx.rng.rand() % MUSIC_NUM);
  }
}

// port of JE_pauseGame (mainint.c:3391), non-network path
export async function pauseGame(ctx: Ctx): Promise<void> {
  const g = ctx.game;
  const c = g.config;
  const input = ctx.input;

  input.mouseSetRelative(false);

  // VGAScreen = VGAScreenSeg
  if (!c.superPause) {
    dString(ctx.vga.screen, ctx.assets.shapes.tables, 120, 90, ctx.assets.helpText.miscText[22] ?? '', FONT_SHAPES);
    showVGA(ctx);
  }

  ctx.audio.setVolume(idiv(c.tyrMusicVolume, 2), c.fxVolume);

  await waitNoInput(ctx, false, false, true); // TODO: should up the joystick repeat temporarily instead

  let done = false;
  do {
    ctx.delay.setDelay(2);

    input.pushJoysticksAsKeyboard();
    input.serviceEvents(true);

    const k = input.lastkeyScan;
    if ((input.newkey && k !== Scancode.LCtrl && k !== Scancode.RCtrl && k !== Scancode.LAlt && k !== Scancode.RAlt) ||
        input.mousePosition() > 0) {
      done = true;
    }

    await waitDelayPlain(ctx);
  } while (!done);

  ctx.audio.setVolume(c.tyrMusicVolume, c.fxVolume);

  input.mouseSetRelative(true);
}

/**
 * The input/pause/menu tail of the level loop (tyrian2.c:2213-2260, `else` of `if (play_demo)`).
 * Returns 'restart' for `goto level_loop` (F1 help).
 */
export async function levelInputTail(ctx: Ctx): Promise<KeyResult> {
  const v = ctx.game.varz;
  const input = ctx.input;

  input.serviceEvents(false);

  if (input.newkey) {
    v.skipStarShowVGA = false;
    await mainKeyboardInput(ctx);
    input.newkey = false;
    if (v.skipStarShowVGA) return 'restart';
  }

  if (v.pauseGamePressed || !input.windowHasFocus) {
    v.pauseGamePressed = false;
    await pauseGame(ctx);
  }

  if (v.ingamemenuPressed) {
    v.ingamemenuPressed = false;
    v.yourInGameMenuRequest = true;
    await doInGameSetup(ctx);
    v.skipStarShowVGA = true;
  }
  return 'continue';
}

/** The game-over wait of the level loop (tyrian2.c:2185-2191), `!play_demo` only. */
export function gameOverKeyWait(ctx: Ctx): void {
  const v = ctx.game.varz;
  const input = ctx.input;
  ctx.input.pushJoysticksAsKeyboard();
  input.serviceEvents(true);
  // `button[]` is stale here: JE_playerMovement returns before resetting it once the player is dead, so
  // keys held when the ship died (e.g. fire) end the level at once.
  if ((input.newkey || v.button[0] || v.button[1] || v.button[2]) || input.newmouse) v.reallyEndLevel = true;
}

/**
 * The non-demo input block of JE_playerMovement (mainint.c:3679-3790): keyboard (device 0 or 1) and mouse (0 or 2).
 * Also the joystick block (device 0 or >= 3, mainint.c:3679). Moves the ship by the keyboard and pad, fills `button[]` and
 * returns the mouse delta (mouseXC, mouseYC) that the caller clamps and applies, and the analog link-gun angle.
 */
export function readPlayerInput(ctx: Ctx, p: Player, inputDevice: number): { mouseXC: number; mouseYC: number; linkGun: LinkGunAnalog } {
  const g = ctx.game;
  const c = g.config;
  const button = g.varz.button;
  const input = ctx.input;
  let mouseXC = 0, mouseYC = 0;
  // link_gun_analog / link_gun_angle (mainint.c:3535-3536): both initialised to false / 0 before joystick_analog_angle adds into the angle.
  const linkGun: LinkGunAnalog = { on: false, angle: 0 };

  /* joystick input */
  const js = input.joysticks;
  const joysticks = js ? js.count : 0;
  if (js && (inputDevice === 0 || (inputDevice >= 3 && inputDevice < DEVICE_KEYBOARD_B)) && joysticks > 0) {
    let j = inputDevice === 0 ? 0 : inputDevice - 3;
    const jMax = Math.min(inputDevice === 0 ? joysticks : inputDevice - 3 + 1, joysticks); // a pad unplugged since the device was chosen: no input
    for (; j < jMax; j++) {
      js.pollOne(j);
      const s = js.state[j];
      if (!s) continue;

      if (s.analog) {
        mouseXC += axisReduce(s, s.x);
        mouseYC += axisReduce(s, s.y);

        const a = { v: linkGun.angle };
        linkGun.on = analogAngle(s, a);
        linkGun.angle = a.v;
      } else {
        p.x += (s.direction[3] ? -1 : 0) + (s.direction[1] ? 1 : 0); // CURRENT_KEY_SPEED
        p.y += (s.direction[0] ? -1 : 0) + (s.direction[2] ? 1 : 0);
      }

      button[0] = button[0] || s.action[0]!;
      button[1] = button[1] || s.action[2]!;
      button[2] = button[2] || s.action[3]!;
      button[3] = button[3] || s.actionPressed[1]!;

      g.varz.ingamemenuPressed = g.varz.ingamemenuPressed || s.actionPressed[4]!;
      g.varz.pauseGamePressed = g.varz.pauseGamePressed || s.actionPressed[5]!;
    }
  }

  input.serviceEvents(false);

  /* mouse input */
  if ((inputDevice === 0 || inputDevice === 2) && ctx.mouse.hasMouse) {
    button[0] = button[0] || input.mousePressed[0]!;
    button[1] = button[1] || input.mousePressed[1]!;
    button[2] = button[2] || input.mousePressed[2]!;
    button[3] = button[3] || input.mousePressed[3]!;

    const [xr, yr] = input.mouseGetRelativePosition();
    mouseXC += xr;
    mouseYC += yr;
  }

  /* keyboard input */
  if (inputDevice === 0 || inputDevice === 1) {
    const ks = input.keysactive;
    const k = c.keySettings;
    if (ks[k[0]!]) p.y -= 1; // CURRENT_KEY_SPEED
    if (ks[k[1]!]) p.y += 1;
    if (ks[k[2]!]) p.x -= 1;
    if (ks[k[3]!]) p.x += 1;

    button[0] = button[0] || ks[k[4]!] !== 0;
    button[3] = button[3] || ks[k[5]!] !== 0;
    button[1] = button[1] || ks[k[6]!] !== 0;
    button[2] = button[2] || ks[k[7]!] !== 0;
    // constantPlay / record_demo: never set outside the command line
  }

  /* keyboard map B (web extension, not in the C): the keyboard block above on keySettings2 */
  if (inputDevice === DEVICE_KEYBOARD_B) {
    const ks = input.keysactive;
    const k = c.keySettings2;
    if (ks[k[0]!]) p.y -= 1;
    if (ks[k[1]!]) p.y += 1;
    if (ks[k[2]!]) p.x -= 1;
    if (ks[k[3]!]) p.x += 1;

    button[0] = button[0] || ks[k[4]!] !== 0;
    button[3] = button[3] || ks[k[5]!] !== 0;
    button[1] = button[1] || ks[k[6]!] !== 0;
    button[2] = button[2] || ks[k[7]!] !== 0;
  }
  return { mouseXC, mouseYC, linkGun };
}
