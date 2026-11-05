import { describe, expect, it } from 'vitest';
import { API_REFERENCES } from '../src/site/api';
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

  it('uses the sidebar, then a group for the API reference', () => {
    const sidebar = STARLIGHT_CONFIG.sidebar ?? [];
    expect(sidebar).toHaveLength(SIDEBAR.length + 1);
    expect(sidebar.slice(0, SIDEBAR.length)).toStrictEqual([...SIDEBAR]);
    const api = sidebar[SIDEBAR.length] as { label: string; items: unknown[] };
    expect(api.label).toBe('API reference');
    expect(api.items).toHaveLength(API_REFERENCES.length);
  });

  it('lists a placeholder group of each plugin, each with a label of its own, for the plugin to replace with its pages', () => {
    const sidebar = STARLIGHT_CONFIG.sidebar ?? [];
    const api = sidebar[SIDEBAR.length] as { items: { label: string; items: unknown[] }[] };
    for (const group of api.items) {
      expect(typeof group.label).toBe('string');
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.items).toStrictEqual([]);
    }
    expect(new Set(api.items.map((group) => group.label)).size).toBe(API_REFERENCES.length);
  });

  it('generates the API reference of every package, one TypeDoc plugin each', () => {
    const names = (STARLIGHT_CONFIG.plugins ?? []).map((plugin) => plugin.name);
    expect(names.slice(0, API_REFERENCES.length)).toHaveLength(API_REFERENCES.length);
    for (const name of names.slice(0, API_REFERENCES.length)) expect(name).toContain('typedoc');
  });

  it('checks the links when the site is built, last so the generated pages are checked too', () => {
    const names = (STARLIGHT_CONFIG.plugins ?? []).map((plugin) => plugin.name);
    expect(names).toHaveLength(API_REFERENCES.length + 1);
    expect(names[names.length - 1]).toContain('links-validator');
  });
});
