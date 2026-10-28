import { describe, expect, it } from 'vitest';
import type { DrawingIssue } from '../src/types';
import { isValidAnchor, validateDrawing } from '../src/validate';
import { anchor, horizontalLine, trendLine } from './fixtures';

const ANCHOR_MESSAGE = (index: number): string => `Anchor ${index} needs a finite time and price and a non-empty y-axis id.`;
const LOCKED = { code: 'KFT-E-SHAPE', message: 'The locked flag must be a boolean.' };
const HIDDEN = { code: 'KFT-E-SHAPE', message: 'The hidden flag must be a boolean.' };
const Z_INDEX = { code: 'KFT-E-SHAPE', message: 'The zIndex must be a finite integer.' };
const META_OBJECT = { code: 'KFT-E-META', message: 'The meta must be a plain object.' };

describe('isValidAnchor', () => {
  it('accepts a finite time and price with a y-axis id', () => {
    expect(isValidAnchor(anchor(1))).toBe(true);
    expect(isValidAnchor({ time: 0, price: -5, yAxisId: 'rsi' })).toBe(true);
  });

  it('rejects null and undefined', () => {
    expect(isValidAnchor(null)).toBe(false);
    expect(isValidAnchor(undefined)).toBe(false);
  });

  it('rejects a time or price that is missing or not finite', () => {
    expect(isValidAnchor({ price: 1, yAxisId: 'p' })).toBe(false);
    expect(isValidAnchor({ time: Number.NaN, price: 1, yAxisId: 'p' })).toBe(false);
    expect(isValidAnchor({ time: 1, yAxisId: 'p' })).toBe(false);
    expect(isValidAnchor({ time: 1, price: Number.POSITIVE_INFINITY, yAxisId: 'p' })).toBe(false);
    expect(isValidAnchor({ time: '1', price: 1, yAxisId: 'p' })).toBe(false);
  });

  it('rejects a y-axis id that is missing, empty or not a string', () => {
    expect(isValidAnchor({ time: 1, price: 1 })).toBe(false);
    expect(isValidAnchor({ time: 1, price: 1, yAxisId: '' })).toBe(false);
    expect(isValidAnchor({ time: 1, price: 1, yAxisId: 5 })).toBe(false);
  });
});

describe('validateDrawing', () => {
  it('returns no issues for valid drawings', () => {
    expect(validateDrawing(trendLine())).toEqual([]);
    expect(validateDrawing(horizontalLine())).toEqual([]);
    expect(validateDrawing({ ...horizontalLine(), kind: 'text-note', text: 'note' })).toEqual([]);
  });

  it('reports a value that is not an object', () => {
    const shape = [{ code: 'KFT-E-SHAPE', message: 'A drawing must be an object.' }];
    expect(validateDrawing(null)).toEqual(shape);
    expect(validateDrawing('trend-line')).toEqual(shape);
    expect(validateDrawing(undefined)).toEqual(shape);
  });

  it('reports an id that is empty or not a string', () => {
    const id = [{ code: 'KFT-E-ID', message: 'The id must be a non-empty string.' }];
    expect(validateDrawing({ ...trendLine(), id: '' })).toEqual(id);
    expect(validateDrawing({ ...trendLine(), id: 7 })).toEqual(id);
  });

  it('reports an unknown kind and skips the anchor checks', () => {
    expect(validateDrawing({ id: 'x', kind: 'circle', anchors: 'none' })).toEqual([{ code: 'KFT-E-KIND', message: 'Unknown drawing kind: circle.' }]);
  });

  it('reports anchors that are missing or the wrong count', () => {
    const anchors = [{ code: 'KFT-E-ANCHORS', message: 'A trend-line needs 2 anchor(s).' }];
    expect(validateDrawing({ id: 'x', kind: 'trend-line' })).toEqual(anchors);
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [anchor(1)] })).toEqual(anchors);
    expect(validateDrawing({ id: 'x', kind: 'horizontal-line', anchors: [anchor(1), anchor(2)] })).toEqual([{ code: 'KFT-E-ANCHORS', message: 'A horizontal-line needs 1 anchor(s).' }]);
  });

  it('reports each invalid anchor by index', () => {
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [anchor(1), { time: 2 }] })).toEqual([{ code: 'KFT-E-ANCHOR', message: ANCHOR_MESSAGE(1) }]);
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [null, {}] })).toEqual([
      { code: 'KFT-E-ANCHOR', message: ANCHOR_MESSAGE(0) },
      { code: 'KFT-E-ANCHOR', message: ANCHOR_MESSAGE(1) },
    ]);
  });

  it('reports text that is not a string', () => {
    expect(validateDrawing({ ...trendLine(), text: 5 })).toEqual([{ code: 'KFT-E-TEXT', message: 'The text must be a string.' }]);
  });

  it('reports every issue in order', () => {
    expect(validateDrawing({ id: '', kind: 'oval', text: false })).toEqual([
      { code: 'KFT-E-ID', message: 'The id must be a non-empty string.' },
      { code: 'KFT-E-KIND', message: 'Unknown drawing kind: oval.' },
      { code: 'KFT-E-TEXT', message: 'The text must be a string.' },
    ]);
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [null, anchor(1), anchor(2, 1, 'rsi')], locked: 1, hidden: 0, zIndex: 0.5, meta: [] })).toEqual([
      { code: 'KFT-E-ANCHORS', message: 'A trend-line needs 2 anchor(s).' },
      LOCKED,
      HIDDEN,
      Z_INDEX,
      META_OBJECT,
    ]);
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [null, anchor(2, 1, 'rsi')], text: 1, locked: 'no', hidden: 'no', zIndex: '1', meta: { a: undefined } })).toEqual([
      { code: 'KFT-E-ANCHOR', message: ANCHOR_MESSAGE(0) },
      { code: 'KFT-E-TEXT', message: 'The text must be a string.' },
      LOCKED,
      HIDDEN,
      Z_INDEX,
      { code: 'KFT-E-META', message: 'The value at meta.a is not JSON-safe.' },
    ]);
  });

  it('never throws, whatever the input', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const inputs: unknown[] = [0, true, Symbol('s'), () => 1, [], new Date(0), { kind: 'trend-line', anchors: [1, 'a', [], null] }, { meta: cyclic }, { locked: {}, zIndex: Symbol('z') }];
    for (const input of inputs) {
      expect(() => validateDrawing(input)).not.toThrow();
    }
  });
});

