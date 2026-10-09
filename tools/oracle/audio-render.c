/* SPDX-License-Identifier: GPL-2.0-or-later */
/*
 * Audio oracle: renders reference PCM from the original C music path.
 *
 * usage: audio-render <music.mus> <song0based> <nsamples> <mode> <musicVolume> <fadeAtSample|-1> <out>
 *   mode raw      : concatenated opl_update output, no volume applied
 *   mode mixed    : audioCallback music path (samples_disabled && !music_disabled)
 *   mode voltable : 256 x s32le volumeFactorTable, no song
 * raw/mixed also write <out>.json {"loopedAtSample":n|-1,"stoppedAtSample":n|-1}.
 * Those are the absolute sample index of the first output sample produced after
 * the lds_update() call that left songlooped / playing in that state.
 * Built from sources in reference/oracle/src (the patched tree).
 */
#include "file.h"
#include "lds_play.h"
#include "opentyr.h"
#include "opl.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int audioSampleRate = 44100;
bool music_stopped = false, music_disabled = false, samples_disabled = true;

/* verbatim from loudness.c */
static const float volumeRange = 30.0f;  // dB
static Sint32 volumeFactorTable[256];
#define TO_FIXED(x) ((Sint32)((x) * (1 << 12)))
#define FIXED_TO_INT(x) ((Sint32)((x) >> 12))
static const int ldsUpdate2Rate = 139;  // 69.5 * 2
static int samplesPerLdsUpdate;
static int samplesPerLdsUpdateFrac;
static int samplesUntilLdsUpdate = 0;
static int samplesUntilLdsUpdateFrac = 0;

static long loopedAt = -1, stoppedAt = -1;
static long chunkBase = 0;

static void audioCallback(Sint16 *samples, int samplesCount, int apply_volume, Uint8 musicVolume)
{
	if (!music_disabled && !music_stopped)
	{
		Sint16 *remaining = samples;
		int remainingCount = samplesCount;
		while (remainingCount > 0)
		{
			if (samplesUntilLdsUpdate == 0)
			{
				lds_update();

				/* oracle bookkeeping only */
				if (songlooped && loopedAt < 0) loopedAt = chunkBase + (remaining - samples);
				if (!playing && stoppedAt < 0) stoppedAt = chunkBase + (remaining - samples);

				/* verbatim from loudness.c */
				// The number of samples that should be produced per Loudness
				// update is not an integer, but we can only produce an integer
				// number of samples, so we accumulate the fractional samples
				// until it amounts to a whole sample.
				samplesUntilLdsUpdate += samplesPerLdsUpdate;
				samplesUntilLdsUpdateFrac += samplesPerLdsUpdateFrac;
				if (samplesUntilLdsUpdateFrac >= ldsUpdate2Rate)
				{
					samplesUntilLdsUpdate += 1;
					samplesUntilLdsUpdateFrac -= ldsUpdate2Rate;
				}
			}

			int count = MIN(samplesUntilLdsUpdate, remainingCount);

			opl_update(remaining, count); /* verbatim from loudness.c */

			remaining += count;
			remainingCount -= count;

			samplesUntilLdsUpdate -= count;
		}
	}
	else
	{
		for (int i = 0; i < samplesCount; ++i)
			samples[i] = 0;
	}

	if (!apply_volume)
		return;

	/* verbatim from loudness.c */
	Sint32 musicVolumeFactor = volumeFactorTable[musicVolume];
	musicVolumeFactor *= 2;  // OPL emulator is too quiet

	if (samples_disabled && !music_disabled)
	{
		// Mix music
		Sint16 *remaining = samples;
		int remainingCount = samplesCount;
		while (remainingCount > 0)
		{
			Sint32 sample = *remaining * musicVolumeFactor;

			sample = FIXED_TO_INT(sample);
			*remaining = MIN(MAX(INT16_MIN, sample), INT16_MAX);

			remaining += 1;
			remainingCount -= 1;
		}
	}
}

