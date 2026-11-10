import { afterEach, describe, expect, it } from 'vitest';
import { geometryOf } from '../src/geometry/index';
import { importDocument } from '../src/import';
import { duplicateDrawing } from '../src/interaction/duplicate';
import { dragHandle, dragPatch, moveDrawings, nudgeDrawing } from '../src/interaction/move';
import { registerKind, type KindDefinition } from '../src/kinds';
import { defaultOptions, resolveOptions, validateOptions } from '../src/options';
import { barWidthPx, isPaneKind, paneShift, panePoint, positionAt, positionOf } from '../src/pane-space';
import { DrawingStore } from '../src/store';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import type { Drawing, DrawingKind } from '../src/types';
import { validateDrawing } from '../src/validate';
import { rig } from './controller-rig';
import { anchor } from './fixtures';

// E12-F01-S02 (FR-TOOL-031, D-10): a kind with `space: 'pane'` is placed from the pane, not from time and price.
const LEGEND = 'legend' as DrawingKind;
const definition = (overrides: Partial<KindDefinition> = {}): KindDefinition => ({
  id: LEGEND,
  anchors: { min: 1, max: 1 },
  defaults: {},
  group: 'annotations',
  space: 'pane',
  // A segment 40 px long from the position: it is hit like any line.
  geometry: ({ points }) => [{ type: 'line', part: 'body', from: points[0], to: { x: points[0].x + 40, y: points[0].y } }],
  ...overrides,
});
const legend = (position?: { x: number; y: number }, time = 1, price = 100): Drawing => ({
  id: 'lg',
  kind: LEGEND,
  anchors: [anchor(time, price)],
  ...(position === undefined ? {} : { options: { position } }),
});

const disposers: (() => void)[] = [];
const register = (overrides: Partial<KindDefinition> = {}): void => {
  disposers.push(registerKind(definition(overrides)));
};
afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
});

describe('registering a pane kind', () => {
  it('is a pane kind, with the middle of the pane as its default position', () => {
    register();
    expect(isPaneKind(LEGEND)).toBe(true);
    expect(isPaneKind('trend-line')).toBe(false);
    expect(defaultOptions(LEGEND)).toEqual({ position: { x: 0.5, y: 0.5 } });
    expect(resolveOptions(LEGEND, { position: { x: 0.1, y: 0.9 } })).toEqual({ position: { x: 0.1, y: 0.9 } });
    expect(positionOf(legend())).toEqual({ x: 0.5, y: 0.5 });
  });

  it('keeps a default position the kind gives', () => {
    register({ defaults: { position: { x: 0.02, y: 0.03 } } });
    expect(defaultOptions(LEGEND)).toEqual({ position: { x: 0.02, y: 0.03 } });
  });

  it('takes exactly one anchor', () => {
    expect(() => registerKind(definition({ anchors: { min: 1, max: 2 } }))).toThrow('The pane kind legend takes exactly one anchor.');
    expect(() => registerKind(definition({ anchors: { min: 2, max: 2 } }))).toThrow(RangeError);
  });
});

describe('options.position (KFT-E-OPTIONS)', () => {
  it('accepts fractions of the pane from 0 to 1, edges included', () => {
    register();
    for (const position of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.25, y: 0.75 },
    ])
      expect(validateOptions(LEGEND, { position })).toEqual([]);
    expect(validateDrawing(legend({ x: 1, y: 0 }))).toEqual([]);
  });

  it('rejects a position outside 0..1, a missing or extra field and what is not a number', () => {
    register();
    const issue = [{ code: 'KFT-E-OPTIONS', message: 'The position must be an object with x and y, both between 0 and 1.' }];
    for (const position of [{ x: 1.01, y: 0 }, { x: 0, y: -0.01 }, { x: 0 }, { x: 0, y: 0, z: 0 }, { x: Number.NaN, y: 0 }, { x: '0', y: 0 }, { x: Infinity, y: 0 }, null, 3, []]) {
      expect(validateOptions(LEGEND, { position })).toEqual(issue);
    }
    expect(validateDrawing(legend({ x: 2, y: 0 }))).toEqual(issue);
  });

  it('is not allowed on a kind in data space', () => {
    expect(validateOptions('rectangle', { position: { x: 0, y: 0 } })).toEqual([{ code: 'KFT-E-OPTIONS', message: 'The option position is not allowed on a rectangle.' }]);
  });
});

