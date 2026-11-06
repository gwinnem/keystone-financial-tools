import { describe, expect, it } from 'vitest';
import {
  CHANGELOG_FILE,
  RELEASE_PACKAGES,
  ROOT_MANIFEST,
  changelogSection,
  checkPublishManifest,
  checkRelease,
  checkTarball,
  isVersion,
  parseManifest,
  parsePackFiles,
  releasedManifest,
  versionOfTag,
  type Manifest,
  type ReleasePackage,
} from '../src/release.ts';

const [CORE, TYPESCRIPT, VUE, REACT, ANGULAR] = RELEASE_PACKAGES as readonly [ReleasePackage, ReleasePackage, ReleasePackage, ReleasePackage, ReleasePackage];

/** A package.json that can be published from its own folder. */
const sourceManifest = (pkg: ReleasePackage, version = '1.2.3', extra: Record<string, unknown> = {}): Manifest => ({
  name: pkg.name,
  version,
  files: ['dist'],
  exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
  types: './dist/index.d.ts',
  ...extra,
});

/** The package.json of Angular in its own folder: ng-packagr writes the entry points into `dist`. */
const angularSource = (version = '1.2.3', extra: Record<string, unknown> = {}): Manifest => ({ name: ANGULAR.name, version, ...extra });

/** The package.json ng-packagr writes into `dist`, once its workspace ranges are replaced. */
const angularDist = (extra: Record<string, unknown> = {}): Manifest => ({
  name: ANGULAR.name,
  version: '1.2.3',
  dependencies: { 'keystone-financial-tools-core': '1.2.3', tslib: '^2.8.1' },
  exports: { '.': { default: './fesm2022/keystone-financial-tools-angular.mjs' } },
  typings: 'types/keystone-financial-tools-angular.d.ts',
  ...extra,
});

function manifestsOf(overrides: Record<string, Manifest> = {}): Map<string, Manifest> {
  const manifests = new Map<string, Manifest>(RELEASE_PACKAGES.map((pkg): [string, Manifest] => [pkg.id, pkg === ANGULAR ? angularSource() : sourceManifest(pkg)]));
  for (const [id, manifest] of Object.entries(overrides)) manifests.set(id, manifest);
  return manifests;
}

const CHANGELOG = '# Changelog\n\n## 1.2.3 (2026-11-10)\n\n- Added things.\n\n## 1.2.2\n\n- Older.\n';

const releaseMessages = (overrides: Record<string, Manifest> = {}, changelog = CHANGELOG, tag?: string): string[] =>
  checkRelease({ rootVersion: '1.2.3', manifests: manifestsOf(overrides), changelog, tag }).map((finding) => finding.message);

describe('the published packages', () => {
  it('are the five packages in the order they are published, Angular from its dist folder', () => {
    expect(RELEASE_PACKAGES).toStrictEqual([
      { id: 'core', name: 'keystone-financial-tools-core', dir: 'packages/core', publishDir: 'packages/core' },
      { id: 'typescript', name: 'keystone-financial-tools-typescript', dir: 'packages/typescript', publishDir: 'packages/typescript' },
      { id: 'vue', name: 'keystone-financial-tools-vue', dir: 'packages/vue', publishDir: 'packages/vue' },
      { id: 'react', name: 'keystone-financial-tools-react', dir: 'packages/react', publishDir: 'packages/react' },
      { id: 'angular', name: 'keystone-financial-tools-angular', dir: 'packages/angular', publishDir: 'packages/angular/dist' },
    ]);
  });

  it('are read from the root manifest and the changelog at these places', () => {
    expect(ROOT_MANIFEST).toBe('package.json');
    expect(CHANGELOG_FILE).toBe('CHANGELOG.md');
  });
});

