import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as main from '../src/index';
import * as testing from '../src/testing/index';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** Every source file the module at `file` reaches through relative static imports and re-exports. */
function reachable(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:import|export)[^'"]*?from\s+'(\.[^']+)'/g)) {
    reachable(`${join(dirname(file), match[1])}.ts`, seen);
  }
  return seen;
}

describe('package entries (NFR-SIZE-001, FR-HOST-010)', () => {
  it('keeps the testing kit out of the main entry', () => {
    const files = [...reachable(join(src, 'index.ts'))].map((f) =>
      f
        .slice(src.length + 1)
        .split('\\')
        .join('/')
    );
    expect(files).toContain('store.ts');
    expect(files).toContain('host-check.ts');
    expect(files.filter((f) => f.startsWith('testing/'))).toEqual([]);
    expect(Object.keys(main)).not.toContain('createMockHost');
    expect(Object.keys(main)).not.toContain('runHostConformance');
  });

  it('exports the mock host and the conformance kit from the testing entry', () => {
    expect(Object.keys(testing).sort()).toEqual(['CONFORMANCE_KEY', 'CONFORMANCE_POINTER', 'CONFORMANCE_TOLERANCE_PX', 'DEFAULT_MOCK_PANE', 'createMockHost', 'runHostConformance']);
  });

  it('declares the testing entry in package.json with types, ESM and CommonJS builds', () => {
    const pkg = JSON.parse(readFileSync(resolve(src, '../package.json'), 'utf8')) as { exports: Record<string, Record<string, string>> };
    expect(pkg.exports['./testing']).toEqual({ types: './dist/testing/index.d.ts', import: './dist/testing.js', require: './dist/testing.cjs' });
  });
});
