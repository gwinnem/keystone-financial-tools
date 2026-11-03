import { describe, expect, it } from 'vitest';
import { geometryOf } from '../src/geometry/index';
import { formatPrice, priceLabelShapes } from '../src/geometry/lines';
import type { TextShape } from '../src/geometry/types';
import { GeometryCache } from '../src/hit/geometry-cache';
import { moveDrawings } from '../src/interaction/move';
import { buildScene } from '../src/scene/build';
import type { SceneItem } from '../src/scene/types';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import { DARK_THEME } from '../src/theme';
import type { Anchor, Drawing } from '../src/types';
import { A, LINE, rig } from './controller-rig';

// E05-F02: the horizontal line tool through the controller, on the mock host (QA-005). The pane is
// `price`, 800 px wide and 400 px high with prices 0 to 200 (y = (200 - p) * 2); time is x * 6000.
// H sits at y = 100 (price 150). Its label has a 10 px font: 6 characters of "150.00" are 36 px
// wide and one line is 13 px high.
const HORIZONTAL = 'horizontal-line';
const H: Drawing = { id: 'h', kind: HORIZONTAL, anchors: [A(300, 100)], style: { fontSize: 10 } };
const anchorsOf = (store: { get(id: string): { anchors: readonly Anchor[] } | undefined }, id: string): readonly Anchor[] => store.get(id)?.anchors ?? [];

function shapeItem(items: readonly SceneItem[], id: string): Extract<SceneItem, { type: 'shape' }> {
  for (const item of items) {
    if (item.type === 'shape' && item.drawingId === id) return item;
  }
  throw new Error(`No shape item for ${id}.`);
}

/** The price label of drawing `id` in the scene. */
function labelOf(items: readonly SceneItem[], id: string): TextShape {
  for (const shape of shapeItem(items, id).shapes) {
    if (shape.type === 'text' && shape.part === 'label') return shape;
  }
  throw new Error(`No label for ${id}.`);
}

/** The y of the body line of drawing `id` in the scene, and its x extent. */
function lineOf(items: readonly SceneItem[], id: string): { readonly from: number; readonly to: number; readonly y: number } {
  for (const shape of shapeItem(items, id).shapes) {
    if (shape.type === 'line' && shape.part === 'body') return { from: shape.from.x, to: shape.to.x, y: shape.from.y };
  }
  throw new Error(`No body line for ${id}.`);
}

describe('placing a horizontal line (FR-INT-010)', () => {
  it('places with one click, across the full width of the pane', () => {
    const { store, tools, click } = rig();
    tools.activate(HORIZONTAL);
    click(300, 100);
    expect(store.list()).toEqual([{ id: 'd1', kind: HORIZONTAL, anchors: [A(300, 100)] }]);
    expect(tools.getState().selection).toEqual(['d1']);
    expect(tools.getState().activeTool).toBeNull();
    expect(lineOf(tools.getScene(), 'd1')).toEqual({ from: 0, to: 800, y: 100 });
  });

  it('spans the pane wherever it is placed, also in future space and after a scroll', () => {
    const { host, tools, click } = rig();
    tools.activate(HORIZONTAL);
    click(700, 300);
    host.scroll(50);
    expect(lineOf(tools.getScene(), 'd1')).toEqual({ from: 0, to: 800, y: 300 });
  });

  it('is one history entry that undo removes and redo brings back', () => {
    const { store, tools, click } = rig();
    tools.activate(HORIZONTAL);
    click(300, 100);
    expect(tools.getState().canUndo).toBe(true);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.redo()).toBe(true);
    expect(anchorsOf(store, 'd1')).toEqual([A(300, 100)]);
  });
});

