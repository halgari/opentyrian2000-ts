// SPDX-License-Identifier: GPL-2.0-or-later
import { CRand } from './crand';
import { FX_PLAY_VOL } from './ids';
import { LdsPlayer } from './lds';
import { type MusicFile, parseMusicFile, songBytes } from './music-file';
import { Opl } from './opl';
import { buildVolumeFactorTable } from './volume-table';

const LDS_UPDATE2_RATE = 139; // 69.5 * 2
const CHANNEL_COUNT = 8;
const CHANNEL_VOLUME_LEVELS = 8;

class Channel {
  samples: Int16Array | null = null;
  pos = 0;
  remaining = 0;
  volume = 0;
}

// port of loudness.c
export class AudioEngine {
  musicDisabled = false;
  samplesDisabled = false;
  songPlaying = 0;
  private stopped = true;

  private musicVolume = 255;
  private sampleVolume = 255;
  private readonly volumeFactorTable = buildVolumeFactorTable();
  private readonly opl: Opl;
  private readonly lds: LdsPlayer;
  private readonly samplesPerLdsUpdate: number;
  private readonly samplesPerLdsUpdateFrac: number;
  private samplesUntilLdsUpdate = 0;
  private samplesUntilLdsUpdateFrac = 0;
  private music: MusicFile | null = null;
  private sounds: Int16Array[] = [];
  private readonly channels: Channel[] = Array.from({ length: CHANNEL_COUNT }, () => new Channel());

  // port of init_audio (loudness.c)
  constructor(readonly sampleRate: number) {
    this.samplesPerLdsUpdate = 2 * Math.floor(sampleRate / LDS_UPDATE2_RATE);
    this.samplesPerLdsUpdateFrac = 2 * (sampleRate % LDS_UPDATE2_RATE);
    this.opl = new Opl(new CRand());
    this.opl.init(sampleRate);
    this.lds = new LdsPlayer(this.opl, sampleRate);
  }

  get playing(): boolean { return this.lds.playing; }
  get songlooped(): boolean { return this.lds.songlooped; }
  get musicStopped(): boolean { return this.stopped; }

  // port of load_music (loudness.c)
  loadMusic(bytes: Uint8Array): void {
    if (this.music === null) this.music = parseMusicFile(bytes);
  }

  loadSounds(sounds: Int16Array[]): void { this.sounds = sounds; }

  // port of load_song (loudness.c)
  private loadSong(songNum: number): void {
    const data = this.music ? songBytes(this.music, songNum) : null;
    if (data) this.lds.load(data);
    else console.warn(`warning: failed to load song ${songNum + 1}`);
  }

  // port of play_song (loudness.c)
  playSong(n: number): void {
    if (n !== this.songPlaying) {
      this.stopped = true;
      this.loadSong(n);
      this.songPlaying = n;
    }
    this.stopped = false;
  }

  // port of restart_song (loudness.c)
  restartSong(): void {
    this.lds.rewind();
    this.stopped = false;
  }

  // port of stop_song (loudness.c)
  stopSong(): void { this.stopped = true; }

  // port of fade_song (loudness.c)
  fadeSong(): void { this.lds.fade(1); }

  // port of set_volume (loudness.c)
  setVolume(music: number, sample: number): void {
    this.musicVolume = music & 0xff;
    this.sampleVolume = sample & 0xff;
  }

  // port of multiSamplePlay (loudness.c); soundIndex0 indexes the loaded sounds
  multiSamplePlay(soundIndex0: number, chan: number, vol: number): void {
    if (this.samplesDisabled) return;
    const s = this.sounds[soundIndex0];
    const c = this.channels[chan];
    c.samples = s ?? null;
    c.pos = 0;
    c.remaining = s ? s.length : 0;
    c.volume = vol;
  }

  // port of JE_playSampleNum (nortsong.c)
  playSample(n: number): void { this.multiSamplePlay(n - 1, 0, FX_PLAY_VOL); }

  // port of audioCallback (loudness.c)
  render(out: Int16Array): void {
    const samplesCount = out.length;

    if (!this.musicDisabled && !this.stopped) {
      let off = 0;
      let remainingCount = samplesCount;
      while (remainingCount > 0) {
        if (this.samplesUntilLdsUpdate === 0) {
          this.lds.update();
          this.samplesUntilLdsUpdate += this.samplesPerLdsUpdate;
          this.samplesUntilLdsUpdateFrac += this.samplesPerLdsUpdateFrac;
          if (this.samplesUntilLdsUpdateFrac >= LDS_UPDATE2_RATE) {
            this.samplesUntilLdsUpdate += 1;
            this.samplesUntilLdsUpdateFrac -= LDS_UPDATE2_RATE;
          }
        }
        const count = Math.min(this.samplesUntilLdsUpdate, remainingCount);
        this.opl.getSample(out, off, count);
        off += count;
        remainingCount -= count;
        this.samplesUntilLdsUpdate -= count;
      }
    } else {
      out.fill(0);
    }

    const musicVolumeFactor = (this.volumeFactorTable[this.musicVolume] * 2) | 0; // OPL emulator is too quiet

    if (this.samplesDisabled && !this.musicDisabled) {
      for (let i = 0; i < samplesCount; i++) {
        const sample = (out[i] * musicVolumeFactor) | 0;
        out[i] = Math.min(Math.max(-32768, sample >> 12), 32767);
      }
    } else if (!this.samplesDisabled) {
      const sampleVolumeFactor = this.volumeFactorTable[this.sampleVolume];
      const factors: number[] = [];
      for (let i = 0; i < CHANNEL_VOLUME_LEVELS; i++) {
        factors.push(Math.trunc((sampleVolumeFactor * (i + 1)) / CHANNEL_VOLUME_LEVELS));
      }
      for (let n = 0; n < samplesCount; n++) {
        let sample = (out[n] * musicVolumeFactor) | 0;
        for (let i = 0; i < CHANNEL_COUNT; i++) {
          const c = this.channels[i];
          if (c.remaining > 0) {
            sample = (sample + c.samples![c.pos] * factors[c.volume]) | 0;
            c.pos += 1;
            c.remaining -= 1;
          }
        }
        out[n] = Math.min(Math.max(-32768, sample >> 12), 32767);
      }
    }
  }
}