describe('validateDrawing: one y-axis per drawing (FR-DM-002)', () => {
  const AXIS = { code: 'KFT-E-AXIS', message: 'All anchors of a drawing must be on the same y-axis.' };

  it('accepts one anchor, or two anchors on the same axis', () => {
    expect(validateDrawing(horizontalLine())).toEqual([]);
    expect(validateDrawing({ id: 'x', kind: 'rectangle', anchors: [anchor(1, 1, 'rsi'), anchor(2, 2, 'rsi')] })).toEqual([]);
  });

  it('reports anchors on different axes once, after the anchor checks', () => {
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [anchor(1), anchor(2, 1, 'rsi')] })).toEqual([AXIS]);
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [anchor(1), anchor(2, 1, 'rsi')], text: 3 })).toEqual([AXIS, { code: 'KFT-E-TEXT', message: 'The text must be a string.' }]);
  });

  it('compares only the valid anchors', () => {
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [anchor(1), { time: 2, price: 1, yAxisId: '' }] })).toEqual([{ code: 'KFT-E-ANCHOR', message: ANCHOR_MESSAGE(1) }]);
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [{ time: Number.NaN, price: 1, yAxisId: 'rsi' }, anchor(2)] })).toEqual([{ code: 'KFT-E-ANCHOR', message: ANCHOR_MESSAGE(0) }]);
  });
});

describe('validateDrawing: locked, hidden and zIndex (FR-DM-005, FR-DM-006)', () => {
  it('accepts the flags when they are absent or of the right type', () => {
    expect(validateDrawing({ ...trendLine(), locked: true, hidden: false, zIndex: 0 })).toEqual([]);
    expect(validateDrawing({ ...trendLine(), locked: false, hidden: true, zIndex: -12 })).toEqual([]);
    expect(validateDrawing({ ...trendLine(), zIndex: Number.MAX_SAFE_INTEGER })).toEqual([]);
  });

  it('reports a locked or hidden flag that is not a boolean', () => {
    expect(validateDrawing({ ...trendLine(), locked: 'yes' })).toEqual([LOCKED]);
    expect(validateDrawing({ ...trendLine(), locked: null })).toEqual([LOCKED]);
    expect(validateDrawing({ ...trendLine(), hidden: 1 })).toEqual([HIDDEN]);
    expect(validateDrawing({ ...trendLine(), hidden: null })).toEqual([HIDDEN]);
  });

  it('reports a zIndex that is not a finite integer', () => {
    for (const zIndex of [1.5, Number.NaN, Number.POSITIVE_INFINITY, '2', null]) {
      expect(validateDrawing({ ...trendLine(), zIndex })).toEqual([Z_INDEX]);
    }
  });
});

