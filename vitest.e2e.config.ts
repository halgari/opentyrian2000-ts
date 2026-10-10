import { defineConfig } from 'vitest/config';

// Browser smoke tests (Playwright). Run with `pnpm test:e2e`; `pnpm test` never launches a browser.
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.e2e.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
