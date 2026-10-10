// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: pnpm data [path/to/tyrian2000.zip]
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const outDir = join(ROOT, 'public', 'data');
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (/^tyrian2000(\.[0-9a-f]{8})?\.t2kpak$/.test(f)) rmSync(join(outDir, f));
// Content hash in the name so the file can be served `immutable` (public/_headers).
const hash = createHash('sha256').update(pak).digest('hex').slice(0, 8);
const outName = `tyrian2000.${hash}.t2kpak`;
writeFileSync(join(outDir, outName), pak);
const raw = entries.reduce((n, e) => n + e.data.length, 0);
console.log(`${entries.length} files, ${raw} bytes -> public/data/${outName} (${pak.length} bytes gzip)`);
