import { defineConfig } from 'vite';

// Builds the `keystone-financial-tools-core/testing` entry (mock host and host conformance kit) into
// the same dist folder as the main build, without emptying it: ESM (`testing.js`) and CommonJS
// (`testing.cjs`). It is a separate build because the main build also makes a UMD bundle, which
// allows only one entry. The main entry never imports from src/testing (checked by entries.test.ts).
export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/testing/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'testing.js' : 'testing.cjs'),
    },
    target: 'es2020',
    sourcemap: mode === 'dev',
    minify: mode === 'dev' ? false : 'terser',
    terserOptions: { compress: { passes: 2 }, format: { comments: false } },
  },
}));
