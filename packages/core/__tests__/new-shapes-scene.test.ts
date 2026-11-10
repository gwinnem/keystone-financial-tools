import { describe, expect, it } from 'vitest';
import { geometryOf } from '../src/geometry/index';
import type { Shape } from '../src/geometry/types';
import { GeometryCache } from '../src/hit/geometry-cache';
import { registerKind, type KindDefinition } from '../src/kinds';
import { buildScene } from '../src/scene/build';
import { SceneCache } from '../src/scene/scene-cache';
import type { HandlesItem, PreviewItem, ShapeItem } from '../src/scene/types';
import { createMockHost } from '../src/testing/mock-host';
import { DARK_THEME, LIGHT_THEME } from '../src/theme';
import type { Anchor, Drawing, DrawingKind } from '../src/types';

// E12-F02-S01 (FR-TOOL-036): the new shapes in geometry and scene. The kind is made up for the test (the registry of this file only):
// it draws every new shape from its two anchors, so a golden test can pin each one.
const GALLERY = 'gallery' as DrawingKind;

const gallery: KindDefinition = {
  id: GALLERY,
  anchors: { min: 2, max: 2 },
  defaults: {},
  group: 'shapes',
  geometry: ({ points }) => {
    const [p1, p2] = points as [{ x: number; y: number }, { x: number; y: number }];
    const middle = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return [
      { type: 'polyline', part: 'body', points: [p1, middle, p2] },
      { type: 'polygon', part: 'body', points: [p1, { x: p2.x, y: p1.y }, p2] },
      { type: 'ellipse', part: 'body', center: middle, radiusX: Math.abs(p2.x - p1.x) / 2, radiusY: Math.abs(p2.y - p1.y) / 2, rotation: 0.5 },
      { type: 'curve', part: 'body', from: p1, controls: [{ x: middle.x, y: p1.y }], to: p2 },
      {
        type: 'curve',
        part: 'body',
        from: p1,
        controls: [
          { x: middle.x, y: p1.y },
          { x: middle.x, y: p2.y },
        ],
        to: p2,
      },
      { type: 'arrowhead', part: 'body', tip: p2, angle: Math.PI / 4, length: 10, width: 8 },
      { type: 'glyph', part: 'body', x: p1.x, y: p1.y, width: 24, height: 24, glyph: 'pin', source: 'icon', fontSize: 24 },
      { type: 'glyph', part: 'body', x: p2.x, y: p2.y, width: 16, height: 16, glyph: '★', source: 'emoji', fontSize: 16 },
    ];
  },
};
registerKind(gallery);

// The default mock host: x = time / 6000 and y = 400 - 2 * price.
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const host = createMockHost();
const drawing = (extra: Partial<Drawing> = {}): Drawing => ({ id: 'g', kind: GALLERY, anchors: [A(100, 100), A(200, 160)], ...extra });
const P = (x: number, y: number) => ({ x, y });

/** The shapes the kind draws from the anchors (100, 100) and (200, 160): the golden values. */
const GOLDEN: Shape[] = [
  { type: 'polyline', part: 'body', points: [P(100, 100), P(150, 130), P(200, 160)] },
  { type: 'polygon', part: 'body', points: [P(100, 100), P(200, 100), P(200, 160)] },
  { type: 'ellipse', part: 'body', center: P(150, 130), radiusX: 50, radiusY: 30, rotation: 0.5 },
  { type: 'curve', part: 'body', from: P(100, 100), controls: [P(150, 100)], to: P(200, 160) },
  { type: 'curve', part: 'body', from: P(100, 100), controls: [P(150, 100), P(150, 160)], to: P(200, 160) },
  { type: 'arrowhead', part: 'body', tip: P(200, 160), angle: Math.PI / 4, length: 10, width: 8 },
  { type: 'glyph', part: 'body', x: 100, y: 100, width: 24, height: 24, glyph: 'pin', source: 'icon', fontSize: 24 },
  { type: 'glyph', part: 'body', x: 200, y: 160, width: 16, height: 16, glyph: '★', source: 'emoji', fontSize: 16 },
];

function shapeItem(items: readonly unknown[], index = 0): ShapeItem {
  return items[index] as ShapeItem;
}

describe('the geometry of the new shapes (FR-TOOL-036)', () => {
  it('has the six new shapes in the shapes of a drawing, as the kind gave them', () => {
    const geometry = geometryOf(drawing(), host);
    expect(geometry?.shapes).toEqual(GOLDEN);
    expect(new Set(geometry?.shapes.map((shape) => shape.type))).toEqual(new Set(['polyline', 'polygon', 'ellipse', 'curve', 'arrowhead', 'glyph']));
  });

  it('keeps a quadratic and a cubic curve apart by the number of control points', () => {
    const curves = (geometryOf(drawing(), host)?.shapes ?? []).flatMap((shape) => (shape.type === 'curve' ? [shape.controls.length] : []));
    expect(curves).toEqual([1, 2]);
  });

  it('keeps an icon, an emoji and a text glyph apart by their source', () => {
    const sources = (geometryOf(drawing(), host)?.shapes ?? []).flatMap((shape) => (shape.type === 'glyph' ? [shape.source] : []));
    expect(sources).toEqual(['icon', 'emoji']);
  });

  it('has the handles of its anchors', () => {
    expect(geometryOf(drawing(), host)?.handles).toEqual([
      { id: 'handle:0', x: 100, y: 100 },
      { id: 'handle:1', x: 200, y: 160 },
    ]);
  });
});

