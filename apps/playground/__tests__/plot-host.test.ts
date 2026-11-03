import { describe, expect, it, vi } from 'vitest';
import type { HostKeyEvent, HostPointerEvent } from 'keystone-financial-tools-core';
import { runHostConformance } from 'keystone-financial-tools-core/testing';
import { BAR_INTERVAL_MS, generateBars, type Bar } from '../src/data';
import { createPlotHost, DEFAULT_FUTURE_BARS, PRICE_AXIS, PRICE_PADDING, type PlotHostOptions } from '../src/plot-host';

const BARS = generateBars(100);
const OPTIONS: PlotHostOptions = { width: 800, height: 400, bars: BARS, barInterval: BAR_INTERVAL_MS };

const POINTER: HostPointerEvent = { phase: 'move', x: 5, y: 6, pointerType: 'mouse', button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
const KEY: HostKeyEvent = { key: 'Delete', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };

// The kit every host must pass, run against the playground host (QA-008).
runHostConformance(
  () => {
    const host = createPlotHost(OPTIONS);
    return {
      host,
      yAxisIds: [PRICE_AXIS],
      lastBarTime: BARS[BARS.length - 1].time,
      changeViewport: () => host.changeViewport(),
      firePointer: (event) => host.dispatchPointer(event),
      fireKey: (event) => host.dispatchKey(event),
    };
  },
  { describe, it, expect }
);

describe('createPlotHost: scales', () => {
  it('has one price pane and the contract version', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.apiVersion).toBe(2);
    expect(PRICE_AXIS).toBe('price');
    expect(host.paneRect('price')).toStrictEqual({ x: 0, y: 0, width: 800, height: 400 });
    expect(host.paneRect('volume')).toBe(null);
    expect(host.barInterval()).toBe(BAR_INTERVAL_MS);
    expect([host.width, host.height]).toStrictEqual([800, 400]);
  });

  it('leaves 20 empty bar slots after the last bar by default, or as many as asked for', () => {
    expect(DEFAULT_FUTURE_BARS).toBe(20);
    expect(createPlotHost(OPTIONS).pxPerBar).toBe(800 / 120);
    expect(createPlotHost({ ...OPTIONS, futureBars: 0 }).pxPerBar).toBe(8);
    expect(createPlotHost({ ...OPTIONS, futureBars: 100 }).pxPerBar).toBe(4);
  });

  it('centres bar i at (i + 0.5) bar widths and inverts it', () => {
    const host = createPlotHost(OPTIONS);
    BARS.forEach((bar, index) => {
      expect(host.timeToX(bar.time)).toBeCloseTo((index + 0.5) * host.pxPerBar, 9);
      expect(host.xToTime(host.timeToX(bar.time))).toBeCloseTo(bar.time, 3);
    });
  });

  it('extrapolates time before the first and after the last bar', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.timeToX(BARS[0].time - BAR_INTERVAL_MS)).toBeCloseTo(-0.5 * host.pxPerBar, 9);
    expect(host.timeToX(BARS[99].time + 10 * BAR_INTERVAL_MS)).toBeCloseTo(109.5 * host.pxPerBar, 9);
  });

  it('shows the lowest low and highest high inside the plot with the padding around them', () => {
    const host = createPlotHost(OPTIONS);
    const low = Math.min(...BARS.map((bar) => bar.low));
    const high = Math.max(...BARS.map((bar) => bar.high));
    expect(PRICE_PADDING).toBe(0.1);
    expect(host.priceMin).toBeCloseTo(low - (high - low) * 0.1, 9);
    expect(host.priceMax).toBeCloseTo(high + (high - low) * 0.1, 9);
    expect(host.priceToY(host.priceMax, 'price')).toBeCloseTo(0, 9);
    expect(host.priceToY(host.priceMin, 'price')).toBeCloseTo(400, 9);
    expect(host.priceToY(high, 'price')).toBeGreaterThan(0);
    expect(host.priceToY(low, 'price')).toBeLessThan(400);
  });

  it('inverts price and y', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.yToPrice(0, 'price')).toBeCloseTo(host.priceMax, 9);
    expect(host.yToPrice(400, 'price')).toBeCloseTo(host.priceMin, 9);
    expect(host.priceToY(host.yToPrice(123, 'price'), 'price')).toBeCloseTo(123, 9);
  });

  it('has no scale for another y-axis', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.priceToY(100, 'volume')).toBeNaN();
    expect(host.yToPrice(100, 'volume')).toBeNaN();
  });

  it('finds the pane inside the plot, edges included except the bottom, and none outside', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.yAxisAt(0, 0)).toBe('price');
    expect(host.yAxisAt(800, 399)).toBe('price');
    expect(host.yAxisAt(-1, 10)).toBe(null);
    expect(host.yAxisAt(801, 10)).toBe(null);
    expect(host.yAxisAt(10, -1)).toBe(null);
    expect(host.yAxisAt(10, 400)).toBe(null);
  });
});

