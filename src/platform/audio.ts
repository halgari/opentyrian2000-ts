// SPDX-License-Identifier: GPL-2.0-or-later
// Sound ids from sndmast.h / musmast.h; real output arrives in Sub-project 2.
export const S_SELECT = 8;
export const S_SPRING = 16;
export const S_CLINK = 23;
export const S_CURSOR = 28;
export const V_DANGER = 37;
export const SONG_TITLE = 29;

export interface Audio {
  playSample(n: number): void;
  playSong(n: number): void;
  stopSong(): void;
  setVolume(music: number, sample: number): void;
}

export class NullAudio implements Audio {
  playSample(): void {}
  playSong(): void {}
  stopSong(): void {}
  setVolume(): void {}
}
