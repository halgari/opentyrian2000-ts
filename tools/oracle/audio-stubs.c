/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Stubs for symbols file.c needs that the audio harness does not link. */
#include <stdio.h>
#include <stdlib.h>

void JE_tyrianHalt(unsigned char code)
{
	fprintf(stderr, "audio-render: JE_tyrianHalt(%d)\n", (int)code);
	exit(code ? code : 1);
}
