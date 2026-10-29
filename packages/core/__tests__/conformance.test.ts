import { describe, expect, it, vi } from 'vitest';
import type { DrawingHost } from '../src/host';
import { CONFORMANCE_KEY, CONFORMANCE_POINTER, CONFORMANCE_TOLERANCE_PX, runHostConformance, type ConformanceSubject } from '../src/testing/conformance';
import { createMockHost, DEFAULT_MOCK_PANE, type MockHost } from '../src/testing/mock-host';

const RSI = { yAxisId: 'rsi', top: 400, height: 100, min: 0, max: 100 };
const LAST_BAR = 5_000_000; // x 833: beyond the 800 px plot, so the panes only see times before it

const NAMES = {
  version: 'declares api version 2 and every required member',
  roundTrip: 'round-trips time and price within 0.5 px across every pane',
  future: 'extrapolates time linearly beyond the last bar',
  yAxisAt: 'finds each pane at its centre with yAxisAt and no pane outside the plot',
  listeners: 'calls pointer, key and viewport listeners until they unsubscribe',
  key: 'reports a key as handled only while a subscribed listener handles it',
};

function subject(change: (mock: MockHost) => Partial<DrawingHost> = () => ({}), overrides: Partial<ConformanceSubject> = {}): ConformanceSubject {
  const mock = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
  const host = { ...mock, ...change(mock) } as DrawingHost;
  return {
    host,
    yAxisIds: ['price', 'rsi'],
    lastBarTime: LAST_BAR,
    changeViewport: () => mock.scroll(10),
    firePointer: (event) => mock.pointer(event.phase, event.x, event.y, event),
    fireKey: (event) => mock.key(event.key, event),
    ...overrides,
  };
}

/** Runs the kit with a collecting runner and returns the names of the tests that failed. */
function failing(factory: () => ConformanceSubject): string[] {
  const cases: { name: string; fn: () => void }[] = [];
  runHostConformance(factory, { describe: (_name, fn) => fn(), it: (name, fn) => cases.push({ name, fn }), expect });
  return cases
    .filter(({ fn }) => {
      try {
        fn();
        return false;
      } catch {
        return true;
      }
    })
    .map(({ name }) => name);
}

// The kit itself, run with Vitest against the mock host (QA-008).
runHostConformance(() => subject(), { describe, it, expect });

