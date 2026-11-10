import { describe, expect, it, vi } from 'vitest';
import type { HostKeyEvent, HostPointerEvent } from 'keystone-financial-tools-core';
import { runHostConformance } from 'keystone-financial-tools-core/testing';
import { BAR_INTERVAL_MS, generateBars, type Bar } from '../src/data';
import { createPlotHost, DEFAULT_FUTURE_BARS, PRICE_AXIS, PRICE_PADDING, VOLUME_AXIS, VOLUME_PADDING, VOLUME_PANE_RATIO, type PlotHostOptions } from '../src/plot-host';
import { ZOOM_STEP } from '../src/viewport';

const BARS = generateBars(100);
const OPTIONS: PlotHostOptions = { width: 800, height: 400, bars: BARS, barInterval: BAR_INTERVAL_MS };

const POINTER: HostPointerEvent = { phase: 'move', x: 5, y: 6, pointerType: 'mouse', button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
const KEY: HostKeyEvent = { key: 'Delete', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
const key = (name: string, extra: Partial<HostKeyEvent> = {}): HostKeyEvent => ({ ...KEY, key: name, ...extra });

/** 100 bars that sit at 50 with a volume of 1000, except the last: it reaches up to 150 with a volume of 5000. */
function flatBars(): Bar[] {
  return Array.from({ length: 100 }, (_, index) => {
    const last = index === 99;
    return { time: index * BAR_INTERVAL_MS, open: 50, high: last ? 150 : 50, low: 50, close: 50, volume: last ? 5000 : 1000 };
  });
}
const FLAT: PlotHostOptions = { ...OPTIONS, bars: flatBars() };

// The kit every host must pass, run against the playground host (QA-008): both panes.
runHostConformance(
  () => {
    const host = createPlotHost(OPTIONS);
    return {
      host,
      yAxisIds: [PRICE_AXIS, VOLUME_AXIS],
      lastBarTime: BARS[BARS.length - 1].time,
      changeViewport: () => host.changeViewport(),
      firePointer: (event) => host.dispatchPointer(event),
      fireKey: (event) => host.dispatchKey(event),
    };
  },
  { describe, it, expect }
);

describe('createPlotHost: contract version 3 members (E11-F04-S01)', () => {
  it('lists the panes top to bottom', () => {
    expect(createPlotHost(OPTIONS).paneIds?.()).toStrictEqual([PRICE_AXIS, VOLUME_AXIS]);
  });

  it('counts bar intervals between two times, signed, in the data and in the future space', () => {
    const host = createPlotHost(FLAT);
    expect(host.barsBetween?.(0, 10 * BAR_INTERVAL_MS)).toBe(10);
    expect(host.barsBetween?.(10 * BAR_INTERVAL_MS, 0)).toBe(-10);
    expect(host.barsBetween?.(99 * BAR_INTERVAL_MS, 130 * BAR_INTERVAL_MS)).toBe(31);
    expect(host.barsBetween?.(7 * BAR_INTERVAL_MS, 7 * BAR_INTERVAL_MS)).toBe(0);
  });

  it('adds the volume of the bars from the first time (inclusive) to the second (exclusive), in either order', () => {
    const host = createPlotHost(FLAT);
    expect(host.volumeBetween?.(0, 3 * BAR_INTERVAL_MS)).toBe(3000);
    expect(host.volumeBetween?.(3 * BAR_INTERVAL_MS, 0)).toBe(3000);
    expect(host.volumeBetween?.(0.5 * BAR_INTERVAL_MS, 2.5 * BAR_INTERVAL_MS)).toBe(2000);
    expect(host.volumeBetween?.(5 * BAR_INTERVAL_MS, 5 * BAR_INTERVAL_MS)).toBe(0);
  });

  it('clamps the volume range to the data', () => {
    const host = createPlotHost(FLAT);
    expect(host.volumeBetween?.(-5 * BAR_INTERVAL_MS, 1000 * BAR_INTERVAL_MS)).toBe(99 * 1000 + 5000);
    expect(host.volumeBetween?.(99 * BAR_INTERVAL_MS, 100 * BAR_INTERVAL_MS)).toBe(5000);
    expect(host.volumeBetween?.(100 * BAR_INTERVAL_MS, 120 * BAR_INTERVAL_MS)).toBe(0);
    expect(host.volumeBetween?.(-20 * BAR_INTERVAL_MS, -1 * BAR_INTERVAL_MS)).toBe(0);
  });

  it('has no volume without bars', () => {
    expect(createPlotHost({ ...OPTIONS, bars: [] }).volumeBetween?.(0, 10 * BAR_INTERVAL_MS)).toBeNull();
  });
});

describe('createPlotHost: panes', () => {
  it('has a price pane above a volume pane, and the contract version', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.apiVersion).toBe(3);
    expect([PRICE_AXIS, VOLUME_AXIS]).toStrictEqual(['price', 'volume']);
    expect(VOLUME_PANE_RATIO).toBe(0.25);
    expect(host.paneRect('price')).toStrictEqual({ x: 0, y: 0, width: 800, height: 300 });
    expect(host.paneRect('volume')).toStrictEqual({ x: 0, y: 300, width: 800, height: 100 });
    expect(host.paneRect('other')).toBe(null);
    expect(host.barInterval()).toBe(BAR_INTERVAL_MS);
    expect([host.width, host.height, host.priceHeight]).toStrictEqual([800, 400, 300]);
  });

  it('gives the pixel left over by a height that does not divide to the volume pane', () => {
    const host = createPlotHost({ ...OPTIONS, height: 401 });
    expect(host.priceHeight).toBe(300);
    expect(host.paneRect('volume')).toStrictEqual({ x: 0, y: 300, width: 800, height: 101 });
  });

  it('finds the pane inside the plot, edges included except the bottom, and none outside', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.yAxisAt(0, 0)).toBe('price');
    expect(host.yAxisAt(800, 299)).toBe('price');
    expect(host.yAxisAt(0, 300)).toBe('volume');
    expect(host.yAxisAt(800, 399)).toBe('volume');
    expect(host.yAxisAt(-1, 10)).toBe(null);
    expect(host.yAxisAt(801, 10)).toBe(null);
    expect(host.yAxisAt(10, -1)).toBe(null);
    expect(host.yAxisAt(10, 400)).toBe(null);
  });
});