describe('validateDrawing: meta (FR-DM-007)', () => {
  const unsafe = (path: string): DrawingIssue[] => [{ code: 'KFT-E-META', message: `The value at ${path} is not JSON-safe.` }];

  it('accepts JSON-safe meta, including shared (not cyclic) references', () => {
    const shared = { tag: 'x' };
    const meta = { a: null, b: true, c: -1.5, d: 'text', e: [1, [2, { f: false }]], g: {}, h: shared, i: [shared, shared] };
    expect(validateDrawing({ ...trendLine(), meta })).toEqual([]);
    expect(validateDrawing({ ...trendLine(), meta: {} })).toEqual([]);
    expect(validateDrawing({ ...trendLine(), meta: Object.assign(Object.create(null) as object, { a: 1 }) })).toEqual([]);
  });

  it('reports meta that is not a plain object', () => {
    for (const meta of [null, 'x', 5, [], [1], new Date(0), new Map(), () => 1]) {
      expect(validateDrawing({ ...trendLine(), meta })).toEqual([META_OBJECT]);
    }
  });

  it('reports the path of a value that does not survive JSON', () => {
    expect(validateDrawing({ ...trendLine(), meta: { a: undefined } })).toEqual(unsafe('meta.a'));
    expect(validateDrawing({ ...trendLine(), meta: { a: () => 1 } })).toEqual(unsafe('meta.a'));
    expect(validateDrawing({ ...trendLine(), meta: { a: Number.NaN } })).toEqual(unsafe('meta.a'));
    expect(validateDrawing({ ...trendLine(), meta: { a: Number.NEGATIVE_INFINITY } })).toEqual(unsafe('meta.a'));
    expect(validateDrawing({ ...trendLine(), meta: { a: 1n } })).toEqual(unsafe('meta.a'));
    expect(validateDrawing({ ...trendLine(), meta: { a: Symbol('s') } })).toEqual(unsafe('meta.a'));
    expect(validateDrawing({ ...trendLine(), meta: { a: new Date(0) } })).toEqual(unsafe('meta.a'));
    expect(validateDrawing({ ...trendLine(), meta: { a: { b: [1, 'x', null, Number.NaN] } } })).toEqual(unsafe('meta.a.b[3]'));
    expect(validateDrawing({ ...trendLine(), meta: { a: [1, undefined] } })).toEqual(unsafe('meta.a[1]'));
    expect(validateDrawing({ ...trendLine(), meta: { ok: 1, list: [], bad: undefined } })).toEqual(unsafe('meta.bad'));
  });

  it('reports the first unsafe value only', () => {
    expect(validateDrawing({ ...trendLine(), meta: { a: [Number.NaN], b: undefined } })).toEqual(unsafe('meta.a[0]'));
    expect(validateDrawing({ ...trendLine(), meta: { a: { x: undefined }, b: undefined } })).toEqual(unsafe('meta.a.x'));
  });

  it('reports a hole in an array', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(validateDrawing({ ...trendLine(), meta: { a: [1, , 3] } })).toEqual(unsafe('meta.a[1]'));
  });

  it('reports a cycle at the value that closes it', () => {
    const meta: Record<string, unknown> = { a: { b: {} } };
    (meta.a as { b: Record<string, unknown> }).b.back = meta;
    expect(validateDrawing({ ...trendLine(), meta })).toEqual(unsafe('meta.a.b.back'));
    const list: unknown[] = [];
    list.push(list);
    expect(validateDrawing({ ...trendLine(), meta: { list } })).toEqual(unsafe('meta.list[0]'));
  });
});

describe('validateDrawing: style and options (FR-DM-010, FR-DM-023)', () => {
  it('accepts a valid style and valid options', () => {
    expect(validateDrawing({ ...trendLine(), style: { color: '#f00', lineStyle: 'dashed' }, options: { extendRight: true } })).toEqual([]);
  });

  it('reports style issues', () => {
    expect(validateDrawing({ ...trendLine(), style: { lineWidth: 0, glow: true } })).toEqual([
      { code: 'KFT-E-STYLE', message: 'The style.lineWidth must be a number from 1 to 10.' },
      { code: 'KFT-E-STYLE', message: 'Unknown style key: glow.' },
    ]);
    expect(validateDrawing({ ...trendLine(), style: null })).toEqual([{ code: 'KFT-E-STYLE', message: 'The style must be a plain object.' }]);
  });

  it('reports options issues for the drawing kind', () => {
    expect(validateDrawing({ ...horizontalLine(), options: { extendLeft: true } })).toEqual([{ code: 'KFT-E-OPTIONS', message: 'The option extendLeft is not allowed on a horizontal-line.' }]);
    expect(validateDrawing({ ...trendLine(), options: 'none' })).toEqual([{ code: 'KFT-E-OPTIONS', message: 'The options must be a plain object.' }]);
  });

  it('skips the options check when the kind is unknown', () => {
    expect(validateDrawing({ id: 'x', kind: 'circle', options: { levels: [] } })).toEqual([{ code: 'KFT-E-KIND', message: 'Unknown drawing kind: circle.' }]);
  });

  it('reports style and options after text and before the flags', () => {
    expect(validateDrawing({ ...trendLine(), locked: 1, options: { reverse: true }, style: { fontSize: 100 }, text: 2 })).toEqual([
      { code: 'KFT-E-TEXT', message: 'The text must be a string.' },
      { code: 'KFT-E-STYLE', message: 'The style.fontSize must be a number from 8 to 72.' },
      { code: 'KFT-E-OPTIONS', message: 'The option reverse is not allowed on a trend-line.' },
      LOCKED,
    ]);
  });
});
