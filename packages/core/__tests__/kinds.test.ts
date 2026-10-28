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
    });
  });
});

describe('DRAWING_KINDS', () => {
  it('lists every kind in catalog order', () => {
    expect(DRAWING_KINDS).toEqual(['trend-line', 'horizontal-line', 'rectangle', 'fibonacci-retracement', 'fibonacci-arcs', 'fibonacci-fans', 'fibonacci-time-zones', 'text-note']);
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
