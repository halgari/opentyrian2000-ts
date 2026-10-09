// SPDX-License-Identifier: GPL-2.0-or-later
// Sound ids from sndmast.h / musmast.h; real output arrives in Sub-project 2.
export { S_SELECT, S_SPRING, S_CLINK, S_CURSOR, V_DANGER, SONG_TITLE } from '../audio/ids';

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
