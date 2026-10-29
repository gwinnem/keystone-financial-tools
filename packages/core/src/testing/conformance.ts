import type { DrawingHost, HostKeyEvent, HostPointerEvent, Rect } from '../host';
import { validateHost } from '../host-check';

/**
 * A host under test plus the means to drive it. A chart wires these to its own input: dispatching
 * DOM pointer and key events on the chart element, changing its zoom.
 */
export interface ConformanceSubject {
  readonly host: DrawingHost;
  /** The y-axes whose panes are checked; at least one. */
  readonly yAxisIds: readonly string[];
  /** The time (epoch ms) of the host's last bar; extrapolation is checked beyond it. */
  readonly lastBarTime: number;
  /** Causes a viewport change (zoom, scroll or resize). */
  changeViewport(): void;
  /** Delivers a pointer event to the host's pointer listeners. */
  firePointer(event: HostPointerEvent): void;
  /** Delivers a key event; returns true when the host treated it as handled (default prevented). */
  fireKey(event: HostKeyEvent): boolean;
}

/** The matchers the suite uses; Vitest's and Jest's `expect` both fit. */
export type ConformanceExpect = (actual: unknown) => {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeGreaterThan(expected: number): void;
};

/** The test runner functions; pass Vitest's or Jest's. */
export interface ConformanceRunner {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: () => void): void;
  readonly expect: ConformanceExpect;
}

/** How far (CSS px) a transform round trip may land from where it started (FR-HOST-002). */
export const CONFORMANCE_TOLERANCE_PX = 0.5;

/** Where in each pane round trips are checked, as fractions of its width and height. */
const SAMPLES: readonly number[] = [0, 0.25, 0.5, 0.75, 0.999];

/** The events the suite sends. */
export const CONFORMANCE_POINTER: HostPointerEvent = Object.freeze({ phase: 'move', x: 1, y: 1, pointerType: 'mouse', button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
export const CONFORMANCE_KEY: HostKeyEvent = Object.freeze({ key: 'Escape', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });

/**
 * Registers the host conformance tests (FR-HOST-010) with the given runner. `factory` makes a fresh
 * subject for every test. Checks: contract version 2 and every required member; time and price
 * round trips within 0.5 px across every pane; linear extrapolation beyond the last bar (future
 * space); `yAxisAt` agreeing with `paneRect` and returning null outside the plot; pointer, key and
 * viewport listeners called until they unsubscribe (unsubscribing twice is harmless); a key reported
 * as handled only while a subscribed listener handles it.
 *
 * @example
 * ```ts
 * import { describe, it, expect } from 'vitest';
 * import { runHostConformance } from 'keystone-financial-tools-core/testing';
 *
 * runHostConformance(() => {
 *   const chart = createTestChart();
 *   return {
 *     host: chart.drawingHost,
 *     yAxisIds: ['price', 'volume'],
 *     lastBarTime: chart.lastBarTime,
 *     changeViewport: () => chart.zoom(2),
 *     firePointer: (e) => chart.dispatchPointer(e),
 *     fireKey: (e) => chart.dispatchKey(e),
 *   };
 * }, { describe, it, expect });
 * ```
 */
export function runHostConformance(factory: () => ConformanceSubject, runner: ConformanceRunner): void {
  const { describe, it, expect } = runner;
  const near = (actual: number, expected: number): void => {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(CONFORMANCE_TOLERANCE_PX);
  };
  const fireAll = (subject: ConformanceSubject): boolean => {
    subject.firePointer(CONFORMANCE_POINTER);
    const handled = subject.fireKey(CONFORMANCE_KEY);
    subject.changeViewport();
    return handled;
  };

  describe('DrawingHost conformance (contract version 2)', () => {
    it('declares api version 2 and every required member', () => {
      expect(validateHost(factory().host)).toEqual([]);
    });

    it('round-trips time and price within 0.5 px across every pane', () => {
      const { host, yAxisIds } = factory();
      expect(yAxisIds.length).toBeGreaterThan(0);
      for (const yAxisId of yAxisIds) {
        const rect = host.paneRect(yAxisId);
        if (rect === null) throw new Error(`paneRect('${yAxisId}') returned null for a listed pane`);
        const { x, y, width, height } = rect;
        for (const fraction of SAMPLES) {
          const px = x + fraction * width;
          const py = y + fraction * height;
          near(host.timeToX(host.xToTime(px)), px);
          near(host.priceToY(host.yToPrice(py, yAxisId), yAxisId), py);
        }
      }
    });

    it('extrapolates time linearly beyond the last bar', () => {
      const { host, lastBarTime } = factory();
      const interval = host.barInterval();
      expect(interval).toBeGreaterThan(0);
      const last = host.timeToX(lastBarTime);
      const step = host.timeToX(lastBarTime + interval) - last;
      expect(step).toBeGreaterThan(0);
      const far = host.timeToX(lastBarTime + 10 * interval);
      near(far, last + 10 * step);
      near(host.timeToX(host.xToTime(far)), far);
    });

    it('finds each pane at its centre with yAxisAt and no pane outside the plot', () => {
      const { host, yAxisIds } = factory();
      for (const yAxisId of yAxisIds) {
        const { x, y, width, height } = host.paneRect(yAxisId) as Rect;
        expect(host.yAxisAt(x + width / 2, y + height / 2)).toBe(yAxisId);
      }
      expect(host.yAxisAt(-1, -1)).toBe(null);
    });

    it('calls pointer, key and viewport listeners until they unsubscribe', () => {
      const subject = factory();
      const calls = { pointer: 0, key: 0, viewport: 0 };
      const stops = [
        subject.host.onPointer(() => {
          calls.pointer++;
        }),
        subject.host.onKey(() => {
          calls.key++;
          return false;
        }),
        subject.host.onViewportChange(() => {
          calls.viewport++;
        }),
      ];
      expect(fireAll(subject)).toBe(false);
      expect(calls).toEqual({ pointer: 1, key: 1, viewport: 1 });
      for (const stop of stops) {
        stop();
        stop();
      }
      fireAll(subject);
      expect(calls).toEqual({ pointer: 1, key: 1, viewport: 1 });
    });

    it('reports a key as handled only while a subscribed listener handles it', () => {
      const subject = factory();
      let handled = true;
      const stop = subject.host.onKey(() => handled);
      expect(subject.fireKey(CONFORMANCE_KEY)).toBe(true);
      handled = false;
      expect(subject.fireKey(CONFORMANCE_KEY)).toBe(false);
      handled = true;
      stop();
      expect(subject.fireKey(CONFORMANCE_KEY)).toBe(false);
    });
  });
}
