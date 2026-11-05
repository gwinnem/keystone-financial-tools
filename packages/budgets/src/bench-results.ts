/** The mean time of one benchmark task, read from a Vitest JSON report. */
export interface BenchResult {
  /** `<file> > <test> > <task>`: what the baseline is keyed by. */
  readonly key: string;
  /** The full name of the test the task belongs to. */
  readonly test: string;
  /** The mean time of one call in milliseconds. */
  readonly meanMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(what: string): never {
  throw new Error(`Not a Vitest benchmark report: ${what}.`);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  return isRecord(value) ? value : invalid(what);
}

function asList(value: unknown, what: string): readonly unknown[] {
  return Array.isArray(value) ? value : invalid(what);
}

function asString(value: unknown, what: string): string {
  return typeof value === 'string' ? value : invalid(what);
}

/**
 * Reads the mean time of every benchmark task from the JSON report of `vitest bench --reporter=json` (Vitest 5: `benchmarks` with
 * `tasks`, each with `latency.mean` in milliseconds, on every test result). Tests without benchmarks are skipped. Throws for a value
 * that is not such a report, so a change of the report format fails the check instead of passing it with nothing measured.
 *
 * @example
 * ```ts
 * const results = readBenchResults(JSON.parse(text));
 * results[0]; // { key: 'perf.bench.ts > NFR-PERF-001 getScene() ... > after a viewport change', test: 'NFR-PERF-001 ...', meanMs: 0.8 }
 * ```
 */
export function readBenchResults(report: unknown): BenchResult[] {
  const results: BenchResult[] = [];
  for (const file of asList(asRecord(report, 'it is not an object')['testResults'], 'it has no testResults')) {
    const fileRecord = asRecord(file, 'a file result is not an object');
    const base = asString(fileRecord['name'], 'a file result has no name').split(/[\\/]/).pop() as string;
    for (const test of asList(fileRecord['assertionResults'], `${base} has no assertionResults`)) {
      const testRecord = asRecord(test, `a test of ${base} is not an object`);
      const fullName = asString(testRecord['fullName'], `a test of ${base} has no fullName`);
      const benchmarks = testRecord['benchmarks'];
      if (benchmarks === undefined) continue;
      for (const benchmark of asList(benchmarks, `the benchmarks of ${fullName} are not a list`)) {
        for (const task of asList(asRecord(benchmark, `a benchmark of ${fullName} is not an object`)['tasks'], `a benchmark of ${fullName} has no tasks`)) {
          const taskRecord = asRecord(task, `a task of ${fullName} is not an object`);
          const taskName = asString(taskRecord['name'], `a task of ${fullName} has no name`);
          const mean = asRecord(taskRecord['latency'], `the task ${taskName} has no latency`)['mean'];
          // Number.isFinite is false for anything that is not a finite number.
          if (!Number.isFinite(mean)) invalid(`the task ${taskName} has no latency.mean`);
          results.push({ key: `${base} > ${fullName} > ${taskName}`, test: fullName, meanMs: mean as number });
        }
      }
    }
  }
  return results;
}
