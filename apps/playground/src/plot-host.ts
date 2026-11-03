import type { DrawingCursor, DrawingHost, HostKeyEvent, HostPointerEvent, NearestBar, Rect } from 'keystone-financial-tools-core';
import type { Bar } from './data';

/** The y-axis of the one pane of the playground. */
export const PRICE_AXIS = 'price';

/** Empty bar slots right of the last bar by default: the future space the drawings may reach into. */
export const DEFAULT_FUTURE_BARS = 20;

/** The visible price range goes this far (as a fraction of the data's range) beyond the lowest low and the highest high. */
export const PRICE_PADDING = 0.1;

export interface PlotHostOptions {
  /** Plot width in CSS px. */
  readonly width: number;
  /** Plot height in CSS px. */
  readonly height: number;
  /** Candles, oldest first, one every `barInterval` ms. */
  readonly bars: readonly Bar[];
  /** Milliseconds between bars. */
  readonly barInterval: number;
  /** Empty bar slots right of the last bar. Default `DEFAULT_FUTURE_BARS`. */
  readonly futureBars?: number;
  /** Called when the tools ask for a redraw. */
  readonly onRender?: () => void;
  /** Called when the tools ask for a cursor. */
  readonly onCursor?: (cursor: DrawingCursor) => void;
}

/** The host plus the way input gets into it: the DOM layer calls `dispatchPointer` and `dispatchKey`. */
export interface PlotHost extends DrawingHost {
  readonly width: number;
  readonly height: number;
  /** CSS px per bar interval. */
  readonly pxPerBar: number;
  /** The visible price range: `priceMin` at the bottom edge, `priceMax` at the top. */
  readonly priceMin: number;
  readonly priceMax: number;
  /** Sends a pointer event to every pointer listener. */
  dispatchPointer(event: HostPointerEvent): void;
  /** Sends a key event to every key listener; true when one of them handled it. */
  dispatchKey(event: HostKeyEvent): boolean;
  /** Tells the viewport listeners that zoom, scroll, size or layout changed. */
  changeViewport(): void;
}

/**
 * The playground's chart as a `DrawingHost` (contract version 2): one pane (`price`) with linear
 * scales, a fixed viewport that shows every bar and `futureBars` empty slots after the last one.
 * Bar `i` is centred at `(i + 0.5) * pxPerBar`; time and price extrapolate linearly beyond the data.
 * It has no DOM: `dispatchPointer`, `dispatchKey` and `changeViewport` are how input reaches it
 * (see `toHostPointer`), so it runs under Node and passes `runHostConformance`.
 *
 * @example
 * ```ts
 * const host = createPlotHost({ width: 800, height: 400, bars: generateBars(120), barInterval: BAR_INTERVAL_MS });
 * const tools = createDrawingTools(host);
 * ```
 */
export function createPlotHost(options: PlotHostOptions): PlotHost {
  const { width, height, bars, barInterval } = options;
  const pxPerBar = width / (bars.length + (options.futureBars ?? DEFAULT_FUTURE_BARS));
  const first = bars.length === 0 ? 0 : bars[0].time;
  const low = bars.length === 0 ? 0 : Math.min(...bars.map((bar) => bar.low));
  const high = bars.length === 0 ? 100 : Math.max(...bars.map((bar) => bar.high));
  const padding = (high - low || 1) * PRICE_PADDING;
  const priceMin = low - padding;
  const priceMax = high + padding;
  const span = priceMax - priceMin;
  const pointerListeners = new Set<(event: HostPointerEvent) => void>();
  const keyListeners = new Set<(event: HostKeyEvent) => boolean>();
  const viewportListeners = new Set<() => void>();

  const subscribe = <T>(listeners: Set<T>, listener: T): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    apiVersion: 2,
    width,
    height,
    pxPerBar,
    priceMin,
    priceMax,
    timeToX: (time) => ((time - first) / barInterval + 0.5) * pxPerBar,
    xToTime: (x) => first + (x / pxPerBar - 0.5) * barInterval,
    priceToY: (price, yAxisId) => (yAxisId === PRICE_AXIS ? ((priceMax - price) / span) * height : Number.NaN),
    yToPrice: (y, yAxisId) => (yAxisId === PRICE_AXIS ? priceMax - (y / height) * span : Number.NaN),
    yAxisAt: (x, y) => (x >= 0 && x <= width && y >= 0 && y < height ? PRICE_AXIS : null),
    paneRect: (yAxisId): Rect | null => (yAxisId === PRICE_AXIS ? { x: 0, y: 0, width, height } : null),
    nearestBar: (time): NearestBar | null => {
      if (bars.length === 0) return null;
      const bar = bars[Math.min(bars.length - 1, Math.max(0, Math.round((time - first) / barInterval)))];
      return { time: bar.time, ohlc: { open: bar.open, high: bar.high, low: bar.low, close: bar.close } };
    },
    barInterval: () => barInterval,
    onPointer: (listener) => subscribe(pointerListeners, listener),
    onKey: (listener) => subscribe(keyListeners, listener),
    onViewportChange: (listener) => subscribe(viewportListeners, listener),
    setCursor: (cursor) => options.onCursor?.(cursor),
    requestRender: () => options.onRender?.(),
    dispatchPointer: (event) => {
      for (const listener of [...pointerListeners]) listener(event);
    },
    dispatchKey: (event) => {
      let handled = false;
      for (const listener of [...keyListeners]) {
        if (listener(event)) handled = true;
      }
      return handled;
    },
    changeViewport: () => {
      for (const listener of [...viewportListeners]) listener();
    },
  };
}