describe('moving a horizontal line changes only its price (FR-INT-010)', () => {
  it('drags the body up or down and ignores the horizontal travel, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [H]);
    click(500, 100);
    drag([500, 100], [700, 160], [[600, 130]]);
    const [anchor] = anchorsOf(store, 'h');
    expect(anchor?.time).toBe(300 * 6000);
    expect(anchor?.price).toBeCloseTo(120, 9);
    expect(anchor?.yAxisId).toBe('price');
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'h')).toEqual([A(300, 100)]);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('drags the handle at the centre of the pane the same way', () => {
    const { store, click, drag } = rig({}, {}, [H]);
    click(500, 100);
    drag([400, 100], [450, 50], [[420, 80]]);
    const [anchor] = anchorsOf(store, 'h');
    expect(anchor?.time).toBe(300 * 6000);
    expect(anchor?.price).toBeCloseTo(175, 9);
  });

  it('shows ns-resize over the line, its handle and its label, and the default cursor elsewhere', () => {
    const { host, click } = rig({}, {}, [H]);
    click(500, 100);
    const last = (): string | undefined => host.cursors[host.cursors.length - 1];
    host.pointer('move', 500, 100);
    expect(last()).toBe('ns-resize');
    host.pointer('move', 500, 300);
    expect(last()).toBe('default');
    host.pointer('move', 400, 100);
    expect(last()).toBe('ns-resize');
    host.pointer('move', 790, 90);
    expect(last()).toBe('ns-resize');
  });

  it('puts a drag back with Escape', () => {
    const { host, store, tools, click } = rig({}, {}, [H]);
    click(500, 100);
    host.pointer('down', 500, 100);
    host.pointer('move', 600, 160);
    expect(anchorsOf(store, 'h')[0]?.price).toBeCloseTo(120, 9);
    host.key('Escape');
    expect(anchorsOf(store, 'h')).toEqual([A(300, 100)]);
    expect(tools.getState().canUndo).toBe(false);
  });
});

