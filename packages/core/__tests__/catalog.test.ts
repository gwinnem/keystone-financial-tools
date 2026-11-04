import { describe, expect, it } from 'vitest';
import { IDLE_TOOLBAR, TOOL_CATALOG, toolbarEntries, type ToolCatalogEntry } from '../src/catalog';
import { DRAWING_KINDS } from '../src/kinds';
import { resolveShortcuts } from '../src/shortcuts';
import type { DrawingKind } from '../src/types';

// FR-FW-040: the tool catalog and the toolbar built from it.
const ALL: ReadonlySet<DrawingKind> = new Set(DRAWING_KINDS);

describe('TOOL_CATALOG', () => {
  it('lists id, label key, group, icon, shortcut and tier for the eight kinds', () => {
    const expected: ToolCatalogEntry[] = [
      { id: 'trend-line', labelKey: 'tool.trend-line', group: 'lines', icon: 'trend-line', shortcut: 'Alt+T', tier: 'community' },
      { id: 'horizontal-line', labelKey: 'tool.horizontal-line', group: 'lines', icon: 'horizontal-line', shortcut: 'Alt+H', tier: 'community' },
      { id: 'rectangle', labelKey: 'tool.rectangle', group: 'shapes', icon: 'rectangle', shortcut: 'Alt+R', tier: 'community' },
      { id: 'fibonacci-retracement', labelKey: 'tool.fibonacci-retracement', group: 'fibonacci', icon: 'fibonacci-retracement', shortcut: 'Alt+F', tier: 'professional' },
      { id: 'fibonacci-arcs', labelKey: 'tool.fibonacci-arcs', group: 'fibonacci', icon: 'fibonacci-arcs', shortcut: null, tier: 'professional' },
      { id: 'fibonacci-fans', labelKey: 'tool.fibonacci-fans', group: 'fibonacci', icon: 'fibonacci-fans', shortcut: null, tier: 'professional' },
      { id: 'fibonacci-time-zones', labelKey: 'tool.fibonacci-time-zones', group: 'fibonacci', icon: 'fibonacci-time-zones', shortcut: null, tier: 'professional' },
      { id: 'text-note', labelKey: 'tool.text-note', group: 'annotations', icon: 'text-note', shortcut: 'Alt+N', tier: 'community' },
    ];
    expect(TOOL_CATALOG).toStrictEqual(expected);
  });

  it('has one entry for each drawing kind, in the order of DRAWING_KINDS', () => {
    expect(TOOL_CATALOG.map((entry) => entry.id)).toStrictEqual([...DRAWING_KINDS]);
  });

  it('uses the four groups, each at least once, and keeps the entries of a group together', () => {
    const groups = TOOL_CATALOG.map((entry) => entry.group);
    expect([...new Set(groups)]).toStrictEqual(['lines', 'shapes', 'fibonacci', 'annotations']);
    expect(groups).toStrictEqual(['lines', 'lines', 'shapes', 'fibonacci', 'fibonacci', 'fibonacci', 'fibonacci', 'annotations']);
  });

  it('gives every tool its own label key and icon, and every shortcut to one tool only', () => {
    expect(new Set(TOOL_CATALOG.map((entry) => entry.labelKey)).size).toBe(8);
    expect(new Set(TOOL_CATALOG.map((entry) => entry.icon)).size).toBe(8);
    const shortcuts = TOOL_CATALOG.flatMap((entry) => (entry.shortcut === null ? [] : [entry.shortcut]));
    expect(shortcuts).toHaveLength(5);
    expect(new Set(shortcuts).size).toBe(5);
  });

  it('puts the four Fibonacci tools in the professional tier, as the proposal of FR-LIC-002 has it', () => {
    expect(TOOL_CATALOG.filter((entry) => entry.tier === 'professional').map((entry) => entry.id)).toStrictEqual(['fibonacci-retracement', 'fibonacci-arcs', 'fibonacci-fans', 'fibonacci-time-zones']);
  });

  it('is frozen, entries included', () => {
    expect(Object.isFrozen(TOOL_CATALOG)).toBe(true);
    for (const entry of TOOL_CATALOG) expect(Object.isFrozen(entry), entry.id).toBe(true);
  });
});

describe('toolbarEntries', () => {
  const defaults = resolveShortcuts().shortcuts;

  it('adds active and enabled to every entry of the catalog, in the order of the catalog', () => {
    const entries = toolbarEntries('rectangle', ALL, defaults);
    expect(entries.map((entry) => entry.id)).toStrictEqual([...DRAWING_KINDS]);
    expect(entries).toStrictEqual(TOOL_CATALOG.map((entry) => ({ ...entry, active: entry.id === 'rectangle', enabled: true })));
  });

  it('marks only the active tool as active', () => {
    expect(
      toolbarEntries('fibonacci-fans', ALL, defaults)
        .filter((entry) => entry.active)
        .map((entry) => entry.id)
    ).toStrictEqual(['fibonacci-fans']);
    expect(toolbarEntries(null, ALL, defaults).some((entry) => entry.active)).toBe(false);
  });

  it('enables only the tools that are allowed', () => {
    const entries = toolbarEntries(null, new Set<DrawingKind>(['rectangle', 'text-note']), defaults);
    expect(entries.filter((entry) => entry.enabled).map((entry) => entry.id)).toStrictEqual(['rectangle', 'text-note']);
    expect(toolbarEntries(null, new Set(), defaults).some((entry) => entry.enabled)).toBe(false);
  });

  it('can be active and not enabled', () => {
    const entry = toolbarEntries('trend-line', new Set(), defaults)[0];
    expect(entry).toMatchObject({ id: 'trend-line', active: true, enabled: false });
  });

  it('shows the shortcut in use instead of the default one', () => {
    const { shortcuts } = resolveShortcuts({ 'trend-line': 'Ctrl+Alt+L', rectangle: null, 'fibonacci-arcs': 'Alt+A' });
    const byId = new Map(toolbarEntries(null, ALL, shortcuts).map((entry) => [entry.id, entry.shortcut]));
    expect(byId.get('trend-line')).toBe('Ctrl+Alt+L');
    expect(byId.get('rectangle')).toBeNull();
    expect(byId.get('fibonacci-arcs')).toBe('Alt+A');
    expect(byId.get('horizontal-line')).toBe('Alt+H');
  });

  it('leaves the catalog as it is', () => {
    toolbarEntries('rectangle', ALL, resolveShortcuts({ rectangle: null }).shortcuts);
    expect(TOOL_CATALOG.find((entry) => entry.id === 'rectangle')?.shortcut).toBe('Alt+R');
  });
});

describe('IDLE_TOOLBAR', () => {
  it('has every tool, none active and none enabled, with the default shortcuts', () => {
    expect(IDLE_TOOLBAR).toStrictEqual(TOOL_CATALOG.map((entry) => ({ ...entry, active: false, enabled: false })));
    expect(IDLE_TOOLBAR).toStrictEqual(toolbarEntries(null, new Set(), resolveShortcuts().shortcuts));
  });

  it('is frozen, entries included', () => {
    expect(Object.isFrozen(IDLE_TOOLBAR)).toBe(true);
    for (const entry of IDLE_TOOLBAR) expect(Object.isFrozen(entry), entry.id).toBe(true);
  });
});
