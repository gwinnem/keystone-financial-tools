import { describe, expect, it, vi } from 'vitest';
import type { Shape } from '../src/geometry/types';
import { distanceToArc, distanceToRect, distanceToSegment, distanceToShape } from '../src/hit/distance';

const RECT = { x: 10, y: 20, width: 30, height: 40 }; // right edge 40, bottom edge 60

describe('distanceToSegment', () => {
  it('measures to the nearest point of the segment', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
    expect(distanceToSegment({ x: 5, y: -3 }, a, b)).toBe(3);
    expect(distanceToSegment({ x: 5, y: 0 }, a, b)).toBe(0);
  });

  it('measures to an end beyond it', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: -3, y: 4 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5);
  });

  it('projects onto a slanted segment that does not start at the origin', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 7, y: 10 };
    expect(distanceToSegment({ x: 10, y: 5 }, a, b)).toBeCloseTo(5.4, 12);
    expect(distanceToSegment({ x: 4, y: 6 }, a, b)).toBeCloseTo(0, 12);
    expect(distanceToSegment({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(Math.hypot(5, 5), 12);
  });

  it('treats a zero-length segment as a point', () => {
    expect(distanceToSegment({ x: 5, y: 6 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(5);
  });
});

describe('distanceToRect', () => {
  it('measures to the nearest edge or corner from outside', () => {
    expect(distanceToRect({ x: 4, y: 30 }, RECT, true)).toBe(6);
    expect(distanceToRect({ x: 45, y: 30 }, RECT, true)).toBe(5);
    expect(distanceToRect({ x: 20, y: 14 }, RECT, true)).toBe(6);
    expect(distanceToRect({ x: 20, y: 66 }, RECT, true)).toBe(6);
    expect(distanceToRect({ x: 46, y: 68 }, RECT, true)).toBe(10);
    expect(distanceToRect({ x: 7, y: 16 }, RECT, false)).toBe(5);
  });

  it('is 0 inside a filled rectangle', () => {
    expect(distanceToRect({ x: 20, y: 30 }, RECT, true)).toBe(0);
    expect(distanceToRect({ x: 10, y: 20 }, RECT, true)).toBe(0);
  });

  it('measures from inside to the nearest edge when only the border counts', () => {
    expect(distanceToRect({ x: 12, y: 40 }, RECT, false)).toBe(2);
    expect(distanceToRect({ x: 38, y: 40 }, RECT, false)).toBe(2);
    expect(distanceToRect({ x: 25, y: 22 }, RECT, false)).toBe(2);
    expect(distanceToRect({ x: 25, y: 58 }, RECT, false)).toBe(2);
    expect(distanceToRect({ x: 25, y: 40 }, RECT, false)).toBe(15);
    expect(distanceToRect({ x: 10, y: 30 }, RECT, false)).toBe(0);
    expect(distanceToRect({ x: 40, y: 60 }, RECT, false)).toBe(0);
  });
});

describe('distanceToArc', () => {
  const center = { x: 100, y: 100 };
  const right = { center, radius: 50, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 };

  it('measures to the circle where the arc covers the direction of the point', () => {
    expect(distanceToArc({ x: 160, y: 100 }, right)).toBeCloseTo(10, 12);
    expect(distanceToArc({ x: 130, y: 100 }, right)).toBeCloseTo(20, 12);
    expect(distanceToArc({ x: 100, y: 30 }, right)).toBeCloseTo(20, 12);
    expect(distanceToArc({ x: 100, y: 160 }, right)).toBeCloseTo(10, 12);
    expect(distanceToArc(center, right)).toBeCloseTo(50, 12);
  });

  it('measures to the nearer end where the arc does not cover the direction of the point', () => {
    expect(distanceToArc({ x: 40, y: 100 }, right)).toBeCloseTo(Math.hypot(60, 50), 12);
    expect(distanceToArc({ x: 100, y: 40 }, { ...right, startAngle: 0, endAngle: Math.PI / 2 })).toBeCloseTo(Math.hypot(50, 60), 12);
    // A quarter arc from (150, 100) to (100, 150): the end on the left side of the point is the nearer one.
    expect(distanceToArc({ x: 40, y: 100 }, { ...right, startAngle: 0, endAngle: Math.PI / 2 })).toBeCloseTo(Math.hypot(60, 50), 12);
    expect(distanceToArc({ x: 100, y: 160 }, { ...right, startAngle: Math.PI, endAngle: 1.5 * Math.PI })).toBeCloseTo(Math.hypot(50, 60), 12);
  });

  it('wraps angles: an arc that starts below the x axis, one that starts past a quarter turn, one with large angles', () => {
    const left = { center, radius: 50, startAngle: Math.PI / 2, endAngle: (3 * Math.PI) / 2 };
    expect(distanceToArc({ x: 40, y: 100 }, left)).toBeCloseTo(10, 12);
    expect(distanceToArc({ x: 160, y: 100 }, left)).toBeCloseTo(Math.hypot(60, 50), 12);
    const far = { center, radius: 50, startAngle: 5 * Math.PI, endAngle: 6 * Math.PI };
    expect(distanceToArc({ x: 100, y: 160 }, far)).toBeCloseTo(Math.hypot(50, 60), 12);
    expect(distanceToArc({ x: 100, y: 40 }, far)).toBeCloseTo(10, 12);
  });

  it('measures every direction to the circle of a full circle', () => {
    const full = { center, radius: 50, startAngle: 0, endAngle: 2 * Math.PI };
    for (const [x, y, expected] of [
      [40, 100, 10],
      [160, 100, 10],
      [100, 40, 10],
      [100, 160, 10],
      [100, 100, 50],
    ] as const) {
      expect(distanceToArc({ x, y }, full)).toBeCloseTo(expected, 12);
    }
  });
});

describe('distanceToShape', () => {
  const line: Shape = { type: 'line', part: 'body', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
  const rect: Shape = { type: 'rect', part: 'body', ...RECT };
  const arc: Shape = { type: 'arc', part: 'level:1', center: { x: 100, y: 100 }, radius: 50, startAngle: 0, endAngle: 2 * Math.PI };
  const text: Shape = { type: 'text', part: 'body', ...RECT, lines: ['a'], fontSize: 10, lineHeight: 13 };
  const label: Shape = { type: 'label', part: 'label', x: 30, y: 40, ratio: 0.5, price: 1, showRatio: true, showPrice: true };

  it('measures each kind of shape', () => {
    const never = vi.fn(() => false);
    expect(distanceToShape({ x: 5, y: 3 }, line, never)).toBe(3);
    expect(distanceToShape({ x: 160, y: 100 }, arc, never)).toBeCloseTo(10, 12);
    expect(distanceToShape({ x: 33, y: 44 }, label, never)).toBe(5);
    expect(never).not.toHaveBeenCalled();
  });

  it('asks whether a rectangle is filled, only for a rectangle', () => {
    const filled = vi.fn(() => true);
    expect(distanceToShape({ x: 20, y: 30 }, rect, filled)).toBe(0);
    expect(filled).toHaveBeenCalledTimes(1);
    expect(distanceToShape({ x: 12, y: 40 }, rect, () => false)).toBe(2);
  });

  it('treats a text box as solid without asking', () => {
    const never = vi.fn(() => false);
    expect(distanceToShape({ x: 20, y: 30 }, text, never)).toBe(0);
    expect(distanceToShape({ x: 4, y: 30 }, text, never)).toBe(6);
    expect(never).not.toHaveBeenCalled();
  });
});
