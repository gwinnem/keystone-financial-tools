import { describe, expect, it } from 'vitest';
import type { DrawingHost, NearestBar, Point } from '../src/host';
import { dragHandle, dragPatch, handleSnap } from '../src/interaction/move';
import { PLACEMENT_START, placementSnap, reducePlacement, type PlacementProgress } from '../src/interaction/placement';
import { effectiveMagnet, snapAnchor, WEAK_MAGNET_PX, type MagnetMode } from '../src/interaction/snap';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import type { Anchor, Drawing, DrawingKind } from '../src/types';

// The price pane maps price p to y = (200 - p) * 2 (y 0 to 400); the volume pane (y 400 to 500)
// maps v to y = 400 + (1000 - v) / 10. Time is x * 6000 with 10 px per bar, so a bar is 10 px wide
// and the nearest bar must be within 5 px. A bar's prices: open 100 (y 200), high 140 (y 120),
// low 40 (y 320), close 60 (y 280).
const VOLUME = { yAxisId: 'volume', top: 400, height: 100, min: 0, max: 1000 };
const OHLC = { open: 100, high: 140, low: 40, close: 60 };
const bar = (x: number): NearestBar => ({ time: x * 6000, ohlc: OHLC });
const host: DrawingHost = createMockHost({ panes: [DEFAULT_MOCK_PANE, VOLUME], bars: [bar(100), bar(300)] });
const P = (x: number, y: number): Point => ({ x, y });
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const SNAPPED = (x: number, price: number): Anchor => ({ time: x * 6000, price, yAxisId: 'price' });

describe('effectiveMagnet (FR-INT-042)', () => {
  it.each<[MagnetMode, MagnetMode]>([
    ['off', 'strong'],
    ['weak', 'off'],
    ['strong', 'off'],
  ])('turns %s into %s while Ctrl/Cmd is held', (mode, inverted) => {
    expect(effectiveMagnet(mode, true)).toBe(inverted);
  });

  it.each<MagnetMode>(['off', 'weak', 'strong'])('leaves %s alone without Ctrl/Cmd', (mode) => {
    expect(effectiveMagnet(mode, false)).toBe(mode);
  });
});

