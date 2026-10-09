// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { CRand } from '../../src/audio/crand';
import { LdsPlayer } from '../../src/audio/lds';
import { parseMusicFile, songBytes } from '../../src/audio/music-file';
import { Opl } from '../../src/audio/opl';
import { describeData, testArchive } from '../helpers/data';

describeData('LdsPlayer', () => {
  const make = () => {
    const opl = new Opl(new CRand());
    opl.init(44100);
    return new LdsPlayer(opl, 44100);
  };
  const song29 = () => songBytes(parseMusicFile(testArchive!.get('music.mus')), 29)!;

  it('starts playing, not looped, after load', () => {
    const lds = make();
    expect(lds.load(song29())).toBe(true);
    expect(lds.playing).toBe(true);
    expect(lds.songlooped).toBe(false);
  });

  it('update() is a no-op returning false when not playing', () => {
    const lds = make();
    lds.load(song29());
    lds.playing = false;
    expect(lds.update()).toBe(false);
    expect(lds.playing).toBe(false);
  });

  it('rejects a song with an invalid mode byte', () => {
    expect(make().load(new Uint8Array([3, 0, 0, 0, 0]))).toBe(false);
  });
});
