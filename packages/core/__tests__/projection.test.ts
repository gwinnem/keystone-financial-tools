import { describe, expect, it } from 'vitest';
import { anchorToPoint, pointToAnchor } from '../src/projection';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import { seeded } from './random';

const RSI = { yAxisId: 'rsi', top: 400, height: 100, min: 0, max: 100 };

describe('anchorToPoint and pointToAnchor (FR-HOST-002)', () => {
  it('converts an anchor to plot coordinates on its own pane', () => {
    const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI], startTime: 60_000 });
    expect(anchorToPoint({ time: 660_000, price: 100, yAxisId: 'price' }, host)).toEqual({ x: 100, y: 200 });
    expect(anchorToPoint({ time: 660_000, price: 30, yAxisId: 'rsi' }, host)).toEqual({ x: 100, y: 470 });
  });

  it('converts a point back to an anchor on the given y-axis', () => {
    const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI], startTime: 60_000 });
    expect(pointToAnchor({ x: 100, y: 200 }, 'price', host)).toEqual({ time: 660_000, price: 100, yAxisId: 'price' });
    expect(pointToAnchor({ x: 100, y: 470 }, 'rsi', host)).toEqual({ time: 660_000, price: 30, yAxisId: 'rsi' });
  });

  it('projects a point outside the pane onto the given axis', () => {
    const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
    expect(pointToAnchor({ x: 0, y: 450 }, 'price', host)).toEqual({ time: 0, price: -25, yAxisId: 'price' });
  });

  it('returns null for a y-axis without a pane', () => {
    expect(pointToAnchor({ x: 10, y: 10 }, 'volume', createMockHost())).toBeNull();
  });
});

describe('future space (FR-HOST-003)', () => {
  it('keeps an anchor beyond the last bar in place relative to the bars when scrolling', () => {
    const host = createMockHost({ bars: [{ time: 0, ohlc: { open: 1, high: 2, low: 0, close: 1 } }] });
    const future = { time: 6_000_000, price: 50, yAxisId: 'price' };
    const bar = { time: 0, price: 50, yAxisId: 'price' };
    const gapBefore = anchorToPoint(future, host).x - anchorToPoint(bar, host).x;
    host.scroll(-300);
    expect(anchorToPoint(future, host)).toEqual({ x: 700, y: 300 });
    expect(anchorToPoint(future, host).x - anchorToPoint(bar, host).x).toBe(gapBefore);
  });
});

describe('projection properties (QA-004)', () => {
  const relativeError = (actual: number, expected: number): number => Math.abs(actual - expected) / Math.max(1, Math.abs(expected));

  it.each([5, 17, 123, 4096])('round-trips anchors for random linear scales (seed %i)', (seed) => {
    const random = seeded(seed);
    for (let run = 0; run < 50; run++) {
      const min = -1000 + random() * 2000;
      const pane = { yAxisId: 'p', top: random() * 300, height: 50 + random() * 500, min, max: min + 0.001 + random() * 5000 };
      const host = createMockHost({
        panes: [pane],
        startTime: Math.floor(random() * 2e12),
        barInterval: 1000 * (1 + Math.floor(random() * 86_400)),
        pxPerBar: 0.5 + random() * 40,
      });
      for (let i = 0; i < 20; i++) {
        const anchor = { time: host.xToTime(-2000 + random() * 6000), price: pane.min + (random() * 3 - 1) * (pane.max - pane.min), yAxisId: 'p' };
        const back = pointToAnchor(anchorToPoint(anchor, host), 'p', host);
        expect(back?.yAxisId).toBe('p');
        expect(relativeError(back?.time ?? Number.NaN, anchor.time)).toBeLessThanOrEqual(1e-9);
        expect(relativeError(back?.price ?? Number.NaN, anchor.price)).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it.each([2, 9, 77])('restores the same pixel geometry after zooming in and back out (seed %i)', (seed) => {
    const random = seeded(seed);
    for (let run = 0; run < 50; run++) {
      const host = createMockHost({ startTime: Math.floor(random() * 1e12), pxPerBar: 1 + random() * 20 });
      const anchors = Array.from({ length: 10 }, () => ({ time: host.xToTime(-500 + random() * 2000), price: random() * 200, yAxisId: 'price' }));
      const before = anchors.map((a) => anchorToPoint(a, host));
      const factor = 0.25 + random() * 8;
      const around = random() * 800;
      host.zoom(factor, around);
      host.zoom(1 / factor, around);
      anchors.forEach((a, i) => {
        const after = anchorToPoint(a, host);
        expect(Math.abs(after.x - before[i].x)).toBeLessThanOrEqual(1e-6);
        expect(after.y).toBe(before[i].y);
      });
    }
  });
});
