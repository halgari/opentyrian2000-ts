// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/jukebox.c
//
// The C leaves the last jukebox song playing when it returns; the title screen restarts SONG_TITLE itself on entry
// (title.ts), so nothing is restored here. `audio_disabled` (no sound device) is not modelled: a silent Audio simply
// ignores the play calls.
import { MUSIC_NUM, SOUND_COUNT } from '../audio/ids';
import type { Ctx } from '../ctx';
import { Scancode } from '../platform/scancodes';
import { waitDelayPlain } from '../platform/wait';
import { Align, Font, drawFontHv } from '../video/font';
import { initStepFadePalette, initStepFadeSolid, stepFadePalette } from '../video/palette';
import { starlibInit, starlibMain } from '../video/starlib';
import { fillRect } from '../video/surface';
import { showVGA } from '../video/video';
import { MUSIC_TITLE, SOUND_TITLE } from './jukebox-titles';

// SDL scancodes the jukebox reads beyond the Scancode enum
const SC_F = 9, SC_N = 17, SC_Q = 20, SC_R = 21, SC_S = 22, SC_SEMICOLON = 51, SC_COMMA = 54, SC_PERIOD = 55, SC_SLASH = 56;

// port of jukebox (jukebox.c:34), FKA Setup.jukeboxGo
export async function jukebox(ctx: Ctx): Promise<void> {
  const { audio, input, palette, assets } = ctx;
  const c = ctx.game.config;
  const screen = ctx.vga.screen;
  const tables = assets.shapes.tables;

  let triggerQuit = false; // true when user wants to quit
  let quitting = false;
  let hideText = false;
  let fadeLoopedSongs = true, fadingSong = false;
  let stopped = false;
  let fx = false;
  let fxNum = 0;
  let paletteFadeSteps = 15;

  const diff = new Int32Array(768);
  initStepFadePalette(palette, diff, palette.colors, 0, 255);

  starlibInit(ctx);

  let fadeVolume = c.tyrMusicVolume;

  for (;;) {
    if (!stopped) {
      if (audio.songlooped && fadeLoopedSongs) fadingSong = true;

      if (fadingSong) {
        if (fadeVolume > 5) {
          fadeVolume -= 2;
        } else {
          fadeVolume = c.tyrMusicVolume;
          fadingSong = false;
        }
        audio.setVolume(fadeVolume, c.fxVolume);
      }

      if (!audio.playing || (audio.songlooped && fadeLoopedSongs && !fadingSong)) audio.playSong(ctx.rng.rand() % MUSIC_NUM);
    }

    ctx.delay.setDelay(1);

    fillRect(screen, 0, 0, 320, 200, 0);

    // starlib input needs to be rewritten
    await starlibMain(ctx);

    input.pushJoysticksAsKeyboard();
    input.serviceEvents(true);

    if (!hideText) {
      const buffer = fx ? `${fxNum + 1} ${SOUND_TITLE[fxNum]}` : `${audio.songPlaying + 1} ${MUSIC_TITLE[audio.songPlaying] ?? ''}`;
      const x = screen.w >> 1;
      drawFontHv(screen, tables, x, 170, 'Press ESC to quit the jukebox.', Font.Small, Align.Centered, 1, 0);
      drawFontHv(screen, tables, x, 180, 'Arrow keys change the song being played.', Font.Small, Align.Centered, 1, 0);
      drawFontHv(screen, tables, x, 190, buffer, Font.Small, Align.Centered, 1, 4);
    }

    if (paletteFadeSteps > 0) stepFadePalette(palette, diff, paletteFadeSteps--, 0, 255);

    showVGA(ctx);

    await waitDelayPlain(ctx);

    // quit on mouse click
    if (input.mousePosition() > 0) triggerQuit = true;

    if (input.newkey) {
      switch (input.lastkeyScan) {
        case Scancode.Escape: // quit jukebox
        case SC_Q:
          triggerQuit = true;
          break;
        case Scancode.Space:
          hideText = !hideText;
          break;
        case SC_F:
          fadingSong = !fadingSong;
          break;
        case SC_N:
          fadeLoopedSongs = !fadeLoopedSongs;
          break;
        case SC_SLASH: // switch to sfx mode
          fx = !fx;
          break;
        case SC_COMMA:
          if (fx && --fxNum < 0) fxNum = SOUND_COUNT - 1;
          break;
        case SC_PERIOD:
          if (fx && ++fxNum >= SOUND_COUNT) fxNum = 0;
          break;
        case SC_SEMICOLON:
          if (fx) audio.playSample(fxNum + 1);
          break;
        case Scancode.Left:
        case Scancode.Up:
          audio.playSong((audio.songPlaying > 0 ? audio.songPlaying : MUSIC_NUM) - 1);
          stopped = false;
          break;
        case Scancode.Return:
        case Scancode.Right:
        case Scancode.Down:
          audio.playSong((audio.songPlaying + 1) % MUSIC_NUM);
          stopped = false;
          break;
        case SC_S: // stop song
          audio.stopSong();
          stopped = true;
          break;
        case SC_R: // restart song
          audio.restartSong();
          stopped = false;
          break;
      }
    }

    // user wants to quit, start fade-out
    if (triggerQuit && !quitting) {
      paletteFadeSteps = 15;
      initStepFadeSolid(palette, diff, 0, 0, 0, 0, 255);
      quitting = true;
    }

    // if fade-out finished, we can finally quit
    if (quitting && paletteFadeSteps === 0) break;
  }

  audio.setVolume(c.tyrMusicVolume, c.fxVolume);
}
