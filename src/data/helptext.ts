// OpenTyrian2000-TS — TypeScript port of OpenTyrian2000
// Copyright (C) 2007-2009 The OpenTyrian Development Team
// Copyright (C) 2022 Kaito Sinclaire
// Copyright (C) 2026 OpenTyrian2000-TS contributors
// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from: src/helptext.c

import { BinaryReader } from '../core/binary-reader';

const CRYPT_KEY = [204, 129, 63, 255, 71, 19, 25, 62, 1, 99];

// port of decrypt_string
export function decryptString(bytes: Uint8Array): Uint8Array {
  const s = bytes.slice();
  for (let i = s.length - 1; i >= 0; --i) {
    s[i] = s[i]! ^ CRYPT_KEY[i % CRYPT_KEY.length]!;
    if (i > 0) s[i] = s[i]! ^ s[i - 1]!;
  }
  return s;
}

// port of read_encrypted_pascal_string
function readEncrypted(r: BinaryReader, size: number): string {
  const len = r.u8();
  const plain = decryptString(r.bytes(len));
  return String.fromCharCode(...plain.subarray(0, Math.min(len, size - 1)));
}

// port of skip_pascal_string
function skip(r: BinaryReader): void {
  r.skip(r.u8());
}

export interface HelpText {
  episode1DataLoc: number; endPos: number;
  helpTxt: string[]; pName: string[]; miscText: string[]; miscTextB: string[];
  menuInt: string[][]; menuText: string[]; outputs: string[]; topicName: string[]; mainMenuHelp: string[];
  inGameText: string[]; detailLevel: string[]; gameSpeedText: string[];
  episodeName: string[]; difficultyName: string[]; gameplayName: string[];
  inputDevices: string[]; networkText: string[]; difficultyNameB: string[]; joyButtonNames: string[];
  superShips: string[]; specialName: string[]; destructHelp: string[]; weaponNames: string[]; destructModeName: string[];
  shipInfo: [string, string][]; timedBattleName: string[]; licensingInfo: string[];
  defaultHighScoreNames: string[]; defaultTeamNames: string[]; orderingInfo: string[]; superTyrianText: string[];
}

// port of JE_loadHelpText
export function loadHelpText(bytes: Uint8Array): HelpText {
  const r = new BinaryReader(bytes);
  const episode1DataLoc = r.s32();
  const section = (count: number, size: number, footer = true): string[] => {
    skip(r);
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(readEncrypted(r, size));
    if (footer) skip(r);
    return out;
  };
  const menuInt: string[][] = Array.from({ length: 16 }, () => new Array<string>(11).fill(''));
  const menuIntSection = (n: number, count: number): void => {
    section(count, 18).forEach((s, i) => (menuInt[n]![i] = s));
  };

  const helpTxt = section(39, 231);
  const pName = section(21, 16);
  const miscText = section(72, 42);
  const miscTextB = section(8, 12);
  menuIntSection(6, 11); // key names
  const menuText = section(7, 29);
  menuText[6] = menuText[5]!; // OpenTyrian2000 override
  menuText[5] = menuText[4]!;
  menuText[4] = 'Setup';
  const outputs = section(9, 31);
  const topicName = section(6, 21);
  const mainMenuHelp = section(37, 66);
  menuIntSection(1, 7);
  menuIntSection(2, 9);
  menuIntSection(3, 9);
  const inGameText = section(6, 21);
  const detailLevel = section(6, 13);
  const gameSpeedText = section(5, 13);
  const episodeName = section(6, 31);
  const difficultyName = section(7, 21);
  const gameplayName = section(6, 26);
  menuIntSection(10, 6);
  const inputDevices = section(3, 13);
  const networkText = section(5, 33);
  menuIntSection(11, 4);
  const difficultyNameB = section(11, 21);
  menuIntSection(12, 7);
  menuIntSection(13, 7);
  const joyButtonNames = section(5, 21);
  const superShips = section(13, 26);
  const specialName = section(11, 10);
  const destructHelp = section(25, 22);
  const weaponNames = section(17, 17);
  const destructModeName = section(5, 13);
  skip(r);
  const shipInfo: [string, string][] = [];
  for (let i = 0; i < 20; i++) shipInfo.push([readEncrypted(r, 256), readEncrypted(r, 256)]);
  skip(r);
  menuIntSection(14, 5);
  const timedBattleName = section(4, 23);
  for (const n of [10, 5, 4, 4, 5, 7, 7, 21, 3, 3]) {
    skip(r);
    for (let i = 0; i < n; i++) skip(r);
    skip(r);
  }
  menuIntSection(15, 6);
  const licensingInfo = section(3, 46);
  const defaultHighScoreNames = section(39, 23);
  const defaultTeamNames = section(10, 25);
  const orderingInfo = section(6, 32);
  const superTyrianText = section(6, 64, false);

  return {
    episode1DataLoc, endPos: r.pos,
    helpTxt, pName, miscText, miscTextB, menuInt, menuText, outputs, topicName, mainMenuHelp,
    inGameText, detailLevel, gameSpeedText, episodeName, difficultyName, gameplayName,
    inputDevices, networkText, difficultyNameB, joyButtonNames, superShips, specialName,
    destructHelp, weaponNames, destructModeName, shipInfo, timedBattleName, licensingInfo,
    defaultHighScoreNames, defaultTeamNames, orderingInfo, superTyrianText,
  };
}
