import { describe, expect, it } from 'vitest';
import { DRAWING_KINDS, KIND_OPTION_KEYS, type DrawingKind } from 'keystone-financial-tools-core';
import { GETTING_STARTED, GUIDES, TOOLS } from '../src/site/pages';
import { frontmatter, pageSlugs, readPage } from './support';

const ALL = [...GETTING_STARTED, ...GUIDES, ...TOOLS];
const kindOf = (slug: string): DrawingKind => slug.slice('tools/'.length) as DrawingKind;

describe('the pages of the site', () => {
  it('has getting started pages for TypeScript, Vue, React and Angular', () => {
    expect(GETTING_STARTED).toStrictEqual([
      { slug: 'getting-started/typescript', label: 'TypeScript' },
      { slug: 'getting-started/vue', label: 'Vue' },
      { slug: 'getting-started/react', label: 'React' },
      { slug: 'getting-started/angular', label: 'Angular' },
    ]);
  });

  it('has a host guide, a persistence guide and a keyboard reference', () => {
    expect(GUIDES).toStrictEqual([
      { slug: 'guides/host', label: 'Implement a host' },
      { slug: 'guides/persistence', label: 'Save and load drawings' },
      { slug: 'guides/keyboard', label: 'Keyboard reference' },
    ]);
  });

  it('has one tool page for each drawing kind of the core, in the order of the core', () => {
    expect(TOOLS.map(({ slug }) => kindOf(slug))).toStrictEqual([...DRAWING_KINDS]);
    expect(TOOLS.map(({ label }) => label)).toStrictEqual([
      'Trend line',
      'Horizontal line',
      'Rectangle',
      'Fibonacci retracement',
      'Fibonacci arcs',
      'Fibonacci fans',
      'Fibonacci time zones',
      'Text note',
    ]);
  });

  it('has a file for every page, and the index', () => {
    const files = pageSlugs();
    for (const { slug } of ALL) expect(files, slug).toContain(slug);
    expect(files).toContain('index');
  });

  it('has no file that the navigation does not list', () => {
    expect(pageSlugs()).toStrictEqual(['index', ...ALL.map(({ slug }) => slug)].sort());
  });

  it('gives every page a title and a description', () => {
    for (const slug of ['index', ...ALL.map((page) => page.slug)]) {
      const header = frontmatter(readPage(slug));
      expect(header, slug).toMatch(/^title: \S.*$/m);
      expect(header, slug).toMatch(/^description: \S.*$/m);
    }
  });

  it('gives every page its label as the title', () => {
    for (const { slug, label } of ALL) expect(frontmatter(readPage(slug)), slug).toContain(`title: ${label}\n`);
  });
});

describe('a getting started page', () => {
  it.each(GETTING_STARTED)('$slug imports from the package of its framework', ({ slug }) => {
    const framework = slug.slice('getting-started/'.length);
    expect(readPage(slug)).toContain(`from 'keystone-financial-tools-${framework}'`);
  });

  it.each(GETTING_STARTED)('$slug leads on to the host and persistence guides', ({ slug }) => {
    const page = readPage(slug);
    expect(page).toContain('](/guides/host/)');
    expect(page).toContain('](/guides/persistence/)');
  });
});

describe('a tool page', () => {
  it.each(TOOLS)('$slug shows how to activate its tool', ({ slug }) => {
    expect(readPage(slug)).toContain(`activate('${kindOf(slug)}')`);
  });

  it.each(TOOLS)('$slug documents every option of its kind, and no other', ({ slug }) => {
    const page = readPage(slug);
    const kind = kindOf(slug);
    const optionRows = page.split('\n').filter((line) => /^\| `[a-zA-Z]+` \|/.test(line));
    expect(optionRows.map((row) => /^\| `([a-zA-Z]+)`/.exec(row)?.[1])).toStrictEqual([...KIND_OPTION_KEYS[kind]]);
  });
});
