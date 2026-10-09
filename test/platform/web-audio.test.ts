// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import type { FromWorklet, ToWorklet } from '../../src/audio/protocol';
import { NullAudio } from '../../src/platform/audio';
import { WebAudio, createAudioOrNull, type AudioDeps } from '../../src/platform/web-audio';

class FakeNode {
  sent: ToWorklet[] = [];
  port: { postMessage: (m: ToWorklet) => void; onmessage: ((e: { data: FromWorklet }) => void) | null } = {
    postMessage: (m) => { this.sent.push(m); }, onmessage: null,
  };
  connected: unknown = null;
  connect(d: unknown) { this.connected = d; }
}
function fakes() {
  const node = new FakeNode();
  const ctx = { sampleRate: 44100, destination: {}, audioWorklet: { addModule: async () => {} } };
  const deps: AudioDeps = { createNode: () => node as never, workletUrl: 'w.js' };
  return { node, ctx: ctx as never, deps };
}

it('playSample posts multiSamplePlay and init is sent first', async () => {
  const { node, ctx, deps } = fakes();
  const a = await WebAudio.create(ctx, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), {
    ...deps, loadSounds: () => [],
  });
  expect(node.sent[0].t).toBe('init');
  a.playSample(28);
  expect(node.sent.at(-1)).toEqual({ t: 'multiSamplePlay', index: 27, chan: 0, vol: 4 });
  a.musicDisabled = true;
  expect(node.sent.at(-1)).toEqual({ t: 'flags', musicDisabled: true, samplesDisabled: false });
  expect(node.connected).toBe((ctx as { destination: unknown }).destination);
});

it('status updates mirrored getters', async () => {
  const { node, ctx, deps } = fakes();
  const a = await WebAudio.create(ctx, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), { ...deps, loadSounds: () => [] });
  expect(a.playing).toBe(false);
  node.port.onmessage!({ data: { t: 'status', playing: true, songlooped: true, songPlaying: 7, peak: 0.5 } });
  expect([a.playing, a.songlooped, a.songPlaying, a.peak]).toEqual([true, true, 7, 0.5]);
});

it('createAudioOrNull falls back to NullAudio on failure', async () => {
  const warn: unknown[] = [];
  const bad = { audioWorklet: { addModule: async () => { throw new Error('nope'); } }, sampleRate: 44100 };
  const a = await createAudioOrNull(bad as never, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), {
    loadSounds: () => [], warn: (...x) => warn.push(x),
  });
  expect(a).toBeInstanceOf(NullAudio);
  expect(warn.length).toBe(1);
});
