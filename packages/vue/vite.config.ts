import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Finds a file of packages/core/src (default index.ts) from this folder or any parent. A plain `../core/src/index.ts` breaks under Stryker,
// which runs the tests from a copy of this package in `.stryker-tmp/sandbox-*`, where the sibling package is no longer at `..`.
function coreSource(file = 'index.ts'): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'core', 'src', file);
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error(`Could not find packages/core/src/${file}`);
}

export default defineConfig({
  resolve: {
    // `/testing` first: the mock host and the conformance kit, used by the tests.
    alias: [
      { find: /^keystone-financial-tools-core\/testing$/, replacement: coreSource('testing/index.ts') },
      { find: /^keystone-financial-tools-core$/, replacement: coreSource() },
    ],
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'KeystoneFinancialToolsVue',
      formats: ['es', 'umd'],
      fileName: (f) => (f === 'es' ? 'index.js' : 'index.umd.cjs'),
    },
    target: 'es2020',
    // No source maps in the release: a map embeds the original TypeScript (E09-F04-S02: no source maps in the tarballs).
    sourcemap: false,
    rolldownOptions: {
      external: ['vue', /^keystone-financial-tools-core/],
      output: {
        globals: { vue: 'Vue', 'keystone-financial-tools-core': 'KeystoneFinancialTools' },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
