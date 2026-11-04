import type { MessageKey } from './messages';
import { deepFreeze } from './object';
import type { ToolShortcuts } from './shortcuts';
import type { DrawingKind } from './types';

/** How the tools are grouped in a toolbar. */
export type ToolGroup = 'lines' | 'shapes' | 'fibonacci' | 'annotations';

/** The licence tier a tool belongs to (SDS 12; the split is a proposal until OD-2 is decided). */
export type ToolTier = 'community' | 'professional';

/**
 * What a toolbar needs to know about a tool, without the state of any chart.
 *
 * @example
 * ```ts
 * const entry: ToolCatalogEntry = { id: 'rectangle', labelKey: 'tool.rectangle', group: 'shapes', icon: 'rectangle', shortcut: 'Alt+R', tier: 'community' };
 * ```
 */
export interface ToolCatalogEntry {
  /** The drawing kind the tool places: pass it to `activate`. */
  readonly id: DrawingKind;
  /** The key of the label in the messages (`tool.<id>`): `messages[entry.labelKey]` is the text to show. */
  readonly labelKey: MessageKey;
  /** The group of the tool; its name is `messages['group.' + group]`. */
  readonly group: ToolGroup;
  /** The name of the icon: yours to map to a picture. */
  readonly icon: string;
  /** The default shortcut, for example `Alt+T`, or null when the tool has none. */
  readonly shortcut: string | null;
  readonly tier: ToolTier;
}

/**
 * The eight tools in toolbar order (FR-FW-040): the order of `DRAWING_KINDS`, which is also the order
 * of the groups. Build a toolbar from `state.toolbar` (an entry of this catalog with `active` and
 * `enabled`) rather than from the catalog itself.
 *
 * @example
 * ```ts
 * const groups = Map.groupBy(TOOL_CATALOG, (entry) => entry.group);
 * ```
 */
export const TOOL_CATALOG: readonly ToolCatalogEntry[] = deepFreeze<readonly ToolCatalogEntry[]>([
  { id: 'trend-line', labelKey: 'tool.trend-line', group: 'lines', icon: 'trend-line', shortcut: 'Alt+T', tier: 'community' },
  { id: 'horizontal-line', labelKey: 'tool.horizontal-line', group: 'lines', icon: 'horizontal-line', shortcut: 'Alt+H', tier: 'community' },
  { id: 'rectangle', labelKey: 'tool.rectangle', group: 'shapes', icon: 'rectangle', shortcut: 'Alt+R', tier: 'community' },
  { id: 'fibonacci-retracement', labelKey: 'tool.fibonacci-retracement', group: 'fibonacci', icon: 'fibonacci-retracement', shortcut: 'Alt+F', tier: 'professional' },
  { id: 'fibonacci-arcs', labelKey: 'tool.fibonacci-arcs', group: 'fibonacci', icon: 'fibonacci-arcs', shortcut: null, tier: 'professional' },
  { id: 'fibonacci-fans', labelKey: 'tool.fibonacci-fans', group: 'fibonacci', icon: 'fibonacci-fans', shortcut: null, tier: 'professional' },
  { id: 'fibonacci-time-zones', labelKey: 'tool.fibonacci-time-zones', group: 'fibonacci', icon: 'fibonacci-time-zones', shortcut: null, tier: 'professional' },
  { id: 'text-note', labelKey: 'tool.text-note', group: 'annotations', icon: 'text-note', shortcut: 'Alt+N', tier: 'community' },
]);

/**
 * An entry of the toolbar: the catalog entry with the state of one chart. `shortcut` is the one in
 * use (the `shortcuts` option over the default), so show it in a tooltip as it is.
 *
 * @example
 * ```ts
 * for (const entry of state.toolbar) {
 *   button(entry.id, { disabled: !entry.enabled, pressed: entry.active, title: entry.shortcut ?? '' });
 * }
 * ```
 */
export interface ToolbarEntry extends ToolCatalogEntry {
  /** The tool is the one placing drawings now. */
  readonly active: boolean;
  /** The tool can be activated: it is in the `tools` option. */
  readonly enabled: boolean;
}

/**
 * The toolbar for a chart: every catalog entry with `active` (it is `activeTool`), `enabled` (it is in
 * `allowed`) and the shortcut in use. `DrawingToolsState.toolbar` is this, kept up to date.
 *
 * @example
 * ```ts
 * toolbarEntries('rectangle', new Set(['rectangle', 'trend-line']), resolveShortcuts().shortcuts);
 * ```
 */
export function toolbarEntries(activeTool: DrawingKind | null, allowed: ReadonlySet<DrawingKind>, shortcuts: ToolShortcuts): readonly ToolbarEntry[] {
  return TOOL_CATALOG.map((entry) => ({ ...entry, shortcut: shortcuts[entry.id], active: entry.id === activeTool, enabled: allowed.has(entry.id) }));
}

/**
 * The toolbar of the tools while there is no chart to draw on (a React component before its host, an
 * Angular service before `attach`): every tool disabled and none active, with the default shortcuts.
 */
export const IDLE_TOOLBAR: readonly ToolbarEntry[] = deepFreeze<readonly ToolbarEntry[]>(TOOL_CATALOG.map((entry) => ({ ...entry, active: false, enabled: false })));
