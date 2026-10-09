// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { decryptString, loadHelpText } from '../../src/data/helptext';
import { describeData, testArchive } from '../helpers/data';

const KEY = [204, 129, 63, 255, 71, 19, 25, 62, 1, 99];
function encrypt(plain: string): Uint8Array {
  const s = Uint8Array.from(plain, (c) => c.charCodeAt(0));
  // inverse of decrypt: walk forward; e[i] = p[i] ^ key[i%10] ^ e[i-1]
  const e = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) e[i] = s[i]! ^ KEY[i % 10]! ^ (i > 0 ? e[i - 1]! : 0);
  return e;
}

describe('decryptString', () => {
  it('inverts the Tyrian string cipher', () => {
    const text = 'Start New Game ~ 0123456789!';
    expect(String.fromCharCode(...decryptString(encrypt(text)))).toBe(text);
  });
  it('handles empty strings', () => {
    expect(decryptString(new Uint8Array()).length).toBe(0);
  });
});

describeData('real tyrian.hdt', () => {
  const h = () => loadHelpText(testArchive!.get('tyrian.hdt'));
  it('parses to exactly episode1DataLoc', () => {
    const t = h();
    expect(t.episode1DataLoc).toBe(21174);
    expect(t.endPos).toBe(t.episode1DataLoc);
  });
  it('main menu matches OpenTyrian2000 (with Setup override)', () => {
    expect(h().menuText).toEqual(['Start New Game', 'Load Game', 'High Scores', 'Instructions', 'Setup', 'Demo', 'Quit']);
  });
  it('other known sections', () => {
    const t = h();
    expect(t.pName[0]).toBe('Tyrian');
    expect(t.pName[20]).toBe('Skip It');
    expect(t.specialName).toEqual(['STEALTH', 'STORMWIND', 'TECHNO', 'ENEMY', 'WEIRD', 'UNKNOWN', 'NORTSHIPZ', 'LIZARD', 'PRETZEL', 'DESTRUCT', 'ENGAGE']);
    expect(t.episodeName[1]).toBe('Episode 1: Escape');
    expect(t.difficultyName[6]).toBe('Lord of Game');
    expect(t.superShips[12]).toBe('Stalker 21.126');
    expect(t.superTyrianText[5]).toBe('Prepare to play...');
    expect(t.miscTextB).toEqual(['Ep', 'Episode', 'Last Level', 'got', 'SUPER', 'POWER:', 'Time Bonus', 'Lives Bonus']);
    expect(t.menuInt).toHaveLength(16);
    expect(t.shipInfo).toHaveLength(20);
  });
});
