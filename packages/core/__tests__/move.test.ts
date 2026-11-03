import { describe, expect, it } from 'vitest';
import type { DrawingHost, Point } from '../src/host';
import { constrainAngle, constrainMove, dragHandle, KEYBOARD_CURSOR_INSET_PX, keyboardCursorStart, moveDrawings, moveKeyboardCursor, nudgeAnchors, SHIFT_STEP_FACTOR } from '../src/interaction/move';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import type { Anchor, Drawing, DrawingKind } from '../src/types';

// Two panes: `price` (y 0 to 400, prices 0 to 200) and `volume` (y 400 to 500, volumes 0 to 1000).
// Time is x * 6000. A price pane pixel is half a price, a volume pane pixel is 10 volume.
const VOLUME = { yAxisId: 'volume', top: 400, height: 100, min: 0, max: 1000 };
const host: DrawingHost = createMockHost({ panes: [DEFAULT_MOCK_PANE, VOLUME] });
const P = (x: number, y: number): Point => ({ x, y });
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const V = (x: number, price: number): Anchor => ({ time: x * 6000, price, yAxisId: 'volume' });
const GONE: Anchor = { time: 0, price: 1, yAxisId: 'gone' };
const drawing = (kind: DrawingKind, ...anchors: Anchor[]): Drawing => ({ id: 'd', kind, anchors });

function expectAnchors(actual: readonly Anchor[] | null, expected: readonly Anchor[]): void {
  expect(actual).not.toBeNull();
  expect(actual).toHaveLength(expected.length);
  expected.forEach((anchor, index) => {
    expect(actual?.[index]?.time).toBeCloseTo(anchor.time, 6);
    expect(actual?.[index]?.price).toBeCloseTo(anchor.price, 9);
    expect(actual?.[index]?.yAxisId).toBe(anchor.yAxisId);
  });
}

// The pointer goes from (100, 100) to (120, 130): 20 px right (120 000 ms), 30 px down (15 price down on the price pane).
const FROM = P(100, 100);
const TO = P(120, 130);
const LATER = 20 * 6000;

describe('constrainMove (FR-INT-031)', () => {
  it('keeps the larger delta and drops the other', () => {
    expect(constrainMove(P(10, 10), P(50, 20))).toEqual(P(50, 10));
    expect(constrainMove(P(10, 10), P(-30, 5))).toEqual(P(-30, 10));
    expect(constrainMove(P(10, 10), P(20, 60))).toEqual(P(10, 60));
    expect(constrainMove(P(10, 10), P(5, -40))).toEqual(P(10, -40));
  });

  it('moves horizontally when the deltas are equal, and stays put without a move', () => {
    expect(constrainMove(P(10, 10), P(30, 30))).toEqual(P(30, 10));
    expect(constrainMove(P(10, 10), P(-10, 30))).toEqual(P(-10, 10));
    expect(constrainMove(P(10, 10), P(10, 10))).toEqual(P(10, 10));
  });
});

describe('constrainAngle (FR-INT-031)', () => {
  const fixed = P(100, 100);
  const UNITS = [P(1, 0), P(Math.SQRT1_2, Math.SQRT1_2), P(0, 1), P(-Math.SQRT1_2, Math.SQRT1_2), P(-1, 0), P(-Math.SQRT1_2, -Math.SQRT1_2), P(0, -1), P(Math.SQRT1_2, -Math.SQRT1_2)];
  const at = (degrees: number, length: number): Point => P(fixed.x + length * Math.cos((degrees * Math.PI) / 180), fixed.y + length * Math.sin((degrees * Math.PI) / 180));

  it.each(UNITS.map((unit, index) => [index * 45, unit] as const))('snaps points near %s degrees to it, keeping the distance, from both sides', (degrees, unit) => {
    for (const off of [-10, 10]) {
      const snapped = constrainAngle(fixed, at(degrees + off, 50));
      expect(snapped.x).toBeCloseTo(fixed.x + 50 * unit.x, 9);
      expect(snapped.y).toBeCloseTo(fixed.y + 50 * unit.y, 9);
    }
  });

  it('is exact on the axes', () => {
    expect(constrainAngle(fixed, P(160, 103)).y).toBe(100);
    expect(constrainAngle(fixed, P(40, 97)).y).toBe(100);
    expect(constrainAngle(fixed, P(103, 160)).x).toBe(100);
    expect(constrainAngle(fixed, P(97, 40)).x).toBe(100);
  });

  it('handles both sides of the half turn', () => {
    // Just above and just below the negative x axis (angles close to 180 and -180 degrees).
    expect(constrainAngle(fixed, P(50, 99)).y).toBe(100);
    expect(constrainAngle(fixed, P(50, 101)).y).toBe(100);
    expect(constrainAngle(fixed, P(50, 100)).x).toBeCloseTo(50, 9);
  });

  it('gives the fixed point back for a zero distance', () => {
    expect(constrainAngle(fixed, fixed)).toEqual(fixed);
  });
});

