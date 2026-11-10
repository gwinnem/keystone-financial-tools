/**
 * A point on the chart in chart-agnostic coordinates. Drawings store anchors, never pixels, so they
 * survive zoom, scroll, resize and pane layout changes.
 */
export interface Anchor {
  /** Bar time in epoch milliseconds. */
  readonly time: number;
  readonly price: number;
  /** The y-axis (pane) the price belongs to. */
  readonly yAxisId: string;
}

/**
 * The drawing tools. The anchor count of each kind is in `ANCHOR_COUNT`. The first eight are the tools of 1.0; the trend-based extension
 * (E11) and the channel, time extension, circles, spiral and wedge (E15) are Fibonacci kinds that a host draws with its Fibonacci renderer
 * (FR-SC-004): they are registered and valid in a document, but not in the default `tools` or the catalog until their tool stories.
 */
export type DrawingKind =
  | 'trend-line'
  | 'horizontal-line'
  | 'rectangle'
  | 'fibonacci-retracement'
  | 'fibonacci-arcs'
  | 'fibonacci-fans'
  | 'fibonacci-time-zones'
  | 'text-note'
  | 'fibonacci-trend-based'
  | 'fibonacci-channel'
  | 'fibonacci-time-extension'
  | 'fibonacci-circles'
  | 'fibonacci-spiral'
  | 'fibonacci-wedge';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

/**
 * Per-drawing style overrides. Every field is optional: a missing value comes from the active
 * `DrawingTheme` at scene time (`resolveStyle`), so switching the theme restyles drawings that do
 * not override it. Colors are CSS color strings; the host validates their syntax.
 *
 * @example
 * ```ts
 * const style: DrawingStyle = { color: '#e91e63', lineWidth: 2, lineStyle: 'dashed' };
 * ```
 */
export interface DrawingStyle {
  readonly color?: string;
  /** CSS px, 1 to 10. */
  readonly lineWidth?: number;
  readonly lineStyle?: LineStyle;
  readonly fillColor?: string;
  /** 0 (no fill) to 1. A rectangle body only hits when this is above 0. */
  readonly fillOpacity?: number;
  readonly textColor?: string;
  /** CSS px, 8 to 72. */
  readonly fontSize?: number;
}

/** One Fibonacci level. `ratio` is unique within a drawing. */
export interface FibonacciLevel {
  readonly ratio: number;
  readonly visible: boolean;
  /** Overrides the drawing color for this level. */
  readonly color?: string;
}

/** A place in a pane as fractions of its width and height, from its top left corner (D-10). */
export interface PanePosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Kind-specific options. Each kind accepts only its own keys (`KIND_OPTION_KEYS`); missing values
 * come from `defaultOptions(kind)`.
 *
 * | Kind | Keys |
 * |---|---|
 * | `trend-line` | `extendLeft`, `extendRight` |
 * | `fibonacci-retracement` | `levels`, `reverse`, `extendLeft`, `extendRight`, `showLabels`, `showPrices` |
 * | `fibonacci-arcs` | `levels`, `fullCircles`, `showLabels` |
 * | `fibonacci-fans` | `levels`, `showLabels` |
 * | `fibonacci-time-zones` | `sequence`, `showLabels` |
 * | `fibonacci-trend-based` | `levels`, `extendLeft`, `extendRight`, `showLabels`, `showPrices` |
 * | `fibonacci-channel` | `levels`, `extendLeft`, `extendRight`, `showLabels` |
 * | `fibonacci-time-extension`, `fibonacci-circles`, `fibonacci-wedge` | `levels`, `showLabels` |
 * | `fibonacci-spiral` | `turns`, `clockwise` |
 * | a pane-anchored kind | `position` |
 *
 * @example
 * ```ts
 * const options: KindOptions = { extendRight: true, levels: [{ ratio: 0.618, visible: true, color: '#f7525f' }] };
 * ```
 */
export interface KindOptions {
  /** Pane-anchored kinds: where the drawing sits, as fractions of the pane from its top left corner. Both between 0 and 1. */
  readonly position?: PanePosition;
  /** Fibonacci levels, at most 24, unique ratios. */
  readonly levels?: readonly FibonacciLevel[];
  /** Time-zone bar multiples: non-negative integers, strictly ascending, at most 32. */
  readonly sequence?: readonly number[];
  readonly extendLeft?: boolean;
  readonly extendRight?: boolean;
  /** Retracement: measure from anchor 2 back to anchor 1. */
  readonly reverse?: boolean;
  readonly showLabels?: boolean;
  readonly showPrices?: boolean;
  /** Arcs: full circles instead of half circles. */
  readonly fullCircles?: boolean;
  /** Spiral: the number of turns, a whole number from 1 to 8. */
  readonly turns?: number;
  /** Spiral: turn clockwise on screen (the default) or counter-clockwise. */
  readonly clockwise?: boolean;
}

