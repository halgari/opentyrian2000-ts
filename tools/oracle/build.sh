#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Builds the patched C original ("oracle") into reference/oracle/opentyrian2000.
set -euo pipefail
COMMIT=aad5aca01af139c0b089237c38ef765f7a84355d
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/tools/fetch-reference.sh"
DIR="$ROOT/reference/oracle"
if [ ! -d "$DIR/.git" ]; then
  git clone --quiet "$ROOT/reference/opentyrian2000" "$DIR"
fi
git -C "$DIR" checkout --quiet --force "$COMMIT"
git -C "$DIR" clean -fdq
git -C "$DIR" apply "$ROOT/tools/oracle/dump-frames.patch"
make -C "$DIR" -j"$(nproc)" WITH_NETWORK=false VCS_IDREV='echo oracle' >/dev/null
# Audio oracle: links the patched tree's OPL + LDS player (no SDL audio device).
gcc -std=iso9899:1999 -O2 -DNDEBUG -DTARGET_UNIX -DTYRIAN_DIR='"."' -Wall -Wextra -Wno-missing-field-initializers \
  -I"$DIR/src" $(pkg-config sdl2 --cflags) -o "$DIR/audio-render" \
  "$ROOT/tools/oracle/audio-render.c" "$ROOT/tools/oracle/audio-stubs.c" \
  "$DIR/src/opl.c" "$DIR/src/lds_play.c" "$DIR/src/file.c" -lm $(pkg-config sdl2 --libs)
echo "audio oracle built: $DIR/audio-render"
echo "oracle built: $DIR/opentyrian2000"
