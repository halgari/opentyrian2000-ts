import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __SINGLE__: JSON.stringify(mode === 'single') },
  build: { target: 'es2022' },
}));