describe('isVersion', () => {
  it.each(['0.1.0', '1.2.3', '10.20.30', '1.0.0-beta.1', '1.0.0-rc-1', '1.0.0-0'])('accepts %s', (text) => {
    expect(isVersion(text)).toBe(true);
  });

  it.each(['', '1.2', '1', 'v1.2.3', '1.2.3.4', '1.2.x', '1x2x3', '1.2.3-', '1.2.3x', 'x1.2.3', ' 1.2.3', '1.2.3 ', '1.2.3-beta+build', '1.2.3\n'])('rejects %j', (text) => {
    expect(isVersion(text)).toBe(false);
  });

  it('rejects what is not text, even when it reads as a version', () => {
    for (const value of [['1.2.3'], 123, null, undefined, {}, true]) expect(isVersion(value)).toBe(false);
    expect(isVersion('1.2.3')).toBe(true);
  });
});

describe('versionOfTag', () => {
  it('is the version after the v', () => {
    expect(versionOfTag('v0.1.0')).toBe('0.1.0');
    expect(versionOfTag('v10.20.30')).toBe('10.20.30');
    expect(versionOfTag('v1.0.0-beta.1')).toBe('1.0.0-beta.1');
  });

  it.each(['1.2.3', 'v1.2', 'V1.2.3', 'release-1.2.3', 'v1.2.3 ', 'xv1.2.3', 'v1.2.3.4', 'vv1.2.3', ''])('throws for %j', (tag) => {
    expect(() => versionOfTag(tag)).toThrow(new Error(`The tag "${tag}" is not a version tag like v1.2.3.`));
  });
});

describe('parseManifest', () => {
  it('reads a JSON object', () => {
    expect(parseManifest('{"name":"a","version":"1.0.0"}', 'package.json')).toStrictEqual({ name: 'a', version: '1.0.0' });
  });

  it.each(['[]', 'null', '"text"', '12', 'true'])('throws for %s, naming the file', (text) => {
    expect(() => parseManifest(text, 'packages/x/package.json')).toThrow(new Error('packages/x/package.json is not a package manifest.'));
  });

  it('lets the error for text that is not JSON through', () => {
    expect(() => parseManifest('{', 'package.json')).toThrow(SyntaxError);
  });
});

describe('changelogSection', () => {
  it('is the heading and the notes under it, up to the next version', () => {
    expect(changelogSection(CHANGELOG, '1.2.3')).toStrictEqual({ heading: '## 1.2.3 (2026-11-10)', notes: '- Added things.' });
    expect(changelogSection(CHANGELOG, '1.2.2')).toStrictEqual({ heading: '## 1.2.2', notes: '- Older.' });
  });

  it('runs to the end of the file for the last version, with its last line', () => {
    expect(changelogSection('## 1.0.0\n\nfirst\nlast', '1.0.0')?.notes).toBe('first\nlast');
    expect(changelogSection('## 1.0.0\n\nfirst\nlast\n\n\n', '1.0.0')?.notes).toBe('first\nlast');
  });

  it('keeps lower headings, lists and blank lines inside the notes', () => {
    const changelog = '## 2.0.0\n\n### Added\n\n- one\n  more of one\n\n- two\n\n## 1.0.0\n\n- old\n';
    expect(changelogSection(changelog, '2.0.0')?.notes).toBe('### Added\n\n- one\n  more of one\n\n- two');
  });

  it('reads a file with Windows line ends', () => {
    expect(changelogSection('# Changelog\r\n\r\n## 1.2.3 (2026-11-10)\r\n\r\n- Added.\r\n- Fixed.\r\n\r\n## 1.2.2\r\n\r\n- Older.\r\n', '1.2.3')).toStrictEqual({
      heading: '## 1.2.3 (2026-11-10)',
      notes: '- Added.\n- Fixed.',
    });
  });

  it('keeps an unreleased note in the heading', () => {
    expect(changelogSection('## 0.1.0 (unreleased)\n\n- x\n', '0.1.0')?.heading).toBe('## 0.1.0 (unreleased)');
  });

  it('finds the version after other versions and notes', () => {
    expect(changelogSection('# Changelog\n\nintro\n\n## 3.0.0\n\n- c\n\n## 2.0.0\n\n- b\n\n## 1.0.0\n\n- a\n', '2.0.0')?.notes).toBe('- b');
  });

  it('is undefined for a version that has no heading', () => {
    expect(changelogSection(CHANGELOG, '9.9.9')).toBeUndefined();
    expect(changelogSection('', '1.0.0')).toBeUndefined();
  });

  it('matches the whole version, not a start of it', () => {
    const changelog = '## 1.2.30\n\n- a\n\n## 1.2.3-beta.1\n\n- b\n\n## 11.2.3\n\n- c\n';
    expect(changelogSection(changelog, '1.2.3')).toBeUndefined();
    expect(changelogSection(changelog, '1.2')).toBeUndefined();
    expect(changelogSection(changelog, '1.2.30')?.notes).toBe('- a');
    expect(changelogSection(changelog, '1.2.3-beta.1')?.notes).toBe('- b');
  });

  it.each(['### 1.2.3', '# 1.2.3', '1.2.3', '##1.2.3', ' ## 1.2.3', '- ## 1.2.3', '## v1.2.3', '## 1.2.3x', '## 1.2.3\t(2026-11-10)'])('does not take %j for the heading of 1.2.3', (line) => {
    expect(changelogSection(`${line}\n\n- notes\n`, '1.2.3')).toBeUndefined();
  });

  it.each(['## 1.2.3 (2026-11-10)', '## 1.2.3 - 2026-11-10', '## 1.2.3 '])('takes %j for the heading of 1.2.3', (line) => {
    expect(changelogSection(`${line}\n\n- notes\n`, '1.2.3')?.notes).toBe('- notes');
  });

  it('is undefined for a section without notes', () => {
    expect(changelogSection('## 1.0.0\n\n## 0.9.0\n\n- a\n', '1.0.0')).toBeUndefined();
    expect(changelogSection('## 1.0.0\n', '1.0.0')).toBeUndefined();
    expect(changelogSection('## 1.0.0', '1.0.0')).toBeUndefined();
    expect(changelogSection('## 1.0.0\n \n\t\n', '1.0.0')).toBeUndefined();
  });
});

