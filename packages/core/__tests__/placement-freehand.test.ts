import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../src/host';
import { clipSegment, FREEHAND_MAX_ANCHORS, FREEHAND_SAMPLE_PX, FREEHAND_TOLERANCE_PX, insideRect, simplifyIndices, simplifyPath, strokeIndices, strokeSteps } from '../src/interaction/freehand';
import { PLACEMENT_START, reducePlacement, type PlacementInput, type PlacementProgress } from '../src/interaction/placement';
import { anchorToPoint } from '../src/projection';
import { isFreehandKind, registerKind, type KindDefinition } from '../src/kinds';
import type { SceneItem } from '../src/scene/types';
import { DrawingStore } from '../src/store';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import type { Anchor, DrawingKind } from '../src/types';
import { A, record, rig } from './controller-rig';

// E12-F01-S05 (FR-TOOL-034): freehand placement. The kinds are made up for the test (the registry of this file only): a polyline
// through its anchors, with 2 to 512 anchors, 2 to 6 and 3 to 20.
const polyline = (id: string, min: number, max: number): KindDefinition => ({
  id: id as DrawingKind,
  anchors: { min, max },
  defaults: {},
  group: 'lines',
  placement: 'freehand',
  geometry: ({ points }) => points.slice(1).map((to, index) => ({ type: 'line', part: 'body', from: points[index] as Point, to })),
});
registerKind(polyline('sketch', 2, 512));
registerKind(polyline('scribble', 2, 6));
registerKind(polyline('longhand', 3, 20));
const SKETCH = 'sketch' as DrawingKind;
const SCRIBBLE = 'scribble' as DrawingKind;
const LONGHAND = 'longhand' as DrawingKind;

const P = (x: number, y: number): Point => ({ x, y });

/** Points are the same to nine digits: a point on an edge comes from a division. */
function expectPoints(actual: readonly Point[] | null | undefined, expected: readonly Point[]): void {
  expect(actual).toHaveLength(expected.length);
  for (const [index, point] of expected.entries()) {
    expect(actual?.[index]?.x).toBeCloseTo(point.x, 9);
    expect(actual?.[index]?.y).toBeCloseTo(point.y, 9);
  }
}

describe('the constants of a stroke', () => {
  it('sample every 3 px, simplify to 1 px and keep at most 512 anchors', () => {
    expect(FREEHAND_SAMPLE_PX).toBe(3);
    expect(FREEHAND_TOLERANCE_PX).toBe(1);
    expect(FREEHAND_MAX_ANCHORS).toBe(512);
  });
});