describe('dragHandle (FR-INT-030, FR-INT-032)', () => {
  it.each<[DrawingKind, number]>([
    ['trend-line', 0],
    ['trend-line', 1],
    ['fibonacci-retracement', 0],
    ['fibonacci-arcs', 1],
    ['fibonacci-fans', 0],
  ])('moves only the anchor of handle %s:%s, in time and price', (kind, handle) => {
    const original = drawing(kind, A(100, 100), A(300, 200));
    const expected = [A(100, 100), A(300, 200)];
    expected[handle] = { ...expected[handle]!, time: expected[handle]!.time + LATER, price: expected[handle]!.price - 15 };
    expectAnchors(dragHandle(original, handle, FROM, TO, false, host), expected);
  });

  it('follows the travel of the pointer, not its position, so the handle does not jump', () => {
    const original = drawing('trend-line', A(100, 100), A(300, 200));
    // The press was 4 px off the handle; the anchor still moves by the 20 x 30 px travel.
    expectAnchors(dragHandle(original, 0, P(104, 96), P(124, 126), false, host), [{ ...A(100, 100), time: 100 * 6000 + LATER, price: 150 - 15 }, A(300, 200)]);
  });

  it('moves a text note by its only handle', () => {
    expectAnchors(dragHandle(drawing('text-note', A(100, 100)), 0, FROM, TO, false, host), [{ ...A(100, 100), time: 100 * 6000 + LATER, price: 135 }]);
  });

  it('changes only the price of a horizontal line and only the time of time zones', () => {
    expectAnchors(dragHandle(drawing('horizontal-line', A(100, 100)), 0, FROM, TO, false, host), [{ ...A(100, 100), price: 135 }]);
    expectAnchors(dragHandle(drawing('fibonacci-time-zones', A(100, 100), A(300, 200)), 1, FROM, TO, false, host), [A(100, 100), { ...A(300, 200), time: 300 * 6000 + LATER }]);
  });

  describe('rectangle handles', () => {
    const rectangle = drawing('rectangle', A(100, 100), A(300, 200));
    const [a1, a2] = [A(100, 100), A(300, 200)] as const;
    const later = (anchor: Anchor): Anchor => ({ ...anchor, time: anchor.time + LATER });
    const lower = (anchor: Anchor): Anchor => ({ ...anchor, price: anchor.price - 15 });

    it.each<[number, string, Anchor[]]>([
      [0, 'corner of anchor 1', [lower(later(a1)), a2]],
      [1, 'corner of anchor 2', [a1, lower(later(a2))]],
      [2, 'corner (x1, y2)', [later(a1), lower(a2)]],
      [3, 'corner (x2, y1)', [lower(a1), later(a2)]],
      [4, 'x1 edge', [later(a1), a2]],
      [5, 'x2 edge', [a1, later(a2)]],
      [6, 'y1 edge', [lower(a1), a2]],
      [7, 'y2 edge', [a1, lower(a2)]],
    ])('handle %s (%s) changes what it should and nothing else', (handle, _name, expected) => {
      expectAnchors(dragHandle(rectangle, handle, FROM, TO, false, host), expected);
    });
  });

  it('uses the price scale of the drawing’s own y-axis', () => {
    // 30 px down on the volume pane is 300 less volume.
    expectAnchors(dragHandle(drawing('horizontal-line', V(100, 500)), 0, FROM, TO, false, host), [V(100, 200)]);
  });

  it('is null for a handle the drawing does not have', () => {
    const line = drawing('trend-line', A(100, 100), A(300, 200));
    for (const handle of [2, -1, 0.5, Number.NaN]) expect(dragHandle(line, handle, FROM, TO, false, host)).toBeNull();
    expect(dragHandle(drawing('horizontal-line', A(100, 100)), 1, FROM, TO, false, host)).toBeNull();
    const rectangle = drawing('rectangle', A(100, 100), A(300, 200));
    for (const handle of [8, -1, 0.5, Number.NaN]) expect(dragHandle(rectangle, handle, FROM, TO, false, host)).toBeNull();
    // A rectangle that lost an anchor has no second corner to move.
    expect(dragHandle(drawing('rectangle', A(100, 100)), 1, FROM, TO, false, host)).toBeNull();
    expect(dragHandle(drawing('rectangle', A(100, 100)), 2, FROM, TO, false, host)).toBeNull();
  });

  it('is null when a y-axis has no pane, also for the second edit of a corner', () => {
    expect(dragHandle(drawing('trend-line', GONE, A(300, 200)), 0, FROM, TO, false, host)).toBeNull();
    expect(dragHandle(drawing('rectangle', A(100, 100), GONE), 2, FROM, TO, false, host)).toBeNull();
    expect(dragHandle(drawing('rectangle', GONE, A(300, 200)), 2, FROM, TO, false, host)).toBeNull();
  });

  it('does not modify the drawing', () => {
    const original = drawing('rectangle', A(100, 100), A(300, 200));
    const frozen = JSON.stringify(original);
    dragHandle(original, 2, FROM, TO, false, host);
    expect(JSON.stringify(original)).toBe(frozen);
  });

  describe('with Shift (FR-INT-031)', () => {
    it.each<DrawingKind>(['trend-line', 'fibonacci-fans'])('keeps the %s to a multiple of 45 degrees from the other anchor', (kind) => {
      // Handle 1 is dragged from the end of a level line to 100 px right and 40 px down: the angle (7.6 degrees) snaps to 0.
      const level = drawing(kind, A(100, 100), A(300, 100));
      const length = Math.hypot(300, 40);
      expectAnchors(dragHandle(level, 1, P(300, 100), P(400, 140), true, host), [A(100, 100), { time: (100 + length) * 6000, price: 150, yAxisId: 'price' }]);
      // Handle 0 is dragged to 150 px left and 40 px up: the angle (-165 degrees) snaps to 180, to the left of the fixed anchor.
      const left = Math.hypot(150, 40);
      expectAnchors(dragHandle(level, 0, P(100, 100), P(150, 60), true, host), [{ time: (300 - left) * 6000, price: 150, yAxisId: 'price' }, A(300, 100)]);
    });

    it('snaps a diagonal too', () => {
      const line = drawing('trend-line', A(100, 100), A(200, 100));
      // Dragged to (300, 210): 200 right and 110 down of the fixed anchor, 28.8 degrees, snaps to 45.
      const result = dragHandle(line, 1, P(200, 100), P(300, 210), true, host);
      const length = Math.hypot(200, 110);
      expect(result?.[1]?.time).toBeCloseTo((100 + length * Math.SQRT1_2) * 6000, 4);
      expect(result?.[1]?.price).toBeCloseTo(200 - (100 + length * Math.SQRT1_2) / 2, 6);
    });

    it('changes nothing about the other kinds', () => {
      for (const kind of ['rectangle', 'fibonacci-retracement', 'fibonacci-arcs'] as const) {
        const original = drawing(kind, A(100, 100), A(300, 200));
        expect(dragHandle(original, 1, FROM, TO, true, host)).toEqual(dragHandle(original, 1, FROM, TO, false, host));
      }
      const horizontal = drawing('horizontal-line', A(100, 100));
      expect(dragHandle(horizontal, 0, FROM, TO, true, host)).toEqual(dragHandle(horizontal, 0, FROM, TO, false, host));
    });

    it('is null for a missing handle, a missing other anchor and a missing pane', () => {
      const line = drawing('trend-line', A(100, 100), A(300, 100));
      for (const handle of [2, -1, 0.5, Number.NaN]) expect(dragHandle(line, handle, FROM, TO, true, host)).toBeNull();
      expect(dragHandle(drawing('trend-line', A(100, 100)), 0, FROM, TO, true, host)).toBeNull();
      // A handle without an anchor, while the other anchor exists.
      expect(dragHandle(drawing('trend-line', A(100, 100)), 1, FROM, TO, true, host)).toBeNull();
      expect(dragHandle(drawing('fibonacci-fans', A(100, 100)), 1, FROM, TO, true, host)).toBeNull();
      expect(dragHandle(drawing('trend-line', GONE, A(300, 100)), 1, FROM, TO, true, host)).toBeNull();
      expect(dragHandle(drawing('fibonacci-fans', A(100, 100), GONE), 1, FROM, TO, true, host)).toBeNull();
    });
  });
});

