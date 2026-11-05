import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toBaseline } from '../src/bench-compare.ts';
import { readBenchResults } from '../src/bench-results.ts';
import { DEFAULT_BASELINE, DEFAULT_RESULTS, SIZE_BUDGETS } from '../src/budgets.ts';
import { main, parseArgs, USAGE } from '../src/run.ts';
import { hex, memoryIo, perfReport } from './support.ts';

const ROOT = resolve('/repo');
const RESULTS = resolve(ROOT, DEFAULT_RESULTS);
const BASELINE = resolve(ROOT, DEFAULT_BASELINE);
const baselineOf = (report: unknown): string => JSON.stringify(toBaseline(readBenchResults(report)));
const FILES = Object.fromEntries(SIZE_BUDGETS.map((budget) => [resolve(ROOT, budget.file), 'export const answer = 42;\n']));

describe('parseArgs', () => {
  it('reads the command and no options', () => {
    expect(parseArgs([])).toStrictEqual({ command: undefined, options: new Map() });
    expect(parseArgs(['size-check'])).toStrictEqual({ command: 'size-check', options: new Map() });
  });

  it('reads every option with its value, the last one winning', () => {
    const { command, options } = parseArgs(['bench-check', '--results', 'a.json', '--baseline', 'b.json', '--root', '/x', '--results', 'c.json']);
    expect(command).toBe('bench-check');
    expect(Object.fromEntries(options)).toStrictEqual({ results: 'c.json', baseline: 'b.json', root: '/x' });
  });

  it.each([
    ['an unknown option', ['bench-check', '--other', 'x'], 'Unknown option --other.'],
    ['an option that only starts like a known one', ['bench-check', '--resultsX', 'x'], 'Unknown option --resultsX.'],
    ['a word where an option belongs', ['bench-check', 'results', 'x'], 'Unknown option results.'],
    ['a single dash', ['bench-check', '-results', 'x'], 'Unknown option -results.'],
    ['two other characters before an option name', ['bench-check', 'xxresults', 'x'], 'Unknown option xxresults.'],
    ['an option without a value', ['bench-check', '--results'], 'The option --results needs a value.'],
    ['a second option without a value', ['bench-check', '--results', 'a', '--root'], 'The option --root needs a value.'],
  ])('throws for %s', (_what, argv, message) => {
    expect(() => parseArgs(argv)).toThrow(new Error(message));
  });
});

