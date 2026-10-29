import { describe, expect, it, vi } from 'vitest';
import { TEXT_CHAR_WIDTH, TEXT_LINE_HEIGHT, textNoteShapes } from '../src/geometry/boxes';
import { at, lineRectRange } from '../src/geometry/clip';
import { levelPart } from '../src/geometry/fibonacci';
import { geometryOf } from '../src/geometry/index';
import type { ArcShape, TextShape } from '../src/geometry/types';
import { anchorToPoint } from '../src/projection';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import { LIGHT_THEME, type DrawingTheme } from '../src/theme';
import type { Drawing } from '../src/types';

const RECT = { x: 0, y: 0, width: 10, height: 10 };
const RSI = { yAxisId: 'rsi', top: 400, height: 100, min: 0, max: 100 };

describe('lineRectRange (Liang-Barsky)', () => {
  it('finds where a diagonal line enters and leaves the rectangle', () => {
    expect(lineRectRange({ x: 5, y: 5 }, { x: 1, y: 2 }, RECT)).toEqual([-2.5, 2.5]);
    expect(lineRectRange({ x: 5, y: 5 }, { x: -1, y: -2 }, RECT)).toEqual([-2.5, 2.5]);
  });

  it('handles lines parallel to an axis, inside, on an edge and outside', () => {
    expect(lineRectRange({ x: 2, y: 5 }, { x: 0, y: 1 }, RECT)).toEqual([-5, 5]);
    expect(lineRectRange({ x: 2, y: 5 }, { x: 4, y: 0 }, RECT)).toEqual([-0.5, 2]);
    expect(lineRectRange({ x: 0, y: 5 }, { x: 0, y: 1 }, RECT)).toEqual([-5, 5]);
    expect(lineRectRange({ x: 10, y: 5 }, { x: 0, y: 1 }, RECT)).toEqual([-5, 5]);
    expect(lineRectRange({ x: 2, y: 0 }, { x: 1, y: 0 }, RECT)).toEqual([-2, 8]);
    expect(lineRectRange({ x: 2, y: 10 }, { x: 1, y: 0 }, RECT)).toEqual([-2, 8]);
    expect(lineRectRange({ x: -1, y: 5 }, { x: 0, y: 1 }, RECT)).toBeNull();
    expect(lineRectRange({ x: 11, y: 5 }, { x: 0, y: 1 }, RECT)).toBeNull();
    expect(lineRectRange({ x: 2, y: -1 }, { x: 1, y: 0 }, RECT)).toBeNull();
    expect(lineRectRange({ x: 2, y: 11 }, { x: 1, y: 0 }, RECT)).toBeNull();
  });

  it('counts a line that only touches a corner, and misses one that passes it', () => {
    expect(lineRectRange({ x: 9, y: -1 }, { x: 1, y: 1 }, RECT)).toEqual([1, 1]);
    expect(lineRectRange({ x: 10, y: -1 }, { x: 1, y: 1 }, RECT)).toBeNull();
  });

  it('works with a rectangle away from the origin', () => {
    const away = { x: 20, y: 30, width: 40, height: 20 };
    expect(lineRectRange({ x: 5, y: 40 }, { x: 1, y: 0 }, away)).toEqual([15, 55]);
    expect(lineRectRange({ x: 40, y: 35 }, { x: 0, y: 1 }, away)).toEqual([-5, 15]);
  });

  it('moves along a line', () => {
    expect(at({ x: 1, y: 2 }, { x: 3, y: -4 }, 0.5)).toEqual({ x: 2.5, y: 0 });
  });
});

describe('geometryOf (FR-GEO-001)', () => {
  const line: Drawing = {
    id: 'l',
    kind: 'trend-line',
    anchors: [
      { time: 600_000, price: 50, yAxisId: 'price' },
      { time: 1_800_000, price: 100, yAxisId: 'price' },
    ],
  };

  it('returns null when the y-axis has no pane', () => {
    const host = createMockHost();
    expect(geometryOf({ ...line, anchors: line.anchors.map((a) => ({ ...a, yAxisId: 'volume' })) }, host)).toBeNull();
    expect(geometryOf({ id: 'h', kind: 'horizontal-line', anchors: [{ time: 0, price: 1, yAxisId: 'volume' }] }, host)).toBeNull();
  });

  it('is deterministic and leaves the drawing as it is', () => {
    const host = createMockHost();
    const frozen = Object.freeze({ ...line, anchors: Object.freeze(line.anchors.map((a) => Object.freeze({ ...a }))) });
    expect(geometryOf(frozen, host)).toEqual(geometryOf(frozen, host));
  });

  it('works on a pane below another one', () => {
    const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, RSI] });
    const horizontal = geometryOf({ id: 'h', kind: 'horizontal-line', anchors: [{ time: 0, price: 50, yAxisId: 'rsi' }] }, host);
    expect(horizontal?.shapes).toEqual([{ type: 'line', part: 'body', from: { x: 0, y: 450 }, to: { x: 800, y: 450 } }]);
    expect(horizontal?.handles).toEqual([{ id: 'handle:0', x: 400, y: 450 }]);
    const zones = geometryOf(
      {
        id: 'z',
        kind: 'fibonacci-time-zones',
        anchors: [
          { time: 0, price: 10, yAxisId: 'rsi' },
          { time: 60_000, price: 90, yAxisId: 'rsi' },
        ],
        options: { sequence: [1] },
      },
      host
    );
    expect(zones?.shapes).toEqual([{ type: 'line', part: 'level:1', from: { x: 10, y: 400 }, to: { x: 10, y: 500 } }]);
    expect(zones?.handles).toEqual([
      { id: 'handle:0', x: 0, y: 450 },
      { id: 'handle:1', x: 10, y: 450 },
    ]);
  });

  it('follows the viewport: the same drawing after a scroll', () => {
    const host = createMockHost();
    host.scroll(50);
    expect(geometryOf(line, host)?.shapes).toEqual([{ type: 'line', part: 'body', from: { x: 150, y: 300 }, to: { x: 350, y: 200 } }]);
  });

  it('names Fibonacci levels by their ratio or sequence value', () => {
    expect(levelPart(0.618)).toBe('level:0.618');
    expect(levelPart(13)).toBe('level:13');
  });
});

