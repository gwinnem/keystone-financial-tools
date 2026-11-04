import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { exportedNames, literalSinks, namesOfSource, packagesDir, sourceFiles, stripComments, textsInSource } from './sources';

// The helpers of the parity test and the message test: they read the source of the other packages, so they have to read it right.
describe('packagesDir', () => {
  it('is the folder with the packages next to this one', () => {
    const dir = packagesDir();
    for (const entry of ['core/src/index.ts', 'vue/src/index.ts', 'react/src/index.ts', 'angular/src/public-api.ts', 'typescript/src/index.ts']) expect(existsSync(join(dir, entry)), entry).toBe(true);
  });
});

describe('stripComments', () => {
  it('removes block comments, also over several lines', () => {
    expect(stripComments('a /* x */ b\n/**\n * c\n */\nd')).toBe('a  b\n\nd');
  });

  it('removes a comment that starts a line or follows code, and keeps the code', () => {
    // The space in front of a comment stays, so the lines are compared without their spaces.
    expect(
      stripComments('// one\n  // two\nconst a = 1; // three\nb')
        .split('\n')
        .map((line) => line.trim())
    ).toStrictEqual(['', '', 'const a = 1;', 'b']);
  });

  it('keeps a double slash in a URL or in a string', () => {
    expect(stripComments('const u = \'https://example.com\'; const v = "//x"; const w = `//y`;')).toBe('const u = \'https://example.com\'; const v = "//x"; const w = `//y`;');
  });
});

describe('namesOfSource', () => {
  it('reads the names of an export list, the name after `as`, and drops `type` in front of a name', () => {
    expect(namesOfSource("export { a, b as c, type D } from './x';\nexport type { E, type F as G } from 'pkg';")).toStrictEqual({ names: new Set(['a', 'c', 'D', 'E', 'G']), stars: [] });
  });

  it('reads a list over several lines with a trailing comma', () => {
    expect(namesOfSource("export type {\n  One,\n  Two,\n} from 'pkg';\nexport {\n  three,\n} from 'pkg';").names).toStrictEqual(new Set(['One', 'Two', 'three']));
  });

  it('reads declarations of every kind', () => {
    const source = [
      'export class A {}',
      'export abstract class B {}',
      'export function c() {}',
      'export const d = 1;',
      'export let e = 1;',
      'export interface F {}',
      'export type G = string;',
      'export enum H {}',
      'export declare const i: number;',
    ].join('\n');
    expect(namesOfSource(source).names).toStrictEqual(new Set(['A', 'B', 'c', 'd', 'e', 'F', 'G', 'H', 'i']));
  });

  it('does not take a name that is not exported, or a type export list, for a declaration', () => {
    const source = "const a = 1;\nfunction b() {}\nclass C {}\nexport type { D } from 'pkg';\nexport {};";
    expect(namesOfSource(source).names).toStrictEqual(new Set(['D']));
  });

  it('lists the modules it exports everything from', () => {
    expect(namesOfSource("export * from './lib/a';\nexport * from 'pkg';\nexport*from \"other\";")).toStrictEqual({ names: new Set(), stars: ['./lib/a', 'pkg', 'other'] });
  });

  it('ignores what is in a comment', () => {
    const source = "// export { a } from 'x';\n/* export class B {} */\n/**\n * export * from 'y';\n */\nexport { c } from 'z';";
    expect(namesOfSource(source)).toStrictEqual({ names: new Set(['c']), stars: [] });
  });

  it('is empty for a source with no export', () => {
    expect(namesOfSource('const a = 1;')).toStrictEqual({ names: new Set(), stars: [] });
  });
});

