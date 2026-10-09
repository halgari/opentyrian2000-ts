#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Clones the pinned upstream C source to reference/opentyrian2000 (read-only reference).
set -euo pipefail
COMMIT=aad5aca01af139c0b089237c38ef765f7a84355d
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/reference/opentyrian2000"
if [ ! -d "$DIR/.git" ]; then
  git clone --quiet https://github.com/KScl/opentyrian2000.git "$DIR"
fi
git -C "$DIR" checkout --quiet "$COMMIT"
echo "reference source at $DIR ($COMMIT)"
