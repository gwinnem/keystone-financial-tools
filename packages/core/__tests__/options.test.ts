import { describe, expect, it } from 'vitest';
import { DRAWING_KINDS } from '../src/kinds';
import {
  DEFAULT_ARC_FAN_LEVELS,
  DEFAULT_RETRACEMENT_LEVELS,
  DEFAULT_TIME_ZONE_SEQUENCE,
  defaultOptions,
  KIND_OPTION_KEYS,
  MAX_LEVELS,
  MAX_SEQUENCE,
  resolveOptions,
  validateOptions,
} from '../src/options';
import type { DrawingKind } from '../src/types';

const optionsIssue = (message: string): { code: string; message: string } => ({ code: 'KFT-E-OPTIONS', message });
const LEVEL_SHAPE = (index: number): string => `Level ${index} needs a finite ratio, a boolean visible flag and an optional non-empty color, and nothing else.`;
const SEQUENCE_VALUE = (index: number): string => `Sequence value ${index} must be a non-negative integer above the value before it.`;
const ratios = (count: number): { ratio: number; visible: boolean }[] => Array.from({ length: count }, (_, i) => ({ ratio: i / 10, visible: true }));
const steps = (count: number): number[] => Array.from({ length: count }, (_, i) => i);

describe('default levels and sequence (FR-DM-020..022)', () => {
  it('shows 0 to 1 and hides the extension levels for retracements', () => {
    expect(DEFAULT_RETRACEMENT_LEVELS).toEqual([
      { ratio: 0, visible: true },
      { ratio: 0.236, visible: true },
      { ratio: 0.382, visible: true },
      { ratio: 0.5, visible: true },
      { ratio: 0.618, visible: true },
      { ratio: 0.786, visible: true },
      { ratio: 1, visible: true },
      { ratio: 1.272, visible: false },
      { ratio: 1.618, visible: false },
      { ratio: 2.618, visible: false },
      { ratio: 4.236, visible: false },
    ]);
  });

  it('uses 0.382, 0.5 and 0.618 for arcs and fans and Fibonacci numbers for time zones', () => {
    expect(DEFAULT_ARC_FAN_LEVELS).toEqual([
      { ratio: 0.382, visible: true },
      { ratio: 0.5, visible: true },
      { ratio: 0.618, visible: true },
    ]);
    expect(DEFAULT_TIME_ZONE_SEQUENCE).toEqual([0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);
  });

  it('freezes the defaults', () => {
    expect(Object.isFrozen(DEFAULT_RETRACEMENT_LEVELS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_RETRACEMENT_LEVELS[0])).toBe(true);
    expect(Object.isFrozen(DEFAULT_TIME_ZONE_SEQUENCE)).toBe(true);
    expect(Object.isFrozen(defaultOptions('trend-line'))).toBe(true);
    expect(Object.isFrozen(KIND_OPTION_KEYS['fibonacci-arcs'])).toBe(true);
  });

  it('passes its own validation', () => {
    for (const kind of DRAWING_KINDS) expect(validateOptions(kind, defaultOptions(kind))).toEqual([]);
  });
});

describe('defaultOptions and KIND_OPTION_KEYS', () => {
  it('gives every option of a kind with its default', () => {
    expect(defaultOptions('trend-line')).toEqual({ extendLeft: false, extendRight: false });
    expect(defaultOptions('fibonacci-retracement')).toEqual({ levels: DEFAULT_RETRACEMENT_LEVELS, reverse: false, extendLeft: false, extendRight: false, showLabels: true, showPrices: true });
    expect(defaultOptions('fibonacci-arcs')).toEqual({ levels: DEFAULT_ARC_FAN_LEVELS, fullCircles: false, showLabels: true });
    expect(defaultOptions('fibonacci-fans')).toEqual({ levels: DEFAULT_ARC_FAN_LEVELS, showLabels: true });
    expect(defaultOptions('fibonacci-time-zones')).toEqual({ sequence: DEFAULT_TIME_ZONE_SEQUENCE, showLabels: true });
    for (const kind of ['horizontal-line', 'rectangle', 'text-note'] as const) expect(defaultOptions(kind)).toEqual({});
  });

  it('lists the accepted keys per kind', () => {
    expect(KIND_OPTION_KEYS).toEqual({
      'trend-line': ['extendLeft', 'extendRight'],
      'horizontal-line': [],
      rectangle: [],
      'fibonacci-retracement': ['levels', 'reverse', 'extendLeft', 'extendRight', 'showLabels', 'showPrices'],
      'fibonacci-arcs': ['levels', 'fullCircles', 'showLabels'],
      'fibonacci-fans': ['levels', 'showLabels'],
      'fibonacci-time-zones': ['sequence', 'showLabels'],
      'text-note': [],
    });
  });

  it('has the documented limits', () => {
    expect(MAX_LEVELS).toBe(24);
    expect(MAX_SEQUENCE).toBe(32);
  });
});

describe('resolveOptions', () => {
  it('puts defined values over the kind defaults', () => {
    expect(resolveOptions('trend-line', { extendRight: true })).toEqual({ extendLeft: false, extendRight: true });
    const levels = [{ ratio: 0.5, visible: true }];
    expect(resolveOptions('fibonacci-fans', { levels, showLabels: undefined })).toEqual({ levels, showLabels: true });
  });

  it('returns the defaults when there are no options, as a new object', () => {
    expect(resolveOptions('fibonacci-time-zones')).toEqual(defaultOptions('fibonacci-time-zones'));
    expect(resolveOptions('fibonacci-time-zones')).not.toBe(defaultOptions('fibonacci-time-zones'));
  });
});

describe('validateOptions: shape and kind (FR-DM-023)', () => {
  it('rejects options that are not a plain object', () => {
    for (const value of [undefined, null, true, [], 'levels']) {
      expect(validateOptions('trend-line', value)).toEqual([optionsIssue('The options must be a plain object.')]);
    }
  });

  it('rejects keys the kind does not use, including unknown and inherited names', () => {
    expect(validateOptions('rectangle', { levels: [] })).toEqual([optionsIssue('The option levels is not allowed on a rectangle.')]);
    expect(validateOptions('trend-line', { sequence: 'x', toString: 1 })).toEqual([
      optionsIssue('The option sequence is not allowed on a trend-line.'),
      optionsIssue('The option toString is not allowed on a trend-line.'),
    ]);
    expect(validateOptions('fibonacci-fans', { fullCircles: 'no' })).toEqual([optionsIssue('The option fullCircles is not allowed on a fibonacci-fans.')]);
  });

  it('treats keys set to undefined as absent', () => {
    expect(validateOptions('rectangle', { levels: undefined })).toEqual([]);
    expect(validateOptions('trend-line', { extendLeft: undefined })).toEqual([]);
  });

  it('reports issues in input key order', () => {
    expect(validateOptions('fibonacci-retracement', { showPrices: 1, levels: 'all', reverse: 'yes' })).toEqual([
      optionsIssue('The option showPrices must be a boolean.'),
      optionsIssue(`The option levels must be an array of at most ${MAX_LEVELS} levels.`),
      optionsIssue('The option reverse must be a boolean.'),
    ]);
  });
});

describe('validateOptions: flags (E01-F02-S04)', () => {
  const FLAGS: Record<string, readonly DrawingKind[]> = {
    extendLeft: ['trend-line', 'fibonacci-retracement'],
    extendRight: ['trend-line', 'fibonacci-retracement'],
    reverse: ['fibonacci-retracement'],
    showLabels: ['fibonacci-retracement', 'fibonacci-arcs', 'fibonacci-fans', 'fibonacci-time-zones'],
    showPrices: ['fibonacci-retracement'],
    fullCircles: ['fibonacci-arcs'],
  };

  it.each(Object.entries(FLAGS))('allows %s as a boolean on its kinds only', (flag, kinds) => {
    for (const kind of DRAWING_KINDS) {
      if (kinds.includes(kind)) {
        expect(validateOptions(kind, { [flag]: true })).toEqual([]);
        expect(validateOptions(kind, { [flag]: false })).toEqual([]);
        expect(validateOptions(kind, { [flag]: 'true' })).toEqual([optionsIssue(`The option ${flag} must be a boolean.`)]);
        expect(validateOptions(kind, { [flag]: null })).toEqual([optionsIssue(`The option ${flag} must be a boolean.`)]);
      } else {
        expect(validateOptions(kind, { [flag]: true })).toEqual([optionsIssue(`The option ${flag} is not allowed on a ${kind}.`)]);
      }
    }
  });
});

describe('validateOptions: levels', () => {
  const levelsOf = (levels: unknown): unknown => validateOptions('fibonacci-retracement', { levels });

  it('accepts no levels and up to 24 levels with optional colors', () => {
    expect(levelsOf([])).toEqual([]);
    expect(levelsOf(ratios(MAX_LEVELS))).toEqual([]);
    expect(
      levelsOf([
        { ratio: -0.5, visible: false, color: '#f00' },
        { ratio: 5, visible: true, color: undefined },
      ])
    ).toEqual([]);
  });

  it('rejects more than 24 levels or a value that is not an array', () => {
    const message = [optionsIssue('The option levels must be an array of at most 24 levels.')];
    expect(levelsOf(ratios(MAX_LEVELS + 1))).toEqual(message);
    expect(levelsOf({ 0: { ratio: 0, visible: true } })).toEqual(message);
    expect(levelsOf(null)).toEqual(message);
  });

  it('reports each malformed level by index', () => {
    const bad = [
      null,
      { visible: true },
      { ratio: Number.NaN, visible: true },
      { ratio: '0.5', visible: true },
      { ratio: 0.5 },
      { ratio: 0.5, visible: 'yes' },
      { ratio: 0.5, visible: true, color: '' },
      { ratio: 0.5, visible: true, color: 5 },
      { ratio: 0.5, visible: true, width: 2 },
      [0.5, true],
    ];
    expect(levelsOf(bad)).toEqual(bad.map((_, index) => optionsIssue(LEVEL_SHAPE(index))));
  });

  it('reports a repeated ratio at each repeat', () => {
    expect(
      levelsOf([
        { ratio: 0.5, visible: true },
        { ratio: 0.618, visible: true },
        { ratio: 0.5, visible: false },
        { ratio: 0.5, visible: true },
      ])
    ).toEqual([optionsIssue('Level 2 repeats ratio 0.5.'), optionsIssue('Level 3 repeats ratio 0.5.')]);
  });

  it('does not count a malformed level as seen', () => {
    expect(
      levelsOf([
        { ratio: 0.5, visible: 'x' },
        { ratio: 0.5, visible: true },
      ])
    ).toEqual([optionsIssue(LEVEL_SHAPE(0))]);
  });

  it('validates levels on arcs and fans too', () => {
    expect(
      validateOptions('fibonacci-arcs', {
        levels: [
          { ratio: 1, visible: true },
          { ratio: 1, visible: true },
        ],
      })
    ).toEqual([optionsIssue('Level 1 repeats ratio 1.')]);
    expect(validateOptions('fibonacci-fans', { levels: [{ ratio: Number.POSITIVE_INFINITY, visible: true }] })).toEqual([optionsIssue(LEVEL_SHAPE(0))]);
  });
});

describe('validateOptions: time-zone sequence', () => {
  const sequenceOf = (sequence: unknown): unknown => validateOptions('fibonacci-time-zones', { sequence });

  it('accepts an empty sequence, one starting at 0 and up to 32 values', () => {
    expect(sequenceOf([])).toEqual([]);
    expect(sequenceOf([0])).toEqual([]);
    expect(sequenceOf([4, 9])).toEqual([]);
    expect(sequenceOf(steps(MAX_SEQUENCE))).toEqual([]);
  });

  it('rejects more than 32 values or a value that is not an array', () => {
    const message = [optionsIssue('The option sequence must be an array of at most 32 values.')];
    expect(sequenceOf(steps(MAX_SEQUENCE + 1))).toEqual(message);
    expect(sequenceOf('0,1,2')).toEqual(message);
  });

  it('rejects negative, fractional and non-number values', () => {
    expect(sequenceOf([-1])).toEqual([optionsIssue(SEQUENCE_VALUE(0))]);
    expect(sequenceOf([1, 2.5])).toEqual([optionsIssue(SEQUENCE_VALUE(1))]);
    expect(sequenceOf([0, '1', null, Number.NaN])).toEqual([optionsIssue(SEQUENCE_VALUE(1)), optionsIssue(SEQUENCE_VALUE(2)), optionsIssue(SEQUENCE_VALUE(3))]);
  });

  it('requires strictly ascending values, compared with the last valid one', () => {
    expect(sequenceOf([1, 1])).toEqual([optionsIssue(SEQUENCE_VALUE(1))]);
    expect(sequenceOf([3, 2, 5])).toEqual([optionsIssue(SEQUENCE_VALUE(1))]);
    expect(sequenceOf([5, 'x', 6])).toEqual([optionsIssue(SEQUENCE_VALUE(1))]);
  });
});