describe('main: the command line', () => {
  it('has a usage line that names the commands and the options', () => {
    expect(USAGE).toBe('Usage: cli.ts <bench-check | bench-baseline | size-check> [--results <file>] [--baseline <file>] [--root <dir>]');
  });

  it('prints the usage and returns 2 for no command and for an unknown command', async () => {
    for (const argv of [[], ['nope']]) {
      const { io, lines } = memoryIo();
      expect(await main(argv, io, ROOT)).toBe(2);
      expect(lines).toStrictEqual([USAGE]);
    }
  });

  it('logs an error and returns 1 for a bad option', async () => {
    const { io, lines } = memoryIo();
    expect(await main(['bench-check', '--nope', 'x'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual(['error: Unknown option --nope.']);
  });

  it('logs a failure that is not an Error as text', async () => {
    const { io, lines } = memoryIo({ [RESULTS]: '{}' });
    io.readText = () => Promise.reject('boom' as unknown as Error);
    expect(await main(['bench-check'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual(['error: boom']);
  });
});

describe('main bench-check: the time budgets and the baseline (E09-F02-S01)', () => {
  it('passes results within the budgets when there is no baseline yet, and says how to record one', async () => {
    const { io, lines } = memoryIo({ [RESULTS]: JSON.stringify(perfReport()) });
    expect(await main(['bench-check'], io, ROOT)).toBe(0);
    expect(lines).toStrictEqual([
      '1.0000 ms  perf.bench.ts > NFR-PERF-001 getScene() with 500 drawings > after a viewport change',
      '0.2000 ms  perf.bench.ts > NFR-PERF-002 hitTest() with 500 drawings > a point in the middle',
      '0.5000 ms  perf.bench.ts > NFR-PERF-003 pointer move during a drag with 500 drawings > a move',
      `No baseline at ${BASELINE}: only the time budgets are checked. Record one with "pnpm --filter keystone-financial-tools-budgets bench:baseline" and commit it.`,
      'OK 3 benchmarks are within the budgets and the baseline.',
    ]);
  });

  it('passes results that match the baseline', async () => {
    const { io, lines } = memoryIo({ [RESULTS]: JSON.stringify(perfReport()), [BASELINE]: baselineOf(perfReport()) });
    expect(await main(['bench-check'], io, ROOT)).toBe(0);
    expect(lines).toHaveLength(4);
    expect(lines.at(-1)).toBe('OK 3 benchmarks are within the budgets and the baseline.');
    expect(lines.some((line) => line.startsWith('No baseline'))).toBe(false);
  });

  it('passes results up to 20% slower than the baseline and fails more than that', async () => {
    const baseline = baselineOf(perfReport(1, 0.2, 0.5));
    const slightly = memoryIo({ [RESULTS]: JSON.stringify(perfReport(1.19, 0.23, 0.59)), [BASELINE]: baseline });
    expect(await main(['bench-check'], slightly.io, ROOT)).toBe(0);
    const much = memoryIo({ [RESULTS]: JSON.stringify(perfReport(1.5, 0.2, 0.5)), [BASELINE]: baseline });
    expect(await main(['bench-check'], much.io, ROOT)).toBe(1);
    expect(much.lines.filter((line) => line.startsWith('FAIL '))).toStrictEqual([
      'FAIL perf.bench.ts > NFR-PERF-001 getScene() with 500 drawings > after a viewport change is 50% slower than the baseline (1.5000 ms against 1.0000 ms; 20% is allowed).',
    ]);
    expect(much.lines.some((line) => line.startsWith('OK '))).toBe(false);
  });

  it('fails a result over its time budget even when it matches the baseline', async () => {
    const report = perfReport(2.5, 0.2, 0.5);
    const { io, lines } = memoryIo({ [RESULTS]: JSON.stringify(report), [BASELINE]: baselineOf(report) });
    expect(await main(['bench-check'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL '))).toStrictEqual([
      'FAIL NFR-PERF-001: perf.bench.ts > NFR-PERF-001 getScene() with 500 drawings > after a viewport change takes 2.5000 ms, over the budget of 2.0000 ms.',
    ]);
  });

  it('reports a budget and a regression together', async () => {
    const { io, lines } = memoryIo({ [RESULTS]: JSON.stringify(perfReport(1, 0.7, 0.5)), [BASELINE]: baselineOf(perfReport(1, 0.4, 0.5)) });
    expect(await main(['bench-check'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL ')).map((line) => line.split(' ')[1])).toStrictEqual(['NFR-PERF-002:', 'perf.bench.ts']);
  });

  it('lists a result the baseline does not have yet without failing', async () => {
    const extra = { fullName: 'a new bench', benchmarks: [{ tasks: [{ name: 'x', latency: { mean: 0.1 } }] }] };
    const { io, lines } = memoryIo({ [RESULTS]: JSON.stringify(perfReport(1, 0.2, 0.5, [extra])), [BASELINE]: baselineOf(perfReport()) });
    expect(await main(['bench-check'], io, ROOT)).toBe(0);
    expect(lines).toContain('Not in the baseline yet: perf.bench.ts > a new bench > x');
  });

  it('fails a baseline entry whose bench is gone', async () => {
    const extra = { fullName: 'an old bench', benchmarks: [{ tasks: [{ name: 'x', latency: { mean: 0.1 } }] }] };
    const { io, lines } = memoryIo({ [RESULTS]: JSON.stringify(perfReport()), [BASELINE]: baselineOf(perfReport(1, 0.2, 0.5, [extra])) });
    expect(await main(['bench-check'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL '))).toHaveLength(1);
    expect(lines.find((line) => line.startsWith('FAIL '))).toContain('perf.bench.ts > an old bench > x is in the baseline but not in the results');
  });

  it('fails a report without the benches of the budgets', async () => {
    const { io, lines } = memoryIo({
      [RESULTS]: JSON.stringify({ testResults: [{ name: 'a.ts', assertionResults: [{ fullName: 'other', benchmarks: [{ tasks: [{ name: 'x', latency: { mean: 1 } }] }] }] }] }),
    });
    expect(await main(['bench-check'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL ')).map((line) => line.slice(0, 18))).toStrictEqual(['FAIL NFR-PERF-001:', 'FAIL NFR-PERF-002:', 'FAIL NFR-PERF-003:']);
  });

  it.each([
    ['there is no report', {}, `error: No benchmark results at ${RESULTS}; run "pnpm --filter keystone-financial-tools-core bench" first.`],
    ['the report is not JSON', { [RESULTS]: 'not json' }, null],
    ['the report is not a Vitest report', { [RESULTS]: '{}' }, 'error: Not a Vitest benchmark report: it has no testResults.'],
    ['the report holds no benchmarks', { [RESULTS]: JSON.stringify({ testResults: [] }) }, `error: The report ${RESULTS} holds no benchmarks.`],
    ['the baseline is not a baseline', { [RESULTS]: JSON.stringify(perfReport()), [BASELINE]: '{"version":2}' }, 'error: Not a baseline: it is not a version 1 object.'],
    ['the baseline is not JSON', { [RESULTS]: JSON.stringify(perfReport()), [BASELINE]: 'x' }, null],
  ])('returns 1 and logs the error when %s', async (_what, files, message) => {
    const { io, lines } = memoryIo(files);
    expect(await main(['bench-check'], io, ROOT)).toBe(1);
    // The results are listed before the baseline is read, so a baseline error comes after those lines; it is always the last line and the only error.
    expect(lines.filter((line) => line.startsWith('error: '))).toHaveLength(1);
    const last = lines.at(-1) ?? '';
    if (message === null) expect(last).toMatch(/^error: /);
    else expect(last).toBe(message);
  });

  it('reads --results and --baseline relative to the root', async () => {
    const { io, lines } = memoryIo({ [resolve(ROOT, 'out/r.json')]: JSON.stringify(perfReport()), [resolve(ROOT, 'out/b.json')]: baselineOf(perfReport()) });
    expect(await main(['bench-check', '--results', 'out/r.json', '--baseline', 'out/b.json'], io, ROOT)).toBe(0);
    expect(lines.at(-1)).toMatch(/^OK /);
    expect(lines.some((line) => line.startsWith('No baseline'))).toBe(false);
  });

  it('uses the baseline of --baseline and not the default one', async () => {
    const { io, lines } = memoryIo({ [RESULTS]: JSON.stringify(perfReport()), [resolve(ROOT, 'out/b.json')]: baselineOf(perfReport(0.5, 0.1, 0.25)) });
    expect(await main(['bench-check', '--baseline', 'out/b.json'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL ') && line.includes('slower than the baseline'))).toHaveLength(3);
  });

  it('takes the root from --root instead of the default', async () => {
    const other = resolve('/other');
    const { io, lines } = memoryIo({ [resolve(other, DEFAULT_RESULTS)]: JSON.stringify(perfReport()) });
    expect(await main(['bench-check', '--root', other], io, ROOT)).toBe(0);
    expect(lines).toContain(
      `No baseline at ${resolve(other, DEFAULT_BASELINE)}: only the time budgets are checked. Record one with "pnpm --filter keystone-financial-tools-budgets bench:baseline" and commit it.`
    );
  });
});

describe('main bench-baseline: recording the baseline', () => {
  it('writes the means of the report, sorted, to the baseline file', async () => {
    const { io, lines, files } = memoryIo({ [RESULTS]: JSON.stringify(perfReport()) });
    expect(await main(['bench-baseline'], io, ROOT)).toBe(0);
    expect(files.get(BASELINE)).toBe(`${JSON.stringify(toBaseline(readBenchResults(perfReport())), null, 2)}\n`);
    expect(Object.keys(JSON.parse(files.get(BASELINE) as string).results)).toHaveLength(3);
    expect(lines).toStrictEqual([`Recorded 3 benchmarks in ${BASELINE}.`]);
  });

  it('is read back by bench-check, which then passes', async () => {
    const { io, files } = memoryIo({ [RESULTS]: JSON.stringify(perfReport()) });
    await main(['bench-baseline'], io, ROOT);
    const second = memoryIo({ [RESULTS]: files.get(RESULTS) as string, [BASELINE]: files.get(BASELINE) as string });
    expect(await main(['bench-check'], second.io, ROOT)).toBe(0);
  });

  it('writes to --baseline', async () => {
    const { io, files } = memoryIo({ [RESULTS]: JSON.stringify(perfReport()) });
    expect(await main(['bench-baseline', '--baseline', 'elsewhere/b.json'], io, ROOT)).toBe(0);
    expect(files.has(resolve(ROOT, 'elsewhere/b.json'))).toBe(true);
    expect(files.has(BASELINE)).toBe(false);
  });

  it('reads --results', async () => {
    const { io, files } = memoryIo({ [resolve(ROOT, 'out/r.json')]: JSON.stringify(perfReport()) });
    expect(await main(['bench-baseline', '--results', 'out/r.json'], io, ROOT)).toBe(0);
    expect(files.has(BASELINE)).toBe(true);
  });

  it('returns 1 and writes nothing when there is no usable report', async () => {
    for (const files of [{}, { [RESULTS]: JSON.stringify({ testResults: [] }) }]) {
      const { io, lines, files: written } = memoryIo(files);
      expect(await main(['bench-baseline'], io, ROOT)).toBe(1);
      expect(lines[0]).toMatch(/^error: /);
      expect(written.has(BASELINE)).toBe(false);
    }
  });
});

describe('main size-check: the min+gzip size budgets (E09-F02-S02)', () => {
  it('passes packages within their budgets and says how big each one is', async () => {
    const { io, lines } = memoryIo(FILES);
    expect(await main(['size-check'], io, ROOT)).toBe(0);
    expect(lines).toHaveLength(SIZE_BUDGETS.length + 1);
    expect(lines[0]).toMatch(/^core: \d+\.\d\d kB of 25\.00 kB \(packages\/core\/dist\/index\.js\)$/);
    expect(lines[1]).toMatch(/^typescript: \d+\.\d\d kB of 3\.00 kB \(packages\/typescript\/dist\/index\.js\)$/);
    expect(lines[4]).toMatch(/^angular: \d+\.\d\d kB of 3\.00 kB \(packages\/angular\/dist\/fesm2022\/keystone-financial-tools-angular\.mjs\)$/);
    expect(lines.at(-1)).toBe('OK 5 package sizes are within the budgets.');
  });

  it('fails a package over 3 kB and passes the core at a size that would be too much for a package', async () => {
    const big = (length: number): string => `export const data = '${hex(length)}';\n`;
    const { io, lines } = memoryIo({ ...FILES, [resolve(ROOT, 'packages/vue/dist/index.js')]: big(8000), [resolve(ROOT, 'packages/core/dist/index.js')]: big(8000) });
    expect(await main(['size-check'], io, ROOT)).toBe(1);
    const failures = lines.filter((line) => line.startsWith('FAIL '));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^FAIL vue: packages\/vue\/dist\/index\.js is \d\.\d\d kB min\+gzip, over the budget of 3\.00 kB\.$/);
    expect(lines.some((line) => line.startsWith('OK '))).toBe(false);
  });

  it('fails the core over 25 kB', async () => {
    const { io, lines } = memoryIo({ ...FILES, [resolve(ROOT, 'packages/core/dist/index.js')]: `export const data = '${hex(54_000)}';\n` });
    expect(await main(['size-check'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL core: packages/core/dist/index.js is '))).toHaveLength(1);
  });

  it('fails a package that is not built, and still measures the others', async () => {
    const files = { ...FILES };
    delete files[resolve(ROOT, 'packages/react/dist/index.js')];
    delete files[resolve(ROOT, 'packages/angular/dist/fesm2022/keystone-financial-tools-angular.mjs')];
    const { io, lines } = memoryIo(files);
    expect(await main(['size-check'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL '))).toStrictEqual([
      'FAIL react: packages/react/dist/index.js does not exist; run "pnpm build" first.',
      'FAIL angular: packages/angular/dist/fesm2022/keystone-financial-tools-angular.mjs does not exist; run "pnpm build" first.',
    ]);
    expect(lines.filter((line) => /^(core|typescript|vue): /.test(line))).toHaveLength(3);
  });

  it('does not measure the testing entry of the core', async () => {
    const { io, lines } = memoryIo(FILES);
    await main(['size-check'], io, ROOT);
    expect(lines.some((line) => line.includes('testing'))).toBe(false);
  });

  it('reads the built files from --root', async () => {
    const other = resolve('/other');
    const { io } = memoryIo(Object.fromEntries(SIZE_BUDGETS.map((budget) => [resolve(other, budget.file), 'export const answer = 42;\n'])));
    expect(await main(['size-check', '--root', other], io, ROOT)).toBe(0);
  });

  it('returns 1 and logs the error for code terser cannot parse', async () => {
    const { io, lines } = memoryIo({ ...FILES, [resolve(ROOT, 'packages/core/dist/index.js')]: 'export const = ;' });
    expect(await main(['size-check'], io, ROOT)).toBe(1);
    expect(lines[0]).toMatch(/^error: /);
  });
});
