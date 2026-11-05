import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { API_OUTPUT_PREFIX } from '../src/site/api';

const DOCS = fileURLToPath(new URL('../src/content/docs/', import.meta.url));

/** The slugs of the written pages under `src/content/docs`, for example `tools/trend-line`, sorted. The generated `api-*` folders are not pages to list. */
export function pageSlugs(): string[] {
  return readdirSync(DOCS, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.md') && !file.startsWith(API_OUTPUT_PREFIX))
    .map((file) => file.replace(/\\/g, '/').slice(0, -'.md'.length))
    .sort();
}

/** The text of a page, with `\n` line ends whatever the checkout did. */
export function readPage(slug: string): string {
  return readFileSync(`${DOCS}${slug}.md`, 'utf8').replace(/\r\n/g, '\n');
}

/** The frontmatter of a page (the text between the two `---` lines), or an empty string. */
export function frontmatter(page: string): string {
  return /^---\n([\s\S]*?)\n---\n/.exec(page)?.[1] ?? '';
}
