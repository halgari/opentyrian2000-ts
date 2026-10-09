// SPDX-License-Identifier: GPL-2.0-or-later
// Shared by the oracle runner and the golden tests. Scancodes are SDL scancodes.
export interface KeyPress { frame: number; scancode: number }
export interface Scenario { maxFrames: number; keys: KeyPress[] }

export const SCENARIOS = {
  /** Intro logos, title logo slide, menu fade-in, idle menu (frames 0–141). */
  boot: { maxFrames: 142, keys: [] },
  /** Down, Down, Down, Up on the main menu. */
  'menu-nav': {
    maxFrames: 146,
    keys: [
      { frame: 141, scancode: 81 },
      { frame: 142, scancode: 81 },
      { frame: 143, scancode: 81 },
      { frame: 144, scancode: 82 },
    ],
  },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;

export interface AudioScenario {
  song: number; samples: number; mode: 'raw' | 'mixed' | 'voltable'; musicVolume: number; fadeAt: number;
}

/**
 * Audio oracle scenarios (tools/oracle/audio-render.c). Song indexes are 0-based in music.mus.
 * fadeAt must be a multiple of 1024 (lds_fade is applied at a callback-chunk boundary), so the
 * "2 s" title fade uses 88064 (= 86 * 1024) rather than 88200.
 */
export const AUDIO_SCENARIOS = {
  'title-raw': { song: 29, samples: 441000, mode: 'raw', musicVolume: 255, fadeAt: -1 },
  // Song 5 is the first song with a non-zero regbd (0x01). No song in this music.mus has regbd & 0x20
  // (rhythm mode) set, and regbd is only written at lds_rewind, so none ever enters rhythm mode.
  'perc-raw': { song: 5, samples: 441000, mode: 'raw', musicVolume: 255, fadeAt: -1 },
  // Song 39 (931 bytes) is the smallest song that loops. The three smaller songs 30, 10, 33 (and 9, 18)
  // end with playing=false without ever looping. loopedAtSample = 2434700, + 44100 = 2478800.
  'loop-raw': { song: 39, samples: 2478800, mode: 'raw', musicVolume: 255, fadeAt: -1 },
  'title-mixed': { song: 29, samples: 441000, mode: 'mixed', musicVolume: 191, fadeAt: -1 },
  'title-fade': { song: 29, samples: 441000, mode: 'mixed', musicVolume: 255, fadeAt: 88064 },
  voltable: { song: 0, samples: 256, mode: 'voltable', musicVolume: 255, fadeAt: -1 },
} satisfies Record<string, AudioScenario>;

export type AudioScenarioName = keyof typeof AUDIO_SCENARIOS;