describe('simplifyIndices and simplifyPath (Ramer-Douglas-Peucker)', () => {
  it('keeps what is too short to simplify', () => {
    expect(simplifyIndices([], 1)).toEqual([]);
    expect(simplifyIndices([P(1, 1)], 1)).toEqual([0]);
    expect(simplifyIndices([P(1, 1), P(5, 5)], 1)).toEqual([0, 1]);
  });

  it('drops points on the line between the first and the last', () => {
    expect(simplifyIndices([P(0, 0), P(5, 0), P(10, 0), P(20, 0)], 1)).toEqual([0, 3]);
  });

  it('drops a point within the tolerance of the line and keeps one beyond it', () => {
    expect(simplifyIndices([P(0, 0), P(5, 1), P(10, 0)], 1)).toEqual([0, 2]);
    expect(simplifyIndices([P(0, 0), P(5, 1.01), P(10, 0)], 1)).toEqual([0, 1, 2]);
  });

  it('measures from the segment, not from the line through it', () => {
    // The point lies on the line through the first two points but past the end of the segment: 4 px from its end.
    expect(simplifyIndices([P(0, 0), P(10, 0), P(14, 0), P(10, 0.5)], 1)).toEqual([0, 2, 3]);
    // Before the start of the segment.
    expect(simplifyIndices([P(0, 0), P(-4, 0), P(10, 0), P(10, 5)], 1)).toEqual([0, 1, 2, 3]);
  });

  it('keeps the corners of a path, in order', () => {
    const path = [P(0, 0), P(10, 0), P(20, 0), P(20, 10), P(20, 20), P(30, 20)];
    expect(simplifyIndices(path, 1)).toEqual([0, 2, 4, 5]);
    expect(simplifyPath(path, 1)).toEqual([P(0, 0), P(20, 0), P(20, 20), P(30, 20)]);
  });

  it('handles a path that comes back to its start', () => {
    const loop = [P(0, 0), P(10, 0), P(10, 10), P(0, 10), P(0, 0)];
    expect(simplifyIndices(loop, 1)).toEqual([0, 1, 2, 3, 4]);
    // A path that ends where it began is measured from that point.
    expect(simplifyIndices([P(0, 0), P(0.5, 0.5), P(0, 0)], 1)).toEqual([0, 2]);
  });

  it('is exact for a tolerance of 0 and removes everything within a large one', () => {
    expect(simplifyIndices([P(0, 0), P(5, 0.001), P(10, 0)], 0)).toEqual([0, 1, 2]);
    expect(simplifyIndices([P(0, 0), P(5, 30), P(10, 0)], 100)).toEqual([0, 2]);
  });

  it('copes with a very long path without a deep recursion', () => {
    const path = Array.from({ length: 3000 }, (_, i) => P(i, i % 2 === 0 ? 0 : 5));
    expect(simplifyIndices(path, 1).length).toBeGreaterThan(2);
    const straight = Array.from({ length: 50000 }, (_, i) => P(i, 0));
    expect(simplifyIndices(straight, 1)).toEqual([0, 49999]);
  });
});

describe('strokeIndices', () => {
  // A zigzag 20 px high with a point every 3 px (the sampling distance): no point is within a pixel of a line between others.
  const zigzag = (count: number): Point[] => Array.from({ length: count }, (_, i) => P(i * FREEHAND_SAMPLE_PX, i % 2 === 0 ? 0 : 20));

  it('simplifies within 1 px', () => {
    expect(strokeIndices([P(0, 0), P(5, 0.9), P(10, 0)])).toEqual([0, 2]);
    expect(strokeIndices([P(0, 0), P(5, 1.5), P(10, 0)])).toEqual([0, 1, 2]);
  });

  it('keeps at most 512 points, the first and the last among them, by simplifying more', () => {
    const path = zigzag(2000);
    expect(simplifyIndices(path, 1)).toHaveLength(2000);
    const kept = strokeIndices(path);
    expect(kept.length).toBeLessThanOrEqual(512);
    expect(kept.length).toBeGreaterThanOrEqual(2);
    expect(kept[0]).toBe(0);
    expect(kept[kept.length - 1]).toBe(1999);
    expect([...kept].sort((a, b) => a - b)).toEqual(kept);
  });

  it('keeps all of 512 points but not 513', () => {
    expect(strokeIndices(zigzag(512))).toHaveLength(512);
    expect(strokeIndices(zigzag(513)).length).toBeLessThanOrEqual(512);
    expect(strokeIndices(zigzag(513)).length).toBeLessThan(513);
  });

  it('keeps at most the number asked for, but never more than 512 and never fewer than 2', () => {
    const path = zigzag(300);
    expect(strokeIndices(path, 6).length).toBeLessThanOrEqual(6);
    expect(strokeIndices(path, 1000)).toHaveLength(300);
    expect(strokeIndices(zigzag(2000), 1000).length).toBeLessThanOrEqual(512);
    expect(strokeIndices(path, 1)).toHaveLength(2);
    expect(strokeIndices(path, 0)).toHaveLength(2);
  });

  it('is the points of the path when it has fewer than the limit and nothing to simplify', () => {
    expect(strokeIndices([P(0, 0), P(10, 10)], 2)).toEqual([0, 1]);
  });
});