/** A value that survives `JSON.stringify` / `JSON.parse` unchanged. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * A persisted drawing. All anchors share one `yAxisId` (one pane).
 *
 * @example
 * ```ts
 * const line: Drawing = {
 *   id: createId(),
 *   kind: 'trend-line',
 *   anchors: [
 *     { time: Date.UTC(2026, 9, 1), price: 100, yAxisId: 'price' },
 *     { time: Date.UTC(2026, 9, 9), price: 112, yAxisId: 'price' },
 *   ],
 *   locked: true,
 *   meta: { author: 'desk-7' },
 * };
 * ```
 */
export interface Drawing {
  /** Unique within a store. See `createId`. */
  readonly id: string;
  readonly kind: DrawingKind;
  readonly anchors: readonly Anchor[];
  readonly style?: DrawingStyle;
  /** Label text, for example the body of a text note. */
  readonly text?: string;
  /** Kind-specific options, see `KindOptions`. */
  readonly options?: KindOptions;
  /** Selectable but not movable, resizable, editable or deletable by interaction. Default `false`. */
  readonly locked?: boolean;
  /** Left out of the scene and of hit-testing. Default `false`. */
  readonly hidden?: boolean;
  /** Paint order; higher is on top, ties keep insertion order. A finite integer, default `0`. */
  readonly zIndex?: number;
  /** Application data. Must be JSON-safe; it round-trips through `toJSON` / `fromJSON` untouched. */
  readonly meta?: { readonly [key: string]: JsonValue };
}

/** Fields of a drawing that `DrawingStore.update` can change. */
export type DrawingPatch = Partial<Omit<Drawing, 'id'>>;

/** What a saved document belongs to. Drawings are timeframe independent unless `timeframe` is set. */
export interface DocumentScope {
  readonly symbol?: string;
  readonly timeframe?: string;
}

/**
 * The saved form of a store (`DrawingStore.toJSON` / `DrawingStore.fromJSON`), version 2.
 *
 * @example
 * ```ts
 * const doc: DrawingDocument = { version: 2, scope: { symbol: 'EURUSD' }, drawings: store.list() };
 * ```
 */
export interface DrawingDocument {
  readonly version: 2;
  readonly scope?: DocumentScope;
  readonly drawings: readonly Drawing[];
}

/** The version 1 document written by 0.1. `fromJSON` migrates it to version 2. */
export interface DrawingDocumentV1 {
  readonly version: 1;
  readonly drawings: readonly Drawing[];
}

export type DrawingIssueCode =
  | 'KFT-E-SHAPE'
  | 'KFT-E-ID'
  | 'KFT-E-KIND'
  | 'KFT-E-ANCHORS'
  | 'KFT-E-ANCHOR'
  | 'KFT-E-AXIS'
  | 'KFT-E-TEXT'
  | 'KFT-E-STYLE'
  | 'KFT-E-OPTIONS'
  | 'KFT-E-META'
  | 'KFT-E-MISSING'
  | 'KFT-E-JSON'
  | 'KFT-E-SCOPE'
  | 'KFT-E-HOST'
  | 'KFT-E-CAPABILITY';

export interface DrawingIssue {
  readonly code: DrawingIssueCode;
  readonly message: string;
}

/**
 * One change to one drawing. Within a batch, changes to the same drawing are folded into one
 * operation: add + update is an add of the final value, add + remove is nothing, update + update is
 * one update from the first `before` to the last `after`, update + remove is a remove of the
 * original, remove + add is an update.
 */
export type StoreOperation =
  | { readonly type: 'add'; readonly id: string; readonly after: Drawing }
  | { readonly type: 'update'; readonly id: string; readonly before: Drawing; readonly after: Drawing }
  | { readonly type: 'remove'; readonly id: string; readonly before: Drawing };

/** What a store notification carries: the new list and the operations, in the order they first happened. */
export interface StoreChange {
  readonly drawings: readonly Drawing[];
  readonly operations: readonly StoreOperation[];
  /**
   * False when the change was made with `{ history: false }` (in a batch: when any part of it was),
   * for example applying a remote document. `History` does not record such changes.
   */
  readonly history: boolean;
}

/**
 * Options of a store change.
 *
 * @example
 * ```ts
 * store.batch(() => applyRemote(store), { history: false });
 * ```
 */
export interface ChangeOptions {
  /** False keeps the change out of the undo history. Default true. */
  readonly history?: boolean;
}

/**
 * Called after every store change (once per batch). The list is the first argument, so a listener
 * that only needs the drawings can ignore `change`.
 *
 * @example
 * ```ts
 * store.subscribe((drawings, change) => {
 *   for (const op of change.operations) console.log(op.type, op.id);
 * });
 * ```
 */
export type DrawingListener = (drawings: readonly Drawing[], change: StoreChange) => void;
