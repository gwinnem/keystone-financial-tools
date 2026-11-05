import { describe, expect, it } from 'vitest';
import { checkBudgets, compareToBaseline, parseBaseline, toBaseline, type Baseline } from '../src/bench-compare.ts';
import type { BenchResult } from '../src/bench-results.ts';
import { PERF_BUDGETS, type PerfBudget } from '../src/budgets.ts';

const result = (key: string, meanMs: number, test = key.split(' > ')[1] ?? key): BenchResult => ({ key, test, meanMs });
const BUDGET: PerfBudget = { id: 'NFR-X', label: 'a thing', maxMs: 2 };

describe('checkBudgets: the time budgets of NFR-PERF-001..003 (E09-F02-S01)', () => {
  it('passes a benchmark within its budget, including one exactly at the budget', () => {
    expect(checkBudgets([result('f > NFR-X a > t', 1.99), result('f > NFR-X a > u', 2)], [BUDGET])).toStrictEqual([]);
  });

  it('fails a benchmark over its budget and names it', () => {
    expect(checkBudgets([result('f > NFR-X a > t', 2.0001)], [BUDGET])).toStrictEqual([{ kind: 'over-budget', message: 'NFR-X: f > NFR-X a > t takes 2.0001 ms, over the budget of 2.0000 ms.' }]);
  });

  it('checks every task of the test, so one slow task fails while the others pass', () => {
    const findings = checkBudgets([result('f > NFR-X a > fast', 0.1, 'NFR-X a'), result('f > NFR-X a > slow', 3, 'NFR-X a')], [BUDGET]);
    expect(findings.map((finding) => finding.message)).toStrictEqual(['NFR-X: f > NFR-X a > slow takes 3.0000 ms, over the budget of 2.0000 ms.']);
  });

  it('fails a budget without a benchmark, so a renamed or deleted bench is noticed', () => {
    expect(checkBudgets([result('f > other > t', 0.1)], [BUDGET])).toStrictEqual([{ kind: 'no-benchmark', message: 'NFR-X: no benchmark in the results (a thing).' }]);
    expect(checkBudgets([], [BUDGET])).toHaveLength(1);
  });

  it('matches a test whose name starts with the id, not one that only contains it', () => {
    const findings = checkBudgets([result('f > a NFR-X > t', 9, 'a NFR-X')], [BUDGET]);
    expect(findings.map((finding) => finding.kind)).toStrictEqual(['no-benchmark']);
  });

  it('applies each budget to its own benchmarks', () => {
    const budgets: PerfBudget[] = [BUDGET, { id: 'NFR-Y', label: 'another', maxMs: 0.5 }];
    const findings = checkBudgets([result('f > NFR-X a > t', 1.5), result('f > NFR-Y b > t', 1.5)], budgets);
    expect(findings.map((finding) => finding.message)).toStrictEqual(['NFR-Y: f > NFR-Y b > t takes 1.5000 ms, over the budget of 0.5000 ms.']);
  });

  it('uses the budgets of the SDS by default', () => {
    const within = [result('f > NFR-PERF-001 s > t', 2), result('f > NFR-PERF-002 h > t', 0.5), result('f > NFR-PERF-003 d > t', 1)];
    expect(checkBudgets(within)).toStrictEqual([]);
    expect(checkBudgets([result('f > NFR-PERF-001 s > t', 2.1), result('f > NFR-PERF-002 h > t', 0.6), result('f > NFR-PERF-003 d > t', 1.1)]).map((finding) => finding.kind)).toStrictEqual([
      'over-budget',
      'over-budget',
      'over-budget',
    ]);
    expect(checkBudgets([]).map((finding) => finding.kind)).toStrictEqual(PERF_BUDGETS.map(() => 'no-benchmark'));
  });
});