describe('clipSegment and insideRect', () => {
  const rect: Rect = { x: 10, y: 20, width: 100, height: 50 };

  it('has the edges of the rectangle inside', () => {
    for (const p of [P(10, 20), P(110, 20), P(10, 70), P(110, 70), P(60, 45)]) expect(insideRect(rect, p)).toBe(true);
    for (const p of [P(9.9, 45), P(110.1, 45), P(60, 19.9), P(60, 70.1)]) expect(insideRect(rect, p)).toBe(false);
  });

  const clip = (from: Point, to: Point): Point[] | null => {
    const result = clipSegment(rect, from, to);
    return result === null ? null : [result.enter, result.leave];
  };

  it('is the whole segment when it is inside', () => {
    expectPoints(clip(P(20, 30), P(100, 60)), [P(20, 30), P(100, 60)]);
  });

  it('is where a segment crosses an edge, on either side', () => {
    expectPoints(clip(P(100, 45), P(210, 45)), [P(100, 45), P(110, 45)]);
    expectPoints(clip(P(-90, 45), P(20, 45)), [P(10, 45), P(20, 45)]);
    expectPoints(clip(P(60, 30), P(60, -70)), [P(60, 30), P(60, 20)]);
    expectPoints(clip(P(60, 170), P(60, 60)), [P(60, 70), P(60, 60)]);
  });

  it('is the part inside of a segment that passes through, and of a slanted one', () => {
    expectPoints(clip(P(0, 45), P(200, 45)), [P(10, 45), P(110, 45)]);
    expectPoints(clip(P(0, 0), P(120, 80)), [P(30, 20), P(105, 70)]);
  });

  it('is null when no part of the segment is inside', () => {
    expect(clipSegment(rect, P(0, 0), P(5, 100))).toBeNull();
    expect(clipSegment(rect, P(120, 0), P(200, 100))).toBeNull();
    expect(clipSegment(rect, P(0, 10), P(200, 10))).toBeNull();
    expect(clipSegment(rect, P(60, 80), P(60, 200))).toBeNull();
    expect(clipSegment(rect, P(0, 0), P(100, 18))).toBeNull();
  });

  it('is a point for a segment that is one, inside or outside', () => {
    expect(clipSegment(rect, P(50, 50), P(50, 50))).toEqual({ enter: P(50, 50), leave: P(50, 50) });
    expect(clipSegment(rect, P(5, 50), P(5, 50))).toBeNull();
  });

  it('touches the pane at a corner', () => {
    expectPoints(clip(P(0, 10), P(20, 30)), [P(10, 20), P(20, 30)]);
    expectPoints(clip(P(0, 10), P(10, 20)), [P(10, 20), P(10, 20)]);
  });
});

describe('strokeSteps', () => {
  const rect: Rect = { x: 0, y: 0, width: 100, height: 100 };

  it('is the point itself while the pointer stays inside', () => {
    expect(strokeSteps(rect, P(10, 10), P(20, 30))).toEqual([P(20, 30)]);
  });

  it('is where the pointer leaves when it goes out, and nothing more while it is out', () => {
    expectPoints(strokeSteps(rect, P(90, 50), P(120, 50)), [P(100, 50)]);
    expect(strokeSteps(rect, P(120, 50), P(150, 50))).toEqual([]);
    expect(strokeSteps(rect, P(120, 120), P(150, 150))).toEqual([]);
  });

  it('is where the pointer comes back and then the point', () => {
    expectPoints(strokeSteps(rect, P(150, 50), P(80, 50)), [P(100, 50), P(80, 50)]);
  });

  it('is the part that crosses the pane when both ends are outside', () => {
    expectPoints(strokeSteps(rect, P(-10, 50), P(110, 50)), [P(0, 50), P(100, 50)]);
  });
});