describe('checkRelease', () => {
  it('finds nothing wrong with five packages of the root version, a changelog section and a matching tag', () => {
    expect(releaseMessages()).toStrictEqual([]);
    expect(releaseMessages({}, CHANGELOG, 'v1.2.3')).toStrictEqual([]);
  });

  it('gives every finding the kind release', () => {
    const findings = checkRelease({ rootVersion: '1.2.3', manifests: manifestsOf({ vue: sourceManifest(VUE, '1.0.0') }), changelog: '', tag: 'v9.9.9' });
    expect(findings).toHaveLength(3);
    expect(findings.map((finding) => finding.kind)).toStrictEqual(['release', 'release', 'release']);
  });

  it.each([undefined, null, '', '1.2', 'v1.2.3', 12, {}])('stops at a root version that is %j, and says so', (rootVersion) => {
    const findings = checkRelease({ rootVersion, manifests: manifestsOf(), changelog: CHANGELOG, tag: 'v1.2.3' });
    expect(findings.map((finding) => finding.message)).toStrictEqual([`The version of the root package.json is ${JSON.stringify(rootVersion)}, not a version like 1.2.3.`]);
  });

  it.each([
    ['core', CORE],
    ['typescript', TYPESCRIPT],
    ['vue', VUE],
    ['react', REACT],
  ] as const)('fails the %s package with another version than the others', (id, pkg) => {
    expect(releaseMessages({ [id]: sourceManifest(pkg, '1.2.2') })).toStrictEqual([`${pkg.name}: the version is "1.2.2", not 1.2.3 like the other packages.`]);
  });

  it('fails Angular with another version, and a package without a version', () => {
    expect(releaseMessages({ angular: angularSource('2.0.0') })).toStrictEqual([`${ANGULAR.name}: the version is "2.0.0", not 1.2.3 like the other packages.`]);
    expect(releaseMessages({ core: { ...sourceManifest(CORE), version: undefined } })).toStrictEqual([`${CORE.name}: the version is undefined, not 1.2.3 like the other packages.`]);
  });

  it('fails a package with the name of another', () => {
    expect(releaseMessages({ react: sourceManifest(VUE, '1.2.3', {}) })).toStrictEqual([`${REACT.name}: package.json has the name "${VUE.name}", expected ${REACT.name}.`]);
    expect(releaseMessages({ angular: { version: '1.2.3' } })).toStrictEqual([`${ANGULAR.name}: package.json has the name undefined, expected ${ANGULAR.name}.`]);
  });

  it('fails a private package, which npm refuses to publish', () => {
    expect(releaseMessages({ core: sourceManifest(CORE, '1.2.3', { private: true }) })).toStrictEqual([`${CORE.name}: package.json is "private": true, so npm refuses to publish it.`]);
    expect(releaseMessages({ angular: angularSource('1.2.3', { private: true }) })).toStrictEqual([`${ANGULAR.name}: package.json is "private": true, so npm refuses to publish it.`]);
  });

  it('accepts "private": false and a package that does not say', () => {
    expect(releaseMessages({ core: sourceManifest(CORE, '1.2.3', { private: false }) })).toStrictEqual([]);
    expect(releaseMessages({ angular: angularSource('1.2.3', { private: false }) })).toStrictEqual([]);
  });

  it('fails a package that does not publish its dist folder', () => {
    const message = `${VUE.name}: package.json "files" does not include "dist".`;
    expect(releaseMessages({ vue: sourceManifest(VUE, '1.2.3', { files: ['src'] }) })).toStrictEqual([message]);
    expect(releaseMessages({ vue: sourceManifest(VUE, '1.2.3', { files: [] }) })).toStrictEqual([message]);
    expect(releaseMessages({ vue: sourceManifest(VUE, '1.2.3', { files: 'dist' }) })).toStrictEqual([message]);
    expect(releaseMessages({ vue: sourceManifest(VUE, '1.2.3', { files: undefined }) })).toStrictEqual([message]);
    expect(releaseMessages({ vue: sourceManifest(VUE, '1.2.3', { files: ['dist', 'README.md'] }) })).toStrictEqual([]);
  });

  it('fails a package without exports, and one whose exports is not an object', () => {
    const message = `${REACT.name}: package.json has no "exports".`;
    expect(releaseMessages({ react: sourceManifest(REACT, '1.2.3', { exports: undefined }) })).toStrictEqual([message]);
    expect(releaseMessages({ react: sourceManifest(REACT, '1.2.3', { exports: null }) })).toStrictEqual([message]);
    expect(releaseMessages({ react: sourceManifest(REACT, '1.2.3', { exports: './dist/index.js' }) })).toStrictEqual([message]);
  });

  it('fails a package without types, and takes typings as types', () => {
    const message = `${TYPESCRIPT.name}: package.json has no "types" (or "typings").`;
    expect(releaseMessages({ typescript: sourceManifest(TYPESCRIPT, '1.2.3', { types: undefined }) })).toStrictEqual([message]);
    expect(releaseMessages({ typescript: sourceManifest(TYPESCRIPT, '1.2.3', { types: 5 }) })).toStrictEqual([message]);
    expect(releaseMessages({ typescript: sourceManifest(TYPESCRIPT, '1.2.3', { types: undefined, typings: './dist/index.d.ts' }) })).toStrictEqual([]);
  });

  it('does not ask Angular for files, exports or types in its own folder: ng-packagr writes them into dist', () => {
    expect(releaseMessages({ angular: angularSource() })).toStrictEqual([]);
  });

  it('allows workspace ranges in the package that is published from its own folder: pnpm replaces them when it packs', () => {
    expect(releaseMessages({ vue: sourceManifest(VUE, '1.2.3', { dependencies: { 'keystone-financial-tools-core': 'workspace:*' } }) })).toStrictEqual([]);
  });

  it('reports every problem of a package, then the next package', () => {
    expect(releaseMessages({ core: { name: CORE.name, version: '0.0.1', private: true }, vue: sourceManifest(VUE, '1.2.3', { exports: undefined }) })).toStrictEqual([
      `${CORE.name}: the version is "0.0.1", not 1.2.3 like the other packages.`,
      `${CORE.name}: package.json "files" does not include "dist".`,
      `${CORE.name}: package.json is "private": true, so npm refuses to publish it.`,
      `${CORE.name}: package.json has no "exports".`,
      `${CORE.name}: package.json has no "types" (or "typings").`,
      `${VUE.name}: package.json has no "exports".`,
    ]);
  });

  it('fails a tag that is not the tag of the version, and accepts no tag and the right tag', () => {
    expect(releaseMessages({}, CHANGELOG, 'v1.2.4')).toStrictEqual(['The tag v1.2.4 does not match the version 1.2.3 of the packages: the tag of this version is v1.2.3.']);
    expect(releaseMessages({}, CHANGELOG, '1.2.3')).toStrictEqual(['The tag 1.2.3 does not match the version 1.2.3 of the packages: the tag of this version is v1.2.3.']);
    expect(releaseMessages({}, CHANGELOG, undefined)).toStrictEqual([]);
    expect(releaseMessages({}, CHANGELOG, 'v1.2.3')).toStrictEqual([]);
  });

  it('fails a changelog without a section for the version', () => {
    expect(releaseMessages({}, '# Changelog\n\n## 1.2.2\n\n- Older.\n')).toStrictEqual(['CHANGELOG.md has no section "## 1.2.3" with notes.']);
    expect(releaseMessages({}, '## 1.2.3\n\n## 1.2.2\n\n- Older.\n')).toStrictEqual(['CHANGELOG.md has no section "## 1.2.3" with notes.']);
  });

  it('fails a section that is still marked unreleased, in any case, and accepts one with a date', () => {
    expect(releaseMessages({}, '## 1.2.3 (unreleased)\n\n- x\n')).toStrictEqual(['The CHANGELOG.md section "## 1.2.3 (unreleased)" is still marked unreleased: give it the date of the release.']);
    expect(releaseMessages({}, '## 1.2.3 (Unreleased)\n\n- x\n')).toHaveLength(1);
    expect(releaseMessages({}, '## 1.2.3 (2026-11-10)\n\n- x\n')).toStrictEqual([]);
    expect(releaseMessages({}, '## 1.2.3\n\n- Unreleased things are not a marker in the notes.\n')).toStrictEqual([]);
  });

  it('reports the packages, the tag and the changelog together, in that order', () => {
    expect(releaseMessages({ vue: sourceManifest(VUE, '1.0.0') }, '', 'v2.0.0')).toStrictEqual([
      `${VUE.name}: the version is "1.0.0", not 1.2.3 like the other packages.`,
      'The tag v2.0.0 does not match the version 1.2.3 of the packages: the tag of this version is v1.2.3.',
      'CHANGELOG.md has no section "## 1.2.3" with notes.',
    ]);
  });
});