describe('exportedNames', () => {
  const root = mkdtempSync(join(tmpdir(), 'keystone-sources-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const write = (path: string, content: string): string => {
    const file = join(root, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
    return file;
  };

  it('adds the names of the files it exports everything from, a file or a folder with an index, and keeps the packages', () => {
    write('lib/a.ts', "export class A {}\nexport * from './b';");
    write('lib/b.tsx', 'export function b() {}');
    write('lib/folder/index.ts', "export const c = 1;\nexport * from 'inner-package';");
    const index = write('index.ts', "export * from './lib/a';\nexport * from './lib/folder';\nexport { z } from 'pkg';\nexport * from 'outer-package';");
    const result = exportedNames(index);
    expect(result.names).toStrictEqual(new Set(['A', 'b', 'c', 'z']));
    expect(result.stars).toStrictEqual(['inner-package', 'outer-package']);
  });

  it('throws for a file that is not there', () => {
    const index = write('broken/index.ts', "export * from './missing';");
    expect(() => exportedNames(index)).toThrow(`Could not find ./missing from ${index}`);
  });

  it('reads the real entry of a package', () => {
    const { names, stars } = exportedNames(join(packagesDir(), 'typescript', 'src', 'index.ts'));
    expect(stars).toStrictEqual(['keystone-financial-tools-core']);
    expect(names.has('autoSave')).toBe(true);
    expect(names.has('MemoryRepository')).toBe(true);
  });
});

describe('sourceFiles', () => {
  it('lists the sources of a package, and no test or declaration', () => {
    const files = sourceFiles('angular');
    expect(files.some((file) => file.endsWith('text-editor.component.ts'))).toBe(true);
    expect(files.some((file) => /\.(spec|test|d)\.ts$/.test(file))).toBe(false);
  });

  it('lists the files of a folder under src, and tsx files', () => {
    expect(sourceFiles('core').some((file) => file.endsWith('catalog.ts'))).toBe(true);
    expect(sourceFiles('core').some((file) => /geometry[\\/]lines\.ts$/.test(file))).toBe(true);
    expect(sourceFiles('react').some((file) => file.endsWith('keystone-text-editor.tsx'))).toBe(true);
  });
});

describe('textsInSource', () => {
  it('finds a text that is a string literal in any of the three kinds of quotes', () => {
    expect(textsInSource('const a = \'One\'; const b = "Two"; const c = `Three`;', ['One', 'Two', 'Three', 'Four'])).toStrictEqual(['One', 'Two', 'Three']);
  });

  it('does not find a text that is only part of a literal, a name, or in a comment', () => {
    expect(textsInSource("const a = 'One thing'; const One = 1; // 'Two'\n/* 'Three' */", ['One', 'Two', 'Three'])).toStrictEqual([]);
  });

  it('takes the characters of the text as they are, not as a pattern', () => {
    expect(textsInSource("const a = 'a.c';", ['a.c', 'abc'])).toStrictEqual(['a.c']);
    expect(textsInSource("const a = 'abc';", ['a.c'])).toStrictEqual([]);
  });
});

describe('literalSinks', () => {
  it.each([
    ['an attribute in JSX', '<textarea aria-label="Note" />'],
    ['an attribute in JSX with an expression of a literal', "<textarea aria-label={'Note'} />"],
    ['an attribute in an object', "h('textarea', { 'aria-label': 'Note' })"],
    ['setAttribute', "field.setAttribute('aria-label', 'Note');"],
    ['a placeholder', 'field.placeholder = `Type`;'],
    ['the text of an element', "button.textContent = 'Go';"],
    ['an inner text', 'button.innerText = "Go";'],
  ])('finds %s', (_name, source) => {
    expect(literalSinks(source)).toHaveLength(1);
  });

  it.each([
    ['an attribute from a value', "<textarea aria-label={label} />\nh('textarea', { 'aria-label': props.label });\nfield.setAttribute('aria-label', this.caption);"],
    ['a literal in a comment', "// field.setAttribute('aria-label', 'Note');"],
    ['a name that only ends like a sink', "const placeholderText = 'x';"],
  ])('does not find %s', (_name, source) => {
    expect(literalSinks(source)).toStrictEqual([]);
  });
});
