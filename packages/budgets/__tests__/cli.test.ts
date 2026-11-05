import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SIZE_BUDGETS } from '../src/budgets.ts';
import { hex, perfReport } from './support.ts';

// End to end: the real entry point of the package scripts, run by Node as a child process on real files in a temporary folder.
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts');
let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'budgets-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function cli(...args: string[]): { status: number | null; output: string } {
  const run = spawnSync(process.execPath, [CLI, ...args, '--root', root], { encoding: 'utf8' });
  return { status: run.status, output: run.stdout };
}

function write(relative: string, text: string): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}

function writeBuilds(overrides: Record<string, string> = {}): void {
  for (const budget of SIZE_BUDGETS) write(budget.file, overrides[budget.id] ?? 'export const answer = 42;\n');
}

describe('the budgets command line (E09-F02)', () => {
  it('records a baseline from the benchmark report and then passes the same report against it', () => {
    write('packages/core/reports/bench/results.json', JSON.stringify(perfReport()));
    const recorded = cli('bench-baseline');
    expect(recorded.status).toBe(0);
    expect(recorded.output).toContain('Recorded 3 benchmarks in ');
    const baseline = JSON.parse(readFileSync(join(root, 'packages/budgets/baseline/core-bench.json'), 'utf8')) as { version: number; results: Record<string, number> };
    expect(baseline.version).toBe(1);
    expect(Object.keys(baseline.results)).toHaveLength(3);
    const checked = cli('bench-check');
    expect(checked.status).toBe(0);
    expect(checked.output).toContain('OK 3 benchmarks are within the budgets and the baseline.');
  });

  it('fails a run more than 20% slower than the baseline, with exit code 1', () => {
    write('packages/core/reports/bench/results.json', JSON.stringify(perfReport()));
    cli('bench-baseline');
    write('packages/core/reports/bench/results.json', JSON.stringify(perfReport(1.5)));
    const checked = cli('bench-check');
    expect(checked.status).toBe(1);
    expect(checked.output).toContain('FAIL perf.bench.ts > NFR-PERF-001 getScene() with 500 drawings > after a viewport change is 50% slower than the baseline');
  });

  it('fails a benchmark over its time budget without a baseline', () => {
    write('packages/core/reports/bench/results.json', JSON.stringify(perfReport(1, 0.9)));
    const checked = cli('bench-check');
    expect(checked.status).toBe(1);
    expect(checked.output).toContain('No baseline at ');
    expect(checked.output).toContain('FAIL NFR-PERF-002: ');
  });

  it('passes the sizes of built packages that are within their budgets', () => {
    writeBuilds();
    const checked = cli('size-check');
    expect(checked.status).toBe(0);
    expect(checked.output).toContain('OK 5 package sizes are within the budgets.');
  });

  it('fails a package over 3 kB min+gzip, and one that is not built', () => {
    writeBuilds({ vue: `export const data = '${hex(8000)}';\n` });
    rmSync(join(root, 'packages/react/dist/index.js'));
    const checked = cli('size-check');
    expect(checked.status).toBe(1);
    expect(checked.output).toMatch(/FAIL vue: packages\/vue\/dist\/index\.js is \d\.\d\d kB min\+gzip, over the budget of 3\.00 kB\./);
    expect(checked.output).toContain('FAIL react: packages/react/dist/index.js does not exist; run "pnpm build" first.');
  });

  it('prints the usage and exits with 2 for an unknown command', () => {
    const run = cli('nope');
    expect(run.status).toBe(2);
    expect(run.output).toContain('Usage: cli.ts');
  });

  it('exits with 1 and says what is missing when there is no report', () => {
    const run = cli('bench-check');
    expect(run.status).toBe(1);
    expect(run.output).toContain('error: No benchmark results at ');
  });
});
