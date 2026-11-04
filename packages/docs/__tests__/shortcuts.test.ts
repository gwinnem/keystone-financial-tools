import { describe, expect, it } from 'vitest';
import { SHIFT_STEP_FACTOR } from 'keystone-financial-tools-core';
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

  it('says ten times as far for Shift, as the core does', () => {
    expect(SHIFT_STEP_FACTOR).toBe(10);
    const shifted = SHORTCUTS.filter(({ keys }) => keys.startsWith('Shift'));
    expect(shifted).toHaveLength(2);
    for (const { action } of shifted) expect(action).toContain('ten bars or ten pixels');
  });
});