describe('createPlotHost: nearestBar', () => {
  const host = createPlotHost(OPTIONS);
  const ohlc = (bar: Bar): object => ({ open: bar.open, high: bar.high, low: bar.low, close: bar.close });

  it('returns the bar at its own time', () => {
    expect(host.nearestBar(BARS[42].time)).toStrictEqual({ time: BARS[42].time, ohlc: ohlc(BARS[42]) });
  });

  it('rounds to the closer bar', () => {
    expect(host.nearestBar(BARS[10].time + BAR_INTERVAL_MS * 0.4)?.time).toBe(BARS[10].time);
    expect(host.nearestBar(BARS[10].time + BAR_INTERVAL_MS * 0.6)?.time).toBe(BARS[11].time);
  });

  it('clamps to the first and the last bar', () => {
    expect(host.nearestBar(BARS[0].time - 5 * BAR_INTERVAL_MS)?.time).toBe(BARS[0].time);
    expect(host.nearestBar(BARS[99].time + 5 * BAR_INTERVAL_MS)?.time).toBe(BARS[99].time);
  });

  it('returns null without data', () => {
    expect(createPlotHost({ ...OPTIONS, bars: [] }).nearestBar(0)).toBe(null);
  });
});

describe('createPlotHost: special data', () => {
  it('shows 0 to 100 (with padding) when there are no bars, and time starts at 0', () => {
    const host = createPlotHost({ ...OPTIONS, bars: [] });
    expect(host.priceMin).toBeCloseTo(-10, 9);
    expect(host.priceMax).toBeCloseTo(110, 9);
    expect(host.timeToX(0)).toBeCloseTo(0.5 * host.pxPerBar, 9);
    expect(host.pxPerBar).toBe(40);
  });

  it('still has a price range when every price is the same', () => {
    const flat: Bar = { time: 0, open: 50, high: 50, low: 50, close: 50 };
    const host = createPlotHost({ ...OPTIONS, bars: [flat] });
    expect(host.priceMax - host.priceMin).toBeCloseTo(0.2, 9);
    expect(host.priceToY(50, 'price')).toBeCloseTo(200, 9);
  });
});

describe('createPlotHost: input and callbacks', () => {
  it('sends pointer events to every pointer listener until it unsubscribes', () => {
    const host = createPlotHost(OPTIONS);
    const first = vi.fn();
    const second = vi.fn();
    const stop = host.onPointer(first);
    host.onPointer(second);
    host.dispatchPointer(POINTER);
    stop();
    host.dispatchPointer(POINTER);
    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(POINTER);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('reports a key as handled when any listener handles it, and still calls the others', () => {
    const host = createPlotHost(OPTIONS);
    const ignoring = vi.fn(() => false);
    const handling = vi.fn(() => true);
    const after = vi.fn(() => false);
    expect(host.dispatchKey(KEY)).toBe(false);
    host.onKey(ignoring);
    expect(host.dispatchKey(KEY)).toBe(false);
    host.onKey(handling);
    host.onKey(after);
    expect(host.dispatchKey(KEY)).toBe(true);
    expect(after).toHaveBeenCalledWith(KEY);
    expect(ignoring).toHaveBeenCalledTimes(2);
  });

  it('tells the viewport listeners about a change, also one that unsubscribes while it is told', () => {
    const host = createPlotHost(OPTIONS);
    const listener = vi.fn();
    const later = vi.fn();
    const stop = host.onViewportChange(() => {
      stop();
    });
    host.onViewportChange(listener);
    host.onViewportChange(later);
    host.changeViewport();
    host.changeViewport();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(later).toHaveBeenCalledTimes(2);
  });

  it('passes render requests and cursors to the callbacks', () => {
    const onRender = vi.fn();
    const onCursor = vi.fn();
    const host = createPlotHost({ ...OPTIONS, onRender, onCursor });
    host.requestRender();
    host.setCursor('crosshair');
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onCursor).toHaveBeenCalledWith('crosshair');
  });

  it('ignores render requests and cursors without callbacks', () => {
    const host = createPlotHost(OPTIONS);
    expect(() => {
      host.requestRender();
      host.setCursor('default');
    }).not.toThrow();
  });
});
