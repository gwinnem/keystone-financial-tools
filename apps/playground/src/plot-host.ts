import type { DrawingCursor, DrawingHost, HostKeyEvent, HostPointerEvent, NearestBar, Rect } from 'keystone-financial-tools-core';
import type { Bar } from './data';
import { scrollViewport, viewportKeyAction, zoomViewport, ZOOM_STEP, type Viewport } from './viewport';

/** The y-axis of the upper pane: the candles. */
export const PRICE_AXIS = 'price';

/** The y-axis of the lower pane: the volume, from 0 up. */
export const VOLUME_AXIS = 'volume';

/** Empty bar slots right of the last bar by default: the future space the drawings may reach into. */
export const DEFAULT_FUTURE_BARS = 20;

/** The visible price range goes this far (as a fraction of the data's range) beyond the lowest low and the highest high. */
export const PRICE_PADDING = 0.1;

/** The volume pane's share of the plot's height; the price pane has the rest. */
export const VOLUME_PANE_RATIO = 0.25;

/** The volume range goes this far (as a fraction of the highest volume) above the highest volume. */
export const VOLUME_PADDING = 0.1;

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

/** The host plus the way input gets into it: the DOM layer calls `dispatchPointer`, `dispatchKey`, `zoom` and `scroll`. */
export interface PlotHost extends DrawingHost {
  readonly width: number;
  readonly height: number;
  /** The height of the price pane; the volume pane is below it. */
  readonly priceHeight: number;
  /** CSS px per bar interval; it changes with the zoom. */
  readonly pxPerBar: number;
  /** The bar slot at the left edge, as a fraction; it changes with the scroll. */
  readonly offset: number;
  /** The visible price range: `priceMin` at the bottom edge of the price pane, `priceMax` at the top. It follows the bars that are shown. */
  readonly priceMin: number;
  readonly priceMax: number;
  /** The volume at the top of the volume pane; the bottom is 0. */
  readonly volumeMax: number;
  /** Sends a pointer event to every pointer listener. */
  dispatchPointer(event: HostPointerEvent): void;
  /** Sends a key event to every key listener; true when one of them handled it. A key no listener handles may zoom or scroll (`viewportKeyAction`). */
  dispatchKey(event: HostKeyEvent): boolean;
  /** Tells the viewport listeners that zoom, scroll, size or layout changed. */
  changeViewport(): void;
  /** Zooms by `factor` (above 1 zooms in), keeping the bar under `anchorX` (default the middle of the plot) in place, and tells the viewport listeners. */
  zoom(factor: number, anchorX?: number): void;
  /** Scrolls by `bars` bar slots, right when positive, and tells the viewport listeners. */
  scroll(bars: number): void;
}

/** What the scales show for the current viewport. */
interface Ranges {
  readonly priceMin: number;
  readonly priceMax: number;
  readonly volumeMax: number;
}

/** One pane's scale: where it starts, how tall it is and the values at its bottom and top edges. */
interface Scale {
  readonly top: number;
  readonly size: number;
  readonly min: number;
  readonly max: number;
}

/**
 * The playground's chart as a `DrawingHost` (contract version 2): two panes, `price` above `volume`, with linear
 * scales. It starts showing every bar and `futureBars` empty slots after the last one; `zoom` and `scroll` (and
 * unhandled keys, see `viewportKeyAction`) change that and tell the viewport listeners. The price scale follows the
 * bars that are shown. Bar `i` is centred at `(i + 0.5 - offset) * pxPerBar`; time extrapolates linearly beyond the data.
 * It has no DOM: `dispatchPointer`, `dispatchKey` and `changeViewport` are how input reaches it (see `toHostPointer`),
 * so it runs under Node and passes `runHostConformance`.
 *
 * @example
 * ```ts
 * const host = createPlotHost({ width: 800, height: 400, bars: generateBars(120), barInterval: BAR_INTERVAL_MS });
 * const tools = createDrawingTools(host);
 * host.zoom(2); // twice as wide bars: the tools redraw by themselves
 * ```
 */
