// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { parseMusicFile, songBytes } from '../../src/audio/music-file';
import { describeData, testArchive } from '../helpers/data';

it('parses a synthetic song table', () => {
  const b = new Uint8Array([2, 0, 10, 0, 0, 0, 13, 0, 0, 0, 1, 2, 3, 4, 5, 6]);
  const m = parseMusicFile(b);
  expect(m.songCount).toBe(2);
  expect(Array.from(m.offsets)).toEqual([10, 13, 16]);
  expect(Array.from(songBytes(m, 1)!)).toEqual([4, 5, 6]);
  expect(songBytes(m, 2)).toBeNull();
  expect(songBytes(m, -1)).toBeNull();
});

describeData('music.mus', () => {
  it('has 41 songs with increasing offsets ending at the file size', () => {
    const bytes = testArchive!.get('music.mus');
    const m = parseMusicFile(bytes);
    expect(m.songCount).toBe(41);
    expect(m.offsets.length).toBe(42);
    for (let i = 1; i < m.offsets.length; i++) expect(m.offsets[i]).toBeGreaterThan(m.offsets[i - 1]);
    expect(m.offsets[41]).toBe(bytes.length);
    expect(songBytes(m, 41)).toBeNull();
    expect(songBytes(m, 40)).not.toBeNull();
  });
});