describe('geometry from the pane', () => {
  it('places the drawing at its fractions of the pane and ignores time and price', () => {
    register();
    const host = createMockHost();
    const a = geometryOf(legend({ x: 0.25, y: 0.5 }, 1, 10), host);
    const b = geometryOf(legend({ x: 0.25, y: 0.5 }, 99999, 190), host);
    expect(a?.shapes).toEqual([{ type: 'line', part: 'body', from: { x: 200, y: 200 }, to: { x: 240, y: 200 } }]);
    expect(b).toEqual(a);
    expect(a?.handles).toEqual([{ id: 'handle:0', x: 200, y: 200 }]);
  });

  it('stays at the same fractions when the viewport is zoomed or scrolled', () => {
    register();
    const host = createMockHost();
    const before = geometryOf(legend({ x: 0.1, y: 0.1 }), host);
    host.zoom(2, 100);
    host.scroll(250);
    expect(geometryOf(legend({ x: 0.1, y: 0.1 }), host)).toEqual(before);
  });

  it('follows the size of the pane when it is resized', () => {
    register();
    const wide = createMockHost({ width: 800, panes: [{ ...DEFAULT_MOCK_PANE, height: 400 }] });
    const small = createMockHost({ width: 400, panes: [{ ...DEFAULT_MOCK_PANE, height: 100 }] });
    expect(geometryOf(legend({ x: 0.5, y: 0.5 }), wide)?.handles[0]).toMatchObject({ x: 400, y: 200 });
    expect(geometryOf(legend({ x: 0.5, y: 0.5 }), small)?.handles[0]).toMatchObject({ x: 200, y: 50 });
  });

  it('has no geometry once its pane is gone, and the drawing stays in the store', () => {
    register();
    const store = new DrawingStore([legend({ x: 0.5, y: 0.5 })]);
    const gone = createMockHost({ panes: [{ ...DEFAULT_MOCK_PANE, yAxisId: 'rsi' }] });
    expect(geometryOf(legend({ x: 0.5, y: 0.5 }), gone)).toBeNull();
    expect(store.list()).toHaveLength(1);
  });

  it('turns a position into a point and a point into a position, kept inside the pane', () => {
    const rect = { x: 10, y: 20, width: 200, height: 100 };
    expect(panePoint(rect, { x: 0.5, y: 0.25 })).toEqual({ x: 110, y: 45 });
    expect(positionAt(rect, { x: 110, y: 45 })).toEqual({ x: 0.5, y: 0.25 });
    expect(positionAt(rect, { x: -50, y: 500 })).toEqual({ x: 0, y: 1 });
    expect(positionAt(rect, { x: 5000, y: -5 })).toEqual({ x: 1, y: 0 });
    expect(positionAt({ x: 0, y: 0, width: 0, height: 0 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});

describe('moving a pane-anchored drawing', () => {
  const host = createMockHost();

  it('moves the position by the pointer travel and leaves the anchor alone', () => {
    register();
    const moved = moveDrawings([legend({ x: 0.25, y: 0.25 })], { x: 220, y: 100 }, { x: 320, y: 150 }, false, host);
    expect(moved).toEqual([{ id: 'lg', anchors: legend().anchors, options: { position: { x: 0.375, y: 0.375 } } }]);
  });

  it('clamps the position to the pane so the drawing stays partly inside', () => {
    register();
    const far = moveDrawings([legend({ x: 0.5, y: 0.5 })], { x: 0, y: 0 }, { x: 99999, y: -99999 }, false, host);
    expect(far[0]?.options).toEqual({ position: { x: 1, y: 0 } });
    const back = moveDrawings([legend({ x: 0.5, y: 0.5 })], { x: 0, y: 0 }, { x: -99999, y: 99999 }, false, host);
    expect(back[0]?.options).toEqual({ position: { x: 0, y: 1 } });
  });

  it('keeps to one direction with Shift', () => {
    register();
    const moved = moveDrawings([legend({ x: 0.25, y: 0.25 })], { x: 0, y: 0 }, { x: 80, y: 20 }, true, host);
    expect(moved[0]?.options).toEqual({ position: { x: 0.35, y: 0.25 } });
  });

  it('leaves a drawing out whose pane is gone, and moves the others', () => {
    register();
    const rsi = createMockHost({ panes: [{ ...DEFAULT_MOCK_PANE, yAxisId: 'rsi' }] });
    expect(moveDrawings([legend({ x: 0.5, y: 0.5 })], { x: 0, y: 0 }, { x: 10, y: 10 }, false, rsi)).toEqual([]);
  });

  it('moves a position that is the default: the move writes the position', () => {
    register();
    const moved = moveDrawings([legend()], { x: 0, y: 0 }, { x: 80, y: 40 }, false, host);
    expect(moved[0]?.options).toEqual({ position: { x: 0.6, y: 0.6 } });
  });

  it('keeps the other options of the drawing when it moves', () => {
    register({ defaults: { showLabels: true } });
    const drawing: Drawing = { ...legend({ x: 0.5, y: 0.5 }), options: { position: { x: 0.5, y: 0.5 }, showLabels: false } };
    expect(paneShift(drawing, 80, 0, host)?.options).toEqual({ position: { x: 0.6, y: 0.5 }, showLabels: false });
  });

  it('is dragged by its one handle: a patch for handle 0, nothing for another and no anchors', () => {
    register();
    const drawing = legend({ x: 0.25, y: 0.25 });
    expect(dragPatch(drawing, 0, { x: 200, y: 100 }, { x: 400, y: 200 }, false, host)).toEqual({ options: { position: { x: 0.5, y: 0.5 } } });
    expect(dragPatch(drawing, 1, { x: 200, y: 100 }, { x: 400, y: 200 }, false, host)).toBeNull();
    expect(dragHandle(drawing, 0, { x: 200, y: 100 }, { x: 400, y: 200 }, false, host)).toBeNull();
    expect(dragPatch(drawing, 0, { x: 0, y: 0 }, { x: 1, y: 1 }, false, createMockHost({ panes: [] }))).toBeNull();
  });

  it('gives the anchors of a drawing in data space as the patch', () => {
    const line: Drawing = { id: 'l', kind: 'trend-line', anchors: [anchor(100, 100), anchor(200, 150)] };
    const patch = dragPatch(line, 0, { x: 100, y: 100 }, { x: 110, y: 100 }, false, host);
    expect(patch).toEqual({ anchors: dragHandle(line, 0, { x: 100, y: 100 }, { x: 110, y: 100 }, false, host) });
    expect(dragPatch(line, 5, { x: 0, y: 0 }, { x: 1, y: 1 }, false, host)).toBeNull();
  });
});

describe('nudging and duplicating', () => {
  const host = createMockHost();

  it('moves the position by bars and pixels, clamped', () => {
    register();
    expect(barWidthPx(host)).toBe(10);
    expect(nudgeDrawing(legend({ x: 0.5, y: 0.5 }), 2, 0, host)).toEqual({ options: { position: { x: 0.525, y: 0.5 } } });
    expect(nudgeDrawing(legend({ x: 0.5, y: 0.5 }), 0, -40, host)).toEqual({ options: { position: { x: 0.5, y: 0.4 } } });
    expect(nudgeDrawing(legend({ x: 1, y: 0 }), 5, -5, host)).toEqual({ options: { position: { x: 1, y: 0 } } });
    expect(nudgeDrawing(legend({ x: 0.5, y: 0.5 }), 1, 1, createMockHost({ panes: [] }))).toBeNull();
  });

  it('gives the anchors as the patch for a drawing in data space', () => {
    const line: Drawing = { id: 'l', kind: 'trend-line', anchors: [anchor(100, 100), anchor(200, 150)] };
    expect(nudgeDrawing(line, 1, 0, host)?.anchors).toHaveLength(2);
    expect(nudgeDrawing(line, 1, 0, createMockHost({ panes: [] }))).toBeNull();
  });

  it('duplicates one bar to the right and 10 px down, unlocked, under a new id', () => {
    register();
    const copy = duplicateDrawing({ ...legend({ x: 0.5, y: 0.5 }), locked: true }, 'copy', host);
    expect(copy).toMatchObject({ id: 'copy', kind: LEGEND, locked: false, options: { position: { x: 0.5125, y: 0.525 } } });
    expect(duplicateDrawing(legend(), 'copy', createMockHost({ panes: [] }))).toBeNull();
  });
});

describe('placing, moving, undoing and saving it with the tools', () => {
  const setup = (position?: { x: number; y: number }) => {
    register();
    return rig({ tools: [LEGEND] }, {}, position === undefined ? [] : [legend(position)]);
  };

  it('is placed where the pointer is, in the pane', () => {
    const { tools, store, click } = setup();
    tools.activate(LEGEND);
    click(200, 100);
    const [drawing] = store.list();
    expect(drawing).toMatchObject({ kind: LEGEND, options: { position: { x: 0.25, y: 0.25 } } });
    expect(tools.getScene().length).toBeGreaterThan(0);
  });

  it('is moved by dragging its body, in one history entry that undo and redo keep', () => {
    const { tools, store, click, drag } = setup({ x: 0.25, y: 0.25 });
    click(220, 100);
    expect(tools.getState().selection).toEqual(['lg']);
    drag([220, 100], [320, 150], [[270, 125]]);
    expect(store.get('lg')?.options).toEqual({ position: { x: 0.375, y: 0.375 } });
    expect(tools.undo()).toBe(true);
    expect(store.get('lg')?.options).toEqual({ position: { x: 0.25, y: 0.25 } });
    expect(tools.getState().canRedo).toBe(true);
    expect(tools.redo()).toBe(true);
    expect(store.get('lg')?.options).toEqual({ position: { x: 0.375, y: 0.375 } });
  });

  it('is moved by its handle', () => {
    const { store, click, drag } = setup({ x: 0.25, y: 0.25 });
    click(220, 100);
    drag([200, 100], [400, 200]);
    expect(store.get('lg')?.options).toEqual({ position: { x: 0.5, y: 0.5 } });
  });

  it('is nudged by the arrow keys', () => {
    const { host, store, click } = setup({ x: 0.5, y: 0.5 });
    click(420, 200);
    host.key('ArrowDown');
    expect(store.get('lg')?.options).toEqual({ position: { x: 0.5, y: 0.5025 } });
  });

  it('keeps its position through export and import, and its place when the viewport changes', () => {
    const { host, store, click, tools } = setup({ x: 0.25, y: 0.75 });
    const saved = JSON.parse(JSON.stringify(store.toJSON())) as unknown;
    const copy = new DrawingStore();
    expect(importDocument(copy, saved).skipped).toEqual([]);
    expect(copy.get('lg')?.options).toEqual({ position: { x: 0.25, y: 0.75 } });
    const before = tools.getScene();
    host.zoom(3, 50);
    host.scroll(400);
    click(900, 900);
    expect(JSON.stringify(tools.getScene())).toBe(JSON.stringify(before));
  });

  it('has no scene item without its pane, and is kept in the store', () => {
    register();
    const { tools, store } = rig({ tools: [LEGEND] }, { panes: [{ ...DEFAULT_MOCK_PANE, yAxisId: 'rsi' }] }, [legend({ x: 0.5, y: 0.5 })]);
    expect(tools.getScene()).toEqual([]);
    expect(store.list()).toHaveLength(1);
  });
});
