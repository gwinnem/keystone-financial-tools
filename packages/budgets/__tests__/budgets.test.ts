import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BYTES_PER_KB, DEFAULT_BASELINE, DEFAULT_RESULTS, PERF_BUDGETS, REGRESSION_TOLERANCE, SIZE_BUDGETS } from '../src/budgets.ts';
import { findUp } from './support.ts';

describe('the time budgets (NFR-PERF-001..003)', () => {
  it('are 2 ms for getScene, 0.5 ms for hitTest and 1 ms for a drag move, each for 500 drawings', () => {
    expect(PERF_BUDGETS).toStrictEqual([
      { id: 'NFR-PERF-001', label: 'getScene() with 500 drawings', maxMs: 2 },
      { id: 'NFR-PERF-002', label: 'hitTest() with 500 drawings', maxMs: 0.5 },
      { id: 'NFR-PERF-003', label: 'pointer move during a drag with 500 drawings', maxMs: 1 },
    ]);
  });

  it('have a bench in the core named after each of them', () => {
    const source = readFileSync(findUp('packages/core/__tests__/perf.bench.ts'), 'utf8');
    for (const budget of PERF_BUDGETS) expect(source).toContain(`'${budget.id} ${budget.label}'`);
  });

  it('allow a slowdown of 20% from the baseline', () => {
    expect(REGRESSION_TOLERANCE).toBe(0.2);
  });
});

describe('the size budgets (NFR-SIZE-001)', () => {
  it('are 25 kB for the core and 3 kB for each other package, in kB of 1000 bytes', () => {
    expect(BYTES_PER_KB).toBe(1000);
    expect(SIZE_BUDGETS.map(({ id, maxBytes }) => [id, maxBytes])).toStrictEqual([
      ['core', 25_000],
      ['typescript', 3000],
      ['vue', 3000],
      ['react', 3000],
      ['angular', 3000],
    ]);
  });

  it('measure the ESM file of each package', () => {
    expect(SIZE_BUDGETS.map(({ file }) => file)).toStrictEqual([
      'packages/core/dist/index.js',
      'packages/typescript/dist/index.js',
      'packages/vue/dist/index.js',
      'packages/react/dist/index.js',
      'packages/angular/dist/fesm2022/keystone-financial-tools-angular.mjs',
    ]);
  });

  it('leave the testing entry out of the budget of the core', () => {
    expect(SIZE_BUDGETS.filter(({ file }) => file.includes('testing'))).toStrictEqual([]);
    expect(SIZE_BUDGETS.filter(({ id }) => id === 'core')).toHaveLength(1);
  });

  it('point at the main file of the package.json of each package', () => {
    for (const { id, file } of SIZE_BUDGETS) {
      if (id === 'angular') continue;
      const manifest = JSON.parse(readFileSync(findUp(`packages/${id}/package.json`), 'utf8')) as { module?: string };
      expect(`packages/${id}/${manifest.module?.replace(/^\.\//, '')}`).toBe(file);
    }
  });
});

describe('the files of the checks', () => {
  it('are under the repository', () => {
    expect(DEFAULT_RESULTS).toBe('packages/core/reports/bench/results.json');
    expect(DEFAULT_BASELINE).toBe('packages/budgets/baseline/core-bench.json');
  });

  it('are written by the bench script of the core', () => {
    const manifest = JSON.parse(readFileSync(findUp('packages/core/package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(manifest.scripts['bench']).toContain(`--outputFile.json=${DEFAULT_RESULTS.replace('packages/core/', '')}`);
  });
});

describe('the CI workflow (E09-F02)', () => {
  const workflow = readFileSync(findUp('.github/workflows/ci.yml'), 'utf8');

  it('checks the bundle sizes after the build', () => {
    expect(workflow).toContain('pnpm --filter keystone-financial-tools-budgets size:check');
    expect(workflow.indexOf('pnpm --filter keystone-financial-tools-budgets size:check')).toBeGreaterThan(workflow.indexOf('run: pnpm build'));
  });

  it('runs the benches, checks them against the budgets and the baseline and keeps the results', () => {
    expect(workflow).toContain('pnpm --filter keystone-financial-tools-core bench');
    expect(workflow).toContain('pnpm --filter keystone-financial-tools-budgets bench:check');
    expect(workflow).toContain('packages/core/reports/bench/results.json');
    expect(workflow).toContain('name: bench-results');
  });

  it('mutation-tests this package', () => {
    expect(workflow).toMatch(/package: \[[^\]]*budgets[^\]]*\]/);
  });
});