describe('deleting a horizontal line', () => {
  it('removes the selected line, and undo and redo bring it back and remove it again', () => {
    const { host, store, tools, click } = rig({}, {}, [H]);
    click(500, 100);
    expect(host.key('Delete')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([H]);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(0);
  });
});

describe('the price label (FR-SC-001)', () => {
  it('is a text shape of the part label with the price in 2 decimals, at the right end on the line', () => {
    const { tools } = rig({}, {}, [H]);
    expect(labelOf(tools.getScene(), 'h')).toEqual({ type: 'text', part: 'label', x: 764, y: 87, width: 36, height: 13, lines: ['150.00'], fontSize: 10, lineHeight: 13 });
  });

  it('uses the priceFormatter of the tools, with the price and the y-axis', () => {
    const { tools } = rig({ priceFormatter: (price, yAxisId) => `${yAxisId}=${price}` }, {}, [H]);
    expect(labelOf(tools.getScene(), 'h').lines).toEqual(['price=150']);
  });

  it('keeps the priceFormatter when the theme changes', () => {
    const { tools } = rig({ priceFormatter: (price) => `$${price}` }, {}, [H]);
    tools.setTheme(DARK_THEME);
    expect(labelOf(tools.getScene(), 'h').lines).toEqual(['$150']);
  });

  it('follows the line during a drag and after it', () => {
    const { host, tools, click } = rig({}, {}, [H]);
    click(500, 100);
    host.pointer('down', 500, 100);
    host.pointer('move', 600, 160);
    const during = labelOf(tools.getScene(), 'h');
    expect(during.lines).toEqual(['120.00']);
    expect(during.y + during.height).toBeCloseTo(160, 9);
    expect(lineOf(tools.getScene(), 'h').y).toBeCloseTo(160, 9);
    host.pointer('up', 600, 160);
    expect(labelOf(tools.getScene(), 'h').lines).toEqual(['120.00']);
  });

  it('is found by hit-testing as the part label, and the pointer there does not miss the line', () => {
    const { tools } = rig({}, {}, [H]);
    expect(tools.hitTest(780, 94)).toEqual({ id: 'h', part: 'label', locked: false });
    expect(tools.hitTest(400, 100)).toEqual({ id: 'h', part: 'body', locked: false });
    expect(tools.hitTest(400, 90)).toBeNull();
  });

  it('is in the placement preview with the same formatter', () => {
    const host = createMockHost();
    const cache = new GeometryCache(host, { priceFormatter: (price) => `p${price}` });
    const items = buildScene(host, { drawings: [], cache, preview: H });
    const preview = items.find((item): item is Extract<SceneItem, { type: 'preview' }> => item.type === 'preview');
    const label = preview?.shapes.find((shape) => shape.type === 'text');
    expect(label).toMatchObject({ part: 'label', lines: ['p150'] });
    cache.destroy();
  });
});

describe('priceFormatter in the geometry (FR-SC-001)', () => {
  const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, { yAxisId: 'rsi', top: 400, height: 100, min: 0, max: 100 }] });
  const labelAt = (drawing: Drawing, options?: Parameters<typeof geometryOf>[2]): TextShape => geometryOf(drawing, host, options)?.shapes[1] as TextShape;

  it('formats with 2 decimals by default', () => {
    expect(formatPrice(75)).toBe('75.00');
    expect(formatPrice(1.2)).toBe('1.20');
    expect(labelAt(H).lines).toEqual(['150.00']);
  });

  it('passes the price and the y-axis of the anchor to the formatter', () => {
    const calls: [number, string][] = [];
    const priceFormatter = (price: number, yAxisId: string): string => {
      calls.push([price, yAxisId]);
      return 'x';
    };
    labelAt({ id: 'h', kind: HORIZONTAL, anchors: [{ time: 0, price: 50, yAxisId: 'rsi' }] }, { priceFormatter });
    expect(calls).toEqual([[50, 'rsi']]);
  });

  it('puts the label at the right edge of its own pane, above the line', () => {
    const label = labelAt({ id: 'h', kind: HORIZONTAL, anchors: [{ time: 0, price: 50, yAxisId: 'rsi' }], style: { fontSize: 10 } });
    expect(label.x + label.width).toBe(800);
    expect(label.y + label.height).toBe(450);
  });

  it('measures the text with measureText when given and takes the font size from the style', () => {
    const label = labelAt({ ...H, style: { fontSize: 20 } }, { measureText: (line, fontSize) => line.length + fontSize });
    expect(label.width).toBe(26);
    expect(label.height).toBeCloseTo(26, 9);
    expect(label.fontSize).toBe(20);
    expect(label.x).toBe(774);
  });

  it('is made by priceLabelShapes from any text', () => {
    expect(priceLabelShapes({ x: 10, y: 50 }, { x: 0, y: 0, width: 100, height: 100 }, 'ab', 10)).toEqual([
      { type: 'text', part: 'label', x: 88, y: 37, width: 12, height: 13, lines: ['ab'], fontSize: 10, lineHeight: 13 },
    ]);
  });

  it('is kept by the geometry cache and unset by default', () => {
    const format = (price: number): string => String(price);
    const cache = new GeometryCache(host, { priceFormatter: format });
    expect(cache.priceFormatter).toBe(format);
    expect(cache.get(H)?.shapes[1]).toMatchObject({ lines: ['150'] });
    cache.destroy();
    const plain = new GeometryCache(host);
    expect(plain.priceFormatter).toBeUndefined();
    plain.destroy();
  });
});

describe('moveDrawings and a horizontal line (FR-INT-010)', () => {
  const host = createMockHost();
  const origin = { x: 100, y: 100 };

  it('changes only the price of a horizontal line and moves the other kinds in time as well', () => {
    const [line, trend] = moveDrawings([H, LINE], origin, { x: 150, y: 140 }, false, host);
    expect(line?.anchors[0]?.time).toBe(300 * 6000);
    expect(line?.anchors[0]?.price).toBeCloseTo(130, 9);
    expect(trend?.anchors[0]?.time).toBe(150 * 6000);
    expect(trend?.anchors[1]?.time).toBe(350 * 6000);
  });

  it('leaves a horizontal line where it is when Shift keeps the move horizontal', () => {
    expect(moveDrawings([H], origin, { x: 200, y: 120 }, true, host)).toEqual([{ id: 'h', anchors: [A(300, 100)] }]);
  });
});
