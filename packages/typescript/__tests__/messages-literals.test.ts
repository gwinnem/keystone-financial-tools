import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { DEFAULT_MESSAGES } from 'keystone-financial-tools-core';
import { describe, expect, it } from 'vitest';
import { literalSinks, packagesDir, sourceFiles, textsInSource } from './sources';

// NFR-I18N-001: no user-visible text is written anywhere but in the message table of the core (`packages/core/src/messages.ts`).
const PACKAGES = ['core', 'vue', 'react', 'angular'];
const TABLE = join(packagesDir(), 'core', 'src', 'messages.ts');
const FILES = PACKAGES.flatMap((name) => sourceFiles(name)).filter((file) => file !== TABLE);
const TEXTS = Object.values(DEFAULT_MESSAGES);

/** What the packages ship, as `[path, source]`, so a failure names the file. */
const SOURCES = FILES.map((file): [string, string] => [file.slice(packagesDir().length + 1), readFileSync(file, 'utf8')]);

describe('the sources of the packages', () => {
  it('are read, the editors of the three frameworks included, and the message table is not one of them', () => {
    const paths = SOURCES.map(([path]) => path.replace(/\\/g, '/'));
    expect(paths.length).toBeGreaterThan(30);
    for (const path of ['core/src/text-editor.ts', 'core/src/catalog.ts', 'vue/src/keystone-text-editor.ts', 'react/src/keystone-text-editor.tsx', 'angular/src/lib/text-editor.component.ts'])
      expect(paths, path).toContain(path);
    expect(paths).not.toContain('core/src/messages.ts');
  });

  it('do not have an English text of the message table as a string literal', () => {
    const found = SOURCES.flatMap(([path, source]) => textsInSource(source, TEXTS).map((text) => `${path}: ${text}`));
    expect(found).toStrictEqual([]);
  });

  it('do not give a text to the user with a string literal: an accessible name, a placeholder or the text of an element is always a value', () => {
    const found = SOURCES.flatMap(([path, source]) => literalSinks(source).map((sink) => `${path}: ${sink}`));
    expect(found).toStrictEqual([]);
  });
});