describe('checkPublishManifest', () => {
  const messages = (pkg: ReleasePackage, manifest: Manifest): string[] => checkPublishManifest(pkg, manifest).map((finding) => finding.message);

  it('finds nothing wrong with a publishable manifest of each package', () => {
    for (const pkg of [CORE, TYPESCRIPT, VUE, REACT]) expect(messages(pkg, sourceManifest(pkg))).toStrictEqual([]);
    expect(messages(ANGULAR, angularDist())).toStrictEqual([]);
  });

  it('gives its findings the kind release', () => {
    expect(checkPublishManifest(CORE, {}).map((finding) => finding.kind)).toStrictEqual(['release', 'release']);
  });

  it('fails a private package, one without exports and one without types, in that order', () => {
    expect(messages(CORE, { private: true })).toStrictEqual([
      `${CORE.name}: package.json is "private": true, so npm refuses to publish it.`,
      `${CORE.name}: package.json has no "exports".`,
      `${CORE.name}: package.json has no "types" (or "typings").`,
    ]);
    expect(messages(ANGULAR, angularDist({ private: true }))).toStrictEqual([`${ANGULAR.name}: package.json is "private": true, so npm refuses to publish it.`]);
    expect(messages(ANGULAR, angularDist({ exports: undefined }))).toStrictEqual([`${ANGULAR.name}: package.json has no "exports".`]);
    expect(messages(ANGULAR, angularDist({ typings: undefined }))).toStrictEqual([`${ANGULAR.name}: package.json has no "types" (or "typings").`]);
  });

  it('prefers types and accepts typings', () => {
    expect(messages(CORE, sourceManifest(CORE, '1.0.0', { types: undefined, typings: 'x.d.ts' }))).toStrictEqual([]);
    expect(messages(CORE, sourceManifest(CORE, '1.0.0', { types: 'x.d.ts', typings: undefined }))).toStrictEqual([]);
    expect(messages(CORE, sourceManifest(CORE, '1.0.0', { types: undefined, typings: undefined }))).toStrictEqual([`${CORE.name}: package.json has no "types" (or "typings").`]);
  });

  it.each(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'])('fails a workspace range in the %s of a built manifest', (key) => {
    expect(messages(ANGULAR, angularDist({ [key]: { 'keystone-financial-tools-core': 'workspace:*', tslib: '^2.8.1' } }))).toStrictEqual([
      `${ANGULAR.name}: ${key}.keystone-financial-tools-core is workspace:*, which npm cannot install: run "pnpm --filter keystone-financial-tools-budgets release:prepare".`,
    ]);
  });

  it('lists every workspace range, for every dependency of a built manifest', () => {
    const found = messages(ANGULAR, angularDist({ dependencies: { a: 'workspace:^', b: '1.0.0', c: 'workspace:~' } }));
    expect(found).toStrictEqual([
      `${ANGULAR.name}: dependencies.a is workspace:^, which npm cannot install: run "pnpm --filter keystone-financial-tools-budgets release:prepare".`,
      `${ANGULAR.name}: dependencies.c is workspace:~, which npm cannot install: run "pnpm --filter keystone-financial-tools-budgets release:prepare".`,
    ]);
  });

  it('does not mind workspace ranges in the manifest of a package that is published from its own folder: pnpm replaces them', () => {
    expect(messages(CORE, sourceManifest(CORE, '1.0.0', { dependencies: { 'keystone-financial-tools-core': 'workspace:*' } }))).toStrictEqual([]);
  });

  it('ignores a dependency that is not text and a dependency list that is not an object', () => {
    expect(messages(ANGULAR, angularDist({ dependencies: { a: 5, b: null }, peerDependencies: 'workspace:*', optionalDependencies: null }))).toStrictEqual([]);
  });
});

