import { existsSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Content-hashed pak written by `pnpm data`; falls back to the fixed name on a fresh checkout. */
function dataUrl(): string {
  const dir = new URL('./public/data/', import.meta.url);
  const hashed = existsSync(dir) ? readdirSync(dir).find((f) => /^tyrian2000\.[0-9a-f]{8}\.t2kpak$/.test(f)) : undefined;
  return `data/${hashed ?? 'tyrian2000.t2kpak'}`;
}

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __SINGLE__: JSON.stringify(mode === 'single'), __DATA_URL__: JSON.stringify(dataUrl()) },
  build: { target: 'es2022' },
}));
