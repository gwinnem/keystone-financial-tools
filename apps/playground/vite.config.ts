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
      { find: /^keystone-financial-tools-vue$/, replacement: source('../../packages/vue/src/index.ts') },
      { find: /^keystone-financial-tools-react$/, replacement: source('../../packages/react/src/index.ts') },
      { find: /^keystone-financial-tools-angular$/, replacement: source('../../packages/angular/src/public-api.ts') },
    ],
    // The package sources live outside this folder: without this they would load their own copy of a framework next to the page's.
    dedupe: ['vue', 'react', 'react-dom', '@angular/core', '@angular/common', 'rxjs'],
  },
  // The end-to-end tests (e2e/) start this server on this port.
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    // One page per framework, all served by the same server.
    rollupOptions: {
      input: {
        index: source('index.html'),
        vue: source('vue.html'),
        react: source('react.html'),
        angular: source('angular.html'),
        embed: source('embed.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // The host logic is unit tested. main.ts, embed.ts, demo.ts, dom.ts, render.ts and the framework pages only wire it to the DOM and the canvas; the end-to-end tests cover them.
      include: ['src/data.ts', 'src/plot-host.ts', 'src/input.ts', 'src/toolbar.ts', 'src/viewport.ts', 'src/embed-params.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
