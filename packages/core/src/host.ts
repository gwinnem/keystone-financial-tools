/** A point in plot coordinates (CSS px, origin at the top left of the plot area). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A rectangle in plot coordinates (CSS px). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One bar's prices. */
export interface Ohlc {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

/** The bar nearest to a time: its own time (epoch ms) and prices. */
export interface NearestBar {
  readonly time: number;
  readonly ohlc: Ohlc;
}

/** Modifier keys held during a pointer or key event. */
export interface Modifiers {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/** `cancel`: the system took the pointer away (for example a touch scroll); `leave`: it left the plot area. */
export type PointerPhase = 'down' | 'move' | 'up' | 'cancel' | 'leave';

export type PointerType = 'mouse' | 'touch' | 'pen';

/**
 * A pointer event in plot coordinates.
 *
 * @example
 * ```ts
 * const down: HostPointerEvent = { phase: 'down', x: 120, y: 48, pointerType: 'mouse', button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
 * ```
 */
export interface HostPointerEvent extends Modifiers {
  readonly phase: PointerPhase;
  /** CSS px from the left of the plot area. */
  readonly x: number;
  /** CSS px from the top of the plot area. */
  readonly y: number;
  readonly pointerType: PointerType;
  /** 0 primary, 1 middle, 2 secondary (`PointerEvent.button`). */
  readonly button: number;
}

/**
 * A key event while the chart has focus. `key` is `KeyboardEvent.key`, for example `'Delete'` or `'z'`.
 * `code` is `KeyboardEvent.code`, for example `'KeyT'`; pass it when you have it: the tool shortcuts use it
 * for letters that Alt or Option change (Option+T on a Mac gives the key `'†'`).
 */
export interface HostKeyEvent extends Modifiers {
  readonly key: string;
  readonly code?: string;
}

/** The cursors the tools ask the host to show. */
export type DrawingCursor = 'default' | 'crosshair' | 'pointer' | 'move' | 'grab' | 'grabbing' | 'ns-resize' | 'ew-resize' | 'nwse-resize' | 'nesw-resize' | 'text' | 'not-allowed';

/** What the tools pass to `DrawingHost.editText` to edit a text note in place. */
export interface TextEditRequest {
  readonly drawingId: string;
  /** The current text. */
  readonly text: string;
  /** Where the note's text box starts, in plot coordinates (CSS px). */
  readonly x: number;
  readonly y: number;
  /** CSS px. */
  readonly fontSize: number;
}

/** The host contract version this package implements: the current one. */
export const HOST_API_VERSION = 3;

/** The oldest host contract version the tools still accept: a version 2 host keeps working, without the members that version 3 added. */
export const MIN_HOST_API_VERSION = 2;

/**
 * What a host can do beyond the members every host has: the members that contract version 3 added. A tool
 * that needs one of them is disabled on a host without it (`KFT-E-CAPABILITY`).
 *
 * - `panes`: `paneIds()`, the y-axes of the panes, top to bottom.
 * - `bars`: `barsBetween(from, to)`, the bars between two times.
 * - `volume`: `volumeBetween(from, to)`, the volume between two times.
 */
export type HostFeature = 'panes' | 'bars' | 'volume';

/**
 * What a chart supplies for the drawing tools to work on it (contract version 3; version 2 hosts are
 * still accepted). keystone-charts-financial implements it; the tools never depend on the chart
 * package. Times are epoch milliseconds; x, y and rectangles are CSS px in plot coordinates.
 *
 * @example
 * ```ts
 * const host: DrawingHost = {
 *   apiVersion: 3,
 *   timeToX: (time) => chart.timeScale.toPixel(time),
 *   paneIds: () => chart.panes.map((pane) => pane.yAxisId),
 *   barsBetween: (from, to) => chart.timeScale.barsBetween(from, to),
 *   // ...the other members
 * };
 * const tools = createDrawingTools(host);
 * ```
 */
export interface DrawingHost {
  /** 3 for a host that has `paneIds` and `barsBetween`; 2 for a host written for contract version 2. */
  readonly apiVersion: 2 | 3;
  /** Time (epoch ms) to x (CSS px). Extrapolates beyond the first and last bar (future space). */
  timeToX(time: number): number;
  /** x (CSS px) to time (epoch ms); the inverse of `timeToX`, also beyond the data. */
  xToTime(x: number): number;
  /** Price to y (CSS px) on a y-axis. Log and percentage scales are the host's concern. */
  priceToY(price: number, yAxisId: string): number;
  /** y (CSS px) to price on a y-axis; the inverse of `priceToY`. */
  yToPrice(y: number, yAxisId: string): number;
  /** The y-axis of the pane under a plot point, or null outside every pane. */
  yAxisAt(x: number, y: number): string | null;
  /** The plot area of a pane (CSS px), or null when the y-axis has no pane. */
  paneRect(yAxisId: string): Rect | null;
  /** The bar nearest to a time (for magnet snapping), or null when there is no data. */
  nearestBar(time: number): NearestBar | null;
  /** Milliseconds between bars at the current timeframe. */
  barInterval(): number;
  /** Subscribes to pointer events over the whole plot area; returns the unsubscribe function. */
  onPointer(listener: (event: HostPointerEvent) => void): () => void;
  /**
   * Subscribes to key events while the chart has focus; returns the unsubscribe function. A
   * listener returning true handled the key: the host then prevents the default action.
   */
  onKey(listener: (event: HostKeyEvent) => boolean): () => void;
  /** Subscribes to zoom, scroll, resize, pane layout and timeframe changes; returns the unsubscribe function. */
  onViewportChange(listener: () => void): () => void;
  setCursor(cursor: DrawingCursor): void;
  /** Asks the host to redraw its overlay layer; the host then calls `getScene()`. */
  requestRender(): void;
  /** Optional in-place text editor: resolves with the new text, or null when cancelled. */
  editText?(request: TextEditRequest): Promise<string | null>;
  /**
   * Version 3, required when `apiVersion` is 3. The y-axis ids of the panes, top to bottom, every pane once:
   * a tool that spans all panes (the vertical line) draws in each of them.
   */
  paneIds?(): readonly string[];
  /**
   * Version 3, required when `apiVersion` is 3. The number of bars from `from` to `to`, counted on the bar
   * axis so that gaps in time (nights, weekends) do not count; negative when `to` is before `from`, 0 for
   * equal times. Beyond the last bar every `barInterval()` counts as one bar (future space).
   */
  barsBetween?(from: number, to: number): number;
  /**
   * Version 3, optional. The total volume of the bars from `from` (inclusive) to `to` (exclusive), or null
   * when the data has no volume. The order of the two times does not matter.
   */
  volumeBetween?(from: number, to: number): number | null;
}

/**
 * The features a host has: `panes` when it has `paneIds`, `bars` when it has `barsBetween` and `volume`
 * when it has `volumeBetween`. A version 2 host has none of them.
 *
 * @example
 * ```ts
 * hostFeatures(host).has('volume'); // true when the host can tell the volume between two times
 * ```
 */
export function hostFeatures(host: DrawingHost): ReadonlySet<HostFeature> {
  const features = new Set<HostFeature>();
  if (typeof host.paneIds === 'function') features.add('panes');
  if (typeof host.barsBetween === 'function') features.add('bars');
  if (typeof host.volumeBetween === 'function') features.add('volume');
  return features;
}

/**
 * The features of `requires` that `features` lacks, in the order of `requires`.
 *
 * @example
 * ```ts
 * missingHostFeatures(['panes', 'volume'], new Set(['panes'])); // ['volume']
 * ```
 */
export function missingHostFeatures(requires: readonly HostFeature[] | undefined, features: ReadonlySet<HostFeature>): readonly HostFeature[] {
  return (requires ?? []).filter((feature) => !features.has(feature));
}