describe('releasedManifest', () => {
  it('replaces workspace:* by the version, workspace:^ and workspace:~ by a range from it, and workspace:<range> by that range', () => {
    const manifest = { dependencies: { a: 'workspace:*', b: 'workspace:^', c: 'workspace:~', d: 'workspace:^1.2.0', e: 'workspace:1.0.0', f: 'workspace:>=1.0.0' } };
    expect(releasedManifest(manifest, '0.1.0')).toStrictEqual({ dependencies: { a: '0.1.0', b: '^0.1.0', c: '~0.1.0', d: '^1.2.0', e: '1.0.0', f: '>=1.0.0' } });
  });

  it('leaves other ranges, and everything else, as it is, in its order', () => {
    const manifest = { name: 'x', dependencies: { core: 'workspace:*', tslib: '^2.8.1' }, scripts: { build: 'x' }, version: '0.1.0' };
    const result = releasedManifest(manifest, '0.1.0');
    expect(result).toStrictEqual({ name: 'x', dependencies: { core: '0.1.0', tslib: '^2.8.1' }, scripts: { build: 'x' }, version: '0.1.0' });
    expect(Object.keys(result)).toStrictEqual(['name', 'dependencies', 'scripts', 'version']);
    expect(Object.keys(result.dependencies as object)).toStrictEqual(['core', 'tslib']);
  });

  it('does the same in all four kinds of dependencies, and only there', () => {
    const range = 'workspace:*';
    const manifest = { dependencies: { a: range }, peerDependencies: { a: range }, optionalDependencies: { a: range }, devDependencies: { a: range }, other: { a: range }, exports: { a: range } };
    expect(releasedManifest(manifest, '2.0.0')).toStrictEqual({
      dependencies: { a: '2.0.0' },
      peerDependencies: { a: '2.0.0' },
      optionalDependencies: { a: '2.0.0' },
      devDependencies: { a: '2.0.0' },
      other: { a: range },
      exports: { a: range },
    });
  });

  it('keeps what is not text, adds no dependency lists and does not change its input', () => {
    const manifest = { dependencies: { a: 5, b: null, c: 'workspace:*' }, peerDependencies: 'workspace:*', devDependencies: null };
    const copy = JSON.parse(JSON.stringify(manifest)) as unknown;
    expect(releasedManifest(manifest, '1.0.0')).toStrictEqual({ dependencies: { a: 5, b: null, c: '1.0.0' }, peerDependencies: 'workspace:*', devDependencies: null });
    expect(manifest).toStrictEqual(copy);
    expect('peerDependencies' in releasedManifest({ name: 'x' }, '1.0.0')).toBe(false);
    expect(Object.keys(releasedManifest({ name: 'x' }, '1.0.0'))).toStrictEqual(['name']);
  });

  it('matches only a range that starts with workspace:', () => {
    expect(releasedManifest({ dependencies: { a: 'x-workspace:*', b: 'npm:workspace:*' } }, '1.0.0')).toStrictEqual({ dependencies: { a: 'x-workspace:*', b: 'npm:workspace:*' } });
  });
});

