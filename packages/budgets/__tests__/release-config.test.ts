import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RELEASE_PACKAGES, changelogSection, checkRelease, type Manifest } from '../src/release.ts';
import { findUp } from './support.ts';

// The real files of the repository against the release rules (E09-F04): what the Release workflow and the checklist rely on.
const root = dirname(findUp('pnpm-workspace.yaml'));
const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
const manifestOf = (relative: string): Manifest => JSON.parse(read(relative)) as Manifest;
const withoutComments = (yaml: string): string => yaml.replace(/^\s*#.*$/gm, '');

const rootVersion = (manifestOf('package.json') as { version: string }).version;
const RELEASE = read('.github/workflows/release.yml');
const CI = read('.github/workflows/ci.yml');

describe('the packages that are published', () => {
  it('share the version of the root package.json and are publishable: not private, with files, exports and types', () => {
    const manifests = new Map(RELEASE_PACKAGES.map((pkg): [string, Manifest] => [pkg.id, manifestOf(`${pkg.dir}/package.json`)]));
    const changelog = `## ${rootVersion} (2026-01-01)\n\n- notes\n`;
    expect(checkRelease({ rootVersion, manifests, changelog, tag: `v${rootVersion}` }).map((finding) => finding.message)).toStrictEqual([]);
  });

  it('are the five library packages, and the others stay private', () => {
    for (const pkg of RELEASE_PACKAGES) expect(manifestOf(`${pkg.dir}/package.json`).private, pkg.name).not.toBe(true);
    for (const folder of ['packages/docs', 'packages/budgets', 'apps/playground', 'e2e', '.']) expect(manifestOf(`${folder}/package.json`).private, folder).toBe(true);
  });

  it('have a changelog section with notes for the version', () => {
    expect(changelogSection(read('CHANGELOG.md'), rootVersion)?.notes.length).toBeGreaterThan(0);
  });

  it('do not write source maps, and Angular is built in partial compilation mode, the only mode npm may publish', () => {
    for (const pkg of ['typescript', 'vue', 'react']) expect(read(`packages/${pkg}/vite.config.ts`), pkg).toMatch(/sourcemap: false,/);
    expect(read('packages/core/vite.config.ts')).toContain("sourcemap: mode === 'dev',");
    const angular = JSON.parse(read('packages/angular/tsconfig.lib.json')) as { compilerOptions: Record<string, unknown>; angularCompilerOptions: Record<string, unknown> };
    expect(angular.angularCompilerOptions).toStrictEqual({ compilationMode: 'partial' });
    expect(angular.compilerOptions.sourceMap).toBe(false);
    expect(angular.compilerOptions.declarationMap).toBe(false);
  });
});

describe('the Release workflow (E09-F04-S01)', () => {
  const yaml = withoutComments(RELEASE);

  it('runs on a pushed tag v* and on nothing else', () => {
    expect(yaml).toMatch(/\non:\n {2}push:\n {4}tags: \['v\*'\]\n/);
    expect(yaml).not.toContain('pull_request');
    expect(yaml).not.toContain('branches:');
    expect(yaml).not.toContain('workflow_dispatch');
  });

  it('never publishes to npm: no publish command, no token, no registry and no provenance login (D-7)', () => {
    expect(yaml).not.toMatch(/\b(npm|pnpm|yarn)\s+publish\b/);
    expect(yaml).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|NPM_CONFIG|npmrc/i);
    expect(yaml).not.toContain('registry-url');
    expect(yaml).not.toMatch(/id-token:\s*write/);
    expect(yaml).not.toMatch(/\bsecrets\./);
  });

  it('can write to the repository in the release job only', () => {
    expect(yaml).toMatch(/\npermissions:\n {2}contents: read\n/);
    expect(yaml.match(/contents: write/g)).toHaveLength(1);
    expect(yaml.indexOf('contents: write')).toBeGreaterThan(yaml.indexOf('\n  release:\n'));
  });

  it('checks the release first, then verifies, runs the end-to-end and the mutation tests, and only then makes the release', () => {
    for (const job of ['verify', 'e2e', 'mutation']) expect(yaml, job).toMatch(new RegExp(`\\n {2}${job}:\\n(?: {4}.*\\n)*? {4}needs: check\\n`));
    expect(yaml).toMatch(/\n {4}needs: \[check, verify, e2e, mutation\]\n/);
  });

  it('runs the mutation tests of the packages the CI does, on every tag', () => {
    const matrix = (text: string): string => /package: \[([^\]]*)\]/.exec(text)?.[1] ?? '';
    expect(matrix(yaml)).toBe(matrix(CI));
    expect(matrix(yaml)).toContain('core');
    expect(yaml).not.toMatch(/\n {4}if: github\.ref/);
  });

  it('checks the tag against the version and the changelog, the tarballs, and attaches the tarballs and the notes', () => {
    expect(yaml).toContain('release:check --tag "$GITHUB_REF_NAME"');
    expect(yaml).toContain('release:prepare');
    expect(yaml).toContain('release:pack-check');
    expect(yaml).toContain('release:notes --tag "$GITHUB_REF_NAME" --out release/notes.md');
    expect(yaml).toContain('gh release create "$GITHUB_REF_NAME" release/*.tgz');
    expect(yaml).toContain('--notes-file release/notes.md');
    expect(yaml).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/main');
  });

  it('packs the four packages with pnpm, which replaces the workspace ranges, and Angular from dist', () => {
    expect(yaml).toContain('for package in core typescript vue react; do');
    expect(yaml).toContain('pnpm --dir "packages/$package" pack --pack-destination "$GITHUB_WORKSPACE/release"');
    expect(yaml).toContain('npm pack ./packages/angular/dist --pack-destination "$GITHUB_WORKSPACE/release"');
  });
});

describe('the release commands the documents name', () => {
  const scripts = Object.keys((manifestOf('packages/budgets/package.json') as { scripts: Record<string, string> }).scripts);

  it.each(['.github/workflows/release.yml', 'CLAUDE.md', 'README.md', 'packages/budgets/README.md', 'packages/docs/src/content/docs/guides/releasing.md'])(
    '%s names only scripts that exist',
    (file) => {
      const named = [...new Set(read(file).match(/release:[a-z-]+/g) ?? [])];
      expect(named.length, file).toBeGreaterThan(0);
      for (const script of named) expect(scripts, `${file}: ${script}`).toContain(script);
    }
  );

  it('are the four of the budgets package', () => {
    expect(scripts.filter((script) => script.startsWith('release:'))).toStrictEqual(['release:check', 'release:notes', 'release:prepare', 'release:pack-check']);
  });
});
