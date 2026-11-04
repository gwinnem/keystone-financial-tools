import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// What the parity test (FR-FW-050) and the message test (NFR-I18N-001) need to read the source of the other packages. They read the text of
// the files and do not import them, so the packages stay as independent as they are in an application.

/**
 * The `packages` folder, found from this folder or any parent: a plain `../core` breaks under Stryker, which runs the tests from a copy of
 * this package in `.stryker-tmp/sandbox-*`, where the sibling packages are no longer at `..`.
 */
export function packagesDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'core', 'src', 'index.ts'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('Could not find packages/core/src/index.ts');
}

/** The source without its block comments and without the comments that start a line or follow code. A `//` after a colon, as in a URL, stays. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const NAMED = /export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;
const STAR = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
const DECLARATION = /export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|function|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;

/** What a source file exports: its own names, and the modules it exports everything from (`export * from`). */
export interface SourceExports {
  readonly names: ReadonlySet<string>;
  readonly stars: readonly string[];
}

/**
 * The names a source exports with `export { a, b as c } from '...'` (the name after `as`; `type` in front of a name is dropped) and with a
 * declaration (`export class A`, `export function f`, `export const c`, `export interface I`, `export type T`, `export enum E`), and the
 * modules it exports everything from. Comments are ignored.
 */
export function namesOfSource(source: string): SourceExports {
  const code = stripComments(source);
  const names = new Set<string>();
  for (const match of code.matchAll(NAMED)) {
    for (const item of (match[1] as string).split(',')) {
      const name = item
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name !== undefined && name !== '') names.add(name);
    }
  }
  for (const match of code.matchAll(DECLARATION)) names.add(match[1] as string);
  const stars = [...code.matchAll(STAR)].map((match) => match[1] as string);
  return { names, stars };
}

function moduleFile(from: string, specifier: string): string {
  const base = join(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(candidate)) return candidate;
  throw new Error(`Could not find ${specifier} from ${from}`);
}

/** The names a file exports, with those of the files it exports everything from (`export * from './x'`); `stars` keeps the packages it exports everything from. */
export function exportedNames(file: string): SourceExports {
  const own = namesOfSource(readFileSync(file, 'utf8'));
  const names = new Set(own.names);
  const stars: string[] = [];
  for (const star of own.stars) {
    if (star.startsWith('.')) {
      const nested = exportedNames(moduleFile(file, star));
      for (const name of nested.names) names.add(name);
      stars.push(...nested.stars);
    } else {
      stars.push(star);
    }
  }
  return { names, stars };
}

/** The `.ts` and `.tsx` files of `packages/<name>/src`, tests and declarations left out. */
export function sourceFiles(name: string): string[] {
  const root = join(packagesDir(), name, 'src');
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.(spec|test|d)\.tsx?$/.test(file))
    .map((file) => join(root, file));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The texts that the source has as a string literal (single, double or backtick quotes). Comments are ignored. */
export function textsInSource(source: string, texts: readonly string[]): string[] {
  const code = stripComments(source);
  return texts.filter((text) => new RegExp(`(['"\`])${escapeRegExp(text)}\\1`).test(code));
}

const SINK = /(?:aria-label|aria-description|aria-roledescription|aria-placeholder|ariaLabel|placeholder|textContent|innerText)['"]?\s*[:=,]\s*\{?\s*['"`]/g;

/** The places where the source gives a text to the user with a string literal: an accessible name, a placeholder or the text of an element. */
export function literalSinks(source: string): string[] {
  return [...stripComments(source).matchAll(SINK)].map((match) => match[0]);
}
