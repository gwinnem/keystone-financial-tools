import { defineConfig } from 'vite';

// `vite build` makes the release bundles: ESM (`index.js`), CommonJS (`index.cjs`) and UMD for script
// tags (`index.umd.cjs`, global `KeystoneFinancialTools`), minified and without source maps (a map
// embeds the original TypeScript).
// `vite build --mode dev` (the `build:dev` and `dev` scripts) keeps the output readable and writes maps.
export default defineConfig(({ mode }) => ({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'KeystoneFinancialTools',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => (format === 'es' ? 'index.js' : format === 'cjs' ? 'index.cjs' : 'index.umd.cjs'),
    },
    target: 'es2020',
    sourcemap: mode === 'dev',
    minify: mode === 'dev' ? false : 'terser',
    terserOptions: { compress: { passes: 2 }, format: { comments: false } },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
}));