describe('runHostConformance', () => {
  it('registers one suite with the documented tests', () => {
    const suites: string[] = [];
    const names: string[] = [];
    runHostConformance(() => subject(), { describe: (name, fn) => (suites.push(name), fn()), it: (name) => names.push(name), expect });
    expect(suites).toEqual(['DrawingHost conformance (contract version 2)']);
    expect(names).toEqual(Object.values(NAMES));
  });

  it('passes for the mock host and makes a fresh subject per test', () => {
    const factory = vi.fn(() => subject());
    expect(failing(factory)).toEqual([]);
    expect(factory).toHaveBeenCalledTimes(6);
  });

  it('exports the events it sends and the tolerance', () => {
    expect(CONFORMANCE_TOLERANCE_PX).toBe(0.5);
    expect(CONFORMANCE_POINTER).toEqual({ phase: 'move', x: 1, y: 1, pointerType: 'mouse', button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
    expect(CONFORMANCE_KEY).toEqual({ key: 'Escape', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
    expect(Object.isFrozen(CONFORMANCE_POINTER)).toBe(true);
    expect(Object.isFrozen(CONFORMANCE_KEY)).toBe(true);
  });

  it('sends exactly those events', () => {
    const firePointer = vi.fn();
    const fireKey = vi.fn(() => false);
    failing(() => subject(undefined, { firePointer, fireKey }));
    expect(firePointer).toHaveBeenCalledWith(CONFORMANCE_POINTER);
    expect(fireKey).toHaveBeenCalledWith(CONFORMANCE_KEY);
  });
});

describe('runHostConformance: what it checks', () => {
  it('samples five points across every pane for the round trips', () => {
    const mock = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
    const xToTime = vi.fn(mock.xToTime);
    const yToPrice = vi.fn(mock.yToPrice);
    const cases: { name: string; fn: () => void }[] = [];
    runHostConformance(() => subject(() => ({ xToTime, yToPrice })), { describe: (_n, fn) => fn(), it: (name, fn) => cases.push({ name, fn }), expect });
    cases.find((c) => c.name === NAMES.roundTrip)?.fn();
    const round = (values: number[][]): number[] => values.map(([v]) => Math.round(v * 1000) / 1000);
    expect(round(xToTime.mock.calls)).toEqual([0, 200, 400, 600, 799.2, 0, 200, 400, 600, 799.2]);
    expect(round(yToPrice.mock.calls as unknown as number[][])).toEqual([0, 100, 200, 300, 399.6, 400, 425, 450, 475, 499.9]);
    expect(yToPrice.mock.calls.map((call) => call[1])).toEqual(['price', 'price', 'price', 'price', 'price', 'rsi', 'rsi', 'rsi', 'rsi', 'rsi']);
  });

  it('probes the last bar, one interval and ten intervals beyond it', () => {
    const mock = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
    const timeToX = vi.fn(mock.timeToX);
    const cases: { name: string; fn: () => void }[] = [];
    runHostConformance(() => subject(() => ({ timeToX })), { describe: (_n, fn) => fn(), it: (name, fn) => cases.push({ name, fn }), expect });
    cases.find((c) => c.name === NAMES.future)?.fn();
    const times = timeToX.mock.calls.map(([t]) => t);
    expect(times.slice(0, 3)).toEqual([LAST_BAR, LAST_BAR + 60_000, LAST_BAR + 600_000]);
    // The fourth is the round trip of the far point through xToTime, so it may differ in the last bits.
    expect(times).toHaveLength(4);
    expect(times[3]).toBeCloseTo(LAST_BAR + 600_000, 3);
  });

  it('names the listed pane that has no rectangle', () => {
    const cases: { name: string; fn: () => void }[] = [];
    runHostConformance(() => subject(undefined, { yAxisIds: ['price', 'volume'] }), { describe: (_n, fn) => fn(), it: (name, fn) => cases.push({ name, fn }), expect });
    expect(() => cases.find((c) => c.name === NAMES.roundTrip)?.fn()).toThrow(new Error("paneRect('volume') returned null for a listed pane"));
  });

  it('probes the centre of every pane and a point outside the plot', () => {
    const mock = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
    const yAxisAt = vi.fn(mock.yAxisAt);
    const cases: { name: string; fn: () => void }[] = [];
    runHostConformance(() => subject(() => ({ yAxisAt })), { describe: (_n, fn) => fn(), it: (name, fn) => cases.push({ name, fn }), expect });
    cases.find((c) => c.name === NAMES.yAxisAt)?.fn();
    expect(yAxisAt.mock.calls).toEqual([
      [400, 200],
      [400, 450],
      [-1, -1],
    ]);
  });
});

describe('runHostConformance: broken hosts fail the right tests', () => {
  it('a wrong api version or a missing member', () => {
    expect(failing(() => subject(() => ({ apiVersion: 1 as never })))).toEqual([NAMES.version]);
    expect(failing(() => subject(() => ({ setCursor: undefined as never })))).toEqual([NAMES.version]);
  });

  it('a time round trip that lands 3 px right', () => {
    expect(failing(() => subject((m) => ({ xToTime: (x) => m.xToTime(x + 3) })))).toEqual([NAMES.roundTrip, NAMES.future]);
  });

  it('a price round trip that lands 3 px up, and one within the tolerance', () => {
    expect(failing(() => subject((m) => ({ yToPrice: (y, id) => m.yToPrice(y - 3, id) })))).toEqual([NAMES.roundTrip]);
    expect(failing(() => subject((m) => ({ yToPrice: (y, id) => m.yToPrice(y - 0.4, id) })))).toEqual([]);
  });

  it('no panes to check, or a pane the host does not have', () => {
    expect(failing(() => subject(undefined, { yAxisIds: [] }))).toEqual([NAMES.roundTrip]);
    expect(failing(() => subject(undefined, { yAxisIds: ['volume'] }))).toEqual([NAMES.roundTrip, NAMES.yAxisAt]);
  });

  it('a listed pane without a rectangle, even when its transforms work', () => {
    expect(failing(() => subject((m) => ({ paneRect: (id) => (id === 'rsi' ? null : m.paneRect(id)) })))).toEqual([NAMES.roundTrip, NAMES.yAxisAt]);
  });

  it('no bar interval, or time that stops at the last bar', () => {
    expect(failing(() => subject(() => ({ barInterval: () => 0 })))).toEqual([NAMES.future]);
    expect(failing(() => subject((m) => ({ timeToX: (t) => m.timeToX(Math.min(t, LAST_BAR)) })))).toEqual([NAMES.future]);
  });

  it('a negative bar interval, even on a reversed time axis where every step still looks right', () => {
    const reversed = (m: MockHost): Partial<DrawingHost> => ({
      barInterval: () => -60_000,
      timeToX: (t) => -m.timeToX(t),
      xToTime: (x) => m.xToTime(-x),
    });
    expect(failing(() => subject(reversed))).toEqual([NAMES.future]);
  });

  it('time that speeds up after the first interval in future space', () => {
    const bent = (m: MockHost) => (t: number) => {
      const x = m.timeToX(t);
      const knee = m.timeToX(LAST_BAR + 60_000);
      return x > knee ? x + (x - knee) : x;
    };
    expect(failing(() => subject((m) => ({ timeToX: bent(m) })))).toEqual([NAMES.future]);
  });

  it('an x to time conversion that is wrong only in future space', () => {
    const far = (m: MockHost) => (x: number) => m.xToTime(x) + (x > m.timeToX(LAST_BAR) ? 1_000_000 : 0);
    expect(failing(() => subject((m) => ({ xToTime: far(m) })))).toEqual([NAMES.future]);
  });

  it('yAxisAt that always or never finds a pane', () => {
    expect(failing(() => subject(() => ({ yAxisAt: () => 'price' })))).toEqual([NAMES.yAxisAt]);
    expect(failing(() => subject(() => ({ yAxisAt: () => null })))).toEqual([NAMES.yAxisAt]);
  });

  it('subscriptions that never end, or that throw when ended twice', () => {
    expect(failing(() => subject((m) => ({ onPointer: (l) => (m.onPointer(l), () => {}) })))).toEqual([NAMES.listeners]);
    expect(failing(() => subject((m) => ({ onKey: (l) => (m.onKey(l), () => {}) })))).toEqual([NAMES.listeners, NAMES.key]);
    expect(failing(() => subject((m) => ({ onViewportChange: (l) => (m.onViewportChange(l), () => {}) })))).toEqual([NAMES.listeners]);
    const once = (stop: () => void) => {
      let calls = 0;
      return () => {
        calls++;
        if (calls > 1) throw new Error('already unsubscribed');
        stop();
      };
    };
    expect(failing(() => subject((m) => ({ onViewportChange: (l) => once(m.onViewportChange(l)) })))).toEqual([NAMES.listeners]);
  });

  it('a subscription that comes back when ended twice', () => {
    const toggling = (m: MockHost) => (listener: Parameters<DrawingHost['onViewportChange']>[0]) => {
      let stop: (() => void) | null = m.onViewportChange(listener);
      return () => {
        if (stop) {
          stop();
          stop = null;
        } else {
          stop = m.onViewportChange(listener);
        }
      };
    };
    expect(failing(() => subject((m) => ({ onViewportChange: toggling(m) })))).toEqual([NAMES.listeners]);
  });

  it('key handling that is never or always reported', () => {
    // Both deliver the key to the listeners and only misreport whether it was handled.
    const reporting = (handled: boolean): ConformanceSubject => {
      const mock = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
      return {
        ...subject(),
        host: mock,
        changeViewport: () => mock.scroll(1),
        firePointer: (e) => mock.pointer(e.phase, e.x, e.y, e),
        fireKey: (e) => (mock.key(e.key, e), handled),
      };
    };
    expect(failing(() => reporting(false))).toEqual([NAMES.key]);
    expect(failing(() => reporting(true))).toEqual([NAMES.listeners, NAMES.key]);
  });
});
