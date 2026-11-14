import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ui': path.resolve(rootDir, 'components/ui/index.ts'),
      '@': rootDir,
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 30_000,
    maxWorkers: 1,
    minWorkers: 1,
    setupFiles: ['tests/setup-tests.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['**/*.dom.test.tsx', 'jsdom'],
      ['**/*.ui.test.tsx', 'jsdom'],
    ],
  },
});