describe('moveDrawings (FR-INT-030, FR-INT-031)', () => {
  const line = { ...drawing('trend-line', A(100, 100), A(300, 200)), id: 'line' };
  const note = { ...drawing('text-note', A(400, 50)), id: 'note' };
  const bar = { ...drawing('horizontal-line', V(200, 500)), id: 'bar' };

  it('moves every anchor of every drawing by the same time and price delta', () => {
    const moved = moveDrawings([line, note], FROM, TO, false, host);
    expect(moved.map((entry) => entry.id)).toEqual(['line', 'note']);
    expectAnchors(moved[0]?.anchors ?? null, [
      { ...A(100, 100), time: 100 * 6000 + LATER, price: 135 },
      { ...A(300, 200), time: 300 * 6000 + LATER, price: 85 },
    ]);
    expectAnchors(moved[1]?.anchors ?? null, [{ ...A(400, 50), time: 400 * 6000 + LATER, price: 175 - 15 }]);
  });

  it('moves a drawing on another pane by the same time and its own pane’s price delta', () => {
    const volumeNote = { ...drawing('text-note', V(200, 500)), id: 'volume-note' };
    const moved = moveDrawings([line, volumeNote], FROM, TO, false, host);
    expectAnchors(moved[1]?.anchors ?? null, [V(200 + 20, 200)]);
  });

  it('moves a horizontal line on another pane by its own pane’s price delta only (FR-INT-010)', () => {
    const moved = moveDrawings([line, bar], FROM, TO, false, host);
    expectAnchors(moved[1]?.anchors ?? null, [V(200, 200)]);
  });

  it('moves horizontally or vertically with Shift, whichever pixel delta is larger', () => {
    const horizontal = moveDrawings([line], FROM, P(150, 110), true, host);
    expectAnchors(horizontal[0]?.anchors ?? null, [
      { ...A(100, 100), time: 150 * 6000 },
      { ...A(300, 200), time: 350 * 6000 },
    ]);
    const vertical = moveDrawings([line], FROM, P(105, 160), true, host);
    expectAnchors(vertical[0]?.anchors ?? null, [
      { ...A(100, 100), price: 150 - 30 },
      { ...A(300, 200), price: 100 - 30 },
    ]);
  });

  it('leaves out drawings whose y-axis has no pane, also when only a later anchor lacks one', () => {
    const lost = { ...drawing('trend-line', GONE, A(300, 200)), id: 'lost' };
    const half = { ...drawing('trend-line', A(300, 200), GONE), id: 'half' };
    expect(moveDrawings([lost, line, half], FROM, TO, false, host).map((entry) => entry.id)).toEqual(['line']);
  });

  it('gives nothing for nothing and does not modify its input', () => {
    expect(moveDrawings([], FROM, TO, false, host)).toEqual([]);
    const frozen = JSON.stringify(line);
    moveDrawings([line], FROM, TO, true, host);
    expect(JSON.stringify(line)).toBe(frozen);
  });
});

