import { describe, expect, it } from 'vitest';
import type { DrawingHost, Point } from '../src/host';
import { ANCHOR_COUNT, DRAWING_KINDS } from '../src/kinds';
import { PLACEMENT_START, placementPreview, reducePlacement, ZERO_LENGTH_PX, type PlacementInput, type PlacementProgress, type PlacementResult } from '../src/interaction/placement';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import type { Anchor, DrawingKind } from '../src/types';

// Two panes: `price` (y 0 to 400, prices 0 to 200) and `volume` (y 400 to 500, volumes 0 to 1000);
// below y = 500 is outside every pane. Time is x * 6000.
const host: DrawingHost = createMockHost({ panes: [DEFAULT_MOCK_PANE, { yAxisId: 'volume', top: 400, height: 100, min: 0, max: 1000 }] });
const P = (x: number, y: number): Point => ({ x, y });
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const V = (x: number, y: number): Anchor => ({ time: x * 6000, price: 1000 - (y - 400) * 10, yAxisId: 'volume' });

const ONE: DrawingKind[] = DRAWING_KINDS.filter((kind) => ANCHOR_COUNT[kind] === 1);
const TWO: DrawingKind[] = DRAWING_KINDS.filter((kind) => ANCHOR_COUNT[kind] === 2);

const anchored = (first: Anchor, pointer: Anchor = first, dragging = false): PlacementProgress => ({ type: 'anchored', first, pointer, dragging });
const click = (x: number, y: number, button = 0): PlacementInput => ({ type: 'click', point: P(x, y), button });
const dragStart = (x: number, y: number, button = 0): PlacementInput => ({ type: 'drag-start', origin: P(x, y), button });
const move = (x: number, y: number): PlacementInput => ({ type: 'move', point: P(x, y) });
const drag = (x: number, y: number): PlacementInput => ({ type: 'drag', point: P(x, y) });
const dragEnd = (x: number, y: number): PlacementInput => ({ type: 'drag-end', point: P(x, y) });

function expectIgnored(tool: DrawingKind, progress: PlacementProgress, input: PlacementInput): void {
  const result = reducePlacement(tool, progress, input, host);
  expect(result.ignored).toBe(true);
  expect(result.anchors).toBeNull();
  expect(result.progress).toBe(progress);
}

const placed = (result: PlacementResult): readonly Anchor[] | null => result.anchors;

describe('the start progress', () => {
  it('is waiting and cannot be changed', () => {
    expect(PLACEMENT_START).toEqual({ type: 'waiting' });
    expect(Object.isFrozen(PLACEMENT_START)).toBe(true);
  });

  it('treats anchors closer than one pixel as one point', () => {
    expect(ZERO_LENGTH_PX).toBe(1);
  });
});

describe.each(ONE)('%s, a one-anchor tool (FR-INT-010)', (tool) => {
  it('places on a left click inside a pane and stays waiting', () => {
    const result = reducePlacement(tool, PLACEMENT_START, click(200, 100), host);
    expect(result).toEqual({ progress: PLACEMENT_START, anchors: [A(200, 100)], ignored: false });
    expect(result.progress).toBe(PLACEMENT_START);
  });

  it('places in the pane under the pointer', () => {
    expect(placed(reducePlacement(tool, PLACEMENT_START, click(200, 450), host))).toEqual([V(200, 450)]);
  });

  it('does nothing for a click outside every pane or with another button', () => {
    expectIgnored(tool, PLACEMENT_START, click(200, 550));
    expectIgnored(tool, PLACEMENT_START, click(200, 100, 1));
    expectIgnored(tool, PLACEMENT_START, click(200, 100, 2));
  });

  it('does not start a drag and ignores the rest', () => {
    for (const input of [dragStart(200, 100), move(200, 100), drag(200, 100), dragEnd(200, 100), { type: 'cancel' } as const]) expectIgnored(tool, PLACEMENT_START, input);
  });
});

