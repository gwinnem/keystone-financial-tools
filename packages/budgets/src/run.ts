import { resolve } from 'node:path';
import { checkBudgets, compareToBaseline, parseBaseline, toBaseline } from './bench-compare.ts';
import { readBenchResults, type BenchResult } from './bench-results.ts';
import { DEFAULT_BASELINE, DEFAULT_RESULTS, SIZE_BUDGETS } from './budgets.ts';
import { formatKb, formatMs } from './findings.ts';
import {
  CHANGELOG_FILE,
  RELEASE_PACKAGES,
  ROOT_MANIFEST,
  changelogSection,
  checkPublishManifest,
  checkRelease,
  checkTarball,
  parseManifest,
  parsePackFiles,
  releasedManifest,
  versionOfTag,
  type Manifest,
} from './release.ts';
import { checkSize, minGzipSize } from './size.ts';

/** What the commands need from the machine, so tests can run them without files. */
export interface Io {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Runs a command in a folder and returns what it wrote to the standard output; rejects when it fails. */
  run(command: string, args: readonly string[], cwd: string): Promise<string>;
  log(line: string): void;
}

const OPTIONS: readonly string[] = ['results', 'baseline', 'root', 'tag', 'version', 'out'];

/** The usage line, printed for a missing or unknown command. */
export const USAGE =
  'Usage: cli.ts <bench-check | bench-baseline | size-check | release-check | release-notes | publish-prepare | pack-check> [--results <file>] [--baseline <file>] [--root <dir>] [--tag <vX.Y.Z>] [--version <X.Y.Z>] [--out <file>]';

/** The command and the `--name value` options of a command line. Throws for an unknown option or an option without a value. */
export function parseArgs(argv: readonly string[]): { readonly command: string | undefined; readonly options: ReadonlyMap<string, string> } {
  const [command, ...rest] = argv;
  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!flag.startsWith('--') || !OPTIONS.includes(flag.slice(2))) throw new Error(`Unknown option ${flag}.`);
    const value = rest[index + 1];
    if (value === undefined) throw new Error(`The option ${flag} needs a value.`);
    options.set(flag.slice(2), value);
  }
  return { command, options };
}

async function loadResults(io: Io, path: string): Promise<BenchResult[]> {
  if (!(await io.exists(path))) throw new Error(`No benchmark results at ${path}; run "pnpm --filter keystone-financial-tools-core bench" first.`);
  const results = readBenchResults(JSON.parse(await io.readText(path)));
  if (results.length === 0) throw new Error(`The report ${path} holds no benchmarks.`);
  return results;
}

function conclude(io: Io, failures: readonly string[], checked: string): number {
  for (const failure of failures) io.log(`FAIL ${failure}`);
  if (failures.length === 0) io.log(`OK ${checked}.`);
  return failures.length === 0 ? 0 : 1;
}

async function benchCheck(io: Io, resultsPath: string, baselinePath: string): Promise<number> {
  const results = await loadResults(io, resultsPath);
  for (const result of results) io.log(`${formatMs(result.meanMs)} ms  ${result.key}`);
  const findings = checkBudgets(results);
  if (await io.exists(baselinePath)) {
    const comparison = compareToBaseline(results, parseBaseline(JSON.parse(await io.readText(baselinePath))));
    findings.push(...comparison.findings);
    for (const key of comparison.added) io.log(`Not in the baseline yet: ${key}`);
  } else {
    io.log(`No baseline at ${baselinePath}: only the time budgets are checked. Record one with "pnpm --filter keystone-financial-tools-budgets bench:baseline" and commit it.`);
  }
  return conclude(
    io,
    findings.map((finding) => finding.message),
    `${results.length} benchmarks are within the budgets and the baseline`
  );
}

async function benchBaseline(io: Io, resultsPath: string, baselinePath: string): Promise<number> {
  const results = await loadResults(io, resultsPath);
  await io.writeText(baselinePath, `${JSON.stringify(toBaseline(results), null, 2)}\n`);
  io.log(`Recorded ${results.length} benchmarks in ${baselinePath}.`);
  return 0;
}

async function sizeCheck(io: Io, root: string): Promise<number> {
  const failures: string[] = [];
  for (const budget of SIZE_BUDGETS) {
    const file = resolve(root, budget.file);
    if (!(await io.exists(file))) {
      failures.push(`${budget.id}: ${budget.file} does not exist; run "pnpm build" first.`);
      continue;
    }
    const bytes = await minGzipSize(await io.readText(file));
    io.log(`${budget.id}: ${formatKb(bytes)} kB of ${formatKb(budget.maxBytes)} kB (${budget.file})`);
    const finding = checkSize(budget, bytes);
    if (finding !== undefined) failures.push(finding.message);
  }
  return conclude(io, failures, `${SIZE_BUDGETS.length} package sizes are within the budgets`);
}

async function readManifest(io: Io, root: string, relative: string, built = false): Promise<Manifest> {
  const path = resolve(root, relative);
  if (!(await io.exists(path))) throw new Error(`${relative} does not exist${built ? '; run "pnpm build" first' : ''}.`);
  return parseManifest(await io.readText(path), relative);
}

async function releaseCheck(io: Io, root: string, tag: string | undefined): Promise<number> {
  const rootManifest = await readManifest(io, root, ROOT_MANIFEST);
  const manifests = new Map<string, Manifest>();
  for (const pkg of RELEASE_PACKAGES) manifests.set(pkg.id, await readManifest(io, root, `${pkg.dir}/package.json`));
  const changelogPath = resolve(root, CHANGELOG_FILE);
  if (!(await io.exists(changelogPath))) throw new Error(`${CHANGELOG_FILE} does not exist.`);
  const findings = checkRelease({ rootVersion: rootManifest.version, manifests, changelog: await io.readText(changelogPath), tag });
  return conclude(
    io,
    findings.map((finding) => finding.message),
    `${RELEASE_PACKAGES.length} packages have the version ${String(rootManifest.version)} and ${CHANGELOG_FILE} has its notes`
  );
}