describe('nudgeAnchors (FR-INT-034)', () => {
  const line = drawing('trend-line', A(100, 100), A(300, 200));

  it('moves the anchors bars later and pixels down', () => {
    expectAnchors(nudgeAnchors(line, 1, 0, host), [
      { ...A(100, 100), time: 100 * 6000 + 60_000 },
      { ...A(300, 200), time: 300 * 6000 + 60_000 },
    ]);
    expectAnchors(nudgeAnchors(line, -10, 0, host), [
      { ...A(100, 100), time: 100 * 6000 - 600_000 },
      { ...A(300, 200), time: 300 * 6000 - 600_000 },
    ]);
    expectAnchors(nudgeAnchors(line, 0, -1, host), [
      { ...A(100, 100), price: 150.5 },
      { ...A(300, 200), price: 100.5 },
    ]);
    expectAnchors(nudgeAnchors(line, 2, 10, host), [
      { ...A(100, 100), time: 100 * 6000 + 120_000, price: 145 },
      { ...A(300, 200), time: 300 * 6000 + 120_000, price: 95 },
    ]);
  });

  it('leaves a price exactly as it is when the move is horizontal, and a time when it is vertical', () => {
    // 42.42 does not survive a round trip through the pane exactly.
    const odd = drawing('horizontal-line', { time: 5000, price: 42.42, yAxisId: 'price' });
    expect(nudgeAnchors(odd, 1, 0, host)?.[0]?.price).toBe(42.42);
    expect(nudgeAnchors(odd, 0, 5, host)?.[0]?.time).toBe(5000);
  });

  it('uses the bar interval of the host and the scale of the anchor’s own pane', () => {
    const slow = createMockHost({ barInterval: 1000, panes: [DEFAULT_MOCK_PANE, VOLUME] });
    // On the volume pane 10 px is 100 volume.
    const result = nudgeAnchors(drawing('horizontal-line', V(0, 500)), 3, 10, slow);
    expect(result?.[0]?.time).toBe(3000);
    expect(result?.[0]?.price).toBeCloseTo(400, 9);
  });

  it('is null when a y-axis has no pane, also a later one', () => {
    expect(nudgeAnchors(drawing('horizontal-line', GONE), 1, 1, host)).toBeNull();
    expect(nudgeAnchors(drawing('trend-line', A(100, 100), GONE), 1, 1, host)).toBeNull();
  });

  it('does not modify the drawing', () => {
    const frozen = JSON.stringify(line);
    nudgeAnchors(line, 1, 1, host);
    expect(JSON.stringify(line)).toBe(frozen);
  });
});