describe.each(TWO)('%s, a two-anchor tool (FR-INT-011)', (tool) => {
  it('takes the first anchor on a left click and shows it as the preview', () => {
    const result = reducePlacement(tool, PLACEMENT_START, click(100, 100), host);
    expect(result).toEqual({ progress: anchored(A(100, 100)), anchors: null, ignored: false });
  });

  it('does nothing for a first click outside every pane or with another button', () => {
    expectIgnored(tool, PLACEMENT_START, click(100, 550));
    expectIgnored(tool, PLACEMENT_START, click(100, 100, 1));
    expectIgnored(tool, PLACEMENT_START, click(100, 100, 2));
  });

  it('starts a drag on a primary press inside a pane', () => {
    expect(reducePlacement(tool, PLACEMENT_START, dragStart(100, 100), host)).toEqual({ progress: anchored(A(100, 100), A(100, 100), true), anchors: null, ignored: false });
  });

  it('does not start a drag outside every pane or with another button', () => {
    expectIgnored(tool, PLACEMENT_START, dragStart(100, 550));
    expectIgnored(tool, PLACEMENT_START, dragStart(100, 100, 2));
    expectIgnored(tool, PLACEMENT_START, dragStart(100, 100, 1));
  });

  it('ignores a pointer that moves before the first anchor and the rest', () => {
    for (const input of [move(100, 100), drag(100, 100), dragEnd(100, 100), { type: 'cancel' } as const]) expectIgnored(tool, PLACEMENT_START, input);
  });
});

describe('click-click placement', () => {
  const first = A(100, 100);

  it('moves the preview with the pointer and keeps the mode', () => {
    expect(reducePlacement('trend-line', anchored(first), move(300, 150), host)).toEqual({ progress: anchored(first, A(300, 150), false), anchors: null, ignored: false });
    expect(reducePlacement('trend-line', anchored(first, A(300, 150)), move(250, 60), host).progress).toEqual(anchored(first, A(250, 60), false));
  });

  it('creates the drawing from the first anchor and the second click, and starts over', () => {
    const result = reducePlacement('trend-line', anchored(first, A(300, 150)), click(320, 160), host);
    expect(result).toEqual({ progress: PLACEMENT_START, anchors: [first, A(320, 160)], ignored: false });
    expect(result.progress).toBe(PLACEMENT_START);
  });

  it('ignores a click with another button', () => {
    expectIgnored('trend-line', anchored(first), click(300, 150, 1));
    expectIgnored('trend-line', anchored(first), click(300, 150, 2));
  });

  it('completes on a release after the pointer was pressed at the second anchor', () => {
    const pressed = reducePlacement('trend-line', anchored(first, A(300, 150)), dragStart(300, 150), host);
    expect(pressed).toEqual({ progress: anchored(first, A(300, 150), true), anchors: null, ignored: false });
    expect(placed(reducePlacement('trend-line', pressed.progress, dragEnd(310, 160), host))).toEqual([first, A(310, 160)]);
  });

  it('ignores a second press while one is held and a press with another button', () => {
    expectIgnored('trend-line', anchored(first, first, true), dragStart(300, 150));
    expectIgnored('trend-line', anchored(first), dragStart(300, 150, 2));
    expectIgnored('trend-line', anchored(first), dragStart(300, 150, 1));
  });

  it('starts over on a pointer cancel', () => {
    expect(reducePlacement('trend-line', anchored(first, A(300, 150)), { type: 'cancel' }, host)).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: false });
  });
});

describe('drag placement', () => {
  const first = A(100, 100);

  it('follows the pointer while it is held and keeps the mode', () => {
    expect(reducePlacement('rectangle', anchored(first, first, true), drag(200, 120), host)).toEqual({ progress: anchored(first, A(200, 120), true), anchors: null, ignored: false });
  });

  it('creates the drawing where the pointer is released', () => {
    const result = reducePlacement('rectangle', anchored(first, A(200, 120), true), dragEnd(300, 150), host);
    expect(result).toEqual({ progress: PLACEMENT_START, anchors: [first, A(300, 150)], ignored: false });
    expect(result.progress).toBe(PLACEMENT_START);
  });

  it('creates nothing and starts over when released at the first anchor', () => {
    const result = reducePlacement('rectangle', anchored(first, A(200, 120), true), dragEnd(100, 100), host);
    expect(result).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: false });
  });
});

