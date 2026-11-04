import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXCEPTIONS, WRAPPED, type Wrappers } from './parity-exceptions';
import { exportedNames, packagesDir } from './sources';

// FR-FW-050 and AR-5: every export of the core is in the Vue, React and Angular packages, re-exported or wrapped, unless the allow-list
// says it is not meant to be. An application then imports the whole public API from its framework package and never from the core.
const packages = packagesDir();
const core = exportedNames(join(packages, 'core', 'src', 'index.ts'));
const ADAPTERS: readonly { readonly name: keyof Wrappers; readonly entry: string }[] = [
  { name: 'vue', entry: join(packages, 'vue', 'src', 'index.ts') },
  { name: 'react', entry: join(packages, 'react', 'src', 'index.ts') },
  { name: 'angular', entry: join(packages, 'angular', 'src', 'public-api.ts') },
];
const EXCEPTION_NAMES = Object.keys(EXCEPTIONS);
const WRAPPED_NAMES = Object.keys(WRAPPED);

describe('the exports of the core', () => {
  it('are read from the source of the core, so a test that finds nothing is not a test that passes', () => {
    expect(core.names.size).toBeGreaterThan(150);
    for (const name of ['createDrawingTools', 'DrawingStore', 'TOOL_CATALOG', 'DEFAULT_MESSAGES', 'DrawingToolsState', 'hitTest']) expect(core.names.has(name), name).toBe(true);
    expect(core.stars).toStrictEqual([]);
  });
});

describe('the allow-list', () => {
  it('has only names that the core exports', () => {
    expect([...EXCEPTION_NAMES, ...WRAPPED_NAMES].filter((name) => !core.names.has(name))).toStrictEqual([]);
  });

  it('does not have a name as an exception and as wrapped', () => {
    expect(EXCEPTION_NAMES.filter((name) => WRAPPED_NAMES.includes(name))).toStrictEqual([]);
  });

  it('gives a reason for every exception', () => {
    for (const [name, reason] of Object.entries(EXCEPTIONS)) expect(reason.trim().length, name).toBeGreaterThan(20);
  });
});

describe.each(ADAPTERS)('the $name package', ({ name, entry }) => {
  const exported = exportedNames(entry);

  it('is read from its source, so a test that finds nothing is not a test that passes', () => {
    expect(exported.names.size).toBeGreaterThan(100);
    expect(exported.names.has('createDrawingTools')).toBe(true);
    expect(exported.names.has(name === 'angular' ? 'KeystoneDrawingToolsService' : 'useDrawingTools')).toBe(true);
  });

  it('re-exports or wraps every export of the core, or has it on the allow-list', () => {
    const missing = [...core.names].filter((exportName) => !exported.names.has(exportName) && !WRAPPED_NAMES.includes(exportName) && !EXCEPTION_NAMES.includes(exportName));
    expect(missing, `Not in the ${name} package, and not on the allow-list of packages/typescript/__tests__/parity-exceptions.ts`).toStrictEqual([]);
  });

  it('has the wrapper of every export it wraps', () => {
    const missing = Object.entries(WRAPPED)
      .map(([wrapped, wrappers]) => ({ wrapped, wrapper: wrappers[name] }))
      .filter(({ wrapper }) => !exported.names.has(wrapper))
      .map(({ wrapped, wrapper }) => `${wrapped} by ${wrapper}`);
    expect(missing).toStrictEqual([]);
  });

  it('does not export what the allow-list says it leaves out', () => {
    expect(EXCEPTION_NAMES.filter((exceptionName) => exported.names.has(exceptionName))).toStrictEqual([]);
  });
});

describe('the typescript package', () => {
  it('exports everything of the core', () => {
    expect(exportedNames(join(packages, 'typescript', 'src', 'index.ts')).stars).toContain('keystone-financial-tools-core');
  });
});