int main(int argc, char **argv)
{
	if (argc != 8)
	{
		fprintf(stderr, "usage: %s <music.mus> <song0based> <nsamples> <raw|mixed|voltable> <musicVolume> <fadeAt|-1> <out>\n", argv[0]);
		return 2;
	}
	const char *musPath = argv[1];
	unsigned int songNum = (unsigned int)atoi(argv[2]);
	long nsamples = atol(argv[3]);
	const char *mode = argv[4];
	Uint8 musicVolume = (Uint8)atoi(argv[5]);
	long fadeAt = atol(argv[6]);
	const char *outPath = argv[7];

	/* verbatim from loudness.c (init_audio) */
	samplesPerLdsUpdate = 2 * (audioSampleRate / ldsUpdate2Rate);
	samplesPerLdsUpdateFrac = 2 * (audioSampleRate % ldsUpdate2Rate);

	volumeFactorTable[0] = 0;
	for (size_t i = 1; i < 256; ++i)
		volumeFactorTable[i] = TO_FIXED(powf(10, (255 - i) * (-volumeRange / (20.0f * 255))));

	FILE *out = fopen(outPath, "wb");
	if (!out) { perror(outPath); return 1; }

	if (strcmp(mode, "voltable") == 0)
	{
		for (int i = 0; i < 256; ++i)
		{
			Uint8 b[4];
			Uint32 v = (Uint32)volumeFactorTable[i];
			b[0] = v & 0xff; b[1] = (v >> 8) & 0xff; b[2] = (v >> 16) & 0xff; b[3] = (v >> 24) & 0xff;
			fwrite(b, 1, 4, out);
		}
		fclose(out);
		return 0;
	}

	int apply_volume;
	if (strcmp(mode, "raw") == 0) apply_volume = 0;
	else if (strcmp(mode, "mixed") == 0) apply_volume = 1;
	else { fprintf(stderr, "bad mode %s\n", mode); return 2; }

	if (fadeAt >= 0 && fadeAt % 1024 != 0)
	{
		fprintf(stderr, "fadeAt must be a multiple of 1024\n");
		return 2;
	}

	/* load_music / load_song, as in loudness.c */
	FILE *music_file = fopen(musPath, "rb");
	if (!music_file) { perror(musPath); return 1; }
	Uint16 song_count = 0;
	fread_u16_die(&song_count, 1, music_file);
	Uint32 *song_offset = malloc((song_count + 1) * sizeof(*song_offset));
	fread_u32_die(song_offset, song_count, music_file);
	song_offset[song_count] = ftell_eof(music_file);
	if (songNum >= song_count) { fprintf(stderr, "song out of range\n"); return 1; }
	unsigned int song_size = song_offset[songNum + 1] - song_offset[songNum];

	opl_init(); /* init_audio calls opl_init() before any song */
	if (!lds_load(music_file, song_offset[songNum], song_size)) return 1; /* ends with lds_rewind(): playing = true */
	music_stopped = false;

	enum { CHUNK = 1024 };
	Sint16 buf[CHUNK];
	for (chunkBase = 0; chunkBase < nsamples; chunkBase += CHUNK)
	{
		if (fadeAt >= 0 && chunkBase == fadeAt)
			lds_fade(1);
		int n = (int)MIN((long)CHUNK, nsamples - chunkBase);
		audioCallback(buf, n, apply_volume, musicVolume);
		for (int i = 0; i < n; ++i)
		{
			Uint8 b[2] = { (Uint8)(buf[i] & 0xff), (Uint8)(((Uint16)buf[i]) >> 8) };
			fwrite(b, 1, 2, out);
		}
	}
	fclose(out);

	char jpath[4096];
	snprintf(jpath, sizeof jpath, "%s.json", outPath);
	FILE *j = fopen(jpath, "w");
	if (!j) { perror(jpath); return 1; }
	fprintf(j, "{\"loopedAtSample\": %ld, \"stoppedAtSample\": %ld}\n", loopedAt, stoppedAt);
	fclose(j);
	return 0;
}
