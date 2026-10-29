import { describe, expect, it } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { buildScene, SNAP_INDICATOR_RADIUS } from '../src/scene/build';
import type { FibonacciItem, HandlesItem, PreviewItem, SceneItem, SceneOptions, ShapeItem } from '../src/scene/types';
import { createMockHost } from '../src/testing/mock-host';
import { DARK_THEME, LIGHT_THEME, type DrawingTheme } from '../src/theme';
import type { Anchor, Drawing } from '../src/types';

// The default mock host: x = time / 6000 and y = 400 - 2 * price, so a plot point maps to an anchor.
const A = (x: number, y: number, yAxisId = 'price'): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId });
const trend = (id: string, extra: Partial<Drawing> = {}): Drawing => ({ id, kind: 'trend-line', anchors: [A(10, 10), A(110, 60)], ...extra });
const rectangle = (id: string, extra: Partial<Drawing> = {}): Drawing => ({ id, kind: 'rectangle', anchors: [A(20, 20), A(120, 90)], ...extra });
const fib = (id: string, kind: Drawing['kind'], extra: Partial<Drawing> = {}): Drawing => ({ id, kind, anchors: [A(10, 300), A(110, 100)], ...extra });

const host = createMockHost();

function scene(drawings: readonly Drawing[], extra: Partial<SceneOptions> = {}): SceneItem[] {
  const theme = extra.theme;
  return buildScene(host, { drawings, cache: new GeometryCache(host, { theme }), ...extra });
}

const ids = (items: readonly SceneItem[]): string[] => items.map((item) => (item.type === 'preview' ? 'preview' : item.type === 'handles' ? `handles:${item.drawingId}` : item.drawingId));