describe('text note boxes (FR-GEO-007)', () => {
  const note = (text?: string, fontSize?: number): Drawing => ({
    id: 'n',
    kind: 'text-note',
    anchors: [{ time: 600_000, price: 150, yAxisId: 'price' }],
    ...(text === undefined ? {} : { text }),
    ...(fontSize === undefined ? {} : { style: { fontSize } }),
  });
  const box = (drawing: Drawing, options?: Parameters<typeof geometryOf>[2]): TextShape => geometryOf(drawing, createMockHost(), options)?.shapes[0] as TextShape;

  it('estimates 0.6 font sizes per character and 1.3 font sizes per line', () => {
    expect(TEXT_CHAR_WIDTH).toBe(0.6);
    expect(TEXT_LINE_HEIGHT).toBe(1.3);
  });

  it('takes the font size from the theme when the note has none', () => {
    const theme: DrawingTheme = { ...LIGHT_THEME, kinds: { ...LIGHT_THEME.kinds, 'text-note': { fontSize: 20 } } };
    const shape = box(note('ab'), { theme });
    expect(shape.fontSize).toBe(20);
    expect(shape.lineHeight).toBeCloseTo(26, 9);
    expect(shape.width).toBeCloseTo(24, 9);
    expect(box(note('ab')).fontSize).toBe(14);
  });

  it('treats a note without text as an empty one', () => {
    const shape = box(note(undefined, 10));
    expect(shape.lines).toEqual(['']);
    expect(shape.width).toBeCloseTo(6, 9);
    expect(shape.height).toBeCloseTo(13, 9);
  });

  it('uses measureText when given, per line, but never less than one character', () => {
    const measureText = vi.fn((line: string, size: number) => line.length * 2 + size);
    expect(box(note('abc\n', 10), { measureText }).width).toBe(16);
    expect(measureText.mock.calls).toEqual([
      ['abc', 10],
      ['', 10],
    ]);
    expect(box(note('abc', 10), { measureText: () => 1 }).width).toBeCloseTo(6, 9);
  });

  it('keeps every line, also empty ones in between', () => {
    expect(textNoteShapes({ x: 1, y: 2 }, 'a\n\nb', 10)[0]).toMatchObject({ x: 1, y: 2, lines: ['a', '', 'b'] });
  });
});

describe('Fibonacci arcs keep their shape on screen (FR-GEO-005)', () => {
  const arcs: Drawing = {
    id: 'a',
    kind: 'fibonacci-arcs',
    anchors: [
      { time: 600_000, price: 50, yAxisId: 'price' },
      { time: 1_800_000, price: 100, yAxisId: 'price' },
    ],
    options: { levels: [{ ratio: 1, visible: true }] },
  };

  it('uses the pixel distance between the anchors, so a vertical zoom changes the arc in data space', () => {
    const wide = createMockHost({ panes: [{ yAxisId: 'price', top: 0, height: 400, min: 0, max: 200 }] });
    const zoomed = createMockHost({ panes: [{ yAxisId: 'price', top: 0, height: 400, min: 25, max: 125 }] });
    const results = [wide, zoomed].map((host) => {
      const [p1, p2] = arcs.anchors.map((a) => anchorToPoint(a, host));
      const arc = geometryOf(arcs, host)?.shapes[0] as ArcShape;
      expect(arc.center).toEqual(p2);
      expect(arc.radius).toBeCloseTo(Math.hypot(p1.x - p2.x, p1.y - p2.y), 9);
      return { radius: arc.radius, topPrice: host.yToPrice(arc.center.y - arc.radius, 'price') };
    });
    expect(results[0].radius).not.toBeCloseTo(results[1].radius, 3);
    expect(results[0].topPrice).not.toBeCloseTo(results[1].topPrice, 3);
  });
});
