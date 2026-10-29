import { describe, expect, it, vi } from 'vitest';
import { validateHost } from '../src/host-check';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';

const RSI = { yAxisId: 'rsi', top: 400, height: 100, min: 0, max: 100 };

describe('createMockHost defaults', () => {
  it('implements contract version 2', () => {
    expect(validateHost(createMockHost())).toEqual([]);
    expect(createMockHost().apiVersion).toBe(2);
  });

  it('has one 400 px price pane from 0 to 200 and an 800 px plot', () => {
    expect(DEFAULT_MOCK_PANE).toEqual({ yAxisId: 'price', top: 0, height: 400, min: 0, max: 200 });
    expect(Object.isFrozen(DEFAULT_MOCK_PANE)).toBe(true);
    const host = createMockHost();
    expect(host.paneRect('price')).toEqual({ x: 0, y: 0, width: 800, height: 400 });
    expect(host.barInterval()).toBe(60_000);
  });

  it('maps time linearly at 10 px per one-minute bar from time 0 at x 0, beyond the data too', () => {
    const host = createMockHost();
    expect(host.timeToX(0)).toBe(0);
    expect(host.timeToX(600_000)).toBe(100);
    expect(host.timeToX(-60_000)).toBe(-10);
    expect(host.timeToX(60_000_000)).toBe(10_000);
    expect(host.xToTime(100)).toBe(600_000);
    expect(host.xToTime(-10)).toBe(-60_000);
  });

  it('maps price linearly with the maximum at the top', () => {
    const host = createMockHost();
    expect(host.priceToY(200, 'price')).toBe(0);
    expect(host.priceToY(100, 'price')).toBe(200);
    expect(host.priceToY(0, 'price')).toBe(400);
    expect(host.priceToY(250, 'price')).toBe(-100);
    expect(host.yToPrice(0, 'price')).toBe(200);
    expect(host.yToPrice(300, 'price')).toBe(50);
  });
});

describe('createMockHost options', () => {
  it('uses the given width, bar interval, start time and bar width', () => {
    const host = createMockHost({ width: 500, barInterval: 1000, startTime: 5000, pxPerBar: 4 });
    expect(host.paneRect('price')).toEqual({ x: 0, y: 0, width: 500, height: 400 });
    expect(host.barInterval()).toBe(1000);
    expect(host.timeToX(5000)).toBe(0);
    expect(host.timeToX(6000)).toBe(4);
    expect(host.xToTime(8)).toBe(7000);
  });

  it('maps every pane on its own band and range', () => {
    const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
    expect(host.priceToY(30, 'rsi')).toBe(470);
    expect(host.priceToY(100, 'rsi')).toBe(400);
    expect(host.yToPrice(470, 'rsi')).toBe(30);
    expect(host.yToPrice(500, 'rsi')).toBe(0);
    expect(host.paneRect('rsi')).toEqual({ x: 0, y: 400, width: 800, height: 100 });
  });

  it('returns NaN prices and no pane for an unknown y-axis', () => {
    const host = createMockHost();
    expect(host.priceToY(1, 'volume')).toBeNaN();
    expect(host.yToPrice(1, 'volume')).toBeNaN();
    expect(host.paneRect('volume')).toBeNull();
  });
});

describe('createMockHost yAxisAt', () => {
  it('finds the pane under a point, edges included on the top and left and right', () => {
    const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
    expect(host.yAxisAt(0, 0)).toBe('price');
    expect(host.yAxisAt(800, 399.9)).toBe('price');
    expect(host.yAxisAt(10, 400)).toBe('rsi');
    expect(host.yAxisAt(10, 499.9)).toBe('rsi');
  });

  it('finds nothing outside the plot or the panes', () => {
    const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
    expect(host.yAxisAt(-0.1, 10)).toBeNull();
    expect(host.yAxisAt(800.1, 10)).toBeNull();
    expect(host.yAxisAt(10, -0.1)).toBeNull();
    expect(host.yAxisAt(10, 500)).toBeNull();
  });
});

describe('createMockHost nearestBar', () => {
  const bar = (time: number) => ({ time, ohlc: { open: time, high: time + 2, low: time - 2, close: time + 1 } });

  it('returns null without bars', () => {
    expect(createMockHost().nearestBar(0)).toBeNull();
  });

  it('returns the nearest bar, the earlier one on a tie, whatever order the bars were given in', () => {
    const host = createMockHost({ bars: [bar(20), bar(0), bar(40)] });
    expect(host.nearestBar(16)).toEqual(bar(20));
    expect(host.nearestBar(10)).toEqual(bar(0));
    expect(host.nearestBar(-5)).toEqual(bar(0));
    expect(host.nearestBar(31)).toEqual(bar(40));
    expect(host.nearestBar(500)).toEqual(bar(40));
  });
});