describe('the placement of a freehand tool', () => {
  const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, { yAxisId: 'volume', top: 400, height: 100, min: 0, max: 1000 }] });
  const press = (x: number, y: number, button = 0): PlacementInput => ({ type: 'drag-start', origin: P(x, y), button });
  const drag = (x: number, y: number): PlacementInput => ({ type: 'drag', point: P(x, y) });
  const release = (x: number, y: number): PlacementInput => ({ type: 'drag-end', point: P(x, y) });
  const click = (x: number, y: number, button = 0): PlacementInput => ({ type: 'click', point: P(x, y), button });
  const pixels = (anchors: readonly Anchor[]): Point[] => anchors.map((anchor) => anchorToPoint(anchor, host));

  function run(tool: DrawingKind, inputs: readonly PlacementInput[], from: PlacementProgress = PLACEMENT_START) {
    let progress = from;
    let anchors: readonly Anchor[] | null = null;
    let ignored = false;
    for (const input of inputs) {
      const result = reducePlacement(tool, progress, input, host);
      progress = result.progress;
      anchors = result.anchors;
      ignored = result.ignored;
    }
    return { progress, anchors, ignored };
  }
  const more = (progress: PlacementProgress): readonly Anchor[] => (progress.type === 'anchored' ? progress.more : []);

  it('is a freehand kind by its registration only', () => {
    expect(isFreehandKind('sketch')).toBe(true);
    expect(isFreehandKind('trend-line')).toBe(false);
    expect(isFreehandKind('unknown-kind')).toBe(false);
  });

  it('starts a stroke on a press, not on a click', () => {
    expect(run(SKETCH, [press(100, 200)]).progress).toEqual({ type: 'anchored', first: A(100, 200), more: [], pointer: A(100, 200), dragging: true });
    const clicked = reducePlacement(SKETCH, PLACEMENT_START, click(100, 200), host);
    expect(clicked).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: true });
    expect(clicked.progress).toBe(PLACEMENT_START);
  });

  it('does not start on another button or outside every pane, and ignores what is not a press', () => {
    for (const input of [press(100, 200, 2), press(100, 550), press(900, 200), drag(100, 200), release(100, 200), { type: 'finish' } as const, { type: 'remove-anchor' } as const]) {
      const result = reducePlacement(SKETCH, PLACEMENT_START, input, host);
      expect(result).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: true });
    }
  });

  it('does not snap its first point to a bar, even with a magnet', () => {
    const result = reducePlacement(SKETCH, PLACEMENT_START, press(103, 205), host, 'strong');
    const first = result.progress.type === 'anchored' ? result.progress.first : null;
    expect(first?.time).toBe(618000);
    expect(first?.yAxisId).toBe('price');
    expect(first?.price).toBeCloseTo(97.5, 9);
  });

  it('takes a point only when the pointer is at least 3 px from the last one', () => {
    let { progress } = run(SKETCH, [press(100, 200)]);
    progress = run(SKETCH, [drag(101, 200), drag(102, 200), drag(102.9, 200)], progress).progress;
    expect(more(progress)).toEqual([]);
    progress = run(SKETCH, [drag(103, 200)], progress).progress;
    expect(more(progress)).toEqual([A(103, 200)]);
    // Measured from the last point taken, not from the last move, and as a distance, not per axis.
    progress = run(SKETCH, [drag(104, 200), drag(105, 200), drag(105.9, 200)], progress).progress;
    expect(more(progress)).toEqual([A(103, 200)]);
    progress = run(SKETCH, [drag(106, 200)], progress).progress;
    expect(more(progress)).toEqual([A(103, 200), A(106, 200)]);
    progress = run(SKETCH, [drag(108, 202)], progress).progress;
    expect(more(progress)).toHaveLength(2);
    progress = run(SKETCH, [drag(108, 203)], progress).progress;
    expect(more(progress)).toHaveLength(3);
  });

  it('follows the pointer with the preview, also where no point is taken', () => {
    const { progress } = run(SKETCH, [press(100, 200), drag(101, 200)]);
    expect(progress).toMatchObject({ first: A(100, 200), more: [], pointer: A(101, 200), dragging: true });
  });

  it('takes a move without a press held too', () => {
    const { progress } = run(SKETCH, [press(100, 200), { type: 'move', point: P(150, 200) }]);
    expect(more(progress)).toEqual([A(150, 200)]);
  });

  it('completes on release with the stroke simplified to 1 px', () => {
    const { progress, anchors } = run(SKETCH, [press(100, 300), drag(150, 300), drag(200, 300), drag(200, 250), release(200, 200)]);
    expect(progress).toBe(PLACEMENT_START);
    expect(anchors).toEqual([A(100, 300), A(200, 300), A(200, 200)]);
  });

  it('keeps a bend that is more than a pixel off the line and drops one that is a pixel or less', () => {
    expect(run(SKETCH, [press(100, 300), drag(150, 298), release(200, 300)]).anchors).toEqual([A(100, 300), A(150, 298), A(200, 300)]);
    expect(run(SKETCH, [press(100, 300), drag(150, 299), release(200, 300)]).anchors).toEqual([A(100, 300), A(200, 300)]);
  });

  it('adds the end of the stroke when it is more than a pixel from the last point, and not when it is not', () => {
    const base = [press(100, 200), drag(110, 200), drag(110, 215)];
    expect(run(SKETCH, [...base, release(110, 217)]).anchors).toEqual([A(100, 200), A(110, 200), A(110, 217)]);
    expect(run(SKETCH, [...base, release(110, 216)]).anchors).toEqual([A(100, 200), A(110, 200), A(110, 215)]);
    expect(run(SKETCH, [...base, release(110, 215)]).anchors).toEqual([A(100, 200), A(110, 200), A(110, 215)]);
  });

  it('creates nothing from a stroke of fewer than two points, and starts over', () => {
    for (const inputs of [
      [press(100, 200), release(100, 200)],
      [press(100, 200), release(100.5, 200)],
      [press(100, 200), drag(101, 200), release(101, 200)],
    ]) {
      const { progress, anchors, ignored } = run(SKETCH, inputs);
      expect(anchors).toBeNull();
      expect(ignored).toBe(false);
      expect(progress).toBe(PLACEMENT_START);
    }
  });

  it('creates nothing from a stroke with fewer anchors than the kind needs', () => {
    expect(run(LONGHAND, [press(100, 200), drag(150, 200), release(200, 250)]).anchors).toHaveLength(3);
    const two = run(LONGHAND, [press(100, 200), release(200, 250)]);
    expect(two.anchors).toBeNull();
    expect(two.progress).toBe(PLACEMENT_START);
  });

  it('keeps at most the most anchors of the kind', () => {
    const wave: PlacementInput[] = Array.from({ length: 200 }, (_, i) => drag(100 + i * 2, 200 + 30 * Math.sin(i / 4)));
    const { anchors } = run(SCRIBBLE, [press(100, 200), ...wave, release(520, 200)]);
    expect(anchors?.length).toBeGreaterThanOrEqual(2);
    expect(anchors?.length).toBeLessThanOrEqual(6);
    expect(anchors?.[0]).toEqual(A(100, 200));
    expect(anchors?.[anchors.length - 1]).toEqual(A(520, 200));
  });

  it('keeps at most 512 anchors, however many the stroke has', () => {
    const zigzag: PlacementInput[] = Array.from({ length: 1500 }, (_, i) => drag(100 + i * 0.4, i % 2 === 0 ? 180 : 220));
    const { anchors } = run(SKETCH, [press(100, 200), ...zigzag, release(700, 200)]);
    expect(anchors?.length).toBeLessThanOrEqual(512);
    expect(anchors?.length).toBeGreaterThanOrEqual(2);
    expect(anchors?.[0]).toEqual(A(100, 200));
    expect(anchors?.[anchors.length - 1]).toEqual(A(700, 200));
  });

  it('keeps the y-axis of the first point for every point, also over another pane', () => {
    const { anchors } = run(SKETCH, [press(100, 380), drag(150, 395), drag(200, 450), drag(250, 450), release(300, 390)]);
    expect(anchors?.every((anchor) => anchor.yAxisId === 'price')).toBe(true);
  });

  it('is clipped at the edge of the pane: the points inside stay and the stroke reaches the edge', () => {
    // Leaves at the bottom of the price pane (y 400) and comes back.
    const { anchors } = run(SKETCH, [press(100, 300), drag(150, 350), drag(200, 450), drag(250, 450), drag(300, 450), drag(350, 350), release(400, 300)]);
    expect(anchors).not.toBeNull();
    for (const point of pixels(anchors as Anchor[])) {
      expect(point.y).toBeLessThanOrEqual(400 + 1e-6);
      expect(point.y).toBeGreaterThanOrEqual(-1e-6);
    }
    const ys = pixels(anchors as Anchor[]).map((point) => Math.round(point.y * 1e6) / 1e6);
    expect(ys.filter((y) => y === 400)).toHaveLength(2);
    expect(ys[0]).toBe(300);
    expect(ys[ys.length - 1]).toBe(300);
  });

  it('is clipped at the side of the pane too', () => {
    const { anchors } = run(SKETCH, [press(700, 200), drag(750, 200), drag(850, 220), drag(900, 240), release(790, 240)]);
    for (const point of pixels(anchors as Anchor[])) expect(point.x).toBeLessThanOrEqual(800 + 1e-6);
    expect(pixels(anchors as Anchor[]).some((point) => Math.abs(point.x - 800) < 1e-6)).toBe(true);
  });

  it('creates nothing for a stroke that leaves the pane at once and stays out', () => {
    // The point where it leaves the pane is 1 px from the start: not a new point, so the stroke has one.
    const { anchors, progress } = run(SKETCH, [press(100, 399), drag(100, 450), drag(150, 480), release(200, 490)]);
    expect(progress).toBe(PLACEMENT_START);
    expect(anchors).toBeNull();
  });

  it('starts over on a cancel, and ignores a click, a second press, a finish and a taken-back anchor during the stroke', () => {
    const { progress } = run(SKETCH, [press(100, 200), drag(150, 200)]);
    expect(reducePlacement(SKETCH, progress, { type: 'cancel' }, host)).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: false });
    for (const input of [click(300, 300), press(300, 300), { type: 'finish' } as const, { type: 'remove-anchor' } as const]) {
      const result = reducePlacement(SKETCH, progress, input, host);
      expect(result).toEqual({ progress, anchors: null, ignored: true });
      expect(result.progress).toBe(progress);
    }
  });

  it('is cancelled by a release when the pane has gone', () => {
    const { progress } = run(SKETCH, [press(100, 200), drag(150, 200)]);
    const lost = createMockHost({ panes: [{ yAxisId: 'other', top: 0, height: 400, min: 0, max: 200 }] });
    expect(reducePlacement(SKETCH, progress, release(200, 200), lost)).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: false });
    expect(reducePlacement(SKETCH, progress, drag(200, 200), lost)).toEqual({ progress, anchors: null, ignored: true });
  });
});

