import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RELEASE_PACKAGES } from '../src/release.ts';

// End to end: the real entry point, run by Node as a child process on real files in a temporary folder. `pack-check` runs the real `npm pack`.
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts');
const CHANGELOG = '# Changelog\n\n## 0.1.0 (2026-11-10)\n\n- First release.\n- Second line.\n\n## 0.0.1\n\n- Older.\n';
/** `pack-check` starts `npm pack` five times, which takes 10 to 20 s alone and longer while Stryker runs eight test runners at once. */
const NPM_TIMEOUT = 120_000;
let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'release-'));
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

const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');

/** A checkout of five publishable packages at 0.1.0, built: what `pnpm build` and `pnpm release:prepare` leave. */
function writeCheckout(): void {
  write('package.json', JSON.stringify({ name: 'keystone-financial-tools', version: '0.1.0', private: true }));
  write('CHANGELOG.md', CHANGELOG);
  for (const pkg of RELEASE_PACKAGES) {
    const manifest = { name: pkg.name, version: '0.1.0', description: pkg.id, license: 'UNLICENSED', exports: { '.': { default: './index.js' } }, types: './index.d.ts' };
    if (pkg.publishDir === pkg.dir) {
      write(`${pkg.dir}/package.json`, JSON.stringify({ ...manifest, files: ['dist'] }));
      write(`${pkg.dir}/README.md`, `# ${pkg.name}\n`);
      write(`${pkg.dir}/dist/index.js`, 'export const answer = 42;\n');
      write(`${pkg.dir}/dist/index.d.ts`, 'export declare const answer = 42;\n');
      write(`${pkg.dir}/src/index.ts`, 'export const answer = 42;\n');
      write(`${pkg.dir}/__tests__/index.test.ts`, '// test\n');
    } else {
      write(`${pkg.dir}/package.json`, JSON.stringify({ name: pkg.name, version: '0.1.0', dependencies: { 'keystone-financial-tools-core': 'workspace:*' } }));
      write(`${pkg.publishDir}/package.json`, JSON.stringify({ ...manifest, typings: 'index.d.ts', dependencies: { 'keystone-financial-tools-core': 'workspace:*' } }));
      write(`${pkg.publishDir}/index.mjs`, 'export const answer = 42;\n');
    }
  }
}

describe('the release command line (E09-F04)', () => {
  it('passes a checkout whose five packages share the version of the changelog section and of the tag', () => {
    writeCheckout();
    const checked = cli('release-check', '--tag', 'v0.1.0');
    expect(checked.status).toBe(0);
    expect(checked.output).toContain('OK 5 packages have the version 0.1.0 and CHANGELOG.md has its notes.');
  });

  it('fails a tag of another version, with exit code 1', () => {
    writeCheckout();
    const checked = cli('release-check', '--tag', 'v0.2.0');
    expect(checked.status).toBe(1);
    expect(checked.output).toContain('FAIL The tag v0.2.0 does not match the version 0.1.0 of the packages');
  });

  it('writes the release notes of a tag to a file', () => {
    writeCheckout();
    const notes = cli('release-notes', '--tag', 'v0.1.0', '--out', 'release-notes.md');
    expect(notes.status).toBe(0);
    expect(read('release-notes.md')).toBe('- First release.\n- Second line.\n');
  });

  it('prints the release notes of a version', () => {
    writeCheckout();
    const notes = cli('release-notes', '--version', '0.0.1');
    expect(notes.status).toBe(0);
    expect(notes.output).toBe('- Older.\n');
  });

  it('exits with 1 for a version that has no section in the changelog', () => {
    writeCheckout();
    const notes = cli('release-notes', '--version', '9.9.9');
    expect(notes.status).toBe(1);
    expect(notes.output).toContain('error: CHANGELOG.md has no section "## 9.9.9" with notes.');
  });

  it('replaces the workspace range in the built Angular manifest', () => {
    writeCheckout();
    const prepared = cli('publish-prepare');
    expect(prepared.status).toBe(0);
    expect(prepared.output).toContain('OK packages/angular/dist/package.json can be published.');
    const manifest = JSON.parse(read('packages/angular/dist/package.json')) as { dependencies: Record<string, string> };
    expect(manifest.dependencies).toStrictEqual({ 'keystone-financial-tools-core': '0.1.0' });
    expect(JSON.parse(read('packages/angular/package.json')).dependencies['keystone-financial-tools-core']).toBe('workspace:*');
  });

  it(
    'passes the tarballs npm would pack for clean packages, and for a prepared Angular manifest',
    () => {
      writeCheckout();
      cli('publish-prepare');
      const packed = cli('pack-check');
      expect(packed.output).toContain('keystone-financial-tools-core: 4 files in the tarball');
      expect(packed.output).toContain('keystone-financial-tools-angular: 2 files in the tarball');
      expect(packed.output).toContain('OK 5 tarballs hold only what is published.');
      expect(packed.status).toBe(0);
    },
    NPM_TIMEOUT
  );

  it(
    'fails what npm would pack that is not meant to be published, and an Angular manifest that is not prepared',
    () => {
      writeCheckout();
      write('packages/vue/dist/index.js.map', '{}');
      write('packages/react/dist/a.test.js', '//');
      const packed = cli('pack-check');
      expect(packed.status).toBe(1);
      expect(packed.output).toContain('FAIL keystone-financial-tools-vue: the tarball would contain dist/index.js.map, a source map.');
      expect(packed.output).toContain('FAIL keystone-financial-tools-react: the tarball would contain dist/a.test.js, a test.');
      expect(packed.output).toContain('FAIL keystone-financial-tools-angular: dependencies.keystone-financial-tools-core is workspace:*');
      expect(packed.output).not.toContain('src/index.ts');
      expect(packed.output).not.toContain('__tests__');
    },
    NPM_TIMEOUT
  );
});