describe('createPlotHost: scales', () => {
  it('leaves 20 empty bar slots after the last bar by default, or as many as asked for', () => {
    expect(DEFAULT_FUTURE_BARS).toBe(20);
    expect(createPlotHost(OPTIONS).pxPerBar).toBe(800 / 120);
    expect(createPlotHost({ ...OPTIONS, futureBars: 0 }).pxPerBar).toBe(8);
    expect(createPlotHost({ ...OPTIONS, futureBars: 100 }).pxPerBar).toBe(4);
  });

  it('starts showing everything from the first slot', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.offset).toBe(0);
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

  it('shows the lowest low and highest high inside the price pane with the padding around them', () => {
    const host = createPlotHost(OPTIONS);
    const low = Math.min(...BARS.map((bar) => bar.low));
    const high = Math.max(...BARS.map((bar) => bar.high));
    expect(PRICE_PADDING).toBe(0.1);
    expect(host.priceMin).toBeCloseTo(low - (high - low) * 0.1, 9);
    expect(host.priceMax).toBeCloseTo(high + (high - low) * 0.1, 9);
    expect(host.priceToY(host.priceMax, 'price')).toBeCloseTo(0, 9);
    expect(host.priceToY(host.priceMin, 'price')).toBeCloseTo(300, 9);
    expect(host.priceToY(high, 'price')).toBeGreaterThan(0);
    expect(host.priceToY(low, 'price')).toBeLessThan(300);
  });

  it('inverts price and y in the price pane', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.yToPrice(0, 'price')).toBeCloseTo(host.priceMax, 9);
    expect(host.yToPrice(300, 'price')).toBeCloseTo(host.priceMin, 9);
    expect(host.priceToY(host.yToPrice(123, 'price'), 'price')).toBeCloseTo(123, 9);
  });

  it('runs the volume from 0 at the bottom edge to the padded highest volume at the top of its pane', () => {
    const host = createPlotHost(OPTIONS);
    const loudest = Math.max(...BARS.map((bar) => bar.volume));
    expect(VOLUME_PADDING).toBe(0.1);
    expect(host.volumeMax).toBeCloseTo(loudest * 1.1, 9);
    expect(host.priceToY(0, 'volume')).toBeCloseTo(400, 9);
    expect(host.priceToY(host.volumeMax, 'volume')).toBeCloseTo(300, 9);
    expect(host.priceToY(loudest, 'volume')).toBeGreaterThan(300);
    expect(host.yToPrice(400, 'volume')).toBeCloseTo(0, 9);
    expect(host.yToPrice(300, 'volume')).toBeCloseTo(host.volumeMax, 9);
    expect(host.priceToY(host.yToPrice(350, 'volume'), 'volume')).toBeCloseTo(350, 9);
  });

  it('has no scale for another y-axis', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.priceToY(100, 'other')).toBeNaN();
    expect(host.yToPrice(100, 'other')).toBeNaN();
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

  it('finds the same bar whatever the zoom and the scroll are', () => {
    const zoomed = createPlotHost(OPTIONS);
    zoomed.zoom(4, 0);
    zoomed.scroll(30);
    expect(zoomed.nearestBar(BARS[42].time)?.time).toBe(BARS[42].time);
  });
});

