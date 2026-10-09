// SPDX-License-Identifier: GPL-2.0-or-later
// Ids are re-exported for screens; the real ids live in src/audio/ids.ts.
export { S_SELECT, S_SPRING, S_CLINK, S_CURSOR, V_DANGER, SONG_TITLE } from '../audio/ids';

export interface Audio {
  playSong(n: number): void; // play_song, 0-based
  restartSong(): void;
  stopSong(): void;
  fadeSong(): void;
  setVolume(music: number, sample: number): void;
  multiSamplePlay(soundIndex0: number, chan: number, vol: number): void;
  playSample(n: number): void; // JE_playSampleNum: 1-based, chan 0, vol FX_PLAY_VOL
  musicDisabled: boolean;
  samplesDisabled: boolean;
  readonly playing: boolean;
  readonly songlooped: boolean;
  readonly songPlaying: number;
}

export class NullAudio implements Audio {
  musicDisabled = false;
  samplesDisabled = false;
  readonly playing = false;
  readonly songlooped = false;
  readonly songPlaying = 0;
  playSong(): void {}
  restartSong(): void {}
  stopSong(): void {}
  fadeSong(): void {}
  setVolume(): void {}
  multiSamplePlay(): void {}
  playSample(): void {}
}