describe('snapAnchor (FR-INT-040, FR-INT-041)', () => {
  it('never snaps with the magnet off', () => {
    expect(snapAnchor(A(100, 200), 'off', host)).toBeNull();
  });

  it.each<[string, number, number, number]>([
    ['open', 205, 100, 200],
    ['high', 125, 140, 120],
    ['low', 315, 40, 320],
    ['close', 285, 60, 280],
  ])('snaps to the %s when it is the nearest value (strong)', (_name, y, price, snappedY) => {
    const result = snapAnchor(A(103, y), 'strong', host);
    expect(result?.anchor).toEqual(SNAPPED(100, price));
    expect(result?.point.x).toBe(100);
    expect(result?.point.y).toBeCloseTo(snappedY, 9);
  });

  it('always snaps with the strong magnet, however far the price is', () => {
    expect(snapAnchor(A(100, 20), 'strong', host)?.anchor).toEqual(SNAPPED(100, 140));
    expect(snapAnchor(A(100, 390), 'strong', host)?.anchor).toEqual(SNAPPED(100, 40));
  });

  it('snaps the time to the nearest bar, from either side', () => {
    expect(snapAnchor(A(97, 200), 'strong', host)?.anchor.time).toBe(100 * 6000);
    expect(snapAnchor(A(104, 200), 'strong', host)?.anchor.time).toBe(100 * 6000);
    expect(snapAnchor(A(298, 200), 'strong', host)?.anchor.time).toBe(300 * 6000);
  });

  it('does not snap where there is no bar close by: future space, before the first bar and gaps', () => {
    expect(snapAnchor(A(400, 200), 'strong', host)).toBeNull();
    expect(snapAnchor(A(50, 200), 'strong', host)).toBeNull();
    expect(snapAnchor(A(200, 200), 'strong', host)).toBeNull();
    expect(snapAnchor(A(100, 200), 'strong', createMockHost())).toBeNull();
  });

  it('snaps up to half a bar interval from a bar and not beyond', () => {
    // 20 px per bar: half an interval is 10 px.
    const wide = createMockHost({ pxPerBar: 20, bars: [bar(100)] });
    const anchor = (x: number): Anchor => ({ time: x * 3000, price: 100, yAxisId: 'price' });
    // The bar is at time 600 000, which is x = 200 here.
    expect(snapAnchor(anchor(210), 'strong', wide)?.anchor.time).toBe(600_000);
    expect(snapAnchor(anchor(190), 'strong', wide)?.anchor.time).toBe(600_000);
    expect(snapAnchor(anchor(210.5), 'strong', wide)).toBeNull();
    expect(snapAnchor(anchor(189.5), 'strong', wide)).toBeNull();
    // A bar and a half away is not close either.
    expect(snapAnchor(anchor(230), 'strong', wide)).toBeNull();
  });

  it('prefers the first of open, high, low and close on a tie', () => {
    const tie = createMockHost({ bars: [{ time: 600_000, ohlc: { open: 200, high: 150, low: 50, close: 0 } }] });
    // Price 100 is 100 px (50 price units) from both the high and the low.
    const result = snapAnchor({ time: 600_000, price: 100, yAxisId: 'price' }, 'strong', tie);
    expect(result?.anchor.price).toBe(150);
    expect(result?.point).toEqual(P(100, 100));
  });

  it('uses the scale of the anchor’s own pane', () => {
    const result = snapAnchor(
      { time: 600_000, price: 520, yAxisId: 'volume' },
      'strong',
      createMockHost({ panes: [DEFAULT_MOCK_PANE, VOLUME], bars: [{ time: 600_000, ohlc: { open: 500, high: 900, low: 100, close: 300 } }] })
    );
    expect(result?.anchor).toEqual({ time: 600_000, price: 500, yAxisId: 'volume' });
    expect(result?.point.y).toBeCloseTo(450, 9);
  });

  it('does not snap on a y-axis without a pane', () => {
    expect(snapAnchor({ time: 600_000, price: 100, yAxisId: 'gone' }, 'strong', host)).toBeNull();
    // Also when the host still has a scale for it.
    expect(snapAnchor(A(100, 200), 'strong', { ...host, paneRect: () => null })).toBeNull();
  });

  describe('the weak magnet', () => {
    // 40 px per bar, so a bar is 40 px wide and the time distance of an anchor from the bar at x = 100 is its x distance exactly.
    const wide = createMockHost({ pxPerBar: 40, bars: [{ time: 150_000, ohlc: OHLC }] });
    const at = (dx: number, price: number): Anchor => ({ time: 150_000 + dx * 1500, price, yAxisId: 'price' });

    it('exposes its distance', () => {
      expect(WEAK_MAGNET_PX).toBe(12);
    });

    it('snaps within 12 px of a value, exactly 12 included, and leaves the anchor free beyond', () => {
      expect(snapAnchor(at(12, 100), 'weak', wide)?.anchor).toEqual({ time: 150_000, price: 100, yAxisId: 'price' });
      expect(snapAnchor(at(12.5, 100), 'weak', wide)).toBeNull();
      expect(snapAnchor(at(0, 100), 'weak', wide)?.anchor.price).toBe(100);
    });

    it('measures the distance to the snapped point in both directions', () => {
      // 9 px right of the bar and 9 px above the open (y 200): 12.7 px away.
      expect(snapAnchor(at(9, 104.5), 'weak', wide)).toBeNull();
      expect(snapAnchor(at(9, 102), 'weak', wide)?.anchor.price).toBe(100);
    });

    it('snaps to the nearest value within reach and to none when the nearest is too far', () => {
      expect(snapAnchor(A(100, 210), 'weak', host)?.anchor.price).toBe(100);
      expect(snapAnchor(A(100, 226), 'weak', host)).toBeNull();
      expect(snapAnchor(A(100, 130), 'weak', host)?.anchor.price).toBe(140);
    });

    it('snaps like strong when a value is in reach', () => {
      expect(snapAnchor(A(103, 205), 'weak', host)).toEqual(snapAnchor(A(103, 205), 'strong', host));
    });
  });
});

