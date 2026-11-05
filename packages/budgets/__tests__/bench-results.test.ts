import { describe, expect, it } from 'vitest';
import { readBenchResults } from '../src/bench-results.ts';
import { benchmark, fileOf, reportOf, task } from './support.ts';

const failure = (tail: string): Error => new Error(`Not a Vitest benchmark report: ${tail}.`);

describe('readBenchResults (E09-F02-S01)', () => {
  it('reads the mean of every task, keyed by file, test and task', () => {
    const report = reportOf(
      fileOf('/repo/packages/core/__tests__/scene.bench.ts', { fullName: 'buildScene with 500 drawings', benchmarks: [benchmark(task('no state', 0.25), task('with a preview', 0.5))] })
    );
    expect(readBenchResults(report)).toStrictEqual([
      { key: 'scene.bench.ts > buildScene with 500 drawings > no state', test: 'buildScene with 500 drawings', meanMs: 0.25 },
      { key: 'scene.bench.ts > buildScene with 500 drawings > with a preview', test: 'buildScene with 500 drawings', meanMs: 0.5 },
    ]);
  });

  it('names the file without its folder, for POSIX and Windows paths', () => {
    const tests = { fullName: 't', benchmarks: [benchmark(task('a', 1))] };
    const keys = readBenchResults(reportOf(fileOf('/repo/x/one.bench.ts', tests), fileOf('C:\\repo\\x\\two.bench.ts', tests), fileOf('three.bench.ts', tests))).map((result) => result.key);
    expect(keys).toStrictEqual(['one.bench.ts > t > a', 'two.bench.ts > t > a', 'three.bench.ts > t > a']);
  });

  it('keeps the order of files, tests, benchmarks and tasks', () => {
    const report = reportOf(
      fileOf('b.ts', { fullName: 't1', benchmarks: [benchmark(task('x', 1), task('y', 2)), benchmark(task('z', 3))] }, { fullName: 't2', benchmarks: [benchmark(task('w', 4))] }),
      fileOf('a.ts', { fullName: 't3', benchmarks: [benchmark(task('v', 5))] })
    );
    expect(readBenchResults(report).map((result) => result.key)).toStrictEqual(['b.ts > t1 > x', 'b.ts > t1 > y', 'b.ts > t1 > z', 'b.ts > t2 > w', 'a.ts > t3 > v']);
  });

  it('skips tests without benchmarks, benchmarks without tasks and reports without files', () => {
    const report = reportOf(fileOf('a.ts', { fullName: 'plain test' }, { fullName: 'empty list', benchmarks: [] }, { fullName: 'empty benchmark', benchmarks: [benchmark()] }));
    expect(readBenchResults(report)).toStrictEqual([]);
    expect(readBenchResults(reportOf())).toStrictEqual([]);
  });

  it('accepts a mean of 0', () => {
    expect(readBenchResults(reportOf(fileOf('a.ts', { fullName: 't', benchmarks: [benchmark(task('x', 0))] })))[0]?.meanMs).toBe(0);
  });

  it.each([
    ['null', null, 'it is not an object'],
    ['an array', [], 'it is not an object'],
    ['a string', 'report', 'it is not an object'],
    ['an object without testResults', {}, 'it has no testResults'],
    ['testResults that is not a list', { testResults: 'x' }, 'it has no testResults'],
    ['a file result that is not an object', { testResults: [5] }, 'a file result is not an object'],
    ['a file result that is an array', { testResults: [[]] }, 'a file result is not an object'],
    ['a file result without a name', { testResults: [{ assertionResults: [] }] }, 'a file result has no name'],
    ['a file result without assertionResults', { testResults: [{ name: 'a.ts' }] }, 'a.ts has no assertionResults'],
    ['a file result with assertionResults that is not a list, named by its folder path', { testResults: [{ name: '/x/y/a.ts', assertionResults: 'x' }] }, 'a.ts has no assertionResults'],
    ['a test that is not an object', { testResults: [{ name: 'a.ts', assertionResults: [5] }] }, 'a test of a.ts is not an object'],
    ['a test without a fullName', { testResults: [{ name: 'a.ts', assertionResults: [{}] }] }, 'a test of a.ts has no fullName'],
    ['benchmarks that is not a list', { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: 'x' }] }] }, 'the benchmarks of T are not a list'],
    ['benchmarks that is null', { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: null }] }] }, 'the benchmarks of T are not a list'],
    ['a benchmark that is not an object', { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [5] }] }] }, 'a benchmark of T is not an object'],
    ['a benchmark without tasks', { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{}] }] }] }, 'a benchmark of T has no tasks'],
    ['a benchmark whose tasks are not a list', { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{ tasks: 'x' }] }] }] }, 'a benchmark of T has no tasks'],
    ['a task that is not an object', { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{ tasks: [5] }] }] }] }, 'a task of T is not an object'],
    ['a task without a name', { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{ tasks: [{ latency: { mean: 1 } }] }] }] }] }, 'a task of T has no name'],
    ['a task without latency', { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{ tasks: [{ name: 'n' }] }] }] }] }, 'the task n has no latency'],
    [
      'a task whose latency is not an object',
      { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{ tasks: [{ name: 'n', latency: 5 }] }] }] }] },
      'the task n has no latency',
    ],
    ['a task without a mean', { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{ tasks: [{ name: 'n', latency: {} }] }] }] }] }, 'the task n has no latency.mean'],
    [
      'a mean that is a string',
      { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{ tasks: [{ name: 'n', latency: { mean: '1' } }] }] }] }] },
      'the task n has no latency.mean',
    ],
    [
      'a mean that is NaN',
      { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{ tasks: [{ name: 'n', latency: { mean: Number.NaN } }] }] }] }] },
      'the task n has no latency.mean',
    ],
    [
      'a mean that is infinite',
      { testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'T', benchmarks: [{ tasks: [{ name: 'n', latency: { mean: Number.POSITIVE_INFINITY } }] }] }] }] },
      'the task n has no latency.mean',
    ],
  ])('throws for %s', (_what, report, tail) => {
    expect(() => readBenchResults(report)).toThrow(failure(tail));
  });
});
