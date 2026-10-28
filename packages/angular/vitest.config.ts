import { defineConfig } from 'vitest/config';
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
  resolve: {
    alias: {
      'keystone-financial-tools-core': coreSource(),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-helpers/setup.ts'],
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
