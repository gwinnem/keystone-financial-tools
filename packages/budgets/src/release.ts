import type { Finding } from './findings.ts';

/** A parsed package.json. */
export type Manifest = Readonly<Record<string, unknown>>;

/** A package that is published to npm (E09-F04, D-7). */
export interface ReleasePackage {
  /** The short name: `core`, `vue`, ... */
  readonly id: string;
  /** The npm name. */
  readonly name: string;
  /** The folder of the package, relative to the repository root. */
  readonly dir: string;
  /** The folder that is packed and published, relative to the repository root: the package itself, or `dist` for Angular (ng-packagr writes the manifest there). */
  readonly publishDir: string;
}

/**
 * The published packages in the order they are published: the core first, as every other package depends on it. All of them have the version
 * of the root package.json (E09-F04-S01).
 */
export const RELEASE_PACKAGES: readonly ReleasePackage[] = [
  { id: 'core', name: 'keystone-financial-tools-core', dir: 'packages/core', publishDir: 'packages/core' },
  { id: 'typescript', name: 'keystone-financial-tools-typescript', dir: 'packages/typescript', publishDir: 'packages/typescript' },
  { id: 'vue', name: 'keystone-financial-tools-vue', dir: 'packages/vue', publishDir: 'packages/vue' },
  { id: 'react', name: 'keystone-financial-tools-react', dir: 'packages/react', publishDir: 'packages/react' },
  { id: 'angular', name: 'keystone-financial-tools-angular', dir: 'packages/angular', publishDir: 'packages/angular/dist' },
];

/** The changelog, relative to the repository root. */
export const CHANGELOG_FILE = 'CHANGELOG.md';

/** The manifest of the repository root, whose version is the version of every package. */
export const ROOT_MANIFEST = 'package.json';

const VERSION = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?';
const VERSION_PATTERN = new RegExp(`^${VERSION}$`);
const TAG_PATTERN = new RegExp(`^v(${VERSION})$`);
const WORKSPACE = 'workspace:';
const DEPENDENCY_KEYS: readonly string[] = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];

const finding = (message: string): Finding => ({ kind: 'release', message });

/** Whether the value is a version: text of three numbers and, optionally, a prerelease such as `-beta.1`. Anything that is not text is not a version. */
export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION_PATTERN.test(value);
}

/**
 * The version a tag names: `v1.2.3` is `1.2.3`. Throws for anything else, such as a tag without the `v`.
 *
 * @example
 * ```ts
 * versionOfTag('v0.1.0'); // '0.1.0'
 * ```
 */
export function versionOfTag(tag: string): string {
  const match = TAG_PATTERN.exec(tag);
  if (match === null) throw new Error(`The tag "${tag}" is not a version tag like v1.2.3.`);
  return match[1];
}

/** A package.json parsed from its text. Throws when the text is not JSON or not an object. `where` names the file in the message. */
export function parseManifest(text: string, where: string): Manifest {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${where} is not a package manifest.`);
  return parsed as Manifest;
}

/** One version of the changelog. */
export interface ChangelogSection {
  /** The heading line, such as `## 0.1.0 (2026-11-10)`. */
  readonly heading: string;
  /** The text under the heading up to the next version, without the blank lines around it. */
  readonly notes: string;
}

const HEADING = /^## (\S+)(?: .*)?$/;

/**
 * The section of a version in the changelog: the heading `## <version>`, optionally followed by a note such as `(unreleased)` or a date,
 * and the lines up to the next `## ` heading. Undefined when the version has no heading or its section is empty.
 *
 * @example
 * ```ts
 * changelogSection('# Changelog\n\n## 1.0.0 (2026-11-10)\n\n- First release.\n', '1.0.0')?.notes; // '- First release.'
 * ```
 */
