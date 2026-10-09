// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: pnpm data [path/to/tyrian2000.zip]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, unzipSync } from 'fflate';
import { encodePak, type PakEntry } from '../src/data/pak';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const zipPath = resolve(process.argv[2] ?? join(homedir(), 'Downloads', 'tyrian2000.zip'));
const EXCLUDE = /\.(exe|pif|ico|ovl)$|^setup\.box$/;

const files = unzipSync(readFileSync(zipPath));
const entries: PakEntry[] = [];
for (const [path, data] of Object.entries(files)) {
  if (path.endsWith('/')) continue;
  const name = basename(path).toLowerCase();
  if (EXCLUDE.test(name)) continue;
  entries.push({ name, data });
}
entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
if (!entries.some((e) => e.name === 'tyrian1.lvl') || !entries.some((e) => e.name === 'tyrian.hdt')) {
  console.error(`${zipPath} does not look like the Tyrian 2000 data zip (no tyrian1.lvl / tyrian.hdt)`);
  process.exit(1);
}

const dataDir = join(ROOT, 'data', 'tyrian2000');
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
for (const e of entries) writeFileSync(join(dataDir, e.name), e.data);

const pak = gzipSync(encodePak(entries), { level: 9 });
mkdirSync(join(ROOT, 'public', 'data'), { recursive: true });
writeFileSync(join(ROOT, 'public', 'data', 'tyrian2000.t2kpak'), pak);
const raw = entries.reduce((n, e) => n + e.data.length, 0);
console.log(`${entries.length} files, ${raw} bytes -> public/data/tyrian2000.t2kpak (${pak.length} bytes gzip)`);
