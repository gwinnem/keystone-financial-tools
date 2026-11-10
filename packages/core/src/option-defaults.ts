import { deepFreeze } from './object';
import type { DrawingKind, FibonacciLevel, KindOptions } from './types';

function levels(visible: readonly number[], hidden: readonly number[] = []): readonly FibonacciLevel[] {
  return [...visible.map((ratio) => ({ ratio, visible: true })), ...hidden.map((ratio) => ({ ratio, visible: false }))];
}

/** Retracement levels: 0 to 1 visible, the extension levels 1.272 to 4.236 present but hidden. */
export const DEFAULT_RETRACEMENT_LEVELS: readonly FibonacciLevel[] = deepFreeze(levels([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], [1.272, 1.618, 2.618, 4.236]));
/** Arcs and fans levels. */
export const DEFAULT_ARC_FAN_LEVELS: readonly FibonacciLevel[] = deepFreeze(levels([0.382, 0.5, 0.618]));
/** Time-zone bar multiples (Fibonacci numbers). */
export const DEFAULT_TIME_ZONE_SEQUENCE: readonly number[] = deepFreeze([0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);

/** Every option the eight kinds of 1.0 accept, with its default. A kind without options has an empty object. */
export const BUILT_IN_DEFAULTS: Readonly<Record<DrawingKind, KindOptions>> = deepFreeze<Record<DrawingKind, KindOptions>>({
  'trend-line': { extendLeft: false, extendRight: false },
  'horizontal-line': {},
  rectangle: {},
  'fibonacci-retracement': { levels: DEFAULT_RETRACEMENT_LEVELS, reverse: false, extendLeft: false, extendRight: false, showLabels: true, showPrices: true },
  'fibonacci-arcs': { levels: DEFAULT_ARC_FAN_LEVELS, fullCircles: false, showLabels: true },
  'fibonacci-fans': { levels: DEFAULT_ARC_FAN_LEVELS, showLabels: true },
  'fibonacci-time-zones': { sequence: DEFAULT_TIME_ZONE_SEQUENCE, showLabels: true },
  'text-note': {},
});
