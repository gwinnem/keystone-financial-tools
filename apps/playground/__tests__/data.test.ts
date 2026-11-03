import { describe, expect, it } from 'vitest';
import { BAR_INTERVAL_MS, DEFAULT_SEED, FIRST_BAR_TIME, generateBars } from '../src/data';

describe('generateBars', () => {
  it('makes the requested number of bars, none for zero', () => {
    expect(generateBars(100)).toHaveLength(100);
    expect(generateBars(0)).toStrictEqual([]);
  });

  it('starts at 2026-01-05 and steps one hour', () => {
    const bars = generateBars(5);
    expect(FIRST_BAR_TIME).toBe(Date.UTC(2026, 0, 5));
    expect(BAR_INTERVAL_MS).toBe(3_600_000);
    expect(bars.map((bar) => bar.time)).toStrictEqual([0, 1, 2, 3, 4].map((index) => FIRST_BAR_TIME + index * BAR_INTERVAL_MS));
  });

  it('keeps every high above and every low below the body', () => {
    for (const bar of generateBars(200)) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
    }
  });

  it('opens each bar at the previous close, the first at 100', () => {
    const bars = generateBars(50);
    expect(bars[0].open).toBe(100);
    for (let index = 1; index < bars.length; index++) expect(bars[index].open).toBe(bars[index - 1].close);
  });

  it('rounds prices to two decimals', () => {
    for (const bar of generateBars(50)) {
      for (const price of [bar.open, bar.high, bar.low, bar.close]) expect(Math.round(price * 100) / 100).toBe(price);
    }
  });

  it('gives the same bars for the same seed, and the default seed when none is given', () => {
    expect(generateBars(30, 3)).toStrictEqual(generateBars(30, 3));
    expect(generateBars(30)).toStrictEqual(generateBars(30, DEFAULT_SEED));
    expect(DEFAULT_SEED).toBe(7);
  });

  it('gives other bars for another seed', () => {
    expect(generateBars(30, 1)).not.toStrictEqual(generateBars(30, 2));
  });
});