describe('paint order (FR-SC-001)', () => {
  it('is empty without drawings', () => {
    expect(scene([])).toEqual([]);
  });

  it('keeps insertion order for equal zIndex', () => {
    expect(ids(scene([trend('a'), trend('b'), trend('c')]))).toEqual(['a', 'b', 'c']);
    expect(ids(scene([trend('a', { zIndex: 2 }), trend('b', { zIndex: 2 }), trend('c', { zIndex: 2 })]))).toEqual(['a', 'b', 'c']);
  });

  it('puts higher zIndex later and treats a missing zIndex as 0', () => {
    expect(ids(scene([trend('top', { zIndex: 5 }), trend('none'), trend('low', { zIndex: -1 }), trend('zero', { zIndex: 0 }), trend('mid', { zIndex: 1 })]))).toEqual([
      'low',
      'none',
      'zero',
      'mid',
      'top',
    ]);
  });

  it('puts handles after everything, in paint order', () => {
    const drawings = [trend('a', { zIndex: 3 }), trend('b'), trend('c', { zIndex: 1 })];
    const items = scene(drawings, { selected: new Set(['a', 'b']), preview: trend('p'), snap: { x: 1, y: 2 } });
    expect(ids(items)).toEqual(['b', 'c', 'a', 'preview', 'preview', 'handles:b', 'handles:a']);
  });

  it('leaves out hidden drawings, also when selected or hovered', () => {
    const items = scene([trend('a', { hidden: true }), trend('b'), trend('c', { hidden: false })], { selected: new Set(['a']), hover: 'a' });
    expect(ids(items)).toEqual(['b', 'c']);
  });

  it('leaves out drawings whose pane does not exist, and their handles', () => {
    const lost: Drawing = { id: 'lost', kind: 'trend-line', anchors: [A(1, 1, 'nope'), A(2, 2, 'nope')] };
    expect(ids(scene([lost, trend('a')], { selected: new Set(['lost', 'a']) }))).toEqual(['a', 'handles:a']);
  });

  it('does not modify the drawings list', () => {
    const drawings = [trend('a', { zIndex: 2 }), trend('b')];
    scene(drawings);
    expect(drawings.map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('shape items (S01)', () => {
  it('turns primitive kinds into shape items with their pixel shapes', () => {
    const cache = new GeometryCache(host);
    const drawings = [trend('t'), rectangle('r'), { id: 'h', kind: 'horizontal-line', anchors: [A(50, 50)] } as Drawing, { id: 'n', kind: 'text-note', anchors: [A(30, 30)], text: 'hi' } as Drawing];
    const items = buildScene(host, { drawings, cache });
    expect(items.map((item) => item.type)).toEqual(['shape', 'shape', 'shape', 'shape']);
    items.forEach((item, index) => {
      const shape = item as ShapeItem;
      expect(shape.drawingId).toBe(drawings[index]?.id);
      expect(shape.shapes).toBe(cache.get(drawings[index] as Drawing)?.shapes);
    });
  });
});

describe('states and style (S02, FR-SC-003)', () => {
  const state = (drawing: Drawing, extra: Partial<SceneOptions> = {}): ShapeItem => scene([drawing], extra)[0] as ShapeItem;

  it('is normal without state: theme style, no change in width, opacity 1', () => {
    const item = state(trend('a'));
    expect(item.state).toBe('normal');
    expect(item.opacity).toBe(1);
    expect(item.style).toEqual({ ...LIGHT_THEME.defaults });
  });

  it('resolves the drawing style over the theme', () => {
    const item = state(trend('a', { style: { color: '#e91e63', lineWidth: 4, lineStyle: 'dashed' } }));
    expect(item.style).toEqual({ ...LIGHT_THEME.defaults, color: '#e91e63', lineWidth: 4, lineStyle: 'dashed' });
    expect(state(rectangle('r')).style.fillOpacity).toBe(0.15);
  });

  it('uses the given theme for the style', () => {
    expect(state(trend('a'), { theme: DARK_THEME }).style.color).toBe(DARK_THEME.defaults.color);
    expect(state(rectangle('r'), { theme: DARK_THEME }).style.fillOpacity).toBe(0.2);
  });

  it('makes a hovered drawing one px wider', () => {
    const item = state(trend('a'), { hover: 'a' });
    expect(item.state).toBe('hover');
    expect(item.style.lineWidth).toBe(3);
    expect(item.opacity).toBe(1);
    expect(state(trend('a', { style: { lineWidth: 5 } }), { hover: 'a' }).style.lineWidth).toBe(6);
  });

  it('ignores hover over another drawing and null', () => {
    expect(state(trend('a'), { hover: 'b' }).state).toBe('normal');
    expect(state(trend('a'), { hover: null }).state).toBe('normal');
  });

  it('shows a selected drawing as selected', () => {
    const item = state(trend('a'), { selected: new Set(['a']) });
    expect(item.state).toBe('selected');
    expect(item.style.lineWidth).toBe(3);
    expect(state(trend('a'), { selected: new Set(['b']) }).state).toBe('normal');
    expect(state(trend('a'), { selected: new Set() }).state).toBe('normal');
  });

  it('lets selected win over hover', () => {
    expect(state(trend('a'), { selected: new Set(['a']), hover: 'a' }).state).toBe('selected');
  });

  it('shows a locked drawing as locked with reduced opacity, over selected and hover', () => {
    const item = state(trend('a', { locked: true }), { selected: new Set(['a']), hover: 'a' });
    expect(item.state).toBe('locked');
    expect(item.opacity).toBe(0.6);
    expect(item.style.lineWidth).toBe(2);
    expect(state(trend('a', { locked: false }), { hover: 'a' }).state).toBe('hover');
  });

  it('takes line width change and opacity from the theme, not from constants', () => {
    const theme: DrawingTheme = {
      ...LIGHT_THEME,
      states: { ...LIGHT_THEME.states, hover: { lineWidthDelta: 3, opacity: 0.9 }, selected: { lineWidthDelta: 5, opacity: 0.8 }, locked: { lineWidthDelta: -1, opacity: 0.3 } },
    };
    expect(state(trend('a'), { theme, hover: 'a' })).toMatchObject({ state: 'hover', opacity: 0.9, style: { lineWidth: 5 } });
    expect(state(trend('a'), { theme, selected: new Set(['a']) })).toMatchObject({ state: 'selected', opacity: 0.8, style: { lineWidth: 7 } });
    expect(state(trend('a', { locked: true }), { theme })).toMatchObject({ state: 'locked', opacity: 0.3, style: { lineWidth: 1 } });
  });

  it('does not change the theme or the drawing', () => {
    const drawing = trend('a', { style: { lineWidth: 4 } });
    state(drawing, { hover: 'a' });
    expect(drawing.style).toEqual({ lineWidth: 4 });
    expect(LIGHT_THEME.defaults.lineWidth).toBe(2);
  });
});

describe('handles (S02)', () => {
  const handles = (drawing: Drawing, extra: Partial<SceneOptions> = {}): HandlesItem => {
    const items = scene([drawing], { selected: new Set([drawing.id]), ...extra });
    return items[items.length - 1] as HandlesItem;
  };

  it('gives only selected drawings a handles item', () => {
    expect(scene([trend('a')]).some((item) => item.type === 'handles')).toBe(false);
    expect(scene([trend('a')], { hover: 'a' }).some((item) => item.type === 'handles')).toBe(false);
    expect(scene([trend('a'), trend('b')], { selected: new Set(['b']) }).filter((item) => item.type === 'handles')).toHaveLength(1);
  });

  it('lists the handle points in handle order with the theme handle style', () => {
    const item = handles(trend('a'));
    expect(item).toEqual({
      type: 'handles',
      drawingId: 'a',
      points: [
        { x: 10, y: 10 },
        { x: 110, y: 60 },
      ],
      style: LIGHT_THEME.states.handles,
      locked: false,
    });
    expect(handles(rectangle('r')).points).toHaveLength(8);
  });

  it('uses the style of the given theme', () => {
    expect(handles(trend('a'), { theme: DARK_THEME }).style).toBe(DARK_THEME.states.handles);
    const theme: DrawingTheme = { ...LIGHT_THEME, states: { ...LIGHT_THEME.states, handles: { size: 11, fillColor: '#000', strokeColor: '#111', lineWidth: 3 } } };
    expect(handles(trend('a'), { theme }).style).toEqual({ size: 11, fillColor: '#000', strokeColor: '#111', lineWidth: 3 });
  });

  it('marks a locked drawing so the host draws lock markers', () => {
    expect(handles(trend('a', { locked: true })).locked).toBe(true);
    expect(handles(trend('a', { locked: false })).locked).toBe(false);
  });

  it('marks the active handle only on its own drawing', () => {
    const drawings = [trend('a'), trend('b')];
    const items = scene(drawings, { selected: new Set(['a', 'b']), active: { drawingId: 'b', index: 1 } });
    const [a, b] = items.slice(2) as HandlesItem[];
    expect('active' in (a as HandlesItem)).toBe(false);
    expect(b?.active).toBe(1);
    expect(handles(trend('a'), { active: { drawingId: 'a', index: 0 } }).active).toBe(0);
    expect('active' in handles(trend('a'), { active: null })).toBe(false);
  });

  it('copies the points, so later changes to the geometry cannot leak in', () => {
    const cache = new GeometryCache(host);
    const drawing = trend('a');
    const item = buildScene(host, { drawings: [drawing], cache, selected: new Set(['a']) })[1] as HandlesItem;
    expect(item.points[0]).not.toBe(cache.get(drawing)?.handles[0]);
    expect(Object.keys(item.points[0] ?? {})).toEqual(['x', 'y']);
  });
});

describe('preview and snap indicator (S03, FR-SC-002)', () => {
  it('shows the preview drawing as a preview item with its shapes and style', () => {
    const preview = trend('p', { style: { color: '#123456' } });
    const items = scene([], { preview });
    expect(items).toHaveLength(1);
    const item = items[0] as PreviewItem;
    expect(item.type).toBe('preview');
    expect(item.shapes).toEqual(new GeometryCache(host).get(preview)?.shapes);
    expect(item.style).toEqual({ ...LIGHT_THEME.defaults, color: '#123456' });
  });

  it('uses the theme for the preview style and geometry', () => {
    const item = scene([], { preview: { id: 'p', kind: 'rectangle', anchors: [A(1, 1), A(5, 5)] }, theme: DARK_THEME })[0] as PreviewItem;
    expect(item.style.fillOpacity).toBe(0.2);
  });

  it('measures a text note preview with the font size of the given theme', () => {
    const note: Drawing = { id: 'p', kind: 'text-note', anchors: [A(10, 10)], text: 'abc' };
    const theme: DrawingTheme = { ...LIGHT_THEME, kinds: { ...LIGHT_THEME.kinds, 'text-note': { fontSize: 30 } } };
    const box = (scene([], { preview: note, theme })[0] as PreviewItem).shapes[0];
    expect(box).toMatchObject({ type: 'text', fontSize: 30, width: 3 * 30 * 0.6 });
    expect((scene([], { preview: note })[0] as PreviewItem).shapes[0]).toMatchObject({ fontSize: 14 });
  });

  it('has no preview item for null, undefined, or a drawing without a pane', () => {
    expect(scene([], { preview: null })).toEqual([]);
    expect(scene([], { preview: undefined })).toEqual([]);
    expect(scene([], { preview: { id: 'p', kind: 'trend-line', anchors: [A(1, 1, 'nope'), A(2, 2, 'nope')] } })).toEqual([]);
  });

  it('draws the snap indicator as a circle around the snapped point in the default style', () => {
    const items = scene([], { snap: { x: 33, y: 44 } });
    expect(items).toEqual([
      { type: 'preview', shapes: [{ type: 'arc', part: 'body', center: { x: 33, y: 44 }, radius: SNAP_INDICATOR_RADIUS, startAngle: 0, endAngle: 2 * Math.PI }], style: LIGHT_THEME.defaults },
    ]);
    expect(SNAP_INDICATOR_RADIUS).toBe(5);
    expect((scene([], { snap: { x: 1, y: 2 }, theme: DARK_THEME })[0] as PreviewItem).style).toEqual(DARK_THEME.defaults);
  });

  it('shows the snap at the origin too, and not for null', () => {
    expect(scene([], { snap: { x: 0, y: 0 } })).toHaveLength(1);
    expect(scene([], { snap: null })).toEqual([]);
  });

  it('puts the preview before the snap indicator, both before handles and after drawings', () => {
    const items = scene([trend('a')], { selected: new Set(['a']), preview: rectangle('p'), snap: { x: 5, y: 5 } });
    expect(items.map((item) => item.type)).toEqual(['shape', 'preview', 'preview', 'handles']);
    expect((items[1] as PreviewItem).shapes[0]?.type).toBe('rect');
    expect((items[2] as PreviewItem).shapes[0]?.type).toBe('arc');
  });

  it('shows both gone when the options no longer have them (after placement or cancel)', () => {
    const drawings = [trend('a')];
    const cache = new GeometryCache(host);
    expect(buildScene(host, { drawings, cache, preview: rectangle('p'), snap: { x: 1, y: 1 } })).toHaveLength(3);
    expect(buildScene(host, { drawings, cache })).toHaveLength(1);
  });
});

describe('Fibonacci items (S04, FR-SC-004)', () => {
  const anchors = [A(10, 300), A(110, 100)];
  const item = (drawing: Drawing, extra: Partial<SceneOptions> = {}): FibonacciItem => scene([drawing], extra)[0] as FibonacciItem;

  it('gives a retracement in data space with every option resolved', () => {
    const drawing = fib('f', 'fibonacci-retracement');
    const result = item(drawing);
    expect(result.type).toBe('fibonacci');
    expect(result.kind).toBe('fibonacci-retracement');
    expect(result.drawingId).toBe('f');
    expect(result.anchors).toBe(drawing.anchors);
    expect(result.anchors).toEqual(anchors);
    expect(result.options).toEqual({
      levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => ({ ratio, visible: true })).concat([1.272, 1.618, 2.618, 4.236].map((ratio) => ({ ratio, visible: false }))),
      reverse: false,
      extendLeft: false,
      extendRight: false,
      showLabels: true,
      showPrices: true,
    });
  });

  it('applies the options of the drawing over the defaults', () => {
    const levels = [{ ratio: 0.5, visible: true, color: '#abcdef' }];
    const result = item(fib('f', 'fibonacci-retracement', { options: { levels, reverse: true, showPrices: false } }));
    expect(result.options).toEqual({ levels, reverse: true, extendLeft: false, extendRight: false, showLabels: true, showPrices: false });
  });

  it('resolves arcs, fans and time zones', () => {
    expect(item(fib('a', 'fibonacci-arcs', { options: { fullCircles: true } })).options).toEqual({
      levels: [0.382, 0.5, 0.618].map((ratio) => ({ ratio, visible: true })),
      fullCircles: true,
      showLabels: true,
    });
    expect(item(fib('b', 'fibonacci-fans', { options: { showLabels: false } })).options).toEqual({ levels: [0.382, 0.5, 0.618].map((ratio) => ({ ratio, visible: true })), showLabels: false });
    expect(item(fib('c', 'fibonacci-time-zones', { options: { sequence: [0, 2, 4] } })).options).toEqual({ sequence: [0, 2, 4], showLabels: true });
    expect(item(fib('d', 'fibonacci-time-zones')).options).toEqual({ sequence: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89], showLabels: true });
  });

  it('carries state, opacity and the resolved style (the Fibonacci default color and width)', () => {
    const plain = item(fib('f', 'fibonacci-fans'));
    expect(plain).toMatchObject({ state: 'normal', opacity: 1, style: { color: '#787b86', lineWidth: 1 } });
    const locked = item(fib('f', 'fibonacci-fans', { locked: true }));
    expect(locked).toMatchObject({ state: 'locked', opacity: 0.6, style: { lineWidth: 1 } });
    expect(item(fib('f', 'fibonacci-fans'), { hover: 'f' })).toMatchObject({ state: 'hover', style: { lineWidth: 2 } });
    expect(item(fib('f', 'fibonacci-fans'), { theme: DARK_THEME }).style.color).toBe('#868993');
  });

  it('has no shapes on the item, and still gives handles as a handles item', () => {
    const items = scene([fib('f', 'fibonacci-retracement')], { selected: new Set(['f']) });
    expect('shapes' in (items[0] as object)).toBe(false);
    expect(items[1]).toMatchObject({ type: 'handles', drawingId: 'f', locked: false });
    expect((items[1] as HandlesItem).points).toHaveLength(2);
  });

  it('leaves out a Fibonacci drawing without a pane', () => {
    expect(scene([{ id: 'f', kind: 'fibonacci-fans', anchors: [A(1, 1, 'nope'), A(2, 2, 'nope')] }])).toEqual([]);
  });

  it('does not give other kinds a fibonacci item', () => {
    expect(scene([trend('a'), rectangle('b')]).map((i) => i.type)).toEqual(['shape', 'shape']);
  });
});
