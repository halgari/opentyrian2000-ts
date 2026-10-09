# OpenTyrian2000-TS — Sub-project 2 (Audio)

Date: 2026-10-09
Status: approved to proceed autonomously ("continue, merge as needed")
Parent: `2026-10-09-foundation-design.md` (architecture rules §3 apply)

## 1. Goal

Music and sound effects, matching OpenTyrian2000 at the pinned commit.

Done means all of the following:
- **Music is exact.** The OPL2 emulator (`opl.c`) and LDS player (`lds_play.c`) are
  ported so that, for a given song, the TS output is **sample-identical** to the C at
  44100 Hz. Golden PCM tests check this.
- **The mixer is exact.** The mixer from `loudness.c audioCallback` (volume table, the
  Q20.12 fixed point, 8 sample channels, clamping) is ported exactly. A golden test
  covers mixed music at reduced volume.
- **It plays in the browser.** Music and SFX play through an AudioWorklet. The title
  music starts on the title screen and menu sounds play.

## 2. C sources

| C | TS | notes |
|---|---|---|
| `opl.c` (DOSBox OPL2, Ken Silverman lineage) | `src/audio/opl.ts` | `fltype` is double, which JS numbers match. Uses libc `rand()` for the percussion noise bit. |
| `lds_play.c` | `src/audio/lds.ts` | Loudness sound system player. |
| `loudness.c` | `src/audio/engine.ts` | Song table, volume table, LDS update cadence, mixer. |
| `nortsong.c loadSndFile`, `JE_playSampleNum`, `JE_changeVolume` | `src/audio/sound-file.ts`, `src/platform/audio.ts` | |
| `sndmast.h`, `musmast.h` | `src/audio/ids.ts` | Sound and song ids. |

`rand()` in `opl.c` is glibc `rand()` and is never seeded (so seed 1). It is ported as
`src/audio/crand.ts`, a glibc `random_r` TYPE_3 port, so percussion noise matches the
oracle. The audio RNG is separate from the game's Mersenne Twister.

## 3. Design

### 3.1 Pure engine
`AudioEngine` is plain TypeScript with no Web Audio dependency. It is constructed with a
sample rate and holds the whole state of `loudness.c`, `lds_play.c` and `opl.c`, ported
from C globals into instance fields: one `Opl`, one `LdsPlayer`, and the mixer.

`render(out: Int16Array)` is the exact port of `audioCallback`. That keeps the engine
deterministic and testable in Node.

LDS updates happen at 69.5 Hz, using the same integer and fractional accumulation as the C
(`ldsUpdate2Rate = 139`).

### 3.2 Sample rate
The engine runs at 44100 Hz, the C's requested rate (`11025 * OUTPUT_QUALITY`). The browser
`AudioContext` is created with `{ sampleRate: 44100 }`. If the browser refuses, the engine
runs at the context's actual rate. The C supports this too: the device may return a
different `got.freq`.

### 3.3 SFX resampling
**SFX resampling is a deliberate non-exact area.** The C converts the 8-bit signed 11025 Hz
samples to s16 at the output rate using `SDL_ConvertAudio`. That is SDL's resampler, which
is a platform detail that differs between SDL versions.

The TS version converts s8 to s16 as `v << 8`, then resamples by linear interpolation to
`round(n * rate / 11025)` samples (exactly 4n at 44100).

Mixer behaviour (channels, volumes, cut-off) stays exact.

### 3.4 Sound files
`tyrian.snd` has 31 SFX and `voices.snd` (or `voicesc.snd` for xmas) has 9 voices. Each
file is a u16 count, then u32 offsets, then s8 PCM. Voice clips drop their last 100 bytes.
This is a port of `loadSndFile`, including its validation.

### 3.5 Browser plumbing
`src/audio/worklet.ts` is an `AudioWorkletProcessor` that owns an `AudioEngine`. It
renders 128-frame blocks into an Int16 scratch buffer and converts them to float32
(`/32768`).

`src/platform/web-audio.ts` implements the `Audio` interface:
- It posts commands to the worklet: init with the music and sound bytes, play/stop/restart/
  fade song, set volume, multi-sample play, and the music/samples disabled flags.