describe('placement with the magnet (FR-INT-040, keyboard placement included)', () => {
  const click = (x: number, y: number) => ({ type: 'click', point: P(x, y), button: 0 }) as const;
  const anchored = (first: Anchor, pointer: Anchor = first, dragging = false): PlacementProgress => ({ type: 'anchored', first, more: [], pointer, dragging });

  it('places a one-anchor tool on the snapped anchor', () => {
    // At y 250 the nearest value is the close (y 280).
    expect(reducePlacement('horizontal-line', PLACEMENT_START, click(103, 250), host, 'strong').anchors).toEqual([SNAPPED(100, 60)]);
    expect(reducePlacement('horizontal-line', PLACEMENT_START, click(103, 250), host, 'off').anchors).toEqual([A(103, 250)]);
    expect(reducePlacement('horizontal-line', PLACEMENT_START, click(103, 250), host).anchors).toEqual([A(103, 250)]);
  });

  it('snaps the first anchor, the preview and the second anchor of a two-anchor tool', () => {
    const first = reducePlacement('trend-line', PLACEMENT_START, click(97, 125), host, 'strong');
    expect(first.progress).toEqual(anchored(SNAPPED(100, 140)));
    const moved = reducePlacement('trend-line', first.progress, { type: 'move', point: P(302, 283) }, host, 'strong');
    expect(moved.progress).toEqual(anchored(SNAPPED(100, 140), SNAPPED(300, 60)));
    const done = reducePlacement('trend-line', moved.progress, click(302, 283), host, 'strong');
    expect(done.anchors).toEqual([SNAPPED(100, 140), SNAPPED(300, 60)]);
  });

  it('snaps a drag placement at the press and at the release', () => {
    const pressed = reducePlacement('rectangle', PLACEMENT_START, { type: 'drag-start', origin: P(103, 205), button: 0 }, host, 'strong');
    expect(pressed.progress).toEqual(anchored(SNAPPED(100, 100), SNAPPED(100, 100), true));
    const dragged = reducePlacement('rectangle', pressed.progress, { type: 'drag', point: P(298, 125) }, host, 'strong');
    expect(dragged.progress).toEqual(anchored(SNAPPED(100, 100), SNAPPED(300, 140), true));
    expect(reducePlacement('rectangle', dragged.progress, { type: 'drag-end', point: P(298, 125) }, host, 'strong').anchors).toEqual([SNAPPED(100, 100), SNAPPED(300, 140)]);
  });

  it('snaps nothing in the weak mode when no value is in reach, and everything when one is', () => {
    expect(reducePlacement('horizontal-line', PLACEMENT_START, click(100, 250), host, 'weak').anchors).toEqual([A(100, 250)]);
    expect(reducePlacement('horizontal-line', PLACEMENT_START, click(103, 205), host, 'weak').anchors).toEqual([SNAPPED(100, 100)]);
  });

  it('snaps on the y-axis of the first anchor, also when the pointer is over another pane', () => {
    const second = reducePlacement('trend-line', anchored(A(100, 100)), { type: 'move', point: P(102, 450) }, host, 'strong');
    // y 450 on the price axis is price -25; the nearest value is the low.
    expect(second.progress).toEqual(anchored(A(100, 100), SNAPPED(100, 40)));
  });

  it('finds two clicks that snap to the same point to be zero length', () => {
    const first = reducePlacement('trend-line', PLACEMENT_START, click(100, 200), host, 'strong');
    const second = reducePlacement('trend-line', first.progress, click(103, 203), host, 'strong');
    expect(second.ignored).toBe(true);
    expect(second.anchors).toBeNull();
    // Without the magnet the same two clicks are 3 px apart and create a drawing.
    const free = reducePlacement('trend-line', reducePlacement('trend-line', PLACEMENT_START, click(100, 200), host).progress, click(103, 203), host);
    expect(free.anchors).toHaveLength(2);
  });

  it('ignores the pointer when the pane of the first anchor is gone, with the magnet too', () => {
    const lost: Anchor = { time: 0, price: 1, yAxisId: 'gone' };
    expect(reducePlacement('trend-line', anchored(lost), { type: 'move', point: P(100, 200) }, host, 'strong').ignored).toBe(true);
  });
});

