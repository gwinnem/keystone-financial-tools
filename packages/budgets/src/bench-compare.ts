import type { BenchResult } from './bench-results.ts';
import { PERF_BUDGETS, REGRESSION_TOLERANCE, type PerfBudget } from './budgets.ts';
import { formatMs, type Finding } from './findings.ts';

/** The recorded mean time of every benchmark task, keyed by `BenchResult.key`. */
export interface Baseline {
  readonly version: 1;
  /** Milliseconds. */
  readonly results: Readonly<Record<string, number>>;
}

/**
 * Checks the time budgets: every benchmark of a test named after a budget must have a mean at or below `maxMs`, and every budget must have
 * at least one benchmark (a renamed or deleted bench would otherwise pass unnoticed).
 *
 * @example
 * ```ts
 * checkBudgets(results).map((finding) => finding.message);
 * // ['NFR-PERF-002: perf.bench.ts > NFR-PERF-002 hitTest() ... > a point in the middle takes 0.7100 ms, over the budget of 0.5000 ms.']
 * ```
 */
export function checkBudgets(results: readonly BenchResult[], budgets: readonly PerfBudget[] = PERF_BUDGETS): Finding[] {
  const findings: Finding[] = [];
  for (const budget of budgets) {
    const measured = results.filter((result) => result.test.startsWith(budget.id));
    if (measured.length === 0) findings.push({ kind: 'no-benchmark', message: `${budget.id}: no benchmark in the results (${budget.label}).` });
    for (const result of measured) {
      if (result.meanMs > budget.maxMs) {
        findings.push({ kind: 'over-budget', message: `${budget.id}: ${result.key} takes ${formatMs(result.meanMs)} ms, over the budget of ${formatMs(budget.maxMs)} ms.` });
      }
    }
  }
  return findings;
}

/** What a comparison with the baseline found. */
export interface Comparison {
  readonly findings: Finding[];
  /** Keys of results that the baseline does not have yet; they are reported, not failed. */
  readonly added: string[];
}

/**
 * Compares the results with the baseline: a task whose mean is more than `tolerance` (default 20%) above its baseline is a regression, and a
 * baseline entry without a result (a bench renamed or deleted) is missing. Both fail. A result without a baseline entry is listed in `added`.
 *
 * @example
 * ```ts
 * const { findings, added } = compareToBaseline(results, baseline);
 * if (findings.length > 0) process.exitCode = 1;
 * ```
 */
export function compareToBaseline(results: readonly BenchResult[], baseline: Baseline, tolerance: number = REGRESSION_TOLERANCE): Comparison {
  const current = new Map(results.map((result): [string, number] => [result.key, result.meanMs]));
  const recorded = new Map(Object.entries(baseline.results));
  const findings: Finding[] = [];
  for (const [key, before] of recorded) {
    const now = current.get(key);
    if (now === undefined) {
      findings.push({ kind: 'missing', message: `${key} is in the baseline but not in the results; record the baseline again if the bench was renamed or removed.` });
    } else if (now > before * (1 + tolerance)) {
      const percent = Math.round((now / before - 1) * 100);
      findings.push({
        kind: 'regression',
        message: `${key} is ${percent}% slower than the baseline (${formatMs(now)} ms against ${formatMs(before)} ms; ${Math.round(tolerance * 100)}% is allowed).`,
      });
    }
  }
  const added = [...current.keys()].filter((key) => !recorded.has(key));
  return { findings, added };
}

/**
 * The baseline of `results`, with the keys in alphabetical order so that a new recording shows only what changed.
 *
 * @example
 * ```ts
 * await writeFile('baseline.json', JSON.stringify(toBaseline(readBenchResults(report)), null, 2));
 * ```
 */
export function toBaseline(results: readonly BenchResult[]): Baseline {
  const means = new Map(results.map((result): [string, number] => [result.key, Number(result.meanMs.toPrecision(6))]));
  // The default sort orders by UTF-16 code unit, which is the alphabetical order of these ASCII keys on every machine.
  const keys = [...means.keys()].sort();
  return { version: 1, results: Object.fromEntries(keys.map((key): [string, number] => [key, means.get(key) as number])) };
}

/**
 * Reads a baseline file. Throws for a value that is not a version 1 baseline of positive times.
 *
 * @example
 * ```ts
 * const baseline = parseBaseline(JSON.parse(text));
 * ```
 */
export function parseBaseline(value: unknown): Baseline {
  if ((value as { version?: unknown } | null)?.version !== 1) throw new Error('Not a baseline: it is not a version 1 object.');
  const results = (value as { results?: unknown }).results;
  if (typeof results !== 'object' || results === null || Array.isArray(results)) throw new Error('Not a baseline: it has no results object.');
  for (const [key, mean] of Object.entries(results)) {
    // Number.isFinite is false for anything that is not a finite number, so a string or null fails here too.
    if (!Number.isFinite(mean) || (mean as number) <= 0) throw new Error(`Not a baseline: ${key} is not a positive time in milliseconds.`);
  }
  return { version: 1, results: results as Record<string, number> };
}
