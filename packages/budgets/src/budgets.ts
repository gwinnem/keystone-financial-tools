/** How much slower than the baseline a benchmark may get before the run fails: more than 20% fails (E09-F02-S01). */
export const REGRESSION_TOLERANCE = 0.2;

/** A size is in kB of 1000 bytes, the stricter reading of the budgets of NFR-SIZE-001. */
export const BYTES_PER_KB = 1000;

/** A time budget of NFR-PERF-001..003. It applies to every benchmark of a test whose name starts with `id`. */
export interface PerfBudget {
  /** The requirement id; the benches of the core name their tests `<id> <label>`. */
  readonly id: string;
  /** What is measured. */
  readonly label: string;
  /** The largest allowed mean time of one call, in milliseconds. */
  readonly maxMs: number;
}

/** The time budgets for 500 drawings (NFR-PERF-001, NFR-PERF-002, NFR-PERF-003); the benches are in `packages/core/__tests__/perf.bench.ts`. */
export const PERF_BUDGETS: readonly PerfBudget[] = [
  { id: 'NFR-PERF-001', label: 'getScene() with 500 drawings', maxMs: 2 },
  { id: 'NFR-PERF-002', label: 'hitTest() with 500 drawings', maxMs: 0.5 },
  { id: 'NFR-PERF-003', label: 'pointer move during a drag with 500 drawings', maxMs: 1 },
];

/** A size budget of NFR-SIZE-001: the minified and gzipped size of one built file. */
export interface SizeBudget {
  /** The package. */
  readonly id: string;
  /** The file that is measured, relative to the repository root. */
  readonly file: string;
  /** The largest allowed size in bytes. */
  readonly maxBytes: number;
}

/**
 * The size budgets of NFR-SIZE-001: the ESM bundle of the core up to 25 kB and each of the other packages up to 3 kB. The `/testing`
 * entry of the core is a separate file (`dist/testing.js`) and is not measured, so it is outside the budget of the core. The framework
 * packages import the core instead of bundling it, so the size is that of the adapter alone.
 */
export const SIZE_BUDGETS: readonly SizeBudget[] = [
  { id: 'core', file: 'packages/core/dist/index.js', maxBytes: 25 * BYTES_PER_KB },
  { id: 'typescript', file: 'packages/typescript/dist/index.js', maxBytes: 3 * BYTES_PER_KB },
  { id: 'vue', file: 'packages/vue/dist/index.js', maxBytes: 3 * BYTES_PER_KB },
  { id: 'react', file: 'packages/react/dist/index.js', maxBytes: 3 * BYTES_PER_KB },
  { id: 'angular', file: 'packages/angular/dist/fesm2022/keystone-financial-tools-angular.mjs', maxBytes: 3 * BYTES_PER_KB },
];

/** Where the core's `bench` script writes the Vitest JSON report, relative to the repository root. */
export const DEFAULT_RESULTS = 'packages/core/reports/bench/results.json';

/** The recorded baseline, relative to the repository root. */
export const DEFAULT_BASELINE = 'packages/budgets/baseline/core-bench.json';