describe('createPlotHost: special data', () => {
  it('shows 0 to 100 (with padding) when there are no bars, and time starts at 0', () => {
    const host = createPlotHost({ ...OPTIONS, bars: [] });
    expect(host.priceMin).toBeCloseTo(-10, 9);
    expect(host.priceMax).toBeCloseTo(110, 9);
    expect(host.volumeMax).toBeCloseTo(1.1, 9);
    expect(host.timeToX(0)).toBeCloseTo(0.5 * host.pxPerBar, 9);
    expect(host.pxPerBar).toBe(40);
  });

  it('still has a price range when every price is the same', () => {
    const flat: Bar = { time: 0, open: 50, high: 50, low: 50, close: 50, volume: 1000 };
    const host = createPlotHost({ ...OPTIONS, bars: [flat] });
    expect(host.priceMax - host.priceMin).toBeCloseTo(0.2, 9);
    expect(host.priceToY(50, 'price')).toBeCloseTo(150, 9);
  });
});

describe('createPlotHost: zoom', () => {
  it('makes the bars wider and tells the viewport listeners', () => {
    const host = createPlotHost(OPTIONS);
    const listener = vi.fn();
    host.onViewportChange(listener);
    const before = host.pxPerBar;
    host.zoom(2);
    expect(host.pxPerBar).toBeCloseTo(before * 2, 9);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps the time in the middle of the plot where it is by default', () => {
    const host = createPlotHost(OPTIONS);
    host.zoom(2, 0);
    host.scroll(10);
    const middle = host.xToTime(400);
    host.zoom(3);
    expect(host.xToTime(400)).toBeCloseTo(middle, 3);
  });

  it('keeps the time under the given x where it is', () => {
    const host = createPlotHost(OPTIONS);
    const under = host.xToTime(100);
    host.zoom(3, 100);
    expect(host.xToTime(100)).toBeCloseTo(under, 3);
    // The slot at x = 100 was 15 and is still at 100: with 20 px per bar the left edge is slot 10.
    expect(host.offset).toBeCloseTo(10, 9);
  });

  it('zooms out again to showing everything and no further', () => {
    const host = createPlotHost(OPTIONS);
    host.zoom(4);
    host.zoom(0.001);
    expect(host.pxPerBar).toBe(800 / 120);
    expect(host.offset).toBeCloseTo(0, 9);
  });

  it('stops at the widest bar', () => {
    const host = createPlotHost(OPTIONS);
    host.zoom(1000);
    expect(host.pxPerBar).toBe(60);
  });

  it('keeps the time and the pixels consistent after a zoom', () => {
    const host = createPlotHost(OPTIONS);
    host.zoom(4, 200);
    host.scroll(12);
    BARS.forEach((bar) => expect(host.xToTime(host.timeToX(bar.time))).toBeCloseTo(bar.time, 3));
  });
});

