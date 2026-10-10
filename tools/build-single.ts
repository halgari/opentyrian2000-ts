// SPDX-License-Identifier: GPL-2.0-or-later
// Usage: pnpm build:single   ->   dist-single/tyrian.html (code, worklet and compressed game data in one file)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'fflate';
import { encodePak, type PakEntry } from '../src/data/pak';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TMP = join(ROOT, 'dist-single-tmp');
const OUT_DIR = join(ROOT, 'dist-single');
const MAX_BYTES = 8_388_608;

/** Never requested at run time (survey 9.2, confirmed by a get() trace over soak, goldens and screen tests). */
export const EXCLUDE = ['estpa.shp', 'tyrianc.shp', 'voicesc.snd', 'exitmsg.bin', 'loudness.awe', 'user1.shp', 'user2.shp', 'shipedit.pcx', 'readme.txt'];

export function escapeScript(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

export const LICENCE_NOTICE = 'Code GPL-2.0-or-later (port of github.com/KScl/opentyrian2000). Tyrian 2000 data: freeware release; see README.';

function build(): void {
  rmSync(TMP, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', 'single', '--outDir', TMP, '--emptyOutDir'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('vite build --mode single failed');
}

function main(): void {
  const dataDir = join(ROOT, 'data', 'tyrian2000');
  if (!existsSync(join(dataDir, 'tyrian.hdt'))) {
    console.error('Game data not found. Run "pnpm data ~/Downloads/tyrian2000.zip" first.');
    process.exit(1);
  }
  build();
  const assets = join(TMP, 'assets');
  const files = readdirSync(assets);
  const jsName = files.find((f) => /^index-.*\.js$/.test(f));
  const workletName = files.find((f) => /^worklet-.*\.js$/.test(f));
  const cssNames = files.filter((f) => f.endsWith('.css'));
  if (!jsName || !workletName) throw new Error(`build output incomplete: ${files.join(', ')}`);
  const js = readFileSync(join(assets, jsName), 'utf8');
  const worklet = readFileSync(join(assets, workletName), 'utf8');
  if (/<\/script/i.test(worklet)) throw new Error('worklet source contains </script');
  const shell = readFileSync(join(TMP, 'index.html'), 'utf8');
  const style = [...shell.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
    + cssNames.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');

  const entries: PakEntry[] = [];
  for (const name of readdirSync(dataDir)) {
    if (EXCLUDE.includes(name)) continue;
    entries.push({ name, data: new Uint8Array(readFileSync(join(dataDir, name))) });
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const b64 = Buffer.from(gzipSync(encodePak(entries), { level: 9 })).toString('base64');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenTyrian2000</title>
<style>${style}
#licence { position: fixed; left: 0; right: 0; bottom: 0; padding: 2px 8px; font-size: 9px; color: #888; text-align: center; pointer-events: none; z-index: 5; }
</style>
</head>
<body>
<div id="stage"><canvas id="screen" width="320" height="200"></canvas></div>
<div id="overlay">Loading…</div>
<div id="licence">${LICENCE_NOTICE}</div>
<script id="worklet" type="text/plain">${worklet}</script>
<script id="data" type="text/plain">${b64}</script>
<script type="module">${escapeScript(js)}</script>
</body>
</html>
`;
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, 'tyrian.html');
  writeFileSync(out, html);
  rmSync(TMP, { recursive: true, force: true });
  const size = Buffer.byteLength(html);
  console.log(`${entries.length} data files -> ${out}: ${size} bytes (${(size / 1048576).toFixed(2)} MiB)`);
  if (size > MAX_BYTES) {
    console.error(`over the budget of ${MAX_BYTES} bytes`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
