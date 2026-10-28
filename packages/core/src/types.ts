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

/** The drawing tools. The anchor count of each kind is in `ANCHOR_COUNT`. */
export type DrawingKind = 'trend-line' | 'horizontal-line' | 'rectangle' | 'fibonacci-retracement' | 'fibonacci-arcs' | 'fibonacci-fans' | 'fibonacci-time-zones' | 'text-note';

export interface DrawingStyle {
  readonly color?: string;
  readonly lineWidth?: number;
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

/** The saved form of a store (`DrawingStore.toJSON` / `DrawingStore.fromJSON`). */
export interface DrawingDocument {
  readonly version: 1;
  readonly drawings: readonly Drawing[];
}

export type DrawingIssueCode = 'KFT-E-SHAPE' | 'KFT-E-ID' | 'KFT-E-KIND' | 'KFT-E-ANCHORS' | 'KFT-E-ANCHOR' | 'KFT-E-AXIS' | 'KFT-E-TEXT' | 'KFT-E-META' | 'KFT-E-MISSING' | 'KFT-E-JSON';

export interface DrawingIssue {
  readonly code: DrawingIssueCode;
  readonly message: string;
}

export type DrawingListener = (drawings: readonly Drawing[]) => void;

export interface Ohlc {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export type PointerPhase = 'down' | 'move' | 'up';

/** A pointer event in the chart's plot coordinates (CSS pixels). */
export interface HostPointerEvent {
  readonly phase: PointerPhase;
  readonly x: number;
  readonly y: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/**
 * What a chart must supply for drawing tools to work on it. keystone-charts-financial implements
 * this contract; the drawing tools never depend on the chart package itself.
 */
export interface DrawingHost {
  timeToX(time: number): number;
  xToTime(x: number): number;
  priceToY(price: number, yAxisId: string): number;
  yToPrice(y: number, yAxisId: string): number;
  /** The y-axis under a plot point, or null outside every pane. */
  yAxisAt(x: number, y: number): string | null;
  /** The bar at a time, for magnet snapping, or null when there is none. */
  ohlcAt(time: number): Ohlc | null;
  /** Subscribes to pointer events; returns the unsubscribe function. */
  onPointer(listener: (event: HostPointerEvent) => void): () => void;
  /** Asks the chart to redraw its overlay layer. */
  requestRender(): void;
}