export function createPlotHost(options: PlotHostOptions): PlotHost {
  const { width, height, bars, barInterval } = options;
  const total = bars.length + (options.futureBars ?? DEFAULT_FUTURE_BARS);
  const priceHeight = Math.floor(height * (1 - VOLUME_PANE_RATIO));
  const volumeHeight = height - priceHeight;
  const first = bars.length === 0 ? 0 : bars[0].time;
  const pointerListeners = new Set<(event: HostPointerEvent) => void>();
  const keyListeners = new Set<(event: HostKeyEvent) => boolean>();
  const viewportListeners = new Set<() => void>();

  const rangesOf = (view: Viewport): Ranges => {
    const visible = bars.slice(Math.max(0, Math.floor(view.offset)), Math.ceil(view.offset + width / view.pxPerBar));
    // Scrolled into the future space there is no bar to fit the range to: use them all.
    const shown = visible.length === 0 ? bars : visible;
    const low = shown.length === 0 ? 0 : Math.min(...shown.map((bar) => bar.low));
    const high = shown.length === 0 ? 100 : Math.max(...shown.map((bar) => bar.high));
    const padding = (high - low || 1) * PRICE_PADDING;
    const loudest = Math.max(1, ...shown.map((bar) => bar.volume));
    return { priceMin: low - padding, priceMax: high + padding, volumeMax: loudest * (1 + VOLUME_PADDING) };
  };

  let viewport: Viewport = { pxPerBar: width / total, offset: 0 };
  let ranges = rangesOf(viewport);

  const scaleOf = (yAxisId: string): Scale | null => {
    if (yAxisId === PRICE_AXIS) return { top: 0, size: priceHeight, min: ranges.priceMin, max: ranges.priceMax };
    if (yAxisId === VOLUME_AXIS) return { top: priceHeight, size: volumeHeight, min: 0, max: ranges.volumeMax };
    return null;
  };

  const subscribe = <T>(listeners: Set<T>, listener: T): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const changeViewport = (): void => {
    for (const listener of [...viewportListeners]) listener();
  };

  const show = (next: Viewport): void => {
    viewport = next;
    ranges = rangesOf(next);
    changeViewport();
  };

  const zoom = (factor: number, anchorX: number = width / 2): void => show(zoomViewport(viewport, factor, anchorX, width, total));
  const scroll = (bars: number): void => show(scrollViewport(viewport, bars, width, total));

  // A key that no listener handled can still move the viewport.
  const applyViewportKey = (event: HostKeyEvent): boolean => {
    const action = viewportKeyAction(event);
    if (action === null) return false;
    const screen = width / viewport.pxPerBar;
    switch (action) {
      case 'zoom-in':
        zoom(ZOOM_STEP);
        break;
      case 'zoom-out':
        zoom(1 / ZOOM_STEP);
        break;
      case 'scroll-start':
        scroll(-Infinity);
        break;
      case 'scroll-end':
        scroll(Infinity);
        break;
      case 'page-back':
        scroll(-screen / 2);
        break;
      case 'page-forward':
        scroll(screen / 2);
        break;
    }
    return true;
  };

  return {
    apiVersion: 2,
    width,
    height,
    priceHeight,
    get pxPerBar() {
      return viewport.pxPerBar;
    },
    get offset() {
      return viewport.offset;
    },
    get priceMin() {
      return ranges.priceMin;
    },
    get priceMax() {
      return ranges.priceMax;
    },
    get volumeMax() {
      return ranges.volumeMax;
    },
    timeToX: (time) => ((time - first) / barInterval - viewport.offset + 0.5) * viewport.pxPerBar,
    xToTime: (x) => first + (x / viewport.pxPerBar + viewport.offset - 0.5) * barInterval,
    priceToY: (price, yAxisId) => {
      const scale = scaleOf(yAxisId);
      return scale === null ? Number.NaN : scale.top + ((scale.max - price) / (scale.max - scale.min)) * scale.size;
    },
    yToPrice: (y, yAxisId) => {
      const scale = scaleOf(yAxisId);
      return scale === null ? Number.NaN : scale.max - ((y - scale.top) / scale.size) * (scale.max - scale.min);
    },
    yAxisAt: (x, y) => {
      if (x < 0 || x > width || y < 0 || y >= height) return null;
      return y < priceHeight ? PRICE_AXIS : VOLUME_AXIS;
    },
    paneRect: (yAxisId): Rect | null => {
      const scale = scaleOf(yAxisId);
      return scale === null ? null : { x: 0, y: scale.top, width, height: scale.size };
    },
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
      return handled || applyViewportKey(event);
    },
    changeViewport,
    zoom,
    scroll,
  };
}
