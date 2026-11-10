import { describe, expect, it } from 'vitest';
import { IDLE_TOOLBAR, missingToolFeatures, TOOL_CATALOG, toolbarEntries, type ToolCatalogEntry } from '../src/catalog';
import type { HostFeature } from '../src/host';
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
      { id: 'rectangle', labelKey: 'tool.rectangle', group: 'shapes', icon: 'rectangle', shortcut: 'Alt+R', tier: 'professional' },
      { id: 'fibonacci-retracement', labelKey: 'tool.fibonacci-retracement', group: 'fibonacci', icon: 'fibonacci-retracement', shortcut: 'Alt+F', tier: 'professional' },
      { id: 'fibonacci-arcs', labelKey: 'tool.fibonacci-arcs', group: 'fibonacci', icon: 'fibonacci-arcs', shortcut: null, tier: 'professional' },
      { id: 'fibonacci-fans', labelKey: 'tool.fibonacci-fans', group: 'fibonacci', icon: 'fibonacci-fans', shortcut: null, tier: 'professional' },
      { id: 'fibonacci-time-zones', labelKey: 'tool.fibonacci-time-zones', group: 'fibonacci', icon: 'fibonacci-time-zones', shortcut: null, tier: 'professional' },
      { id: 'text-note', labelKey: 'tool.text-note', group: 'annotations', icon: 'text-note', shortcut: 'Alt+N', tier: 'professional' },
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

  it('puts the trend line and horizontal line in the community tier and the rectangle, the text note and the four Fibonacci tools in the professional tier (FR-LIC-002)', () => {
    expect(TOOL_CATALOG.filter((entry) => entry.tier === 'community').map((entry) => entry.id)).toStrictEqual(['trend-line', 'horizontal-line']);
    expect(TOOL_CATALOG.filter((entry) => entry.tier === 'professional').map((entry) => entry.id)).toStrictEqual([
      'rectangle',
      'fibonacci-retracement',
      'fibonacci-arcs',
      'fibonacci-fans',
      'fibonacci-time-zones',
      'text-note',
    ]);
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

describe('tools that need host features (E11-F04-S01)', () => {
  const defaults = resolveShortcuts().shortcuts;
  const catalog: readonly ToolCatalogEntry[] = [
    { ...TOOL_CATALOG[0], requires: ['panes'] },
    { ...TOOL_CATALOG[1], requires: ['panes', 'volume', 'bars'] },
    { ...TOOL_CATALOG[2], requires: [] },
    TOOL_CATALOG[3],
  ];
  const features = (...names: HostFeature[]): ReadonlySet<HostFeature> => new Set(names);

  it('needs no host feature for any of the eight tools of 1.0', () => {
    for (const entry of TOOL_CATALOG) expect(entry.requires, entry.id).toBeUndefined();
    for (const entry of TOOL_CATALOG) expect(missingToolFeatures(entry.id, features()), entry.id).toEqual([]);
  });

  it('lists the required features that the host lacks, in the order of requires', () => {
    expect(missingToolFeatures('trend-line', features(), catalog)).toEqual(['panes']);
    expect(missingToolFeatures('horizontal-line', features('volume'), catalog)).toEqual(['panes', 'bars']);
    expect(missingToolFeatures('horizontal-line', features('bars', 'volume', 'panes'), catalog)).toEqual([]);
    expect(missingToolFeatures('rectangle', features(), catalog)).toEqual([]);
    expect(missingToolFeatures('fibonacci-retracement', features(), catalog)).toEqual([]);
  });

  it('has nothing missing for a kind that is not in the catalog', () => {
    expect(missingToolFeatures('nope' as never, features(), catalog)).toEqual([]);
  });

  it('disables a tool whose features the host lacks and names them in missing', () => {
    const entries = toolbarEntries(null, ALL, defaults, features('panes'), catalog);
    expect(entries.map((entry) => [entry.id, entry.enabled])).toEqual([
      ['trend-line', true],
      ['horizontal-line', false],
      ['rectangle', true],
      ['fibonacci-retracement', true],
    ]);
    expect(entries[1].missing).toEqual(['volume', 'bars']);
  });

  it('has no missing key on an entry that the host can serve, so nothing else changes', () => {
    const entries = toolbarEntries(null, ALL, defaults, features('panes'), catalog);
    expect('missing' in entries[0]).toBe(false);
    expect('missing' in entries[2]).toBe(false);
    expect('missing' in entries[3]).toBe(false);
  });

  it('keeps a tool disabled that is not allowed, with the features present', () => {
    const entries = toolbarEntries(null, new Set<DrawingKind>(), defaults, features('panes'), catalog);
    expect(entries.some((entry) => entry.enabled)).toBe(false);
    expect(entries.some((entry) => 'missing' in entry)).toBe(true);
  });

  it('takes the host to have every feature when none are given', () => {
    const entries = toolbarEntries(null, ALL, defaults, undefined, catalog);
    expect(entries.every((entry) => entry.enabled && !('missing' in entry))).toBe(true);
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
