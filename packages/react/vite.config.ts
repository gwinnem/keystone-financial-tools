import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Finds packages/core/src/index.ts from this folder or any parent. A plain `../core/src/index.ts` breaks under Stryker, which runs the
// tests from a copy of this package in `.stryker-tmp/sandbox-*`, where the sibling package is no longer at `..`.
function coreSource(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'core', 'src', 'index.ts');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error('Could not find packages/core/src/index.ts');
}

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      'keystone-financial-tools-core': coreSource(),
    },
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'KeystoneFinancialToolsReact',
      formats: ['es', 'umd'],
      fileName: (f) => (f === 'es' ? 'index.js' : 'index.umd.cjs'),
    },
    target: 'es2020',
    sourcemap: true,
    rolldownOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', /^keystone-financial-tools-core/],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
          'keystone-financial-tools-core': 'KeystoneFinancialTools',
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
