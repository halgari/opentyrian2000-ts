// SPDX-License-Identifier: GPL-2.0-or-later
// Web-only: the licence notice shown on the start overlay (single file and multi-file site alike).

export const UPSTREAM_URL = 'https://github.com/KScl/opentyrian2000';

/** `sourceUrl` comes from the OT_SOURCE_URL build-time variable; empty or unset yields the "not configured" wording. */
export function licenceNotice(sourceUrl: string | undefined): string {
  const source = sourceUrl ? `Source code: GPL-2.0, ${sourceUrl}` : 'Source code: GPL-2.0 (source URL not configured)';
  return `${source}\n`
    + `This engine is GPL-2.0 software, a port of OpenTyrian and OpenTyrian2000 (${UPSTREAM_URL}).\n`
    + 'Tyrian 2000 game data is (c) its owners, a freeware release, "All Rights Reserved" per its readme.';
}