describe('checkTarball', () => {
  const messages = (pkg: ReleasePackage, files: readonly string[]): string[] => checkTarball(pkg, files).map((finding) => finding.message);
  const GOOD = ['package.json', 'README.md', 'dist/index.js', 'dist/index.cjs', 'dist/index.umd.cjs', 'dist/index.d.ts', 'dist/testing.js', 'dist/testing/index.d.ts'];

  it('finds nothing wrong with the manifest, the readme and the built files', () => {
    expect(messages(CORE, GOOD)).toStrictEqual([]);
    expect(messages(ANGULAR, ['package.json', 'README.md', 'LICENSE', 'fesm2022/keystone-financial-tools-angular.mjs', 'types/keystone-financial-tools-angular.d.ts'])).toStrictEqual([]);
  });

  it('gives its findings the kind release', () => {
    expect(checkTarball(CORE, ['dist/a.js.map']).map((finding) => finding.kind)).toStrictEqual(['release', 'release']);
  });

  it('fails a tarball without a package.json', () => {
    expect(messages(CORE, ['dist/index.js'])).toStrictEqual([`${CORE.name}: the tarball has no package.json.`]);
    expect(messages(CORE, ['dist/package.json', 'dist/index.js'])).toStrictEqual([`${CORE.name}: the tarball has no package.json.`]);
    expect(messages(ANGULAR, [])).toStrictEqual([`${ANGULAR.name}: the tarball has no package.json.`]);
  });

  it('fails a package published from its own folder when its tarball has no dist files, and not Angular', () => {
    expect(messages(VUE, ['package.json', 'README.md'])).toStrictEqual([`${VUE.name}: the tarball has no files in dist/; run "pnpm build" first.`]);
    expect(messages(VUE, ['package.json', 'distribution/index.js', 'mydist/index.js'])).toStrictEqual([`${VUE.name}: the tarball has no files in dist/; run "pnpm build" first.`]);
    expect(messages(ANGULAR, ['package.json'])).toStrictEqual([]);
  });

  it.each([
    ['dist/index.js.map', 'a source map'],
    ['dist/index.d.ts.map', 'a source map'],
    ['__tests__/a.ts', 'a test'],
    ['dist/__tests__/a.js', 'a test'],
    ['dist/a.test.js', 'a test'],
    ['dist/a.test.d.ts', 'a test'],
    ['dist/a.spec.mjs', 'a test'],
    ['fixtures/a.json', 'a fixture'],
    ['dist/fixture/a.json', 'a fixture'],
    ['dist/__fixtures__/a.json', 'a fixture'],
    ['src/index.ts', 'a source file'],
    ['dist/src/index.js', 'a source file'],
    ['tsconfig.json', 'a build or test configuration'],
    ['tsconfig.build.json', 'a build or test configuration'],
    ['vite.config.ts', 'a build or test configuration'],
    ['vite.testing.config.ts', 'a build or test configuration'],
    ['vitest.config.mts', 'a build or test configuration'],
    ['stryker.conf.json', 'a build or test configuration'],
    ['stryker.log', 'a build or test configuration'],
    ['coverage/index.html', 'a test or build report'],
    ['reports/mutation/index.html', 'a test or build report'],
    ['.stryker-tmp/sandbox/a.js', 'a test or build report'],
    ['.turbo/turbo-build.log', 'a test or build report'],
    ['dist/.turbo/x.log', 'a test or build report'],
  ])('fails %s: %s', (file, what) => {
    expect(messages(ANGULAR, ['package.json', file])).toStrictEqual([`${ANGULAR.name}: the tarball would contain ${file}, ${what}.`]);
  });

  it.each([
    'dist/x.map.js',
    'dist/testing.js',
    'dist/latest.js',
    'dist/myfixtures/a.json',
    'dist/resrc/a.js',
    'dist/src.js',
    'dist/mytsconfig.json',
    'dist/vite-plugin.js',
    'dist/vite.js',
    'dist/stryker-notes.md',
    'dist/tsconfig.json.md',
    'dist/vite.config.ts.txt',
    'dist/stryker.log.txt',
    'dist/coverage.js',
    'dist/reports.js',
    'dist/a_test.js',
    'dist/test.js',
    'dist/spec.js',
    'dist/tests/a.js',
    'dist/__tests__x/a.js',
  ])('does not mind %s', (file) => {
    expect(messages(ANGULAR, ['package.json', file])).toStrictEqual([]);
  });

  it('names a file once, for the first rule that fits, and every file that is wrong', () => {
    expect(messages(CORE, ['package.json', 'dist/index.js', 'src/a.test.ts', 'dist/index.js.map', 'src/b.ts'])).toStrictEqual([
      `${CORE.name}: the tarball would contain src/a.test.ts, a test.`,
      `${CORE.name}: the tarball would contain dist/index.js.map, a source map.`,
      `${CORE.name}: the tarball would contain src/b.ts, a source file.`,
    ]);
  });

  it('reports the missing manifest and dist before the files that do not belong', () => {
    expect(messages(CORE, ['src/a.ts'])).toStrictEqual([
      `${CORE.name}: the tarball has no package.json.`,
      `${CORE.name}: the tarball has no files in dist/; run "pnpm build" first.`,
      `${CORE.name}: the tarball would contain src/a.ts, a source file.`,
    ]);
  });
});