export function changelogSection(changelog: string, version: string): ChangelogSection | undefined {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => HEADING.exec(line)?.[1] === version);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => line.startsWith('## '));
  const notes = (next === -1 ? rest : rest.slice(0, next)).join('\n').trim();
  return notes === '' ? undefined : { heading: lines[start], notes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** What is wrong with a manifest that is about to be published, whichever folder it is in: `private`, no entry points, `workspace:` ranges in a built manifest. */
function manifestProblems(manifest: Manifest, built: boolean): string[] {
  const problems: string[] = [];
  if (manifest.private === true) problems.push('package.json is "private": true, so npm refuses to publish it.');
  if (!isRecord(manifest.exports)) problems.push('package.json has no "exports".');
  if (typeof (manifest.types ?? manifest.typings) !== 'string') problems.push('package.json has no "types" (or "typings").');
  if (built) {
    for (const key of DEPENDENCY_KEYS) {
      const dependencies = manifest[key];
      if (!isRecord(dependencies)) continue;
      for (const [name, range] of Object.entries(dependencies)) {
        if (typeof range === 'string' && range.startsWith(WORKSPACE)) {
          problems.push(`${key}.${name} is ${range}, which npm cannot install: run "pnpm --filter keystone-financial-tools-budgets release:prepare".`);
        }
      }
    }
  }
  return problems;
}

/**
 * What is wrong with the package.json of a package in its own folder: another name or version than the release, `"private": true`, and, for
 * a package that is published from its own folder, a missing `files` list with `dist`, `exports` or `types`. Angular has none of those in
 * the source (ng-packagr writes them into `dist/package.json`), so only its name, version and `private` are checked here.
 */
function sourceProblems(pkg: ReleasePackage, manifest: Manifest, version: string): string[] {
  const problems: string[] = [];
  if (manifest.name !== pkg.name) problems.push(`package.json has the name ${JSON.stringify(manifest.name)}, expected ${pkg.name}.`);
  if (manifest.version !== version) problems.push(`the version is ${JSON.stringify(manifest.version)}, not ${version} like the other packages.`);
  if (pkg.publishDir !== pkg.dir) {
    if (manifest.private === true) problems.push('package.json is "private": true, so npm refuses to publish it.');
    return problems;
  }
  if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) problems.push('package.json "files" does not include "dist".');
  problems.push(...manifestProblems(manifest, false));
  return problems;
}

/** The input of {@link checkRelease}. */
export interface ReleaseInput {
  /** The `version` of the root package.json, as it is in the file. */
  readonly rootVersion: unknown;
  /** The package.json of every package of {@link RELEASE_PACKAGES}, by id. */
  readonly manifests: ReadonlyMap<string, Manifest>;
  /** The text of CHANGELOG.md. */
  readonly changelog: string;
  /** The tag that is being released, such as `v0.1.0`; left out when no tag is checked. */
  readonly tag?: string;
}

/**
 * Checks that a release can be made (E09-F04-S01): the root version is a version, every published package has that version, is not
 * private and is publishable, the tag (when there is one) is the tag of that version, and the changelog has a dated section with notes
 * for it. Returns what is wrong, nothing when the release is fine.
 *
 * @example
 * ```ts
 * checkRelease({ rootVersion: '0.1.0', manifests, changelog, tag: 'v0.1.0' }).map((f) => f.message);
 * ```
 */
export function checkRelease(input: ReleaseInput): Finding[] {
  const { rootVersion, manifests, changelog, tag } = input;
  if (!isVersion(rootVersion)) {
    return [finding(`The version of the root package.json is ${JSON.stringify(rootVersion)}, not a version like 1.2.3.`)];
  }
  const findings: Finding[] = [];
  for (const pkg of RELEASE_PACKAGES) {
    for (const problem of sourceProblems(pkg, manifests.get(pkg.id) as Manifest, rootVersion)) findings.push(finding(`${pkg.name}: ${problem}`));
  }
  if (tag !== undefined && tag !== `v${rootVersion}`) {
    findings.push(finding(`The tag ${tag} does not match the version ${rootVersion} of the packages: the tag of this version is v${rootVersion}.`));
  }
  const section = changelogSection(changelog, rootVersion);
  if (section === undefined) {
    findings.push(finding(`${CHANGELOG_FILE} has no section "## ${rootVersion}" with notes.`));
  } else if (/unreleased/i.test(section.heading)) {
    findings.push(finding(`The ${CHANGELOG_FILE} section "${section.heading}" is still marked unreleased: give it the date of the release.`));
  }
  return findings;
}

/**
 * What is wrong with the package.json of a package in its publish folder, which is `dist` for Angular: `"private": true`, no `exports`, no
 * `types` or `typings` and, in a built manifest (Angular), a `workspace:` range that npm cannot install.
 *
 * @example
 * ```ts
 * checkPublishManifest(RELEASE_PACKAGES[4], distManifest).map((f) => f.message);
 * ```
 */
