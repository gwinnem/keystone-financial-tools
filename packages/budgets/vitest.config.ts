import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // `cli.test.ts` starts the CLI as a child process and `perf.bench.ts` of the core is read as text, both of which take a moment.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // `src/cli.ts` only connects `main` to the file system; the end-to-end tests run it as a child process, which coverage does not see.
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
