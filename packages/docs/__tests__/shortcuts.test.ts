import { describe, expect, it } from 'vitest';
import { SHIFT_STEP_FACTOR, TOOL_CATALOG } from 'keystone-financial-tools-core';
import { SHORTCUTS } from '../src/site/shortcuts';
import { readPage } from './support';

const page = readPage('guides/keyboard');
const rows = page.split('\n').filter((line) => line.startsWith('| '));

describe('the keyboard reference', () => {
  it('has a row for every shortcut', () => {
    for (const { keys, when, action } of SHORTCUTS) expect(rows, keys).toContain(`| ${keys} | ${when} | ${action} |`);
  });

  it('has no row that is not a shortcut', () => {
    // The header and the line under it are the two rows that are not shortcuts.
    expect(rows).toHaveLength(SHORTCUTS.length + 2);
    expect(rows[0]).toBe('| Keys | When | What it does |');
  });

  it('lists no shortcut twice', () => {
    const seen = SHORTCUTS.map(({ keys, when }) => `${keys} | ${when}`);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('has a row for the shortcut of every tool of the catalog, and none for a tool without one', () => {
    const toolRows = SHORTCUTS.filter(({ keys }) => keys.startsWith('Alt + '));
    const catalog = TOOL_CATALOG.flatMap(({ id, shortcut }) => (shortcut === null ? [] : [[id, shortcut.replace(/\+/g, ' + ')]]));
    expect(catalog).toHaveLength(5);
    expect(toolRows.map(({ keys }) => keys)).toStrictEqual(catalog.map(([, keys]) => keys));
    for (const [id, keys] of catalog) {
      const row = toolRows.find((candidate) => candidate.keys === keys);
      expect(row?.action, `${id} ${keys}`).toBe(`Choose the ${id.replace(/-/g, ' ').replace('fibonacci', 'Fibonacci')} tool`);
    }
  });

  it('has the undo and redo keys, as the core binds them', () => {
    const keys = SHORTCUTS.map((shortcut) => shortcut.keys);
    expect(keys).toContain('Ctrl/Cmd + Z');
    expect(keys).toContain('Ctrl/Cmd + Shift + Z');
    expect(keys).toContain('Ctrl/Cmd + Y');
    expect(page).not.toContain('The core has no key binding');
  });

  it('says ten times as far for Shift, as the core does', () => {
    expect(SHIFT_STEP_FACTOR).toBe(10);
    const shifted = SHORTCUTS.filter(({ keys }) => keys.startsWith('Shift'));
    expect(shifted).toHaveLength(2);
    for (const { action } of shifted) expect(action).toContain('ten bars or ten pixels');
  });
});
