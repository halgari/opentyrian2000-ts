// SPDX-License-Identifier: GPL-2.0-or-later
import type { AudioEngine } from './engine';

type Command =
  | { t: 'init'; music: Uint8Array; sounds: Int16Array[] }
  | { t: 'playSong'; n: number } | { t: 'restartSong' } | { t: 'stopSong' } | { t: 'fadeSong' }
  | { t: 'setVolume'; music: number; sample: number }
  | { t: 'multiSamplePlay'; index: number; chan: number; vol: number }
  | { t: 'flags'; musicDisabled: boolean; samplesDisabled: boolean };

/** Every command carries an increasing `seq`; status echoes the last one the worklet handled. */
export type ToWorklet = Command & { seq: number };

export type FromWorklet = { t: 'status'; seq: number; playing: boolean; songlooped: boolean; songPlaying: number; peak: number };

/** Hosts an AudioEngine behind the worklet message protocol (DOM-free, testable in node). */
export class EngineHost {
  private scratch = new Int16Array(0);
  private lastPlaying = false;
  private lastSongLooped = false;
  private lastSongPlaying = 0;
  private peak = 0;
  private lastSeq = 0;
  private framesSincePeak = 0;

  constructor(private readonly engine: AudioEngine, private readonly post: (m: FromWorklet) => void) {}

  handle(m: ToWorklet): void {
    const e = this.engine;
    this.lastSeq = m.seq;
    switch (m.t) {
      case 'init': e.loadMusic(m.music); e.loadSounds(m.sounds); break;
      case 'playSong': e.playSong(m.n); break;
      case 'restartSong': e.restartSong(); break;
      case 'stopSong': e.stopSong(); break;
      case 'fadeSong': e.fadeSong(); break;
      case 'setVolume': e.setVolume(m.music, m.sample); break;
      case 'multiSamplePlay': e.multiSamplePlay(m.index, m.chan, m.vol); break;
      case 'flags': e.musicDisabled = m.musicDisabled; e.samplesDisabled = m.samplesDisabled; break;
    }
  }

  process(out: Float32Array): void {
    if (this.scratch.length !== out.length) this.scratch = new Int16Array(out.length);
    this.engine.render(this.scratch);
    for (let i = 0; i < out.length; i++) {
      const v = this.scratch[i] / 32768;
      out[i] = v;
      const a = Math.abs(v);
      if (a > this.peak) this.peak = a;
    }
    this.framesSincePeak += out.length;
    const e = this.engine;
    const changed = e.playing !== this.lastPlaying || e.songlooped !== this.lastSongLooped || e.songPlaying !== this.lastSongPlaying;
    const windowDone = this.framesSincePeak >= e.sampleRate / 2;
    if (changed || windowDone) {
      this.lastPlaying = e.playing; this.lastSongLooped = e.songlooped; this.lastSongPlaying = e.songPlaying;
      this.post({
        t: 'status', seq: this.lastSeq,
        playing: this.lastPlaying, songlooped: this.lastSongLooped, songPlaying: this.lastSongPlaying, peak: this.peak,
      });
      if (windowDone) { this.peak = 0; this.framesSincePeak = 0; }
    }
  }
}
