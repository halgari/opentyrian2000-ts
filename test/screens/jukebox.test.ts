// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { MUSIC_NUM } from '../../src/audio/ids';
import type { Audio } from '../../src/platform/audio';
import { jukebox } from '../../src/screens/jukebox';
import { SC } from '../../tools/oracle/scenarios-shopc';
import { describeData } from '../helpers/data';
import { drive, menuCtx } from '../helpers/drive';

const KEY_S = 22, KEY_SLASH = 56, KEY_SEMI = 51, KEY_PERIOD = 55;

/** Records the audio calls; `playing`/`songPlaying` follow play_song like the real engine. */
class RecordingAudio implements Audio {
  calls: string[] = [];
  musicDisabled = false; samplesDisabled = false;
  playing = false; songlooped = false; songPlaying = 0;
  playSong(n: number): void { this.calls.push(`play ${n}`); this.songPlaying = n; this.playing = true; }
  restartSong(): void { this.calls.push('restart'); }
  stopSong(): void { this.calls.push('stop'); this.playing = false; }
  fadeSong(): void {}
  setVolume(m: number, s: number): void { this.calls.push(`vol ${m} ${s}`); }
  multiSamplePlay(): void {}
  playSample(n: number): void { this.calls.push(`sample ${n}`); }
}

function jukeCtx() {
  const ctx = menuCtx();
  const audio = new RecordingAudio();
  ctx.audio = audio;
  return { ctx, audio };
}

describeData('jukebox', () => {
  it('starts a random song, Down/Return step forward, Up steps back with wrap, Esc leaves and restores the volume', async () => {
    const { ctx, audio } = jukeCtx();
    await drive(ctx, jukebox, (t) => t.tap(SC.Down, SC.Return, SC.Up, SC.Up).wait(10).tap(SC.Escape), 80);
    const plays = audio.calls.filter((c) => c.startsWith('play ')).map((c) => Number(c.slice(5)));
    const first = plays[0]!;
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(MUSIC_NUM);
    expect(plays.slice(1)).toEqual([(first + 1) % MUSIC_NUM, (first + 2) % MUSIC_NUM, (first + 1) % MUSIC_NUM, first]);
    expect(audio.calls.at(-1)).toBe(`vol ${ctx.game.config.tyrMusicVolume} ${ctx.game.config.fxVolume}`);
  });

  it('S stops the song and does not restart it on its own; R restarts', async () => {
    const { ctx, audio } = jukeCtx();
    await drive(ctx, jukebox, (t) => t.tap(KEY_S).wait(10).tap(SC.Escape), 80);
    expect(audio.calls.filter((c) => c.startsWith('play '))).toHaveLength(1); // only the initial song
    expect(audio.calls).toContain('stop');
    const b = jukeCtx();
    await drive(b.ctx, jukebox, (t) => t.tap(KEY_S, 21 /* R */).wait(10).tap(SC.Escape), 80);
    expect(b.audio.calls).toContain('restart');
  });

  it('sound-effect mode: / toggles, . steps, ; plays the 1-based effect', async () => {
    const { ctx, audio } = jukeCtx();
    await drive(ctx, jukebox, (t) => t.tap(KEY_SLASH, KEY_PERIOD, KEY_SEMI).wait(10).tap(SC.Escape), 80);
    expect(audio.calls).toContain('sample 2');
  });

  it('leaving by Escape fades the palette to black', async () => {
    const { ctx } = jukeCtx();
    await drive(ctx, jukebox, (t) => t.tap(SC.Escape), 80);
    expect(Array.from(ctx.palette.current).every((v) => v === 0)).toBe(true);
  });
});
