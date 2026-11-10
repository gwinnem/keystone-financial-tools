import { describe, expect, it } from 'vitest';
import { DEFAULT_MESSAGES, TOOL_CATALOG } from 'keystone-financial-tools-core';
import { readPage } from './support';

const page = readPage('guides/toolbar');
const rows = page.split('\n').filter((line) => line.startsWith('| '));

describe('the toolbar guide (FR-FW-040, FR-FW-041)', () => {
  it('has a row for every tool of the catalog, with its group, shortcut and tier', () => {
    for (const { id, group, shortcut, tier } of TOOL_CATALOG) expect(rows, id).toContain(`| \`${id}\` | ${group} | ${shortcut ?? 'none'} | ${tier} |`);
  });

  it('has a row for every field of an entry, in the order of the type', () => {
    const table = page.slice(page.indexOf('| Field |'), page.indexOf('## The tools')).split('\n');
    const fields = table.filter((line) => line.startsWith('| `')).map((line) => /^\| `(\w+)`/.exec(line)?.[1]);
    expect(fields).toStrictEqual(['id', 'labelKey', 'group', 'icon', 'shortcut', 'tier', 'requires', 'active', 'enabled', 'missing']);
  });

  it('has no row that is not a field, a tool, a key or a table head', () => {
    // Heads and their lines (4 tables), 10 fields, the tools, the messages and 2 keys.
    expect(rows).toHaveLength(8 + 10 + TOOL_CATALOG.length + Object.keys(DEFAULT_MESSAGES).length + 2);
  });

  it('has a row for every message, with its English text (NFR-I18N-001)', () => {
    for (const [key, text] of Object.entries(DEFAULT_MESSAGES)) expect(rows, key).toContain(`| \`${key}\` | ${text} |`);
  });

  it('explains the messages option, the table of every package and the error for a bad key', () => {
    expect(page).toContain("messages: { 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' }");
    expect(page).toContain('`messages` of `useDrawingTools` in Vue and React');
    expect(page).toContain('`messages()` of `KeystoneDrawingToolsService` in Angular');
    expect(page).toContain("`messages['editor.note']`");
    expect(page).toContain('`resolveMessages(overrides)`');
    expect(page).toContain('throw a `RangeError`');
  });

  it('names the label key as the core builds it', () => {
    expect(TOOL_CATALOG.every(({ id, labelKey }) => labelKey === `tool.${id}`)).toBe(true);
    expect(page).toContain('`tool.` and the kind');
  });

  it('explains the shortcuts option, null, and the Mac key code', () => {
    expect(page).toContain("shortcuts: { 'trend-line': 'Ctrl+Alt+L', rectangle: null }");
    expect(page).toContain('`null` turns its shortcut off');
    expect(page).toContain('`code`');
  });

  it('links to the guides and getting started pages it names', () => {
    for (const link of ['/guides/host/', '/guides/keyboard/', '/getting-started/typescript/', '/getting-started/vue/', '/getting-started/react/', '/getting-started/angular/']) {
      expect(page, link).toContain(`](${link})`);
    }
  });
});
