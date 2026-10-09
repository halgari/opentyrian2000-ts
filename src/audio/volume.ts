// SPDX-License-Identifier: GPL-2.0-or-later
import { S_CLINK } from './ids';

// port of JE_changeVolume (nortsong.c); set_volume is left to the caller
export function changeVolume(
  music: number, musicDelta: number, sample: number, sampleDelta: number,
  playSample: (n: number) => void,
): { music: number; sample: number } {
  let musicTemp = music + musicDelta;
  let sampleTemp = sample + sampleDelta;

  if (musicDelta) {
    if (musicTemp > 255) { musicTemp = 255; playSample(S_CLINK); }
    else if (musicTemp < 0) { musicTemp = 0; playSample(S_CLINK); }
  }
  if (sampleDelta) {
    if (sampleTemp > 255) { sampleTemp = 255; playSample(S_CLINK); }
    else if (sampleTemp < 0) { sampleTemp = 0; playSample(S_CLINK); }
  }
  return { music: musicTemp, sample: sampleTemp };
}
