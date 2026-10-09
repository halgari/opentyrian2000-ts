// SPDX-License-Identifier: GPL-2.0-or-later
import { FX_PLAY_VOL, MUSIC_NUM } from '../audio/ids';
import type { FromWorklet, ToWorklet } from '../audio/protocol';
import { loadSounds as defaultLoadSounds } from '../audio/sound-file';
import workletUrl from '../audio/worklet.ts?worker&url';
import { NullAudio, type Audio } from './audio';

interface NodeLike {
  port: { postMessage(m: ToWorklet, transfer?: Transferable[]): void; onmessage: ((e: { data: FromWorklet }) => void) | null };
  connect(dest: unknown): unknown;
  onprocessorerror?: ((e: unknown) => void) | null;
}

type Command = ToWorklet extends infer T ? (T extends unknown ? Omit<T, 'seq'> : never) : never;

/** Injection points for tests. */
export interface AudioDeps {
  createNode?: (ctx: AudioContext) => NodeLike;
  workletUrl?: string;
  loadSounds?: typeof defaultLoadSounds;
  warn?: (...args: unknown[]) => void;
}

export class WebAudio implements Audio {
  private _playing = false;
  private _songlooped = false;
  private _songPlaying = 0;
  private _peak = 0;
  private _musicDisabled = false;
  private _samplesDisabled = false;
  private seq = 0;

  private constructor(private readonly node: NodeLike, warn: (...args: unknown[]) => void) {
    node.onprocessorerror = (e) => warn('Audio processor error:', e);
    node.port.onmessage = (e) => {
      const m = e.data;
      if (m.t !== 'status') return;
      // Ignore status computed before the worklet saw our latest command.
      if (m.seq < this.seq) return;
      this._playing = m.playing; this._songlooped = m.songlooped; this._songPlaying = m.songPlaying; this._peak = m.peak;
    };
  }

  get playing(): boolean { return this._playing; }
  get songlooped(): boolean { return this._songlooped; }
  get songPlaying(): number { return this._songPlaying; }
  get peak(): number { return this._peak; }

  static async create(
    ctx: AudioContext, music: Uint8Array, tyrianSnd: Uint8Array, voicesSnd: Uint8Array, deps: AudioDeps = {},
  ): Promise<WebAudio> {
    await ctx.audioWorklet.addModule(deps.workletUrl ?? workletUrl);
    const node = deps.createNode
      ? deps.createNode(ctx)
      : (new AudioWorkletNode(ctx, 'tyrian-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }) as unknown as NodeLike);
    node.connect(ctx.destination);
    const sounds = (deps.loadSounds ?? defaultLoadSounds)(tyrianSnd, voicesSnd, ctx.sampleRate);
    const audio = new WebAudio(node, deps.warn ?? console.warn);
    // Decoded sound buffers are ours alone; transfer them instead of copying.
    const transfer: Transferable[] = [];
    for (const snd of sounds) {
      if (snd.byteOffset === 0 && snd.byteLength === snd.buffer.byteLength && !transfer.includes(snd.buffer)) transfer.push(snd.buffer);
    }
    audio.post({ t: 'init', music, sounds }, transfer);
    return audio;
  }

  private post(m: Command, transfer?: Transferable[]): void {
    this.node.port.postMessage({ ...m, seq: ++this.seq } as ToWorklet, transfer);
  }
  private postFlags(): void {
    this.post({ t: 'flags', musicDisabled: this._musicDisabled, samplesDisabled: this._samplesDisabled });
  }

  get musicDisabled(): boolean { return this._musicDisabled; }
  set musicDisabled(v: boolean) { this._musicDisabled = v; this.postFlags(); }
  get samplesDisabled(): boolean { return this._samplesDisabled; }
  set samplesDisabled(v: boolean) { this._samplesDisabled = v; this.postFlags(); }

  // The C sets these synchronously on the caller's thread (play_song / lds_rewind), so mirror them now.
  // port of play_song (loudness.c)
  playSong(n: number): void {
    if (n !== this._songPlaying) {
      if (n >= 0 && n < MUSIC_NUM) { this._playing = true; this._songlooped = false; } // load_song -> lds_load -> lds_rewind
      this._songPlaying = n;
    }
    this.post({ t: 'playSong', n });
  }
  // port of restart_song (loudness.c)
  restartSong(): void {
    this._playing = true; this._songlooped = false; // lds_rewind
    this.post({ t: 'restartSong' });
  }
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

/** Create the AudioContext at the game's 44100 Hz, falling back to the device rate if the browser refuses. */
export function createAudioContext(
  Ctor: new (options?: AudioContextOptions) => AudioContext = AudioContext,
  warn: (...args: unknown[]) => void = console.warn,
): AudioContext | null {
  let ac: AudioContext;
  try {
    ac = new Ctor({ sampleRate: 44100 });
  } catch (err) {
    warn('AudioContext at 44100 Hz refused, using device rate:', err);
    try {
      ac = new Ctor();
    } catch (err2) {
      warn('AudioContext unavailable:', err2);
      return null;
    }
  }
  try {
    void Promise.resolve(ac.resume()).catch((err: unknown) => warn('AudioContext resume failed:', err));
  } catch (err) {
    warn('AudioContext resume failed:', err);
  }
  return ac;
}
