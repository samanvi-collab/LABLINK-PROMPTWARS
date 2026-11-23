import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client/src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@server': path.resolve(import.meta.dirname, 'server/src'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['client/**/*.test.tsx', 'jsdom'],
      ['server/**/*.test.ts', 'node'],
    ],
    setupFiles: ['./client/src/test/setup.ts'],
    include: ['server/tests/**/*.test.ts', 'client/src/**/*.test.tsx'],
    globals: false,
    testTimeout: 15000,
  },
});
