import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Io } from '../src/run.ts';

/** A task of a Vitest benchmark report with the mean time in milliseconds. */
export const task = (name: string, mean: number): unknown => ({ name, rank: 1, throughput: { mean: 1000 / mean }, latency: { min: mean / 2, max: mean * 2, mean, p99: mean * 2, samplesCount: 100 } });

/** A benchmark (one `bench(...).run()`) of tasks. */
export const benchmark = (...tasks: unknown[]): unknown => ({ tasks });

export interface TestSpec {
  readonly fullName: string;
  readonly benchmarks?: unknown;
}

/** A file of a Vitest JSON report: its tests, each with its benchmarks when it has any. */
export const fileOf = (name: string, ...tests: TestSpec[]): unknown => ({
  name,
  status: 'passed',
  assertionResults: tests.map((test) => ({ ancestorTitles: [], title: test.fullName, status: 'passed', ...test })),
});

/** The JSON report of `vitest bench --reporter=json`. */
export const reportOf = (...files: unknown[]): unknown => ({ numTotalTests: 1, success: true, testResults: files });

/** A report with one benchmark task for each of the three time budgets, at the given means. */
export function perfReport(scene = 1, hit = 0.2, drag = 0.5, extra: TestSpec[] = []): unknown {
  return reportOf(
    fileOf(
      '/repo/packages/core/__tests__/perf.bench.ts',
      { fullName: 'NFR-PERF-001 getScene() with 500 drawings', benchmarks: [benchmark(task('after a viewport change', scene))] },
      { fullName: 'NFR-PERF-002 hitTest() with 500 drawings', benchmarks: [benchmark(task('a point in the middle', hit))] },
      { fullName: 'NFR-PERF-003 pointer move during a drag with 500 drawings', benchmarks: [benchmark(task('a move', drag))] },
      ...extra
    )
  );
}

/** An `Io` on a map of files; `lines` collects what is logged. */
export function memoryIo(files: Record<string, string> = {}): { readonly io: Io; readonly files: Map<string, string>; readonly lines: string[] } {
  const store = new Map(Object.entries(files));
  const lines: string[] = [];
  const io: Io = {
    readText: async (path) => {
      const text = store.get(path);
      if (text === undefined) throw new Error(`ENOENT ${path}`);
      return text;
    },
    writeText: async (path, text) => {
      store.set(path, text);
    },
    exists: async (path) => store.has(path),
    log: (line) => {
      lines.push(line);
    },
  };
  return { io, files: store, lines };
}

/** `length` hexadecimal characters from a seeded generator; gzip cannot shrink them below about half their number of bytes. */
export function hex(length: number, seed = 1): string {
  let state = seed;
  let text = '';
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    text += ((state >>> 24) & 15).toString(16);
  }
  return text;
}

/**
 * Finds a file of the repository from this folder or any parent. A fixed `../..` breaks under Stryker, which runs the tests from a copy of
 * this package in `.stryker-tmp/sandbox-*`, where the sibling packages are no longer at `..`.
 */
export function findUp(relative: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(dir, relative);
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error(`Could not find ${relative}`);
}