describe('createMockHost input and output', () => {
  it('sends a plain primary mouse pointer event by default, with overrides', () => {
    const host = createMockHost();
    const seen = vi.fn();
    host.onPointer(seen);
    host.pointer('down', 10, 20);
    host.pointer('move', 11, 21, { pointerType: 'touch', button: 2, shiftKey: true, ctrlKey: true, altKey: true, metaKey: true });
    expect(seen.mock.calls).toEqual([
      [{ phase: 'down', x: 10, y: 20, pointerType: 'mouse', button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }],
      [{ phase: 'move', x: 11, y: 21, pointerType: 'touch', button: 2, shiftKey: true, ctrlKey: true, altKey: true, metaKey: true }],
    ]);
  });

  it('sends key events and reports whether any listener handled them', () => {
    const host = createMockHost();
    const first = vi.fn(() => false);
    const second = vi.fn(() => true);
    host.onKey(first);
    expect(host.key('a')).toBe(false);
    const stop = host.onKey(second);
    expect(host.key('Delete', { ctrlKey: true })).toBe(true);
    expect(first).toHaveBeenLastCalledWith({ key: 'Delete', shiftKey: false, ctrlKey: true, altKey: false, metaKey: false });
    expect(second).toHaveBeenCalledTimes(1);
    stop();
    expect(host.key('Delete')).toBe(false);
  });

  it('calls every listener even when a later one would handle the key', () => {
    const host = createMockHost();
    const handles = vi.fn(() => true);
    const after = vi.fn(() => false);
    host.onKey(handles);
    host.onKey(after);
    expect(host.key('x')).toBe(true);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('counts listeners per kind and stops calling the ones that unsubscribed', () => {
    const host = createMockHost();
    const pointer = vi.fn();
    const stopPointer = host.onPointer(pointer);
    host.onPointer(vi.fn());
    host.onPointer(vi.fn());
    const stopViewport = host.onViewportChange(vi.fn());
    host.onKey(() => false);
    host.onKey(() => false);
    const count = (): number[] => [host.listenerCount('pointer'), host.listenerCount('key'), host.listenerCount('viewport')];
    expect(count()).toEqual([3, 2, 1]);
    stopPointer();
    stopPointer();
    stopViewport();
    host.pointer('down', 0, 0);
    expect(pointer).not.toHaveBeenCalled();
    expect(count()).toEqual([2, 2, 0]);
  });

  it('zooms around a point and notifies viewport listeners', () => {
    const host = createMockHost();
    const viewport = vi.fn();
    host.onViewportChange(viewport);
    host.zoom(2, 100);
    expect(host.timeToX(600_000)).toBe(100);
    expect(host.timeToX(0)).toBe(-100);
    expect(host.xToTime(-100)).toBe(0);
    host.zoom(0.5);
    expect(host.timeToX(600_000)).toBe(50);
    expect(viewport).toHaveBeenCalledTimes(2);
  });

  it('zooms around x 0 by default', () => {
    const host = createMockHost({ startTime: 60_000 });
    host.zoom(2);
    expect(host.timeToX(60_000)).toBe(0);
    expect(host.timeToX(120_000)).toBe(20);
  });

  it('scrolls the data to the right for positive px and notifies viewport listeners', () => {
    const host = createMockHost();
    const viewport = vi.fn();
    host.onViewportChange(viewport);
    host.scroll(50);
    expect(host.timeToX(0)).toBe(50);
    host.scroll(-80);
    expect(host.timeToX(0)).toBe(-30);
    expect(viewport).toHaveBeenCalledTimes(2);
  });

  it('records cursors and render requests', () => {
    const host = createMockHost();
    expect(host.cursors).toEqual([]);
    expect(host.renderRequests).toBe(0);
    host.setCursor('crosshair');
    host.setCursor('move');
    host.requestRender();
    host.requestRender();
    expect(host.cursors).toEqual(['crosshair', 'move']);
    expect(host.renderRequests).toBe(2);
  });

  it('has editText only when one is given', async () => {
    expect('editText' in createMockHost()).toBe(false);
    const editText = vi.fn(async () => 'new text');
    const host = createMockHost({ editText });
    expect(host.editText).toBe(editText);
    await expect(host.editText?.({ drawingId: 'n', text: 'old', x: 0, y: 0, fontSize: 12 })).resolves.toBe('new text');
  });
});