describe('the new shapes in the scene (FR-SC-001, FR-SC-003)', () => {
  const scene = (drawings: readonly Drawing[], extra: Partial<Parameters<typeof buildScene>[1]> = {}) =>
    buildScene(host, { drawings, cache: new GeometryCache(host, { theme: extra.theme }), ...extra });

  it('is a shape item with every shape, in the order the kind gave them', () => {
    const items = scene([drawing()]);
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe('shape');
    expect(shapeItem(items).shapes).toEqual(GOLDEN);
    expect(shapeItem(items).state).toBe('normal');
    expect(shapeItem(items).opacity).toBe(1);
  });

  it('takes stroke, dash and fill from the resolved style, for every shape alike', () => {
    const style = { color: '#ff0000', lineWidth: 3, lineStyle: 'dashed', fillColor: '#00ff00', fillOpacity: 0.3 } as const;
    const item = shapeItem(scene([drawing({ style })]));
    expect(item.style).toMatchObject(style);
    expect(item.shapes).toEqual(GOLDEN);
    // The shapes carry no style of their own: a host draws all of them with the one `style` of the item.
    for (const shape of item.shapes) expect(Object.keys(shape)).not.toContain('style');
  });

  it('has the fill of the theme for the kind, and the fill of the dark theme in the dark theme', () => {
    expect(shapeItem(scene([drawing()])).style.fillOpacity).toBe(LIGHT_THEME.defaults.fillOpacity);
    expect(shapeItem(scene([drawing()], { theme: DARK_THEME })).style.color).toBe(DARK_THEME.defaults.color);
  });

  it.each([
    ['normal', {}, undefined],
    ['hover', { hover: 'g' }, 'hover'],
    ['selected', { selected: new Set(['g']) }, 'selected'],
  ] as const)('is %s: the width and opacity of the state, the same shapes', (state, options, themeState) => {
    const items = scene([drawing()], options);
    const item = shapeItem(items);
    expect(item.state).toBe(state);
    const emphasis = themeState === undefined ? { lineWidthDelta: 0, opacity: 1 } : LIGHT_THEME.states[themeState];
    expect(item.style.lineWidth).toBe(LIGHT_THEME.defaults.lineWidth + emphasis.lineWidthDelta);
    expect(item.opacity).toBe(emphasis.opacity);
    expect(item.shapes).toEqual(GOLDEN);
  });

  it('is locked: the opacity of the locked state wins over selected and hover, the same shapes', () => {
    const item = shapeItem(scene([drawing({ locked: true })], { selected: new Set(['g']), hover: 'g' }));
    expect(item.state).toBe('locked');
    expect(item.opacity).toBe(LIGHT_THEME.states.locked.opacity);
    expect(item.style.lineWidth).toBe(LIGHT_THEME.defaults.lineWidth + LIGHT_THEME.states.locked.lineWidthDelta);
    expect(item.shapes).toEqual(GOLDEN);
  });

  it('gives a selected drawing the handles of its anchors, locked or not', () => {
    for (const locked of [false, true]) {
      const items = scene([drawing({ locked })], { selected: new Set(['g']) });
      const handles = items[1] as HandlesItem;
      expect(handles.type).toBe('handles');
      expect(handles.points).toEqual([P(100, 100), P(200, 160)]);
      expect(handles.locked).toBe(locked);
    }
  });

  it('shows the placement preview with every shape too', () => {
    const items = scene([], { preview: drawing() });
    expect(items).toHaveLength(1);
    expect((items[0] as PreviewItem).type).toBe('preview');
    expect((items[0] as PreviewItem).shapes).toEqual(GOLDEN);
  });

  it('keeps the same array from the scene cache until an input changes (FR-SC-001)', () => {
    const cache = new GeometryCache(host);
    const scenes = new SceneCache(host);
    const drawings = [drawing()];
    const first = scenes.get({ drawings, cache });
    expect(scenes.get({ drawings, cache })).toBe(first);
    expect(scenes.get({ drawings, cache, hover: 'g' })).not.toBe(first);
    expect(shapeItem(first).shapes).toBe(shapeItem(scenes.get({ drawings, cache })).shapes);
  });

  it('is left out with its pane, like every drawing', () => {
    const lost: Drawing = {
      id: 'lost',
      kind: GALLERY,
      anchors: [
        { time: 0, price: 1, yAxisId: 'nope' },
        { time: 1, price: 2, yAxisId: 'nope' },
      ],
    };
    expect(scene([lost])).toEqual([]);
  });
});
