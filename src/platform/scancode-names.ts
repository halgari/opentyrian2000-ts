// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: SDL2 SDL_scancode_names.h (SDL_GetScancodeName), used by the keyboard config screen (game_menu.c:355)

const NAMES = new Map<number, string>();
const set = (sc: number, name: string): void => { NAMES.set(sc, name); };

for (let i = 0; i < 26; i++) set(4 + i, String.fromCharCode(65 + i));
for (let i = 1; i <= 9; i++) set(29 + i, String(i));
set(39, '0');
[[40, 'Return'], [41, 'Escape'], [42, 'Backspace'], [43, 'Tab'], [44, 'Space'], [45, '-'], [46, '='], [47, '['], [48, ']'],
  [49, '\\'], [50, '#'], [51, ';'], [52, '\''], [53, '`'], [54, ','], [55, '.'], [56, '/'], [57, 'CapsLock']]
  .forEach(([sc, n]) => set(sc as number, n as string));
for (let i = 1; i <= 12; i++) set(57 + i, `F${i}`);
[[70, 'PrintScreen'], [71, 'ScrollLock'], [72, 'Pause'], [73, 'Insert'], [74, 'Home'], [75, 'PageUp'], [76, 'Delete'],
  [77, 'End'], [78, 'PageDown'], [79, 'Right'], [80, 'Left'], [81, 'Down'], [82, 'Up'], [83, 'Numlock'],
  [84, 'Keypad /'], [85, 'Keypad *'], [86, 'Keypad -'], [87, 'Keypad +'], [88, 'Keypad Enter']]
  .forEach(([sc, n]) => set(sc as number, n as string));
for (let i = 1; i <= 9; i++) set(88 + i, `Keypad ${i}`);
set(98, 'Keypad 0');
set(99, 'Keypad .');
set(100, 'NonUS \\');
set(101, 'Application');
set(103, 'Keypad =');
for (let i = 13; i <= 24; i++) set(91 + i, `F${i}`);
[[224, 'Left Ctrl'], [225, 'Left Shift'], [226, 'Left Alt'], [227, 'Left GUI'], [228, 'Right Ctrl'], [229, 'Right Shift'],
  [230, 'Right Alt'], [231, 'Right GUI']].forEach(([sc, n]) => set(sc as number, n as string));

/** SDL_GetScancodeName: the empty string for scancodes without a name. */
export function scancodeName(sc: number): string {
  return NAMES.get(sc) ?? '';
}
