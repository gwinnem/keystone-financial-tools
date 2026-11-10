import { missingHostFeatures, type HostFeature } from './host';
import type { MessageKey } from './messages';
import { deepFreeze } from './object';
import type { ToolShortcuts } from './shortcuts';
import type { DrawingKind } from './types';

/** How the tools are grouped in a toolbar. */
export type ToolGroup = 'lines' | 'shapes' | 'fibonacci' | 'annotations';

/** The licence tier a tool belongs to (SDS 12, FR-LIC-002): the trend line and horizontal line are community; the rectangle, the text note and the four Fibonacci tools are professional. */
export type ToolTier = 'community' | 'professional';

/**
 * What a toolbar needs to know about a tool, without the state of any chart.
 *
 * @example
 * ```ts
 * const entry: ToolCatalogEntry = { id: 'rectangle', labelKey: 'tool.rectangle', group: 'shapes', icon: 'rectangle', shortcut: 'Alt+R', tier: 'professional' };
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
  /**
   * The host features the tool needs (`paneIds`, `barsBetween`, `volumeBetween` of host contract version 3). The
   * tool is disabled on a host without them. None of the eight tools of 1.0 needs one, so they work on a version 2 host.
   */
  readonly requires?: readonly HostFeature[];
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
  { id: 'rectangle', labelKey: 'tool.rectangle', group: 'shapes', icon: 'rectangle', shortcut: 'Alt+R', tier: 'professional' },
  { id: 'fibonacci-retracement', labelKey: 'tool.fibonacci-retracement', group: 'fibonacci', icon: 'fibonacci-retracement', shortcut: 'Alt+F', tier: 'professional' },
  { id: 'fibonacci-arcs', labelKey: 'tool.fibonacci-arcs', group: 'fibonacci', icon: 'fibonacci-arcs', shortcut: null, tier: 'professional' },
  { id: 'fibonacci-fans', labelKey: 'tool.fibonacci-fans', group: 'fibonacci', icon: 'fibonacci-fans', shortcut: null, tier: 'professional' },
  { id: 'fibonacci-time-zones', labelKey: 'tool.fibonacci-time-zones', group: 'fibonacci', icon: 'fibonacci-time-zones', shortcut: null, tier: 'professional' },
  { id: 'text-note', labelKey: 'tool.text-note', group: 'annotations', icon: 'text-note', shortcut: 'Alt+N', tier: 'professional' },
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
  /**
   * The tool can be activated: it is in the `tools` option and the host has every feature it `requires`.
   */
  readonly enabled: boolean;
  /**
   * Only on an entry that the host cannot serve: the features the tool `requires` and the host lacks. Show it as the
   * reason the button is disabled; activating the tool emits `blocked` with `KFT-E-CAPABILITY`.
   */
  readonly missing?: readonly HostFeature[];
}

/**
 * The toolbar for a chart: every catalog entry with `active` (it is `activeTool`), `enabled` (it is in
 * `allowed` and `features` has everything it `requires`) and the shortcut in use. An entry whose required
 * features are missing also has `missing`. Without `features` the host is taken to have every feature.
 * `DrawingToolsState.toolbar` is this, kept up to date.
 *
 * @example
 * ```ts
 * toolbarEntries('rectangle', new Set(['rectangle', 'trend-line']), resolveShortcuts().shortcuts);
 * ```
 */
export function toolbarEntries(
  activeTool: DrawingKind | null,
  allowed: ReadonlySet<DrawingKind>,
  shortcuts: ToolShortcuts,
  features?: ReadonlySet<HostFeature>,
  catalog: readonly ToolCatalogEntry[] = TOOL_CATALOG
): readonly ToolbarEntry[] {
  return catalog.map((entry) => {
    const missing = features === undefined ? [] : missingHostFeatures(entry.requires, features);
    const base = { ...entry, shortcut: shortcuts[entry.id], active: entry.id === activeTool, enabled: allowed.has(entry.id) && missing.length === 0 };
    return missing.length === 0 ? base : { ...base, missing };
  });
}

/**
 * The host features that `kind` needs and `features` lacks (empty when the tool works on the host).
 *
 * @example
 * ```ts
 * missingToolFeatures('trend-line', hostFeatures(host)); // [] on every host
 * ```
 */
export function missingToolFeatures(kind: DrawingKind, features: ReadonlySet<HostFeature>, catalog: readonly ToolCatalogEntry[] = TOOL_CATALOG): readonly HostFeature[] {
  return missingHostFeatures(catalog.find((entry) => entry.id === kind)?.requires, features);
}

/**
 * The toolbar of the tools while there is no chart to draw on (a React component before its host, an
 * Angular service before `attach`): every tool disabled and none active, with the default shortcuts.
 */
export const IDLE_TOOLBAR: readonly ToolbarEntry[] = deepFreeze<readonly ToolbarEntry[]>(TOOL_CATALOG.map((entry) => ({ ...entry, active: false, enabled: false })));
