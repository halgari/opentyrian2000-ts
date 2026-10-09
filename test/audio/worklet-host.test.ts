// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/engine';
import { EngineHost, type FromWorklet } from '../../src/audio/protocol';
import { loadSounds } from '../../src/audio/sound-file';
import { describeData, testArchive } from '../helpers/data';

describeData('EngineHost', () => {
  function setup() {
    const posted: FromWorklet[] = [];
    const host = new EngineHost(new AudioEngine(44100), (m) => posted.push(m));
    const a = testArchive!;
    host.handle({
      t: 'init', music: a.get('music.mus'),
      sounds: loadSounds(a.get('tyrian.snd'), a.get('voices.snd'), 44100),
    });
    return { host, posted };
  }
  const block = (host: EngineHost) => { const o = new Float32Array(128); host.process(o); return o; };

  it('plays a song, stays in range, posts status', () => {
    const { host, posted } = setup();
    host.handle({ t: 'playSong', n: 29 });
    let max = 0;
    for (let i = 0; i < 44100 / 128; i++) for (const v of block(host)) max = Math.max(max, Math.abs(v));
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(1);
    expect(posted.some((m) => m.playing && m.songPlaying === 29)).toBe(true);
    expect(posted.some((m) => m.peak > 0)).toBe(true);
  });

  it('stopSong silences later blocks', () => {
    const { host } = setup();
    host.handle({ t: 'playSong', n: 29 });
    for (let i = 0; i < 100; i++) block(host);
    host.handle({ t: 'stopSong' });
    block(host);
    for (let i = 0; i < 50; i++) expect(block(host).every((v) => v === 0)).toBe(true);
  });
});
