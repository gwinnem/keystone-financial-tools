import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RELEASE_PACKAGES, type ReleasePackage } from '../src/release.ts';
import { main, USAGE } from '../src/run.ts';
import { memoryIo } from './support.ts';

const ROOT = resolve('/repo');
const at = (relative: string, root = ROOT): string => resolve(root, relative);
const ANGULAR = RELEASE_PACKAGES[4] as ReleasePackage;
const NPM_PACK = ['pack', '--dry-run', '--json', '--ignore-scripts'];

const CHANGELOG = '# Changelog\n\n## 0.1.0 (2026-11-10)\n\n### Added\n\n- First release.\n- Second line.\n\n## 0.0.1\n\n- Older.\n';

const sourceManifest = (pkg: ReleasePackage, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name: pkg.name, version: '0.1.0', files: ['dist'], exports: { '.': { import: './dist/index.js' } }, types: './dist/index.d.ts', ...extra });

const angularSourceManifest = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name: ANGULAR.name, version: '0.1.0', dependencies: { 'keystone-financial-tools-core': 'workspace:*', tslib: '^2.8.1' }, ...extra });

const DIST = {
  name: ANGULAR.name,
  version: '0.1.0',
  dependencies: { 'keystone-financial-tools-core': 'workspace:*', tslib: '^2.8.1' },
  module: 'fesm2022/keystone-financial-tools-angular.mjs',
  typings: 'types/keystone-financial-tools-angular.d.ts',
  exports: { '.': { default: './fesm2022/keystone-financial-tools-angular.mjs' } },
  scripts: { prepublishOnly: 'node --eval "process.exit(1)"' },
};

