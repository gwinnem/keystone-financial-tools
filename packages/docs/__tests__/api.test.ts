import { describe, expect, it } from 'vitest';
import { API_OUTPUT_PREFIX, API_REFERENCES, REQUIRED_TO_BE_DOCUMENTED, typeDocOptions } from '../src/site/api';

describe('the generated API references (E09-F01-S02)', () => {
  it('has one reference for each package, with the testing entry of the core apart, in sidebar order', () => {
    expect(API_REFERENCES.map(({ id, label }) => [id, label])).toStrictEqual([
      ['core', 'Core'],
      ['core-testing', 'Core testing'],
      ['typescript', 'TypeScript'],
      ['vue', 'Vue'],
      ['react', 'React'],
      ['angular', 'Angular'],
    ]);
  });

  it('reads the source entry file of each package', () => {
    expect(API_REFERENCES.map(({ entryPoint }) => entryPoint)).toStrictEqual([
      '../core/src/index.ts',
      '../core/src/testing/index.ts',
      '../typescript/src/index.ts',
      '../vue/src/index.ts',
      '../react/src/index.ts',
      '../angular/src/public-api.ts',
    ]);
  });

  it('reads each package with its own tsconfig.json', () => {
    expect(API_REFERENCES.map(({ tsconfig }) => tsconfig)).toStrictEqual([
      '../core/tsconfig.json',
      '../core/tsconfig.json',
      '../typescript/tsconfig.json',
      '../vue/tsconfig.json',
      '../react/tsconfig.json',
      '../angular/tsconfig.json',
    ]);
  });

  it('has unique ids, so the output folders do not clash', () => {
    const outputs = API_REFERENCES.map((reference) => typeDocOptions(reference).output);
    expect(new Set(outputs).size).toBe(API_REFERENCES.length);
  });

  it('writes each reference to an api- folder', () => {
    expect(API_OUTPUT_PREFIX).toBe('api-');
    expect(API_REFERENCES.map((reference) => typeDocOptions(reference).output)).toStrictEqual(['api-core', 'api-core-testing', 'api-typescript', 'api-vue', 'api-react', 'api-angular']);
  });
});

describe('the TypeDoc options of a reference', () => {
  const [core] = API_REFERENCES;
  if (core === undefined) throw new Error('no reference');
  const options = typeDocOptions(core);

  it('passes the entry file and the tsconfig of the package', () => {
    expect(options.entryPoints).toStrictEqual(['../core/src/index.ts']);
    expect(options.tsconfig).toBe('../core/tsconfig.json');
  });

  it('names the sidebar group and collapses it', () => {
    expect(options.sidebar).toStrictEqual({ label: 'Core', collapsed: true });
  });

  it('fails the build for a public export without TSDoc (NFR-DOC-001)', () => {
    expect(options.typeDoc?.validation).toStrictEqual({ notDocumented: true, notExported: false, invalidLink: false });
    expect(options.typeDoc?.treatValidationWarningsAsErrors).toBe(true);
  });

  it('requires a comment on classes, enums, functions, interfaces, type aliases and variables, and not on their members', () => {
    expect(REQUIRED_TO_BE_DOCUMENTED).toStrictEqual(['Class', 'Enum', 'Function', 'Interface', 'TypeAlias', 'Variable']);
    expect(options.typeDoc?.requiredToBeDocumented).toStrictEqual(['Class', 'Enum', 'Function', 'Interface', 'TypeAlias', 'Variable']);
  });

  it('copies the list of kinds, so a caller cannot change the constant', () => {
    expect(options.typeDoc?.requiredToBeDocumented).not.toBe(REQUIRED_TO_BE_DOCUMENTED);
  });
});