describe('createPlotHost: scroll', () => {
  it('moves the bars left when scrolled right, and tells the viewport listeners', () => {
    const host = createPlotHost(OPTIONS);
    host.zoom(4, 0);
    const listener = vi.fn();
    host.onViewportChange(listener);
    const x = host.timeToX(BARS[40].time);
    host.scroll(5);
    expect(host.offset).toBe(5);
    expect(host.timeToX(BARS[40].time)).toBeCloseTo(x - 5 * host.pxPerBar, 9);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('cannot scroll when everything is shown', () => {
    const host = createPlotHost(OPTIONS);
    host.scroll(10);
    expect(host.offset).toBe(0);
  });

  it('stops at the first slot and at the end of the future space', () => {
    const host = createPlotHost(OPTIONS);
    host.zoom(4, 0);
    host.scroll(-50);
    expect(host.offset).toBe(0);
    host.scroll(1000);
    expect(host.offset).toBeCloseTo(120 - 800 / host.pxPerBar, 9);
  });
});

describe('createPlotHost: the scales follow the bars that are shown', () => {
  it('fits the price range to the visible bars', () => {
    const host = createPlotHost(FLAT);
    expect(host.priceMin).toBeCloseTo(40, 9);
    expect(host.priceMax).toBeCloseTo(160, 9);
    host.zoom(8, 0);
    // Only flat bars are in view: the range is the padding around a single price.
    expect(host.priceMin).toBeCloseTo(49.9, 9);
    expect(host.priceMax).toBeCloseTo(50.1, 9);
    host.scroll(Infinity);
    expect(host.priceMax).toBeGreaterThan(150);
  });

  it('fits the volume range to the visible bars', () => {
    const host = createPlotHost(FLAT);
    expect(host.volumeMax).toBeCloseTo(5500, 9);
    host.zoom(8, 0);
    expect(host.volumeMax).toBeCloseTo(1100, 9);
  });

  it('counts a bar that is only partly in view', () => {
    const host = createPlotHost({ ...FLAT, futureBars: 0 });
    host.zoom(8, 0);
    // 800 / 60 = 13.33 slots from slot 0 show bars 0 to 13.
    host.scroll(86.5);
    // Slots 86.5 to 99.83 show bars 86 to 99, the last of them reaching up to 150.
    expect(host.priceMax).toBeGreaterThan(150);
  });

  it('uses every bar when the viewport is scrolled into the future space and none is in view', () => {
    const host = createPlotHost(FLAT);
    host.zoom(8, 0);
    host.scroll(Infinity);
    expect(host.offset).toBeGreaterThan(100);
    expect(host.priceMin).toBeCloseTo(40, 9);
    expect(host.priceMax).toBeCloseTo(160, 9);
    expect(host.volumeMax).toBeCloseTo(5500, 9);
  });

  it('moves the pixels of a price when the range changes, and keeps the panes where they are', () => {
    const host = createPlotHost(FLAT);
    const before = host.priceToY(50, 'price');
    host.zoom(8, 0);
    expect(host.priceToY(50, 'price')).not.toBeCloseTo(before, 3);
    expect(host.priceToY(50, 'price')).toBeCloseTo(150, 9);
    expect(host.paneRect('price')).toStrictEqual({ x: 0, y: 0, width: 800, height: 300 });
  });
});

describe('createPlotHost: keys that no tool handled', () => {
  it('zooms in with plus and out with minus', () => {
    const host = createPlotHost(OPTIONS);
    expect(host.dispatchKey(key('+'))).toBe(true);
    expect(host.pxPerBar).toBeCloseTo((800 / 120) * ZOOM_STEP, 9);
    expect(host.dispatchKey(key('-'))).toBe(true);
    expect(host.pxPerBar).toBeCloseTo(800 / 120, 9);
  });

  it('scrolls to the start with Home and to the end with End', () => {
    const host = createPlotHost(OPTIONS);
    host.zoom(4, 0);
    expect(host.dispatchKey(key('End'))).toBe(true);
    expect(host.offset).toBeCloseTo(120 - 800 / host.pxPerBar, 9);
    expect(host.dispatchKey(key('Home'))).toBe(true);
    expect(host.offset).toBe(0);
  });

  it('scrolls half a screen with Page Down and Page Up', () => {
    const host = createPlotHost(OPTIONS);
    host.zoom(4, 0);
    const half = 400 / host.pxPerBar;
    expect(host.dispatchKey(key('PageDown'))).toBe(true);
    expect(host.offset).toBeCloseTo(half, 9);
    expect(host.dispatchKey(key('PageUp'))).toBe(true);
    expect(host.offset).toBeCloseTo(0, 9);
  });

  it('tells the viewport listeners once per key', () => {
    const host = createPlotHost(OPTIONS);
    const listener = vi.fn();
    host.onViewportChange(listener);
    host.dispatchKey(key('+'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('leaves a key with Ctrl, Alt or Cmd, and any other key, alone', () => {
    const host = createPlotHost(OPTIONS);
    const before = host.pxPerBar;
    expect(host.dispatchKey(key('+', { ctrlKey: true }))).toBe(false);
    expect(host.dispatchKey(key('+', { altKey: true }))).toBe(false);
    expect(host.dispatchKey(key('+', { metaKey: true }))).toBe(false);
    expect(host.dispatchKey(key('a'))).toBe(false);
    expect(host.pxPerBar).toBe(before);
  });

  it('does not move the viewport for a key a listener handled', () => {
    const host = createPlotHost(OPTIONS);
    host.onKey(() => true);
    const before = host.pxPerBar;
    expect(host.dispatchKey(key('+'))).toBe(true);
    expect(host.pxPerBar).toBe(before);
  });

  it('moves the viewport when the listeners ignored the key', () => {
    const host = createPlotHost(OPTIONS);
    host.onKey(() => false);
    const before = host.pxPerBar;
    expect(host.dispatchKey(key('+'))).toBe(true);
    expect(host.pxPerBar).toBeGreaterThan(before);
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
