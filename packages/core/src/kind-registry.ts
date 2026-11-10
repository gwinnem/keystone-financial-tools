import type { ToolGroup } from './catalog';
import type { DrawingHost, Point, Rect } from './host';
import type { HandlePoint, GeometryOptions, Shape } from './geometry/types';
import { deepFreeze } from './object';
import type { Drawing, DrawingKind, KindOptions, PanePosition } from './types';

/** Where a pane-anchored kind sits when a drawing has no `position`: the middle of the pane. */
export const DEFAULT_PANE_POSITION: PanePosition = Object.freeze({ x: 0.5, y: 0.5 });

/**
 * How many anchors a kind takes: `min` to `max`, both whole numbers with `1 <= min <= max`. A fixed kind has
 * `min === max`; a kind with a variable number of anchors has `min < max`.
 */
export interface AnchorRule {
  readonly min: number;
  readonly max: number;
}

/** What a kind's geometry function is given. */
export interface KindGeometryContext {
  readonly drawing: Drawing;
  /** The anchors in pixels, in anchor order. */
  readonly points: readonly Point[];
  /** The pane of the first anchor's y-axis. */
  readonly rect: Rect;
  readonly host: DrawingHost;
  readonly options: GeometryOptions;
  /** The options of the drawing over the defaults of the kind. */
  readonly kindOptions: KindOptions;
}

/**
 * Everything the library knows about a drawing kind (FR-TOOL-030, D-8): add a kind by registering one of these.
 * The hit parts of a kind come from the `part` of its shapes.
 *
 * @example
 * ```ts
 * const dispose = registerKind({
 *   id: 'cross-line',
 *   anchors: { min: 1, max: 1 },
 *   defaults: {},
 *   group: 'lines',
 *   geometry: ({ points, rect }) => [],
 * });
 * ```
 */
export interface KindDefinition {
  readonly id: string;
  readonly anchors: AnchorRule;
  /** Every option the kind accepts with its default; the keys are the option schema. Frozen when registered. */
  readonly defaults: KindOptions;
  /** The group of the kind in a toolbar. */
  readonly group: ToolGroup;
  /**
   * `data` (default): the anchors are points of the chart. `pane` (D-10): the drawing has one anchor that only names the pane (its time
   * and price are ignored) and `options.position`, fractions 0..1 of the pane, places it; the `points` of the geometry
   * context is that one plot point. A pane kind needs the anchor rule 1 to 1.
   */
  readonly space?: 'data' | 'pane';
  /**
   * `points` (default): one click per anchor (FR-TOOL-032, FR-TOOL-033). `freehand` (FR-TOOL-034): the pointer is pressed, dragged and released
   * and the path it took becomes the anchors: sampled every 3 px, simplified to 1 px and limited to 512 anchors when released. A freehand kind
   * needs the anchor rule `min` of at least 2; a click alone creates nothing, and a stroke is drawn with a pointer, not with the keyboard.
   */
  readonly placement?: 'points' | 'freehand';
  /** The shapes of a drawing of the kind for the current frame. */
  readonly geometry: (context: KindGeometryContext) => Shape[];
  /**
   * The grab points of a drawing. Default: one `handle:<n>` at each anchor; for a freehand kind (`placement: 'freehand'`) four handles at the
   * corners of the box around its anchors, which scale it (FR-TOOL-035). Dragging a handle that is not an anchor changes nothing.
   */
  readonly handles?: (points: readonly Point[], rect: Rect) => HandlePoint[];
}

const definitions = new Map<string, KindDefinition>();
const kinds: string[] = [];
const defaultTools: string[] = [];
const rules: Record<string, AnchorRule> = {};
const counts: Record<string, number> = {};

/** The anchor rule of every registered kind. */
export const ANCHOR_RULES: Readonly<Record<DrawingKind, AnchorRule>> = rules as Record<DrawingKind, AnchorRule>;

/** The anchor count of every registered kind that has a fixed one (`min === max`). */
export const ANCHOR_COUNT: Readonly<Record<DrawingKind, number>> = counts as Record<DrawingKind, number>;

