// SPDX-License-Identifier: GPL-2.0-or-later
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe } from 'vitest';
import { DataArchive } from '../../src/data/archive';

export const DATA_DIR = fileURLToPath(new URL('../../data/tyrian2000', import.meta.url));

function load(): DataArchive | null {
  if (!existsSync(join(DATA_DIR, 'tyrian.hdt'))) return null;
  const files = new Map<string, Uint8Array>();
  for (const name of readdirSync(DATA_DIR)) files.set(name, new Uint8Array(readFileSync(join(DATA_DIR, name))));
  return new DataArchive(files);
}

export const testArchive = load();
/** describe() when game data is present (run `pnpm data`), otherwise describe.skip(). */
export const describeData = testArchive ? describe : describe.skip;