/** The points of the polyline of the placement preview, or null without one. */
function previewPoints(items: readonly SceneItem[]): Point[] | null {
  for (const item of items) {
    if (item.type !== 'preview') continue;
    const points: Point[] = [];
    for (const shape of item.shapes) {
      if (shape.type !== 'line') continue;
      if (points.length === 0) points.push(shape.from);
      points.push(shape.to);
    }
    return points;
  }
  return null;
}

describe('drawing a stroke through the controller', () => {
  const setup = (options: { stayInTool?: boolean; magnet?: 'strong' | 'off' } = {}) => rig({ tools: [SKETCH, LONGHAND], store: new DrawingStore(), ...options });
  const stroke: [number, number][] = [
    [150, 300],
    [200, 300],
  ];

  it('creates one drawing on release, with one history entry', () => {
    const { tools, drag, store } = setup();
    let changes = 0;
    store.subscribe(() => changes++);
    tools.activate(SKETCH);
    drag([100, 300], [200, 250], stroke);
    expect(changes).toBe(1);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({ kind: 'sketch', anchors: [A(100, 300), A(200, 300), A(200, 250)] });
    expect(tools.getState().selection).toEqual(['d1']);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it.each(['touch', 'pen'] as const)('works with %s too', (pointerType) => {
    const { host, tools, store } = setup();
    tools.activate(SKETCH);
    host.pointer('down', 100, 300, { pointerType });
    for (const [x, y] of stroke) host.pointer('move', x, y, { pointerType });
    host.pointer('move', 200, 250, { pointerType });
    host.pointer('up', 200, 250, { pointerType });
    expect(store.list()[0]?.anchors).toEqual([A(100, 300), A(200, 300), A(200, 250)]);
  });

  it('shows the stroke so far in the preview', () => {
    const { host, tools } = setup();
    tools.activate(SKETCH);
    expect(previewPoints(tools.getScene())).toBeNull();
    host.pointer('down', 100, 300);
    host.pointer('move', 150, 300);
    host.pointer('move', 200, 280);
    expectPoints(previewPoints(tools.getScene()), [P(100, 300), P(150, 300), P(200, 280), P(200, 280)]);
  });

  it('creates nothing from a click, and stays in the tool', () => {
    const { tools, click, store } = setup();
    tools.activate(SKETCH);
    click(100, 300);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBe('sketch');
    expect(previewPoints(tools.getScene())).toBeNull();
  });

  it('creates nothing from a stroke that is too short, and stays in the tool', () => {
    const { host, tools, store } = setup();
    tools.activate(SKETCH);
    host.pointer('down', 100, 300);
    host.pointer('move', 100.5, 300);
    host.pointer('up', 101, 300);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBe('sketch');
  });

  it('is cancelled by Escape without a store change, and the release after it does nothing', () => {
    const { host, tools, store } = setup();
    let changes = 0;
    store.subscribe(() => changes++);
    tools.activate(SKETCH);
    host.pointer('down', 100, 300);
    host.pointer('move', 150, 300);
    host.key('Escape');
    host.pointer('move', 200, 300);
    host.pointer('up', 200, 300);
    expect(changes).toBe(0);
    expect(previewPoints(tools.getScene())).toBeNull();
  });

  it('is not changed by Enter or Backspace while it is drawn', () => {
    const { host, tools, store } = setup();
    tools.activate(SKETCH);
    host.pointer('down', 100, 300);
    host.pointer('move', 150, 300);
    host.key('Enter');
    host.key('Backspace');
    host.pointer('move', 200, 300);
    host.pointer('up', 200, 250);
    expect(store.list()[0]?.anchors).toEqual([A(100, 300), A(200, 300), A(200, 250)]);
  });

  it('does not snap, with the magnet on', () => {
    const { drag, tools, store } = setup({ magnet: 'strong' });
    tools.activate(SKETCH);
    drag([100, 300], [200, 250], stroke);
    expect(store.list()[0]?.anchors).toEqual([A(100, 300), A(200, 300), A(200, 250)]);
    expect(tools.getScene().every((item) => item.type !== 'preview')).toBe(true);
  });

  it('says only that the drawing is placed', () => {
    const { drag, tools } = setup();
    const said = record(tools, 'announce');
    tools.activate(SKETCH);
    drag([100, 300], [200, 250], stroke);
    expect(said).toEqual(['sketch placed']);
  });

  it('draws again with stayInTool', () => {
    const { drag, tools, store } = setup({ stayInTool: true });
    tools.activate(SKETCH);
    drag([100, 300], [200, 250], stroke);
    drag(
      [300, 300],
      [400, 250],
      [
        [350, 300],
        [400, 300],
      ]
    );
    expect(store.list()).toHaveLength(2);
    expect(tools.getState().activeTool).toBe('sketch');
  });

  it('is clipped at the edge of the pane', () => {
    const { drag, tools, store } = setup();
    tools.activate(SKETCH);
    drag(
      [700, 200],
      [790, 240],
      [
        [750, 200],
        [850, 220],
        [900, 240],
      ]
    );
    const anchors = store.list()[0]?.anchors ?? [];
    expect(anchors.length).toBeGreaterThan(2);
    for (const anchor of anchors) expect(anchor.time).toBeLessThanOrEqual(800 * 6000 + 1e-3);
  });

  it('creates nothing for a stroke with fewer anchors than the kind needs', () => {
    const { host, tools, store } = setup();
    tools.activate(LONGHAND);
    host.pointer('down', 100, 300);
    host.pointer('move', 200, 300);
    host.pointer('up', 200, 300);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBe('longhand');
  });
});