- It mirrors `playing`, `songlooped` and `songPlaying`, which the worklet posts whenever
  they change. The game reads these: game over waits for `!playing`, and the jukebox will
  read them. Transitions the audio thread makes on its own (song ended, looped) may lag by
  a message, as in the C. Side effects the C applies synchronously on the caller's thread
  (`play_song` setting `song_playing`; `lds_rewind` setting `playing = true`, `songlooped =
  false`) are applied locally by `WebAudio` at call time. Each command carries a `seq`; the
  worklet echoes the last handled `seq` in `status`, and `WebAudio` applies a status only if
  its `seq` is not older than the last command sent.

The `AudioContext` is created at the start gesture, which already exists in `main.ts`, so
it is allowed to start. If AudioWorklet is unavailable or init throws, the game falls back
to `NullAudio` and logs a warning. This is the C's `audio_disabled` path.

### 3.6 Audio interface
`src/platform/audio.ts` changes from a stub to a full interface:

```ts
interface Audio {
  playSong(n: number): void; // play_song, 0-based
  restartSong(): void;
  stopSong(): void;
  fadeSong(): void;
  setVolume(music: number, sample: number): void;
  multiSamplePlay(soundIndex0: number, chan: number, vol: number): void;
  playSample(n: number): void; // JE_playSampleNum: 1-based, chan 0, vol fxPlayVol=4
  musicDisabled: boolean;
  samplesDisabled: boolean;
  readonly playing: boolean;
  readonly songlooped: boolean;
  readonly songPlaying: number;
}
```

- **Volumes:** `JE_changeVolume` moves into `src/audio/volume.ts` as a pure function that
  needs a `playSample` callback. The volumes default to 191/191, the C's
  missing-config defaults. `config.c` itself is ported in sub-project 4.
- **Ids:** all ids move to `src/audio/ids.ts`: the S_/V_ constants, the SONG_ constants and
  `MUSIC_NUM`. The music and sound title strings are deferred to the jukebox and game flow.

## 4. Testing

### 4.1 Audio oracle
`tools/oracle/audio-render.c` is a standalone harness. It compiles against the pinned
reference's `opl.c`, `lds_play.c` and `file.c` plus stubs, without SDL audio or a device.

- **Inputs:** `music.mus` path, song index, sample count, music volume, an optional fade
  start (in samples), and an output path.
- **What it does:** it runs a verbatim copy of the music path of `audioCallback`
  (callback-sized chunks of 1024 samples, the same LDS cadence) and writes raw s16le.
- **Other modes:** a second mode writes the raw `opl_update` output with no volume
  applied, and a third mode dumps `volumeFactorTable` (256 × s32).
- **Build and run:** `tools/oracle/build.sh` builds it next to the patched game, and
  `tools/oracle/run.ts` gains audio scenarios writing into `test-data/oracle/audio/`.

### 4.2 Golden tests (skipped when the oracle data is absent)
- **Volume table:** TS equals the C table for all 256 entries.
- **Raw OPL output:**
  - song 29 (title), first 10 s;
  - one percussion-mode song (`regbd & 0x20`), first 10 s;
  - one song rendered past its loop point, which checks `songlooped`.
- **Mixed output:** song 29 at music volume 191, and a fade started at 2 s.

### 4.3 Unit tests
- glibc `rand` sequence for seed 1.
- `.snd` parsing and errors.
- The resampler's length and endpoints.
- Mixer channel behaviour: a new sample on a channel replaces the old one, and the
  volume levels.
- `JE_changeVolume` clamping and the clink sound.
- The worklet message protocol, using a fake port.

### 4.4 Browser smoke test
Run the preview build headless. Confirm the worklet loads, the engine reports
`playing = true` on the title screen, and rendered blocks are not silent. A debug
`window.__audio` hook exposes the peak level when `?debug` is present.

## 5. Out of scope
- The jukebox screen and setup-menu volume UI. Those belong to sub-project 4/5; the
  interface supports them.
- `TYRIAN.CFG` load/save.
- MIDI and other output devices.
- Single-file worklet inlining, which is sub-project 5. Vite's `?worker&url` import is
  used for now.