export function checkPublishManifest(pkg: ReleasePackage, manifest: Manifest): Finding[] {
  return manifestProblems(manifest, pkg.publishDir !== pkg.dir).map((problem) => finding(`${pkg.name}: ${problem}`));
}

function released(range: string, version: string): string {
  if (!range.startsWith(WORKSPACE)) return range;
  const bare = range.slice(WORKSPACE.length);
  if (bare === '*') return version;
  return bare === '^' || bare === '~' ? `${bare}${version}` : bare;
}

/**
 * The manifest with its `workspace:` ranges replaced by what pnpm publishes for them: `workspace:*` becomes the version, `workspace:^` and
 * `workspace:~` a range from it and any other `workspace:<range>` that range. The rest is left as it is, in its order. pnpm does this when
 * it packs a package (`pnpm pack`); the Angular manifest in `dist` is not a pnpm package, so it needs this step.
 *
 * @example
 * ```ts
 * releasedManifest({ dependencies: { core: 'workspace:*' } }, '0.1.0'); // { dependencies: { core: '0.1.0' } }
 * ```
 */
export function releasedManifest(manifest: Manifest, version: string): Manifest {
  const result: Record<string, unknown> = { ...manifest };
  for (const key of DEPENDENCY_KEYS) {
    const dependencies = manifest[key];
    if (!isRecord(dependencies)) continue;
    result[key] = Object.fromEntries(Object.entries(dependencies).map(([name, range]) => [name, typeof range === 'string' ? released(range, version) : range]));
  }
  return result;
}

const FORBIDDEN: readonly { readonly pattern: RegExp; readonly what: string }[] = [
  { pattern: /\.map$/, what: 'a source map' },
  { pattern: /(^|\/)__tests__\//, what: 'a test' },
  { pattern: /\.(test|spec)\./, what: 'a test' },
  { pattern: /(^|\/)(fixtures?|__fixtures__)\//, what: 'a fixture' },
  { pattern: /(^|\/)src\//, what: 'a source file' },
  { pattern: /(^|\/)(tsconfig[^/]*\.json|(vite|vitest)[^/]*\.config\.[cm]?[jt]s|stryker[^/]*\.(json|log))$/, what: 'a build or test configuration' },
  { pattern: /(^|\/)(coverage|reports|\.stryker-tmp|\.turbo)\//, what: 'a test or build report' },
];

/**
 * What is wrong with the files a package would put in its tarball (the paths `npm pack --dry-run` lists, relative to the package): no
 * package.json, no `dist/` files for a package that is published from its own folder, and any test, fixture, source file, source map,
 * build or test configuration or report (E09-F04-S02).
 *
 * @example
 * ```ts
 * checkTarball(RELEASE_PACKAGES[0], ['package.json', 'dist/index.js', 'dist/index.js.map']).map((f) => f.message);
 * ```
 */
export function checkTarball(pkg: ReleasePackage, files: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  if (!files.includes('package.json')) findings.push(finding(`${pkg.name}: the tarball has no package.json.`));
  if (pkg.publishDir === pkg.dir && !files.some((file) => file.startsWith('dist/'))) {
    findings.push(finding(`${pkg.name}: the tarball has no files in dist/; run "pnpm build" first.`));
  }
  for (const file of files) {
    const rule = FORBIDDEN.find((candidate) => candidate.pattern.test(file));
    if (rule !== undefined) findings.push(finding(`${pkg.name}: the tarball would contain ${file}, ${rule.what}.`));
  }
  return findings;
}

/**
 * The paths of the files in the output of `npm pack --dry-run --json`. Throws when the output is not JSON or not that report.
 *
 * @example
 * ```ts
 * parsePackFiles('[{"files":[{"path":"package.json"}]}]'); // ['package.json']
 * ```
 */
export function parsePackFiles(output: string): string[] {
  const failure = new Error('Unexpected output of "npm pack --dry-run --json": it has no list of files.');
  const parsed: unknown = JSON.parse(output);
  const entry = Array.isArray(parsed) ? (parsed[0] as unknown) : undefined;
  const files = isRecord(entry) ? entry.files : undefined;
  if (!Array.isArray(files)) throw failure;
  return files.map((file: unknown) => {
    if (!isRecord(file) || typeof file.path !== 'string') throw failure;
    return file.path;
  });
}
