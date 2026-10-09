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
