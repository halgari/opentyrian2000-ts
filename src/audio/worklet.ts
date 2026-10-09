// SPDX-License-Identifier: GPL-2.0-or-later
import { AudioEngine } from './engine';
import { EngineHost, type ToWorklet } from './protocol';

// Minimal AudioWorkletGlobalScope typings (not in lib.dom).
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

class TyrianAudioProcessor extends AudioWorkletProcessor {
  private readonly host: EngineHost;
  constructor() {
    super();
    this.host = new EngineHost(new AudioEngine(sampleRate), (m) => this.port.postMessage(m));
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => this.host.handle(e.data);
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    this.host.process(outputs[0][0]);
    return true;
  }
}

registerProcessor('tyrian-audio', TyrianAudioProcessor);
