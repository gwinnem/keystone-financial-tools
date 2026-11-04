import { describe, expect, it } from 'vitest';
import { GETTING_STARTED, GUIDES, TOOLS } from '../src/site/pages';
import { STARLIGHT_CONFIG } from '../src/site/config';
import { SIDEBAR } from '../src/site/sidebar';

describe('the sidebar', () => {
  it('has the getting started pages, the guides and the tools, in that order', () => {
    expect(SIDEBAR).toStrictEqual([
      { label: 'Getting started', items: [...GETTING_STARTED] },
      { label: 'Guides', items: [...GUIDES] },
      { label: 'Tools', items: [...TOOLS] },
    ]);
  });

  it('lists every page once', () => {
    const groups = SIDEBAR as unknown as { items: { slug: string }[] }[];
    const slugs = groups.flatMap((group) => group.items.map((item) => item.slug));
    expect(slugs).toHaveLength(GETTING_STARTED.length + GUIDES.length + TOOLS.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('the Starlight configuration', () => {
  it('names the site and describes it', () => {
    expect(STARLIGHT_CONFIG.title).toBe('Keystone drawing tools');
    expect(STARLIGHT_CONFIG.description).toBe('Trend lines, Fibonacci tools and text notes for financial charts, with TypeScript, Vue, React and Angular packages.');
  });

  it('uses the sidebar', () => {
    expect(STARLIGHT_CONFIG.sidebar).toBe(SIDEBAR);
  });

  it('checks the links when the site is built, so a broken link fails the build', () => {
    const names = (STARLIGHT_CONFIG.plugins ?? []).map((plugin) => plugin.name);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('links-validator');
  });
});
