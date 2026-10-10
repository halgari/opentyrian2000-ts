import { existsSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Content-hashed pak written by `pnpm data`; falls back to the fixed name on a fresh checkout. */
function hashedPak(): string | undefined {
  const dir = new URL('./public/data/', import.meta.url);
  return existsSync(dir) ? readdirSync(dir).find((f) => /^tyrian2000\.[0-9a-f]{8}\.t2kpak$/.test(f)) : undefined;
}
function dataUrl(): string {
  const hashed = hashedPak();
  return `data/${hashed ?? 'tyrian2000.t2kpak'}`;
}

const SOURCE_URL = process.env.OT_SOURCE_URL ?? '';
const warnNoSource = (): void => { if (!SOURCE_URL) console.warn('\n!!! WARNING: OT_SOURCE_URL is not set. The licence notice will say "source URL not configured". Set it before publishing. !!!\n'); };

export default defineConfig(({ mode, command }) => {
  if (command === 'build') {
    warnNoSource();
    // the /data/* cache rule is immutable: a fixed (unhashed) pak name would be cached for a year
    if (mode !== 'single' && !hashedPak()) throw new Error('No content-hashed pak in public/data. Run "pnpm data <zip>" first.');
  }
  return {
  base: './',
  define: { __SINGLE__: JSON.stringify(mode === 'single'), __SOURCE_URL__: JSON.stringify(SOURCE_URL), __DATA_URL__: JSON.stringify(dataUrl()) },
  build: { target: 'es2022' },
  };
});
