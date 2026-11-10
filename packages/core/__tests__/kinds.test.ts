import { describe, expect, it } from 'vitest';
import { ANCHOR_COUNT, DRAWING_KINDS, isDrawingKind } from '../src/kinds';

describe('ANCHOR_COUNT', () => {
  it('gives the anchor count of every kind', () => {
    expect(ANCHOR_COUNT).toEqual({
      'trend-line': 2,
      'horizontal-line': 1,
      rectangle: 2,
      'fibonacci-retracement': 2,
      'fibonacci-arcs': 2,
      'fibonacci-fans': 2,
      'fibonacci-time-zones': 2,
      'text-note': 1,
      'fibonacci-trend-based': 3,
      'fibonacci-channel': 3,
      'fibonacci-time-extension': 3,
      'fibonacci-circles': 2,
      'fibonacci-spiral': 2,
      'fibonacci-wedge': 3,
    });
  });
});

describe('DRAWING_KINDS', () => {
  it('lists the eight tools of 1.0 in catalog order, then the Fibonacci kinds of E11 and E15', () => {
    expect(DRAWING_KINDS).toEqual([
      'trend-line',
      'horizontal-line',
      'rectangle',
      'fibonacci-retracement',
      'fibonacci-arcs',
      'fibonacci-fans',
      'fibonacci-time-zones',
      'text-note',
      'fibonacci-trend-based',
      'fibonacci-channel',
      'fibonacci-time-extension',
      'fibonacci-circles',
      'fibonacci-spiral',
      'fibonacci-wedge',
    ]);
  });
});

describe('isDrawingKind', () => {
  it.each(DRAWING_KINDS)('accepts %s', (kind) => {
    expect(isDrawingKind(kind)).toBe(true);
  });

  it('rejects unknown names and inherited object keys', () => {
    expect(isDrawingKind('circle')).toBe(false);
    expect(isDrawingKind('toString')).toBe(false);
    expect(isDrawingKind('')).toBe(false);
  });

  it('rejects values that are not strings, even when they convert to a kind', () => {
    expect(isDrawingKind({ toString: () => 'rectangle' })).toBe(false);
    expect(isDrawingKind(undefined)).toBe(false);
    expect(isDrawingKind(null)).toBe(false);
    expect(isDrawingKind(2)).toBe(false);
  });
});