describe('placementSnap (FR-INT-043)', () => {
  it('is the snapped point under the pointer before the first anchor', () => {
    const snap = placementSnap(PLACEMENT_START, P(103, 205), 'strong', host);
    expect(snap?.x).toBe(100);
    expect(snap?.y).toBeCloseTo(200, 9);
  });

  it('is nothing with the magnet off, outside every pane, away from a bar or out of reach of the weak magnet', () => {
    expect(placementSnap(PLACEMENT_START, P(103, 205), 'off', host)).toBeNull();
    expect(placementSnap(PLACEMENT_START, P(103, 550), 'strong', host)).toBeNull();
    expect(placementSnap(PLACEMENT_START, P(200, 205), 'strong', host)).toBeNull();
    expect(placementSnap(PLACEMENT_START, P(100, 250), 'weak', host)).toBeNull();
    expect(placementSnap(PLACEMENT_START, P(103, 205), 'weak', host)?.x).toBe(100);
  });

  it('uses the y-axis of the first anchor once it is set', () => {
    const progress: PlacementProgress = { type: 'anchored', first: A(100, 100), more: [], pointer: A(100, 100), dragging: false };
    // Over the volume pane, but on the price axis: the nearest value is the low (y 320).
    const snap = placementSnap(progress, P(102, 450), 'strong', host);
    expect(snap?.x).toBe(100);
    expect(snap?.y).toBeCloseTo(320, 9);
    // The first anchor on the volume axis: the nearest value is the high, at the top of the volume scale.
    const onVolume: PlacementProgress = { type: 'anchored', first: { time: 0, price: 500, yAxisId: 'volume' }, more: [], pointer: { time: 0, price: 500, yAxisId: 'volume' }, dragging: false };
    expect(placementSnap(onVolume, P(102, 205), 'strong', host)?.y).toBeCloseTo(486, 9);
  });

  it('is nothing when the pane of the first anchor is gone', () => {
    const lost: Anchor = { time: 0, price: 1, yAxisId: 'gone' };
    expect(placementSnap({ type: 'anchored', first: lost, more: [], pointer: lost, dragging: false }, P(100, 200), 'strong', host)).toBeNull();
  });
});