describe('the second anchor is on the first anchor y-axis (FR-INT-012)', () => {
  const first = A(100, 100);

  it('projects the preview and the second anchor from another pane onto the price axis', () => {
    const over = reducePlacement('trend-line', anchored(first), move(300, 450), host);
    expect(over.progress).toEqual(anchored(first, { time: 300 * 6000, price: -25, yAxisId: 'price' }));
    expect(placed(reducePlacement('trend-line', anchored(first), click(300, 450), host))).toEqual([first, { time: 300 * 6000, price: -25, yAxisId: 'price' }]);
  });

  it('projects from outside every pane and onto the volume axis', () => {
    expect(placed(reducePlacement('trend-line', anchored(first), click(300, 550), host))).toEqual([first, { time: 300 * 6000, price: -75, yAxisId: 'price' }]);
    const volume = V(100, 450);
    expect(placed(reducePlacement('rectangle', anchored(volume), click(300, 200), host))).toEqual([volume, { time: 300 * 6000, price: 1000 - (200 - 400) * 10, yAxisId: 'volume' }]);
  });

  it('ignores the pointer when the first anchor pane is gone', () => {
    const lost: Anchor = { time: 0, price: 1, yAxisId: 'gone' };
    for (const input of [move(300, 150), drag(300, 150), click(300, 150), dragEnd(300, 150)])
      expectIgnored('trend-line', anchored(lost, lost, input.type === 'drag' || input.type === 'drag-end'), input);
  });
});

describe('outside every pane is decided by yAxisAt alone', () => {
  // A host that still has a pane rectangle for any axis id, as a lazy implementation might.
  const lenient: DrawingHost = { ...host, yAxisAt: () => null, paneRect: () => ({ x: 0, y: 0, width: 800, height: 400 }) };

  it.each([
    ['a one-anchor tool', 'horizontal-line', click(200, 100)],
    ['a two-anchor tool', 'trend-line', click(200, 100)],
    ['a press of a two-anchor tool', 'trend-line', dragStart(200, 100)],
  ] as const)('does not place for %s', (_name, tool, input) => {
    const result = reducePlacement(tool, PLACEMENT_START, input, lenient);
    expect(result).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: true });
  });
});

describe('zero-length drawings are not created', () => {
  const first = A(100, 100);
  const near: ReadonlyArray<readonly [number, number]> = [
    [100, 100],
    [101, 100],
    [99, 100],
    [100, 101],
    [100, 99],
    [101, 101],
    [99, 99],
    [100.5, 99.5],
  ];
  const apart: ReadonlyArray<readonly [number, number]> = [
    [101.1, 100],
    [98.9, 100],
    [100, 101.1],
    [100, 98.9],
    [101.1, 101],
    [101, 101.1],
    [105, 100],
    [100, 105],
  ];

  it.each(near)('a second click at (%s, %s) is ignored and waits for another', (x, y) => {
    expectIgnored('trend-line', anchored(first), click(x, y));
  });

  it.each(near)('a release at (%s, %s) starts over without a drawing', (x, y) => {
    expect(reducePlacement('trend-line', anchored(first, A(200, 100), true), dragEnd(x, y), host)).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: false });
  });

  it.each(apart)('a second click at (%s, %s) creates the drawing', (x, y) => {
    expect(placed(reducePlacement('trend-line', anchored(first), click(x, y), host))).toHaveLength(2);
  });

  it.each(apart)('a release at (%s, %s) creates the drawing', (x, y) => {
    expect(placed(reducePlacement('trend-line', anchored(first, first, true), dragEnd(x, y), host))).toHaveLength(2);
  });

  it('measures in pixels, so the same distance on a stretched axis is not zero length', () => {
    const volume = V(100, 450);
    // One pixel on the volume axis is 10 volume units: 4 px apart in y is not within one pixel.
    expect(placed(reducePlacement('trend-line', anchored(volume), click(100, 454), host))).toHaveLength(2);
    expectIgnored('trend-line', anchored(volume), click(100, 451));
  });
});

describe('placementPreview', () => {
  it('is nothing until the first anchor is set', () => {
    expect(placementPreview('trend-line', PLACEMENT_START, 'p')).toBeNull();
  });

  it('is the tool with the first anchor and the anchor under the pointer', () => {
    const first = A(100, 100);
    expect(placementPreview('rectangle', anchored(first, A(300, 150)), 'p')).toEqual({ id: 'p', kind: 'rectangle', anchors: [first, A(300, 150)] });
  });
});
