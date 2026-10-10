// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it, vi } from 'vitest';
import type { FromWorklet, ToWorklet } from '../../src/audio/protocol';
import { NullAudio } from '../../src/platform/audio';
import { WebAudio, createAudioContext, createAudioOrNull, type AudioDeps } from '../../src/platform/web-audio';

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
  expect(node.sent.at(-1)).toMatchObject({ t: 'multiSamplePlay', index: 27, chan: 0, vol: 4 });
  a.musicDisabled = true;
  expect(node.sent.at(-1)).toMatchObject({ t: 'flags', musicDisabled: true, samplesDisabled: false });
  expect(node.connected).toBe((ctx as { destination: unknown }).destination);
});

it('status updates mirrored getters', async () => {
  const { node, ctx, deps } = fakes();
  const a = await WebAudio.create(ctx, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), { ...deps, loadSounds: () => [] });
  expect(a.playing).toBe(false);
  node.port.onmessage!({ data: { t: 'status', seq: 1, playing: true, songlooped: true, songPlaying: 7, peak: 0.5 } });
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

async function make() {
  const f = fakes();
  const a = await WebAudio.create(f.ctx, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), { ...f.deps, loadSounds: () => [] });
  const status = (seq: number, playing: boolean, songlooped: boolean, songPlaying: number): void =>
    f.node.port.onmessage!({ data: { t: 'status', seq, playing, songlooped, songPlaying, peak: 0 } });
  const lastSeq = () => f.node.sent.at(-1) as { seq: number };
  return { ...f, a, status, lastSeq };
}

it('commands carry increasing seq', async () => {
  const { a, node } = await make();
  a.stopSong(); a.fadeSong(); a.setVolume(1, 2);
  const seqs = node.sent.map((m) => m.seq);
  expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
  expect(new Set(seqs).size).toBe(seqs.length);
});

it('playSong updates the mirror immediately, per play_song', async () => {
  const { a, node } = await make();
  a.playSong(0); // same as songPlaying: no change
  expect([a.playing, a.songlooped, a.songPlaying]).toEqual([false, false, 0]);
  node.port.onmessage!({ data: { t: 'status', seq: 99, playing: false, songlooped: true, songPlaying: 0, peak: 0 } });
  a.playSong(5);
  expect([a.playing, a.songlooped, a.songPlaying]).toEqual([true, false, 5]);
  a.playSong(999); // out of range: songPlaying set, lds state untouched
  expect([a.playing, a.songlooped, a.songPlaying]).toEqual([true, false, 999]);
});

it('restartSong sets playing and clears songlooped immediately', async () => {
  const { a, status, lastSeq } = await make();
  status(lastSeq().seq, false, true, 3);
  expect([a.playing, a.songlooped]).toEqual([false, true]);
  a.restartSong();
  expect([a.playing, a.songlooped]).toEqual([true, false]);
});

it('stale status is ignored, later status applied', async () => {
  const { a, status, lastSeq } = await make();
  a.playSong(7);
  const seq = lastSeq().seq;
  status(seq - 1, false, true, 0); // computed before the worklet saw playSong
  expect([a.playing, a.songlooped, a.songPlaying]).toEqual([true, false, 7]);
  status(seq, true, false, 7);
  expect(a.songPlaying).toBe(7);
  status(seq, false, true, 7); // worklet-originated: song ended/looped
  expect([a.playing, a.songlooped]).toEqual([false, true]);
});

it('stop/fade/volume post the right messages', async () => {
  const { a, node } = await make();
  a.restartSong(); a.stopSong(); a.fadeSong(); a.setVolume(10, 20);
  expect(node.sent.slice(-4)).toMatchObject([
    { t: 'restartSong' }, { t: 'stopSong' }, { t: 'fadeSong' }, { t: 'setVolume', music: 10, sample: 20 },
  ]);
});

it('createAudioOrNull with no context yields NullAudio', async () => {
  const warn = vi.fn();
  const a = await createAudioOrNull(null, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), { warn });
  expect(a).toBeInstanceOf(NullAudio);
  expect(warn).toHaveBeenCalled();
});

it('createAudioContext retries without sampleRate when 44100 is refused', () => {
  const calls: unknown[] = [];
  class Fake {
    constructor(o?: unknown) { calls.push(o); if (o) throw new Error('NotSupportedError'); }
    resume() { return Promise.reject(new Error('x')); }
  }
  const warn = vi.fn();
  const ac = createAudioContext(Fake as never, warn);
  expect(ac).toBeInstanceOf(Fake);
  expect(calls).toEqual([{ sampleRate: 44100 }, undefined]);
});

it('createAudioContext returns null when construction always fails', () => {
  class Bad { constructor() { throw new Error('no'); } }
  expect(createAudioContext(Bad as never, () => {})).toBeNull();
});

it('falls back to workletFallbackUrl when the primary module fails to load', async () => {
  const { ctx, deps } = fakes();
  const tried: string[] = [];
  (ctx as { audioWorklet: { addModule: (u: string) => Promise<void> } }).audioWorklet.addModule = async (u) => {
    tried.push(u);
    if (u === 'blob:x') throw new Error('refused');
  };
  await WebAudio.create(ctx, new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), {
    ...deps, workletUrl: 'blob:x', workletFallbackUrl: 'data:y', loadSounds: () => [], warn: () => {},
  });
  expect(tried).toEqual(['blob:x', 'data:y']);
});