async function releaseNotes(io: Io, root: string, options: ReadonlyMap<string, string>): Promise<number> {
  const tag = options.get('tag');
  const given = options.get('version');
  if ((tag === undefined) === (given === undefined)) throw new Error('Give either --tag or --version.');
  const version = tag === undefined ? (given as string) : versionOfTag(tag);
  const changelogPath = resolve(root, CHANGELOG_FILE);
  if (!(await io.exists(changelogPath))) throw new Error(`${CHANGELOG_FILE} does not exist.`);
  const section = changelogSection(await io.readText(changelogPath), version);
  if (section === undefined) throw new Error(`${CHANGELOG_FILE} has no section "## ${version}" with notes.`);
  const out = options.get('out');
  if (out === undefined) {
    io.log(section.notes);
  } else {
    await io.writeText(resolve(root, out), `${section.notes}\n`);
    io.log(`Wrote the release notes of ${version} to ${resolve(root, out)}.`);
  }
  return 0;
}

async function publishPrepare(io: Io, root: string): Promise<number> {
  const version = (await readManifest(io, root, ROOT_MANIFEST)).version;
  if (typeof version !== 'string') throw new Error(`${ROOT_MANIFEST} has no version.`);
  const failures: string[] = [];
  for (const pkg of RELEASE_PACKAGES.filter((candidate) => candidate.publishDir !== candidate.dir)) {
    const relative = `${pkg.publishDir}/package.json`;
    const manifest = releasedManifest(await readManifest(io, root, relative, true), version);
    await io.writeText(resolve(root, relative), `${JSON.stringify(manifest, null, 2)}\n`);
    io.log(`${relative}: the workspace dependencies are ${version} now.`);
    const problems = checkPublishManifest(pkg, manifest).map((finding) => finding.message);
    for (const problem of problems) io.log(`FAIL ${problem}`);
    if (problems.length === 0) io.log(`OK ${relative} can be published.`);
    failures.push(...problems);
  }
  return failures.length === 0 ? 0 : 1;
}

async function packCheck(io: Io, root: string): Promise<number> {
  const failures: string[] = [];
  for (const pkg of RELEASE_PACKAGES) {
    const manifest = await readManifest(io, root, `${pkg.publishDir}/package.json`, true);
    failures.push(...checkPublishManifest(pkg, manifest).map((finding) => finding.message));
    const files = parsePackFiles(await io.run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], resolve(root, pkg.publishDir)));
    io.log(`${pkg.name}: ${files.length} files in the tarball`);
    failures.push(...checkTarball(pkg, files).map((finding) => finding.message));
  }
  return conclude(io, failures, `${RELEASE_PACKAGES.length} tarballs hold only what is published`);
}

/**
 * Runs a command and returns the exit code: 0 when it passed, 1 when a budget, the baseline or a release check was not met or something
 * failed (the error is logged), 2 for a missing or unknown command. `defaultRoot` is the repository root; `--root` replaces it, and
 * `--results`, `--baseline` and `--out` are resolved against it.
 *
 * - `bench-check`: reads the Vitest JSON report of the core's benches, checks the time budgets of NFR-PERF-001..003 and, when a baseline
 *   exists, fails a task that is more than 20% slower than it (E09-F02-S01).
 * - `bench-baseline`: records the report as the new baseline.
 * - `size-check`: checks the min+gzip size of the core and of each package against NFR-SIZE-001 (E09-F02-S02).
 * - `release-check`: checks that the five published packages have the version of the root package.json, are publishable, that `--tag` (when
 *   given) is the tag of that version and that CHANGELOG.md has a dated section with notes for it (E09-F04-S01).
 * - `release-notes`: prints the CHANGELOG.md section of `--tag` or `--version`, or writes it to `--out` (E09-F04-S01).
 * - `publish-prepare`: replaces the `workspace:` ranges in `packages/angular/dist/package.json` by the release version (E09-F04-S02).
 * - `pack-check`: runs `npm pack --dry-run` for every published package and fails for a test, fixture, source or source map in a tarball,
 *   and for a manifest npm cannot publish (E09-F04-S02).
 *
 * @example
 * ```ts
 * process.exitCode = await main(['size-check'], io, repositoryRoot);
 * ```
 */
export async function main(argv: readonly string[], io: Io, defaultRoot: string): Promise<number> {
  try {
    const { command, options } = parseArgs(argv);
    const root = resolve(options.get('root') ?? defaultRoot);
    switch (command) {
      case 'bench-check':
        return await benchCheck(io, resolve(root, options.get('results') ?? DEFAULT_RESULTS), resolve(root, options.get('baseline') ?? DEFAULT_BASELINE));
      case 'bench-baseline':
        return await benchBaseline(io, resolve(root, options.get('results') ?? DEFAULT_RESULTS), resolve(root, options.get('baseline') ?? DEFAULT_BASELINE));
      case 'size-check':
        return await sizeCheck(io, root);
      case 'release-check':
        return await releaseCheck(io, root, options.get('tag'));
      case 'release-notes':
        return await releaseNotes(io, root, options);
      case 'publish-prepare':
        return await publishPrepare(io, root);
      case 'pack-check':
        return await packCheck(io, root);
      default:
        io.log(USAGE);
        return 2;
    }
  } catch (error) {
    io.log(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
