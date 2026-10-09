// SPDX-License-Identifier: GPL-2.0-or-later
export function formatBootError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/game data|data pack|missing data file/.test(msg)) {
    return `Could not load the Tyrian 2000 game data.\n${msg}\n\nDevelopers: run "pnpm data ~/Downloads/tyrian2000.zip" and reload.`;
  }
  return `Something went wrong:\n${msg}`;
}