describe('compareToBaseline: a run more than 20% slower than the baseline fails (E09-F02-S01)', () => {
  const baseline: Baseline = { version: 1, results: { a: 100, b: 10 } };

  it('passes results that are equal, faster or at most 20% slower', () => {
    expect(compareToBaseline([result('a', 100), result('b', 5)], baseline)).toStrictEqual({ findings: [], added: [] });
    expect(compareToBaseline([result('a', 120), result('b', 12)], baseline).findings).toStrictEqual([]);
  });

  it('fails a result more than 20% slower and says by how much', () => {
    const { findings } = compareToBaseline([result('a', 150), result('b', 10)], baseline);
    expect(findings).toStrictEqual([{ kind: 'regression', message: 'a is 50% slower than the baseline (150.0000 ms against 100.0000 ms; 20% is allowed).' }]);
  });

  it('fails a result just over the limit', () => {
    expect(compareToBaseline([result('a', 120.0001), result('b', 10)], baseline).findings.map((finding) => finding.kind)).toStrictEqual(['regression']);
  });

  it('takes the allowed slowdown as a parameter', () => {
    expect(compareToBaseline([result('a', 140), result('b', 10)], baseline, 0.5).findings).toStrictEqual([]);
    expect(compareToBaseline([result('a', 160), result('b', 10)], baseline, 0.5).findings).toStrictEqual([
      { kind: 'regression', message: 'a is 60% slower than the baseline (160.0000 ms against 100.0000 ms; 50% is allowed).' },
    ]);
  });

  it('fails a baseline entry without a result, because the bench was renamed or removed', () => {
    const { findings } = compareToBaseline([result('a', 100)], baseline);
    expect(findings).toStrictEqual([{ kind: 'missing', message: 'b is in the baseline but not in the results; record the baseline again if the bench was renamed or removed.' }]);
  });

  it('lists results the baseline does not have, in the order of the results, without failing', () => {
    const comparison = compareToBaseline([result('z', 1), result('a', 100), result('b', 10), result('constructor', 1)], baseline);
    expect(comparison).toStrictEqual({ findings: [], added: ['z', 'constructor'] });
  });

  it('reports every regression and every missing entry', () => {
    const { findings } = compareToBaseline([result('a', 200)], baseline);
    expect(findings.map((finding) => finding.kind)).toStrictEqual(['regression', 'missing']);
  });
});

describe('toBaseline and parseBaseline', () => {
  it('records the means with the keys in alphabetical order', () => {
    const baseline = toBaseline([result('b', 2), result('c', 3), result('a', 1), result('a2', 1.5)]);
    expect(baseline.version).toBe(1);
    expect(Object.keys(baseline.results)).toStrictEqual(['a', 'a2', 'b', 'c']);
    expect(baseline.results).toStrictEqual({ a: 1, a2: 1.5, b: 2, c: 3 });
  });

  it('rounds a mean to six significant digits', () => {
    expect(toBaseline([result('a', 0.123456789), result('b', 123456.789)]).results).toStrictEqual({ a: 0.123457, b: 123457 });
  });

  it('records no results for no results', () => {
    expect(toBaseline([])).toStrictEqual({ version: 1, results: {} });
  });

  it('is read back by parseBaseline', () => {
    const baseline = toBaseline([result('a', 0.5), result('b', 0.25)]);
    expect(parseBaseline(JSON.parse(JSON.stringify(baseline)))).toStrictEqual(baseline);
  });

  it('accepts an empty baseline', () => {
    expect(parseBaseline({ version: 1, results: {} })).toStrictEqual({ version: 1, results: {} });
  });

  it.each([
    ['null', null, 'Not a baseline: it is not a version 1 object.'],
    ['a number', 5, 'Not a baseline: it is not a version 1 object.'],
    ['an object without a version', { results: {} }, 'Not a baseline: it is not a version 1 object.'],
    ['version 2', { version: 2, results: {} }, 'Not a baseline: it is not a version 1 object.'],
    ['no results', { version: 1 }, 'Not a baseline: it has no results object.'],
    ['results that is null', { version: 1, results: null }, 'Not a baseline: it has no results object.'],
    ['results that is a list', { version: 1, results: [] }, 'Not a baseline: it has no results object.'],
    ['results that is a string', { version: 1, results: 'x' }, 'Not a baseline: it has no results object.'],
    ['a time of 0', { version: 1, results: { a: 1, b: 0 } }, 'Not a baseline: b is not a positive time in milliseconds.'],
    ['a negative time', { version: 1, results: { a: -1 } }, 'Not a baseline: a is not a positive time in milliseconds.'],
    ['a time that is NaN', { version: 1, results: { a: Number.NaN } }, 'Not a baseline: a is not a positive time in milliseconds.'],
    ['an infinite time', { version: 1, results: { a: Number.POSITIVE_INFINITY } }, 'Not a baseline: a is not a positive time in milliseconds.'],
    ['a time that is a string', { version: 1, results: { a: '1' } }, 'Not a baseline: a is not a positive time in milliseconds.'],
  ])('throws for %s', (_what, value, message) => {
    expect(() => parseBaseline(value)).toThrow(new Error(message));
  });
});