/** The files of a clean checkout: the root and the five packages at one version, and a changelog. */
function checkout(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const files: Record<string, string | undefined> = {
    [at('package.json')]: JSON.stringify({ name: 'keystone-financial-tools', version: '0.1.0', private: true }),
    [at('CHANGELOG.md')]: CHANGELOG,
    ...Object.fromEntries(RELEASE_PACKAGES.map((pkg) => [at(`${pkg.dir}/package.json`), pkg.id === 'angular' ? angularSourceManifest() : sourceManifest(pkg)])),
    ...overrides,
  };
  return Object.fromEntries(Object.entries(files).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

/** The files of a checkout after the build: the built manifest of Angular as ng-packagr writes it. */
const built = (overrides: Record<string, string | undefined> = {}): Record<string, string> => checkout({ [at('packages/angular/dist/package.json')]: JSON.stringify(DIST), ...overrides });

/** The build after `publish-prepare`: the workspace range of Angular is the release version, so `pack-check` passes it. */
const preparedBuild = (overrides: Record<string, string | undefined> = {}): Record<string, string> =>
  built({
    [at('packages/angular/dist/package.json')]: JSON.stringify({ ...DIST, dependencies: { 'keystone-financial-tools-core': '0.1.0', tslib: '^2.8.1' } }),
    ...overrides,
  });

const packOutput = (...paths: string[]): string => JSON.stringify([{ name: 'x', files: paths.map((path) => ({ path, size: 1 })) }]);
const GOOD_TARBALL = packOutput('package.json', 'README.md', 'dist/index.js', 'dist/index.d.ts');
const ANGULAR_TARBALL = packOutput('package.json', 'README.md', 'fesm2022/keystone-financial-tools-angular.mjs', 'types/keystone-financial-tools-angular.d.ts');
const cleanTarballs = (): Record<string, string> => Object.fromEntries(RELEASE_PACKAGES.map((pkg) => [at(pkg.publishDir), pkg.id === 'angular' ? ANGULAR_TARBALL : GOOD_TARBALL]));

describe('the usage', () => {
  it('names the release commands and their options', () => {
    for (const word of ['release-check', 'release-notes', 'publish-prepare', 'pack-check', '--tag <vX.Y.Z>', '--version <X.Y.Z>', '--out <file>']) expect(USAGE).toContain(word);
  });
});

describe('main release-check (E09-F04-S01)', () => {
  it('passes five packages of one version with a dated changelog section', async () => {
    const { io, lines } = memoryIo(checkout());
    expect(await main(['release-check'], io, ROOT)).toBe(0);
    expect(lines).toStrictEqual(['OK 5 packages have the version 0.1.0 and CHANGELOG.md has its notes.']);
  });

  it('passes the tag of that version and fails another', async () => {
    const right = memoryIo(checkout());
    expect(await main(['release-check', '--tag', 'v0.1.0'], right.io, ROOT)).toBe(0);
    expect(right.lines).toHaveLength(1);
    const wrong = memoryIo(checkout());
    expect(await main(['release-check', '--tag', 'v0.2.0'], wrong.io, ROOT)).toBe(1);
    expect(wrong.lines).toStrictEqual(['FAIL The tag v0.2.0 does not match the version 0.1.0 of the packages: the tag of this version is v0.1.0.']);
  });

  it('logs every finding as a FAIL line and no OK line', async () => {
    const { io, lines } = memoryIo(
      checkout({
        [at('packages/vue/package.json')]: sourceManifest(RELEASE_PACKAGES[2] as ReleasePackage, { version: '0.0.9' }),
        [at('packages/react/package.json')]: sourceManifest(RELEASE_PACKAGES[3] as ReleasePackage, { private: true }),
        [at('CHANGELOG.md')]: '## 0.1.0 (unreleased)\n\n- x\n',
      })
    );
    expect(await main(['release-check'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual([
      'FAIL keystone-financial-tools-vue: the version is "0.0.9", not 0.1.0 like the other packages.',
      'FAIL keystone-financial-tools-react: package.json is "private": true, so npm refuses to publish it.',
      'FAIL The CHANGELOG.md section "## 0.1.0 (unreleased)" is still marked unreleased: give it the date of the release.',
    ]);
  });

  it('fails a root version that is not a version', async () => {
    const { io, lines } = memoryIo(checkout({ [at('package.json')]: JSON.stringify({ name: 'x' }) }));
    expect(await main(['release-check'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual(['FAIL The version of the root package.json is undefined, not a version like 1.2.3.']);
  });

  it.each([
    ['the root package.json', 'package.json', 'error: package.json does not exist.'],
    ['a package.json of a package', 'packages/vue/package.json', 'error: packages/vue/package.json does not exist.'],
    ['the changelog', 'CHANGELOG.md', 'error: CHANGELOG.md does not exist.'],
  ])('returns 1 and says so when %s is missing', async (_what, file, message) => {
    const { io, lines } = memoryIo(checkout({ [at(file)]: undefined }));
    expect(await main(['release-check'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual([message]);
  });

  it('returns 1 and names the file of a package.json that is not an object', async () => {
    const { io, lines } = memoryIo(checkout({ [at('packages/core/package.json')]: '[]' }));
    expect(await main(['release-check'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual(['error: packages/core/package.json is not a package manifest.']);
  });

  it('reads the checkout of --root', async () => {
    const other = resolve('/other');
    const files = Object.fromEntries(Object.entries(checkout()).map(([path, text]) => [path.replace(ROOT, other), text]));
    const { io } = memoryIo(files);
    expect(await main(['release-check', '--root', other], io, ROOT)).toBe(0);
  });
});

describe('main release-notes (E09-F04-S01)', () => {
  const NOTES = '### Added\n\n- First release.\n- Second line.';

  it('prints the notes of --version, and of the version of --tag', async () => {
    for (const argv of [
      ['release-notes', '--version', '0.1.0'],
      ['release-notes', '--tag', 'v0.1.0'],
    ]) {
      const { io, lines } = memoryIo(checkout());
      expect(await main(argv, io, ROOT)).toBe(0);
      expect(lines).toStrictEqual([NOTES]);
    }
  });

  it('prints the notes of an older version', async () => {
    const { io, lines } = memoryIo(checkout());
    expect(await main(['release-notes', '--version', '0.0.1'], io, ROOT)).toBe(0);
    expect(lines).toStrictEqual(['- Older.']);
  });

  it('writes the notes to --out, relative to the root, instead of printing them', async () => {
    const { io, lines, files } = memoryIo(checkout());
    expect(await main(['release-notes', '--tag', 'v0.1.0', '--out', 'release/notes.md'], io, ROOT)).toBe(0);
    expect(files.get(at('release/notes.md'))).toBe(`${NOTES}\n`);
    expect(lines).toStrictEqual([`Wrote the release notes of 0.1.0 to ${at('release/notes.md')}.`]);
  });

  it('reads and writes at --root', async () => {
    const other = resolve('/other');
    const { io, files } = memoryIo({ [at('CHANGELOG.md', other)]: CHANGELOG });
    expect(await main(['release-notes', '--version', '0.1.0', '--out', 'n.md', '--root', other], io, ROOT)).toBe(0);
    expect(files.get(at('n.md', other))).toBe(`${NOTES}\n`);
    expect(files.has(at('n.md'))).toBe(false);
  });

  it.each([
    ['neither a tag nor a version', ['release-notes'], 'error: Give either --tag or --version.'],
    ['both', ['release-notes', '--tag', 'v0.1.0', '--version', '0.1.0'], 'error: Give either --tag or --version.'],
    ['a tag that is not a version tag', ['release-notes', '--tag', '0.1.0'], 'error: The tag "0.1.0" is not a version tag like v1.2.3.'],
    ['a version without notes', ['release-notes', '--version', '9.9.9'], 'error: CHANGELOG.md has no section "## 9.9.9" with notes.'],
    ['a tag of a version without notes', ['release-notes', '--tag', 'v9.9.9'], 'error: CHANGELOG.md has no section "## 9.9.9" with notes.'],
  ])('returns 1 and says what is wrong for %s', async (_what, argv, message) => {
    const { io, lines, files } = memoryIo(checkout());
    expect(await main(argv, io, ROOT)).toBe(1);
    expect(lines).toStrictEqual([message]);
    expect(files.has(at('release/notes.md'))).toBe(false);
  });

  it('returns 1 when there is no changelog', async () => {
    const { io, lines } = memoryIo(checkout({ [at('CHANGELOG.md')]: undefined }));
    expect(await main(['release-notes', '--version', '0.1.0'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual(['error: CHANGELOG.md does not exist.']);
  });

  it('writes nothing for a version without notes', async () => {
    const { io, files } = memoryIo(checkout());
    await main(['release-notes', '--version', '9.9.9', '--out', 'n.md'], io, ROOT);
    expect(files.has(at('n.md'))).toBe(false);
  });
});

describe('main publish-prepare (E09-F04-S02)', () => {
  const DIST_PATH = at('packages/angular/dist/package.json');
  const PREPARED = `${JSON.stringify({ ...DIST, dependencies: { 'keystone-financial-tools-core': '0.1.0', tslib: '^2.8.1' } }, null, 2)}\n`;

  it('replaces the workspace ranges of the built Angular manifest by the release version, and keeps the rest as it was', async () => {
    const { io, lines, files } = memoryIo(built());
    expect(await main(['publish-prepare'], io, ROOT)).toBe(0);
    expect(files.get(DIST_PATH)).toBe(PREPARED);
    expect(lines).toStrictEqual(['packages/angular/dist/package.json: the workspace dependencies are 0.1.0 now.', 'OK packages/angular/dist/package.json can be published.']);
  });

  it('is the same the second time', async () => {
    const { io, files } = memoryIo(built());
    await main(['publish-prepare'], io, ROOT);
    expect(await main(['publish-prepare'], io, ROOT)).toBe(0);
    expect(files.get(DIST_PATH)).toBe(PREPARED);
  });

  it('writes the file Angular only, and no other manifest', async () => {
    const before = built();
    const { io, files } = memoryIo(before);
    await main(['publish-prepare'], io, ROOT);
    for (const [path, text] of Object.entries(before)) if (path !== DIST_PATH) expect(files.get(path)).toBe(text);
    expect(files.size).toBe(Object.keys(before).length);
  });

  it('takes the version of the root package.json', async () => {
    const { io, files } = memoryIo(built({ [at('package.json')]: JSON.stringify({ version: '2.5.0-beta.1' }) }));
    await main(['publish-prepare'], io, ROOT);
    expect(JSON.parse(files.get(DIST_PATH) as string).dependencies).toStrictEqual({ 'keystone-financial-tools-core': '2.5.0-beta.1', tslib: '^2.8.1' });
  });

  it('works at --root', async () => {
    const other = resolve('/other');
    const { io, files } = memoryIo({
      [at('package.json', other)]: JSON.stringify({ version: '0.1.0' }),
      [at('packages/angular/dist/package.json', other)]: JSON.stringify(DIST),
    });
    expect(await main(['publish-prepare', '--root', other], io, ROOT)).toBe(0);
    expect(files.get(at('packages/angular/dist/package.json', other))).toBe(PREPARED);
  });

  it('fails a built manifest that npm would refuse, after it wrote it', async () => {
    const { io, lines, files } = memoryIo(built({ [DIST_PATH]: JSON.stringify({ ...DIST, private: true, exports: undefined }) }));
    expect(await main(['publish-prepare'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual([
      'packages/angular/dist/package.json: the workspace dependencies are 0.1.0 now.',
      'FAIL keystone-financial-tools-angular: package.json is "private": true, so npm refuses to publish it.',
      'FAIL keystone-financial-tools-angular: package.json has no "exports".',
    ]);
    expect(JSON.parse(files.get(DIST_PATH) as string).dependencies['keystone-financial-tools-core']).toBe('0.1.0');
  });

  it.each([
    ['there is no build', { [at('packages/angular/dist/package.json')]: undefined }, 'error: packages/angular/dist/package.json does not exist; run "pnpm build" first.'],
    ['there is no root package.json', { [at('package.json')]: undefined }, 'error: package.json does not exist.'],
    ['the root package.json has no version', { [at('package.json')]: '{}' }, 'error: package.json has no version.'],
    ['the version is not text', { [at('package.json')]: '{"version":1}' }, 'error: package.json has no version.'],
    ['the built manifest is not an object', { [at('packages/angular/dist/package.json')]: '"x"' }, 'error: packages/angular/dist/package.json is not a package manifest.'],
  ])('returns 1 when %s', async (_what, overrides, message) => {
    const { io, lines } = memoryIo(built(overrides));
    expect(await main(['publish-prepare'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual([message]);
  });
});

describe('main pack-check (E09-F04-S02)', () => {
  it('runs npm pack --dry-run in the publish folder of every package, in publish order, and passes clean tarballs', async () => {
    const { io, lines, runs } = memoryIo(preparedBuild(), cleanTarballs());
    expect(await main(['pack-check'], io, ROOT)).toBe(0);
    expect(runs).toStrictEqual(RELEASE_PACKAGES.map((pkg) => ({ command: 'npm', args: NPM_PACK, cwd: at(pkg.publishDir) })));
    expect(runs[4]?.cwd).toBe(at('packages/angular/dist'));
    expect(lines).toStrictEqual([
      'keystone-financial-tools-core: 4 files in the tarball',
      'keystone-financial-tools-typescript: 4 files in the tarball',
      'keystone-financial-tools-vue: 4 files in the tarball',
      'keystone-financial-tools-react: 4 files in the tarball',
      'keystone-financial-tools-angular: 4 files in the tarball',
      'OK 5 tarballs hold only what is published.',
    ]);
  });

  it('passes a prepared Angular manifest and fails one that still has a workspace range', async () => {
    const prepared = JSON.stringify({ ...DIST, dependencies: { 'keystone-financial-tools-core': '0.1.0' } });
    expect(await main(['pack-check'], memoryIo(built({ [at('packages/angular/dist/package.json')]: prepared }), cleanTarballs()).io, ROOT)).toBe(0);
    const { io, lines } = memoryIo(built(), cleanTarballs());
    expect(await main(['pack-check'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL '))).toStrictEqual([
      'FAIL keystone-financial-tools-angular: dependencies.keystone-financial-tools-core is workspace:*, which npm cannot install: run "pnpm --filter keystone-financial-tools-budgets release:prepare".',
    ]);
  });

  it('fails a test, a fixture, a source map and a source file in a tarball, naming the package and the file', async () => {
    const outputs = { ...cleanTarballs(), [at('packages/vue')]: packOutput('package.json', 'dist/index.js', 'dist/index.js.map', 'dist/__tests__/a.js', 'src/index.ts', 'fixtures/a.json') };
    const { io, lines } = memoryIo(preparedBuild(), outputs);
    expect(await main(['pack-check'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL '))).toStrictEqual([
      'FAIL keystone-financial-tools-vue: the tarball would contain dist/index.js.map, a source map.',
      'FAIL keystone-financial-tools-vue: the tarball would contain dist/__tests__/a.js, a test.',
      'FAIL keystone-financial-tools-vue: the tarball would contain src/index.ts, a source file.',
      'FAIL keystone-financial-tools-vue: the tarball would contain fixtures/a.json, a fixture.',
    ]);
    expect(lines.some((line) => line.startsWith('OK '))).toBe(false);
  });

  it('checks every package before it fails, the manifest of a package before its tarball', async () => {
    const outputs = {
      ...cleanTarballs(),
      [at('packages/core')]: packOutput('package.json', 'dist/a.js.map'),
      [at('packages/react')]: packOutput('package.json', 'README.md'),
    };
    const overrides = { [at('packages/core/package.json')]: sourceManifest(RELEASE_PACKAGES[0] as ReleasePackage, { private: true }) };
    const { io, lines, runs } = memoryIo(preparedBuild(overrides), outputs);
    expect(await main(['pack-check'], io, ROOT)).toBe(1);
    expect(runs).toHaveLength(5);
    expect(lines.filter((line) => line.startsWith('FAIL '))).toStrictEqual([
      'FAIL keystone-financial-tools-core: package.json is "private": true, so npm refuses to publish it.',
      'FAIL keystone-financial-tools-core: the tarball would contain dist/a.js.map, a source map.',
      'FAIL keystone-financial-tools-react: the tarball has no files in dist/; run "pnpm build" first.',
    ]);
  });

  it('fails a package that is not built', async () => {
    const { io, lines } = memoryIo(preparedBuild(), { ...cleanTarballs(), [at('packages/typescript')]: packOutput('package.json', 'README.md') });
    expect(await main(['pack-check'], io, ROOT)).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL '))).toStrictEqual(['FAIL keystone-financial-tools-typescript: the tarball has no files in dist/; run "pnpm build" first.']);
  });

  it('returns 1 and says so when Angular is not built, after it checked the packages before it', async () => {
    const { io, lines } = memoryIo(preparedBuild({ [at('packages/angular/dist/package.json')]: undefined }), cleanTarballs());
    expect(await main(['pack-check'], io, ROOT)).toBe(1);
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe('error: packages/angular/dist/package.json does not exist; run "pnpm build" first.');
  });

  it('returns 1 for a package.json that is not JSON', async () => {
    const { io, lines } = memoryIo(preparedBuild({ [at('packages/core/package.json')]: '{' }), cleanTarballs());
    expect(await main(['pack-check'], io, ROOT)).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^error: /);
  });

  it('returns 1 and logs the error when npm fails, and does not go on', async () => {
    const outputs = cleanTarballs();
    delete outputs[at('packages/typescript')];
    const { io, lines, runs } = memoryIo(preparedBuild(), outputs);
    expect(await main(['pack-check'], io, ROOT)).toBe(1);
    expect(runs).toHaveLength(2);
    expect(lines).toStrictEqual(['keystone-financial-tools-core: 4 files in the tarball', `error: npm failed in ${at('packages/typescript')}`]);
  });

  it('returns 1 for output that is not the report of npm pack', async () => {
    const { io, lines } = memoryIo(preparedBuild(), { ...cleanTarballs(), [at('packages/core')]: '[]' });
    expect(await main(['pack-check'], io, ROOT)).toBe(1);
    expect(lines).toStrictEqual(['error: Unexpected output of "npm pack --dry-run --json": it has no list of files.']);
  });

  it('works at --root', async () => {
    const other = resolve('/other');
    const files = Object.fromEntries(Object.entries(preparedBuild()).map(([path, text]) => [path.replace(ROOT, other), text]));
    const outputs = Object.fromEntries(Object.entries(cleanTarballs()).map(([path, text]) => [path.replace(ROOT, other), text]));
    const { io, runs } = memoryIo(files, outputs);
    expect(await main(['pack-check', '--root', other], io, ROOT)).toBe(0);
    expect(runs.map((run) => run.cwd)).toStrictEqual(RELEASE_PACKAGES.map((pkg) => at(pkg.publishDir, other)));
  });
});
