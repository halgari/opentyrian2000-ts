// SPDX-License-Identifier: GPL-2.0-or-later
import { FX_PLAY_VOL } from '../audio/ids';
import type { FromWorklet, ToWorklet } from '../audio/protocol';
import { loadSounds as defaultLoadSounds } from '../audio/sound-file';
import workletUrl from '../audio/worklet.ts?worker&url';
import { NullAudio, type Audio } from './audio';

interface NodeLike {
  port: { postMessage(m: ToWorklet, transfer?: Transferable[]): void; onmessage: ((e: { data: FromWorklet }) => void) | null };
  connect(dest: unknown): unknown;
}

/** Injection points for tests. */
export interface AudioDeps {
  createNode?: (ctx: AudioContext) => NodeLike;
  workletUrl?: string;
  loadSounds?: typeof defaultLoadSounds;
  warn?: (...args: unknown[]) => void;
}

export class WebAudio implements Audio {
  playing = false;
  songlooped = false;
  songPlaying = 0;
  peak = 0;
  private _musicDisabled = false;
  private _samplesDisabled = false;

  private constructor(private readonly node: NodeLike) {
    node.port.onmessage = (e) => {
      const m = e.data;
      if (m.t !== 'status') return;
      this.playing = m.playing; this.songlooped = m.songlooped; this.songPlaying = m.songPlaying; this.peak = m.peak;
    };
  }

  static async create(
    ctx: AudioContext, music: Uint8Array, tyrianSnd: Uint8Array, voicesSnd: Uint8Array, deps: AudioDeps = {},
  ): Promise<WebAudio> {
    await ctx.audioWorklet.addModule(deps.workletUrl ?? workletUrl);
    const node = deps.createNode
      ? deps.createNode(ctx)
      : (new AudioWorkletNode(ctx, 'tyrian-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }) as unknown as NodeLike);
    node.connect(ctx.destination);
    const sounds = (deps.loadSounds ?? defaultLoadSounds)(tyrianSnd, voicesSnd, ctx.sampleRate);
    const audio = new WebAudio(node);
    audio.post({ t: 'init', music, sounds });
    return audio;
  }

  private post(m: ToWorklet): void { this.node.port.postMessage(m); }
  private postFlags(): void {
    this.post({ t: 'flags', musicDisabled: this._musicDisabled, samplesDisabled: this._samplesDisabled });
  }

  get musicDisabled(): boolean { return this._musicDisabled; }
  set musicDisabled(v: boolean) { this._musicDisabled = v; this.postFlags(); }
  get samplesDisabled(): boolean { return this._samplesDisabled; }
  set samplesDisabled(v: boolean) { this._samplesDisabled = v; this.postFlags(); }

  playSong(n: number): void { this.post({ t: 'playSong', n }); }
  restartSong(): void { this.post({ t: 'restartSong' }); }
  stopSong(): void { this.post({ t: 'stopSong' }); }
  fadeSong(): void { this.post({ t: 'fadeSong' }); }
  setVolume(music: number, sample: number): void { this.post({ t: 'setVolume', music, sample }); }
  multiSamplePlay(index: number, chan: number, vol: number): void { this.post({ t: 'multiSamplePlay', index, chan, vol }); }
  playSample(n: number): void { this.multiSamplePlay(n - 1, 0, FX_PLAY_VOL); }
}

/** The C's audio_disabled path: any failure yields a silent game plus a warning. */
export async function createAudioOrNull(
  ctx: AudioContext | null, music: Uint8Array, tyrianSnd: Uint8Array, voicesSnd: Uint8Array, deps: AudioDeps = {},
): Promise<Audio> {
  try {
    if (!ctx) throw new Error('AudioContext unavailable');
    return await WebAudio.create(ctx, music, tyrianSnd, voicesSnd, deps);
  } catch (err) {
    (deps.warn ?? console.warn)('Audio disabled:', err);
    return new NullAudio();
  }
}
