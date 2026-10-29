import type { DrawingCursor, DrawingHost, HostKeyEvent, HostPointerEvent, Modifiers, NearestBar, PointerPhase, PointerType, TextEditRequest } from '../host';

/** One pane of the mock host: a horizontal band of the plot with a linear price scale. */
export interface MockPane {
  readonly yAxisId: string;
  /** CSS px from the top of the plot. */
  readonly top: number;
  /** CSS px. */
  readonly height: number;
  /** Price at the bottom edge. */
  readonly min: number;
  /** Price at the top edge. */
  readonly max: number;
}

export interface MockHostOptions {
  /** Plot width in CSS px. Default 800. */
  readonly width?: number;
  /** Default one pane: `DEFAULT_MOCK_PANE`. */
  readonly panes?: readonly MockPane[];
  /** Milliseconds between bars. Default 60 000. */
  readonly barInterval?: number;
  /** Bars for `nearestBar`, in any order. Default none. */
  readonly bars?: readonly NearestBar[];
  /** Time (epoch ms) at x = 0. Default 0. */
  readonly startTime?: number;
  /** CSS px per bar interval. Default 10. */
  readonly pxPerBar?: number;
  /** When given, the host has this `editText`; otherwise it has none. */
  readonly editText?: (request: TextEditRequest) => Promise<string | null>;
}

/** Overrides for a scripted pointer event; everything else defaults to a plain primary mouse event. */
export interface MockPointerOptions extends Partial<Modifiers> {
  readonly pointerType?: PointerType;
  readonly button?: number;
}

export type MockListenerKind = 'pointer' | 'key' | 'viewport';

/** A `DrawingHost` with scripted input and recorded output, for tests. */
export interface MockHost extends DrawingHost {
  /** Sends a pointer event to every pointer listener. */
  pointer(phase: PointerPhase, x: number, y: number, options?: MockPointerOptions): void;
  /** Sends a key event to every key listener; true when any of them handled it. */
  key(key: string, modifiers?: Partial<Modifiers>): boolean;
  /** Zooms the time axis by `factor` (2 = twice as wide) around `aroundX` (default 0) and notifies viewport listeners. */
  zoom(factor: number, aroundX?: number): void;
  /** Moves the data `px` CSS px to the right (negative: left) and notifies viewport listeners. */
  scroll(px: number): void;
  /** Every cursor set, in order. */
  readonly cursors: readonly DrawingCursor[];
  /** How often `requestRender` was called. */
  readonly renderRequests: number;
  /** How many listeners of a kind are subscribed. */
  listenerCount(kind: MockListenerKind): number;
}

/** The default pane: `price`, 400 px high from the top, prices 0 (bottom) to 200 (top). */
export const DEFAULT_MOCK_PANE: MockPane = Object.freeze({ yAxisId: 'price', top: 0, height: 400, min: 0, max: 200 });

/**
 * A deterministic in-memory host (contract version 2) with linear scales: time runs left to right
 * at `pxPerBar` per `barInterval` from `startTime` at x = 0 and extrapolates in both directions;
 * every pane maps its price range linearly onto its band. Scripted input (`pointer`, `key`,
 * `zoom`, `scroll`) drives the listeners; `cursors` and `renderRequests` record what the tools
 * asked for.
 *
 * @example
 * ```ts
 * import { createMockHost } from 'keystone-financial-tools-core/testing';
 *
 * const host = createMockHost({ panes: [{ yAxisId: 'price', top: 0, height: 300, min: 90, max: 110 }] });
 * host.pointer('down', 120, 40);
 * host.pointer('up', 120, 40);
 * expect(host.renderRequests).toBe(1);
 * ```
 */
export function createMockHost(options: MockHostOptions = {}): MockHost {
  const width = options.width ?? 800;
  const panes = options.panes ?? [DEFAULT_MOCK_PANE];
  const interval = options.barInterval ?? 60_000;
  const bars = [...(options.bars ?? [])].sort((a, b) => a.time - b.time);
  let timeAtZero = options.startTime ?? 0;
  let msPerPx = interval / (options.pxPerBar ?? 10);
  const pointerListeners = new Set<(event: HostPointerEvent) => void>();
  const keyListeners = new Set<(event: HostKeyEvent) => boolean>();
  const viewportListeners = new Set<() => void>();
  const cursors: DrawingCursor[] = [];
  let renderRequests = 0;

  const paneOf = (yAxisId: string): MockPane | undefined => panes.find((pane) => pane.yAxisId === yAxisId);
  const subscribe = <T>(listeners: Set<T>, listener: T): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const modifiers = (given: Partial<Modifiers>): Modifiers => ({
    shiftKey: given.shiftKey ?? false,
    ctrlKey: given.ctrlKey ?? false,
    altKey: given.altKey ?? false,
    metaKey: given.metaKey ?? false,
  });
  const viewportChanged = (): void => {
    for (const listener of [...viewportListeners]) listener();
  };

  const host: MockHost = {
    apiVersion: 2,
    timeToX: (time) => (time - timeAtZero) / msPerPx,
    xToTime: (x) => timeAtZero + x * msPerPx,
    priceToY: (price, yAxisId) => {
      const pane = paneOf(yAxisId);
      return pane === undefined ? Number.NaN : pane.top + ((pane.max - price) / (pane.max - pane.min)) * pane.height;
    },
    yToPrice: (y, yAxisId) => {
      const pane = paneOf(yAxisId);
      return pane === undefined ? Number.NaN : pane.max - ((y - pane.top) / pane.height) * (pane.max - pane.min);
    },
    yAxisAt: (x, y) => {
      if (x < 0 || x > width) return null;
      return panes.find((pane) => y >= pane.top && y < pane.top + pane.height)?.yAxisId ?? null;
    },
    paneRect: (yAxisId) => {
      const pane = paneOf(yAxisId);
      return pane === undefined ? null : { x: 0, y: pane.top, width, height: pane.height };
    },
    nearestBar: (time) => {
      let best: NearestBar | null = null;
      for (const bar of bars) {
        if (best === null || Math.abs(bar.time - time) < Math.abs(best.time - time)) best = bar;
      }
      return best;
    },
    barInterval: () => interval,
    onPointer: (listener) => subscribe(pointerListeners, listener),
    onKey: (listener) => subscribe(keyListeners, listener),
    onViewportChange: (listener) => subscribe(viewportListeners, listener),
    setCursor: (cursor) => {
      cursors.push(cursor);
    },
    requestRender: () => {
      renderRequests++;
    },
    pointer: (phase, x, y, given = {}) => {
      const event: HostPointerEvent = { phase, x, y, pointerType: given.pointerType ?? 'mouse', button: given.button ?? 0, ...modifiers(given) };
      for (const listener of [...pointerListeners]) listener(event);
    },
    key: (key, given = {}) => {
      const event: HostKeyEvent = { key, ...modifiers(given) };
      let handled = false;
      for (const listener of [...keyListeners]) {
        if (listener(event)) handled = true;
      }
      return handled;
    },
    zoom: (factor, aroundX = 0) => {
      const pinned = timeAtZero + aroundX * msPerPx;
      msPerPx /= factor;
      timeAtZero = pinned - aroundX * msPerPx;
      viewportChanged();
    },
    scroll: (px) => {
      timeAtZero -= px * msPerPx;
      viewportChanged();
    },
    get cursors() {
      return cursors;
    },
    get renderRequests() {
      return renderRequests;
    },
    listenerCount: (kind) => (kind === 'pointer' ? pointerListeners : kind === 'key' ? keyListeners : viewportListeners).size,
  };
  if (options.editText !== undefined) host.editText = options.editText;
  return host;
}
