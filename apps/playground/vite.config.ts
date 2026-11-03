import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// The playground runs against the sources of the packages, so `pnpm dev` and the end-to-end tests need no build of them first.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^keystone-financial-tools-core\/testing$/, replacement: source('../../packages/core/src/testing/index.ts') },
      { find: /^keystone-financial-tools-core$/, replacement: source('../../packages/core/src/index.ts') },
      { find: /^keystone-financial-tools-typescript$/, replacement: source('../../packages/typescript/src/index.ts') },
    ],
  },
  // The end-to-end tests (e2e/) start this server on this port.
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // The host logic is unit tested. main.ts, dom.ts and render.ts only wire it to the DOM and the canvas; the end-to-end tests cover them.
      include: ['src/data.ts', 'src/plot-host.ts', 'src/input.ts', 'src/toolbar.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