describe('the keyboard cursor (FR-INT-034, NFR-A11Y-001)', () => {
  it('starts at the centre of a pane', () => {
    expect(keyboardCursorStart('price', host)).toEqual(P(400, 200));
    expect(keyboardCursorStart('volume', host)).toEqual(P(400, 450));
  });

  it('does not start on a y-axis without a pane', () => {
    expect(keyboardCursorStart('gone', host)).toBeNull();
  });

  it('moves a bar right or left and a pixel down or up', () => {
    expect(moveKeyboardCursor(P(400, 200), 1, 0, 'price', host)).toEqual(P(410, 200));
    expect(moveKeyboardCursor(P(400, 200), -3, 0, 'price', host)).toEqual(P(370, 200));
    expect(moveKeyboardCursor(P(400, 200), 0, 1, 'price', host)).toEqual(P(400, 201));
    expect(moveKeyboardCursor(P(400, 200), 0, -10, 'price', host)).toEqual(P(400, 190));
    expect(moveKeyboardCursor(P(400, 200), SHIFT_STEP_FACTOR, 5, 'price', host)).toEqual(P(500, 205));
  });

  it('moves by the bar width of the current zoom', () => {
    const zoomed = createMockHost({ pxPerBar: 4, startTime: 1_000_000, panes: [DEFAULT_MOCK_PANE] });
    expect(moveKeyboardCursor(P(400, 200), 2, 0, 'price', zoomed)).toEqual(P(408, 200));
  });

  it('leaves a coordinate exactly as it is when it does not move', () => {
    expect(moveKeyboardCursor(P(123.456, 78.9), 0, 0, 'price', host)).toEqual(P(123.456, 78.9));
  });

  it('stays inside the pane, one pixel from its edges', () => {
    expect(KEYBOARD_CURSOR_INSET_PX).toBe(1);
    expect(moveKeyboardCursor(P(5, 200), -1, 0, 'price', host)?.x).toBe(1);
    expect(moveKeyboardCursor(P(795, 200), 1, 0, 'price', host)?.x).toBe(799);
    expect(moveKeyboardCursor(P(400, 5), 0, -10, 'price', host)?.y).toBe(1);
    expect(moveKeyboardCursor(P(400, 395), 0, 10, 'price', host)?.y).toBe(399);
    // The volume pane starts at y = 400 and is 100 px high.
    expect(moveKeyboardCursor(P(400, 405), 0, -10, 'volume', host)?.y).toBe(401);
    expect(moveKeyboardCursor(P(400, 495), 0, 10, 'volume', host)?.y).toBe(499);
  });

  it('is null on a y-axis without a pane', () => {
    expect(moveKeyboardCursor(P(400, 200), 1, 1, 'gone', host)).toBeNull();
  });
});