/** Every registered kind, in registration order (the eight kinds of 1.0 first). The array is kept up to date. */
export const DRAWING_KINDS: readonly DrawingKind[] = kinds as DrawingKind[];

/** The kinds the `tools` option allows when it is not set: the eight tools of 1.0 (D-8). */
export const DEFAULT_TOOLS: readonly DrawingKind[] = defaultTools as DrawingKind[];

function checkDefinition(definition: KindDefinition): void {
  if (typeof definition.id !== 'string' || definition.id === '') throw new RangeError('A kind needs a non-empty id.');
  if (definitions.has(definition.id)) throw new RangeError(`The kind ${definition.id} is already registered.`);
  const { min, max } = definition.anchors;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new RangeError(`The anchor rule of ${definition.id} needs whole numbers with 1 <= min <= max.`);
  }
  if (definition.space === 'pane' && (min !== 1 || max !== 1)) throw new RangeError(`The pane kind ${definition.id} takes exactly one anchor.`);
  if (definition.placement === 'freehand' && min < 2) throw new RangeError(`The freehand kind ${definition.id} needs at least two anchors.`);
}

function add(definition: KindDefinition, isDefault: boolean): () => void {
  checkDefinition(definition);
  const defaults = definition.space === 'pane' ? { position: DEFAULT_PANE_POSITION, ...definition.defaults } : { ...definition.defaults };
  const entry: KindDefinition = deepFreeze({ ...definition, anchors: { ...definition.anchors }, defaults });
  definitions.set(entry.id, entry);
  kinds.push(entry.id);
  if (isDefault) defaultTools.push(entry.id);
  rules[entry.id] = entry.anchors;
  if (entry.anchors.min === entry.anchors.max) counts[entry.id] = entry.anchors.min;
  return () => {
    if (definitions.get(entry.id) !== entry) return;
    definitions.delete(entry.id);
    kinds.splice(kinds.indexOf(entry.id), 1);
    const at = defaultTools.indexOf(entry.id);
    if (at >= 0) defaultTools.splice(at, 1);
    delete rules[entry.id];
    delete counts[entry.id];
  };
}

/**
 * Registers a kind. Throws `RangeError` for an empty id, an id that is taken or a bad anchor rule. Returns a function
 * that removes the kind again. A kind registered here is not in the default of the `tools` option: ask for it by id.
 *
 * @example
 * ```ts
 * const dispose = registerKind({ id: 'ray', anchors: { min: 2, max: 2 }, defaults: {}, group: 'lines', geometry: () => [] });
 * dispose();
 * ```
 */
export function registerKind(definition: KindDefinition): () => void {
  return add(definition, false);
}

/** Registers one of the eight kinds of 1.0, which the `tools` option allows by default. Used by the built-in kinds only. */
export function registerBuiltInKind(definition: KindDefinition): void {
  add(definition, true);
}

/** The definition of a kind, or undefined when it is not registered. */
export function kindDefinition(kind: string): KindDefinition | undefined {
  return definitions.get(kind);
}

/** The definition of a kind; throws `RangeError` when it is not registered. */
export function requireKind(kind: string): KindDefinition {
  const definition = definitions.get(kind);
  if (definition === undefined) throw new RangeError(`The kind ${kind} is not registered.`);
  return definition;
}

/** True for a kind placed by a freehand stroke (`placement: 'freehand'`, FR-TOOL-034). */
export function isFreehandKind(kind: string): boolean {
  return definitions.get(kind)?.placement === 'freehand';
}

/** True for the id of a registered kind. */
export function isDrawingKind(value: unknown): value is DrawingKind {
  return typeof value === 'string' && definitions.has(value);
}

/** The text of an anchor rule for a message: `2 anchor(s)` for a fixed kind, `3 to 6 anchors` for a ranged one. */
export function anchorRuleText(rule: AnchorRule): string {
  return rule.min === rule.max ? `${rule.min} anchor(s)` : `${rule.min} to ${rule.max} anchors`;
}