describe('parsePackFiles', () => {
  const FAILURE = new Error('Unexpected output of "npm pack --dry-run --json": it has no list of files.');

  it('is the paths of the files of the first package', () => {
    expect(parsePackFiles('[{"name":"a","files":[{"path":"package.json","size":1},{"path":"dist/index.js","size":2}]}]')).toStrictEqual(['package.json', 'dist/index.js']);
    expect(parsePackFiles('[{"files":[{"path":"a"}]},{"files":[{"path":"b"}]}]')).toStrictEqual(['a']);
    expect(parsePackFiles('[{"files":[]}]')).toStrictEqual([]);
  });

  it.each([
    '{}',
    '[]',
    '[{}]',
    '[null]',
    '[1]',
    'null',
    '"x"',
    '{"files":[{"path":"a"}]}',
    '[{"files":"a"}]',
    '[{"files":{"path":"a"}}]',
    '[{"files":[{}]}]',
    '[{"files":[{"path":1}]}]',
    '[{"files":[null]}]',
    '[{"files":["a"]}]',
  ])('throws for %s', (output) => {
    expect(() => parsePackFiles(output)).toThrow(FAILURE);
  });

  it('lets the error for output that is not JSON through', () => {
    expect(() => parsePackFiles('npm notice')).toThrow(SyntaxError);
  });
});
