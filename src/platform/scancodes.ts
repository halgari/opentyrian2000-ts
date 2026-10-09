// SPDX-License-Identifier: GPL-2.0-or-later
export enum Scancode {
  A = 4, Return = 40, Escape = 41, Backspace = 42, Tab = 43, Space = 44,
  F1 = 58, F12 = 69, PrintScreen = 70, ScrollLock = 71, Pause = 72,
  Insert = 73, Home = 74, PageUp = 75, Delete = 76, End = 77, PageDown = 78,
  Right = 79, Left = 80, Down = 81, Up = 82,
  LCtrl = 224, LShift = 225, LAlt = 226, LGui = 227, RCtrl = 228, RShift = 229, RAlt = 230, RGui = 231,
}

export const KMOD_LSHIFT = 0x0001, KMOD_RSHIFT = 0x0002, KMOD_LCTRL = 0x0040, KMOD_RCTRL = 0x0080,
  KMOD_LALT = 0x0100, KMOD_RALT = 0x0200;

const TABLE: Record<string, number> = {
  Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44, Minus: 45, Equal: 46,
  BracketLeft: 47, BracketRight: 48, Backslash: 49, Semicolon: 51, Quote: 52, Backquote: 53,
  Comma: 54, Period: 55, Slash: 56, CapsLock: 57,
  PrintScreen: 70, ScrollLock: 71, Pause: 72, Insert: 73, Home: 74, PageUp: 75,
  Delete: 76, End: 77, PageDown: 78, ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81, ArrowUp: 82,
  NumLock: 83, NumpadDivide: 84, NumpadMultiply: 85, NumpadSubtract: 86, NumpadAdd: 87,
  NumpadEnter: 88, Numpad0: 98, NumpadDecimal: 99,
  ControlLeft: 224, ShiftLeft: 225, AltLeft: 226, MetaLeft: 227,
  ControlRight: 228, ShiftRight: 229, AltRight: 230, MetaRight: 231,
};
for (let i = 0; i < 26; i++) TABLE[`Key${String.fromCharCode(65 + i)}`] = 4 + i;
for (let i = 1; i <= 9; i++) TABLE[`Digit${i}`] = 29 + i;
TABLE['Digit0'] = 39;
for (let i = 1; i <= 12; i++) TABLE[`F${i}`] = 57 + i;
for (let i = 1; i <= 9; i++) TABLE[`Numpad${i}`] = 88 + i;

export function scancodeFromCode(code: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(TABLE, code) ? TABLE[code] : undefined;
}
