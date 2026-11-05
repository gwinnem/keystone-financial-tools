import { describe, expect, it } from 'vitest';
import { BAR_INTERVAL_MS, BASE_VOLUME, DEFAULT_SEED, FIRST_BAR_TIME, generateBars, volumeOf } from '../src/data';

describe('volumeOf', () => {
  it('is the base volume for a bar that did not move', () => {
    expect(BASE_VOLUME).toBe(1000);
    expect(volumeOf(100, 100, 100, 100)).toBe(1000);
  });

  it('grows with the range of the bar and with the size of its body', () => {
    expect(volumeOf(100, 102, 99, 100)).toBe(1000 + 3 * 400);
    expect(volumeOf(100, 100, 100, 101)).toBe(1000 + 300);
    expect(volumeOf(100, 102, 99, 101)).toBe(2500);
  });

  it('does not care whether the bar rose or fell', () => {
    expect(volumeOf(101, 102, 99, 100)).toBe(volumeOf(100, 102, 99, 101));
  });

  it('rounds to a whole number', () => {
    expect(volumeOf(100, 100.01, 100, 100)).toBe(1004);
    expect(volumeOf(100, 100.0012, 100, 100)).toBe(1000);
  });
});

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

  it('gives every bar a whole volume of at least the base, made from its own prices', () => {
    for (const bar of generateBars(100)) {
      expect(Number.isInteger(bar.volume)).toBe(true);
      expect(bar.volume).toBeGreaterThanOrEqual(BASE_VOLUME);
      expect(bar.volume).toBe(volumeOf(bar.open, bar.high, bar.low, bar.close));
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
