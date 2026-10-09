// SPDX-License-Identifier: GPL-2.0-or-later
import type { AudioEngine } from './engine';

export type ToWorklet =
  | { t: 'init'; music: Uint8Array; sounds: Int16Array[] }
  | { t: 'playSong'; n: number } | { t: 'restartSong' } | { t: 'stopSong' } | { t: 'fadeSong' }
  | { t: 'setVolume'; music: number; sample: number }
  | { t: 'multiSamplePlay'; index: number; chan: number; vol: number }
  | { t: 'flags'; musicDisabled: boolean; samplesDisabled: boolean };

export type FromWorklet = { t: 'status'; playing: boolean; songlooped: boolean; songPlaying: number; peak: number };

/** Hosts an AudioEngine behind the worklet message protocol (DOM-free, testable in node). */
export class EngineHost {
  private scratch = new Int16Array(0);
  private last = { playing: false, songlooped: false, songPlaying: 0 };
  private peak = 0;
  private framesSincePeak = 0;

  constructor(private readonly engine: AudioEngine, private readonly post: (m: FromWorklet) => void) {}

  handle(m: ToWorklet): void {
    const e = this.engine;
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
    const changed = e.playing !== this.last.playing || e.songlooped !== this.last.songlooped || e.songPlaying !== this.last.songPlaying;
    const windowDone = this.framesSincePeak >= e.sampleRate / 2;
    if (changed || windowDone) {
      this.last = { playing: e.playing, songlooped: e.songlooped, songPlaying: e.songPlaying };
      this.post({ t: 'status', ...this.last, peak: this.peak });
      if (windowDone) { this.peak = 0; this.framesSincePeak = 0; }
    }
  }
}