describe('handle drags with the magnet (FR-INT-040)', () => {
  const FROM = P(300, 100);
  const TO = P(303, 125);
  // The press was at the second end of the line; it moves 3 px right and 25 px down.
  const line = (kind: DrawingKind): Drawing => ({ id: 'd', kind, anchors: [A(100, 100), A(300, 100)] });

  it.each<DrawingKind>(['trend-line', 'fibonacci-retracement', 'fibonacci-arcs', 'fibonacci-fans'])('snaps the dragged anchor of a %s and leaves the other', (kind) => {
    const anchors = dragHandle(line(kind), 1, FROM, TO, false, host, 'strong');
    expect(anchors).toEqual([A(100, 100), SNAPPED(300, 140)]);
    const snap = handleSnap(line(kind), 1, FROM, TO, false, host, 'strong');
    expect(snap?.x).toBe(300);
    expect(snap?.y).toBeCloseTo(120, 9);
  });

  it('snaps a text note', () => {
    const note: Drawing = { id: 'n', kind: 'text-note', anchors: [A(300, 100)] };
    expect(dragHandle(note, 0, FROM, TO, false, host, 'strong')).toEqual([SNAPPED(300, 140)]);
  });

  it('does not snap with the magnet off, by default, or when the weak magnet has nothing in reach', () => {
    const free = dragHandle(line('trend-line'), 1, FROM, TO, false, host);
    expect(free?.[1]?.time).toBe(303 * 6000);
    expect(dragHandle(line('trend-line'), 1, FROM, TO, false, host, 'off')).toEqual(free);
    expect(handleSnap(line('trend-line'), 1, FROM, TO, false, host)).toBeNull();
    expect(handleSnap(line('trend-line'), 1, FROM, TO, false, host, 'off')).toBeNull();
    expect(dragPatch(line('trend-line'), 1, FROM, TO, false, host)).toEqual({ anchors: free });
    expect(dragPatch(line('trend-line'), 1, FROM, TO, false, host, 'strong')).not.toEqual({ anchors: free });
    expect(dragHandle(line('trend-line'), 1, FROM, P(303, 160), false, host, 'weak')?.[1]?.price).toBeCloseTo(120, 9);
    expect(handleSnap(line('trend-line'), 1, FROM, P(303, 160), false, host, 'weak')).toBeNull();
    expect(dragHandle(line('trend-line'), 1, FROM, TO, false, host, 'weak')?.[1]).toEqual(SNAPPED(300, 140));
  });

  it('snaps the corners of a rectangle that move one anchor', () => {
    const rectangle: Drawing = { id: 'r', kind: 'rectangle', anchors: [A(100, 100), A(300, 200)] };
    expect(dragHandle(rectangle, 0, P(100, 100), P(102, 103), false, host, 'strong')).toEqual([SNAPPED(100, 140), A(300, 200)]);
    const second = dragHandle(rectangle, 1, P(300, 200), P(302, 203), false, host, 'strong');
    expect(second?.[0]).toEqual(A(100, 100));
    expect(second?.[1]).toEqual(SNAPPED(300, 100));
    expect(handleSnap(rectangle, 0, P(100, 100), P(102, 103), false, host, 'strong')?.x).toBe(100);
  });

  it.each([2, 3, 4, 5, 6, 7])('does not snap handle %s of a rectangle, which moves only part of an anchor', (handle) => {
    const rectangle: Drawing = { id: 'r', kind: 'rectangle', anchors: [A(100, 100), A(300, 200)] };
    const free = dragHandle(rectangle, handle, P(100, 100), P(102, 103), false, host);
    expect(dragHandle(rectangle, handle, P(100, 100), P(102, 103), false, host, 'strong')).toEqual(free);
    expect(handleSnap(rectangle, handle, P(100, 100), P(102, 103), false, host, 'strong')).toBeNull();
  });

  it('does not snap a horizontal line or time zones, which move one coordinate', () => {
    const horizontal: Drawing = { id: 'h', kind: 'horizontal-line', anchors: [A(100, 100)] };
    expect(dragHandle(horizontal, 0, P(100, 100), P(102, 103), false, host, 'strong')).toEqual(dragHandle(horizontal, 0, P(100, 100), P(102, 103), false, host));
    const zones: Drawing = { id: 'z', kind: 'fibonacci-time-zones', anchors: [A(100, 100), A(300, 100)] };
    expect(dragHandle(zones, 1, P(300, 100), P(302, 103), false, host, 'strong')).toEqual(dragHandle(zones, 1, P(300, 100), P(302, 103), false, host));
    expect(handleSnap(zones, 1, P(300, 100), P(302, 103), false, host, 'strong')).toBeNull();
  });

  it('keeps an angle-constrained drag to its angle without snapping', () => {
    const horizontalLine = line('trend-line');
    const constrained = dragHandle(horizontalLine, 1, FROM, P(400, 140), true, host, 'strong');
    expect(constrained).toEqual(dragHandle(horizontalLine, 1, FROM, P(400, 140), true, host));
    expect(handleSnap(horizontalLine, 1, FROM, P(400, 140), true, host, 'strong')).toBeNull();
    // Shift does not constrain the other kinds, so they still snap.
    expect(dragHandle(line('fibonacci-retracement'), 1, FROM, TO, true, host, 'strong')?.[1]).toEqual(SNAPPED(300, 140));
  });

  it('is null for a drag that cannot happen, also with the magnet on', () => {
    expect(dragHandle(line('trend-line'), 5, FROM, TO, false, host, 'strong')).toBeNull();
    expect(handleSnap(line('trend-line'), 5, FROM, TO, false, host, 'strong')).toBeNull();
    expect(handleSnap(line('trend-line'), 5, FROM, TO, true, host, 'strong')).toBeNull();
  });
});
