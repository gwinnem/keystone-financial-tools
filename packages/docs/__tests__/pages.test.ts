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

  it('has a host guide, a persistence guide, a toolbar guide, a keyboard reference and the release and publish checklist', () => {
    expect(GUIDES).toStrictEqual([
      { slug: 'guides/host', label: 'Implement a host' },
      { slug: 'guides/persistence', label: 'Save and load drawings' },
      { slug: 'guides/toolbar', label: 'Build a toolbar' },
      { slug: 'guides/keyboard', label: 'Keyboard reference' },
      { slug: 'guides/releasing', label: 'Release and publish' },
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

describe('the release and publish page (E09-F04)', () => {
  const page = readPage('guides/releasing');

  it('has the checklist for a release and for the manual publish, in the order of the packages', () => {
    expect(page).toContain('\n## Release a version\n');
    expect(page).toContain('\n## Publish to npm\n');
    const order = ['core', 'typescript', 'vue', 'react', 'angular'].map((id) => page.indexOf(`npm publish release/keystone-financial-tools-${id}-`));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toStrictEqual(order);
  });

  it('names the commands of the release checks', () => {
    for (const script of ['release:check', 'release:prepare', 'release:pack-check']) expect(page, script).toContain(`keystone-financial-tools-budgets ${script}`);
  });

  it('says that nothing publishes automatically', () => {
    expect(page).toContain('Publishing to npm is **manual**');
    expect(page).toContain('D-7');
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

describe('the toolbar example of a getting started page (FR-FW-040)', () => {
  it.each(GETTING_STARTED)('$slug has a Build a toolbar section that renders the toolbar and leads to the guide', ({ slug }) => {
    const page = readPage(slug);
    expect(page).toContain('\n## Build a toolbar\n');
    const section = page.slice(page.indexOf('\n## Build a toolbar\n')).split('\n## ')[1] ?? '';
    expect(section).toContain('tool.active');
    expect(section).toContain('tool.enabled');
    expect(section).toContain('tool.id');
    expect(section).toContain('](/guides/toolbar/)');
  });

  it.each(GETTING_STARTED)('$slug lists the guide under Next', ({ slug }) => {
    const next = readPage(slug).split('\n## Next\n')[1] ?? '';
    expect(next).toContain('- [Build a toolbar](/guides/toolbar/)');
  });
});

describe('a tool page', () => {
  it.each(TOOLS)('$slug shows how to activate its tool', ({ slug }) => {
    expect(readPage(slug)).toContain(`activate('${kindOf(slug)}')`);
  });

  it.each(TOOLS)('$slug has a Try it section that embeds the playground with only its tool (E09-F01-S03)', ({ slug, label }) => {
    const page = readPage(slug);
    expect(page).toContain('\n## Try it\n');
    expect(page).toContain(`<iframe src="/playground/embed.html?tool=${kindOf(slug)}" title="${label} example"`);
    expect(page.match(/<iframe /g)).toHaveLength(1);
    // The section comes before the options, where a reader is still deciding whether to use the tool.
    expect(page.indexOf('\n## Try it\n')).toBeLessThan(page.indexOf('\n## Options\n'));
  });

  it.each(TOOLS)('$slug gives its iframe a width, a height and lazy loading', ({ slug }) => {
    expect(readPage(slug)).toMatch(/<iframe [^>]*width="100%" height="\d+" loading="lazy"><\/iframe>/);
  });

  it.each(TOOLS)('$slug documents every option of its kind, and no other', ({ slug }) => {
    const page = readPage(slug);
    const kind = kindOf(slug);
    const optionRows = page.split('\n').filter((line) => /^\| `[a-zA-Z]+` \|/.test(line));
    expect(optionRows.map((row) => /^\| `([a-zA-Z]+)`/.exec(row)?.[1])).toStrictEqual([...KIND_OPTION_KEYS[kind]]);
  });
});
