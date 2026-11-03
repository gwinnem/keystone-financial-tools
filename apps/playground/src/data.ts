/** One candle. `time` is the bar's time in epoch milliseconds. */
export interface Bar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

/** One hour, in milliseconds. */
export const BAR_INTERVAL_MS = 3_600_000;

/** The time of the first bar: 2026-01-05T00:00:00Z. */
export const FIRST_BAR_TIME = Date.UTC(2026, 0, 5);

/** The seed of the data set the playground and the end-to-end tests use. */
export const DEFAULT_SEED = 7;

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * A deterministic random walk of `count` hourly candles from `FIRST_BAR_TIME`, starting at 100: the
 * same `seed` always gives the same bars, so the end-to-end tests know where every candle is.
 *
 * @example
 * ```ts
 * const bars = generateBars(120);
 * bars[0].time === FIRST_BAR_TIME; // true
 * ```
 */
export function generateBars(count: number, seed: number = DEFAULT_SEED): readonly Bar[] {
  let state = seed >>> 0;
  // A linear congruential generator (Numerical Recipes): enough for a demo data set.
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const bars: Bar[] = [];
  let close = 100;
  for (let index = 0; index < count; index++) {
    const open = close;
    close = open + (next() - 0.5) * 4;
    const high = Math.max(open, close) + next() * 1.5;
    const low = Math.min(open, close) - next() * 1.5;
    bars.push({ time: FIRST_BAR_TIME + index * BAR_INTERVAL_MS, open: round(open), high: round(high), low: round(low), close: round(close) });
    close = round(close);
  }
  return bars;
}
