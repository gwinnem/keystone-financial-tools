import { describe, expect, it } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import type { NearestBar, Point } from '../src/host';
import { GestureRecogniser } from '../src/interaction/gesture';
import { dragHandle, handleSnap, keyboardCursorStart, moveKeyboardCursor } from '../src/interaction/move';
import { PLACEMENT_START, placementPreview, placementSnap, reducePlacement, type PlacementInput, type PlacementProgress } from '../src/interaction/placement';
import { effectiveMagnet, type MagnetMode } from '../src/interaction/snap';
import { buildScene } from '../src/scene/build';
import type { SceneItem } from '../src/scene/types';
import { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, DrawingKind } from '../src/types';

// QA-005: magnet scenarios on the mock host. A small stand-in for the controller (E04-F06) wires raw
// pointer events through the gesture recogniser to the placement reducer with the effective magnet
// (the stored mode, inverted while Ctrl/Cmd is held) and feeds the snap point to the scene. Time is
// x * 6000 (10 px per bar) and a price p is at y = (200 - p) * 2. Every bar has the open 100 (y 200),
// high 140 (y 120), low 40 (y 320) and close 60 (y 280).
const OHLC = { open: 100, high: 140, low: 40, close: 60 };
const bar = (x: number): NearestBar => ({ time: x * 6000, ohlc: OHLC });
const BARS = [bar(100), bar(300), bar(400)];
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const SNAPPED = (x: number, price: number): Anchor => ({ time: x * 6000, price, yAxisId: 'price' });
const P = (x: number, y: number): Point => ({ x, y });

function placer(mode: MagnetMode, tool: DrawingKind = 'trend-line') {
  const host = createMockHost({ bars: BARS });
  const store = new DrawingStore();
  const cache = new GeometryCache(host, { store });
  const recogniser = new GestureRecogniser({ now: () => 0 });
  let progress: PlacementProgress = PLACEMENT_START;
  let snap: Point | null = null;
  let cursor: Point | null = null;

  const run = (input: PlacementInput & { readonly point: Point }, invert: boolean): void => {
    const magnet = effectiveMagnet(mode, invert);
    const result = reducePlacement(tool, progress, input, host, magnet);
    progress = result.progress;
    if (result.anchors !== null) store.add({ id: `d${store.list().length + 1}`, kind: tool, anchors: result.anchors });
    snap = placementSnap(progress, input.point, magnet, host);
  };
  host.onPointer((event) => {
    for (const gesture of recogniser.handle(event)) {
      const invert = 'ctrlKey' in gesture && (gesture.ctrlKey || gesture.metaKey);
      if (gesture.type === 'move') run({ type: 'move', point: gesture.point }, invert);
      if (gesture.type === 'click') run({ type: 'click', point: gesture.point, button: gesture.button }, invert);
    }
  });
  const scene = (): readonly SceneItem[] => buildScene(host, { drawings: store.list(), cache, preview: placementPreview(tool, progress, 'preview'), ...(snap === null ? {} : { snap }) });
  return {
    host,
    store,
    run,
    scene,
    key: (point: Point, invert = false) => run({ type: 'move', point }, invert),
    get progress() {
      return progress;
    },
    get cursor() {
      return cursor;
    },
    set cursor(value: Point | null) {
      cursor = value;
    },
    get mode() {
      return mode;
    },
  };
}

/** The centre of the snap indicator (a circle, the only arc of a placement scene), or null. */
function indicator(items: readonly SceneItem[]): Point | null {
  for (const item of items) {
    if (item.type !== 'preview') continue;
    const shape = item.shapes[0];
    if (shape?.type === 'arc') return shape.center;
  }
  return null;
}

function expectIndicator(items: readonly SceneItem[], expected: Point | null): void {
  const actual = indicator(items);
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual?.x).toBeCloseTo(expected.x, 9);
  expect(actual?.y).toBeCloseTo(expected.y, 9);
}

const tap = (d: ReturnType<typeof placer>, x: number, y: number, modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {}): void => {
  d.host.pointer('down', x, y, modifiers);
  d.host.pointer('up', x, y, modifiers);
};

describe('placing with the magnet (FR-INT-040, FR-INT-043)', () => {
  it('snaps both anchors of a trend line and shows the indicator where the pointer will snap', () => {
    const d = placer('strong');
    d.host.pointer('move', 103, 205);
    expectIndicator(d.scene(), P(100, 200));
    tap(d, 103, 205);
    expect(d.progress).toMatchObject({ type: 'anchored', first: SNAPPED(100, 100) });
    d.host.pointer('move', 302, 283);
    expectIndicator(d.scene(), P(300, 280));
    tap(d, 302, 283);
    expect(d.store.list().map((drawing) => drawing.anchors)).toEqual([[SNAPPED(100, 100), SNAPPED(300, 60)]]);
    expect(d.progress).toEqual(PLACEMENT_START);
  });

  it('shows no indicator and places free anchors with the magnet off', () => {
    const d = placer('off');
    d.host.pointer('move', 103, 250);
    expectIndicator(d.scene(), null);
    tap(d, 103, 250);
    tap(d, 303, 150);
    expect(d.store.list().map((drawing) => drawing.anchors)).toEqual([[A(103, 250), A(303, 150)]]);
  });

  it('shows no indicator where nothing snaps: outside a pane, in future space, between bars', () => {
    const d = placer('strong');
    d.host.pointer('move', 103, 450);
    expectIndicator(d.scene(), null);
    d.host.pointer('move', 500, 205);
    expectIndicator(d.scene(), null);
    d.host.pointer('move', 200, 205);
    expectIndicator(d.scene(), null);
    tap(d, 500, 250);
    expect(d.progress).toMatchObject({ type: 'anchored', first: A(500, 250) });
  });

  it('snaps with the weak magnet only within reach of a value', () => {
    const d = placer('weak');
    d.host.pointer('move', 100, 250);
    expectIndicator(d.scene(), null);
    d.host.pointer('move', 100, 210);
    expectIndicator(d.scene(), P(100, 200));
  });

  it('inverts the magnet while Ctrl or Cmd is held, without changing the stored mode', () => {
    const off = placer('off');
    off.host.pointer('move', 103, 205, { ctrlKey: true });
    expectIndicator(off.scene(), P(100, 200));
    tap(off, 103, 205, { ctrlKey: true });
    expect(off.progress).toMatchObject({ first: SNAPPED(100, 100) });
    off.host.pointer('move', 303, 150);
    expectIndicator(off.scene(), null);
    expect(off.mode).toBe('off');

    for (const mode of ['weak', 'strong'] as const) {
      const on = placer(mode);
      on.host.pointer('move', 103, 205);
      expectIndicator(on.scene(), P(100, 200));
      on.host.pointer('move', 103, 205, { metaKey: true });
      expectIndicator(on.scene(), null);
      tap(on, 103, 205, { metaKey: true });
      // Free: the time of the click, not the time of the bar.
      expect(on.progress).toMatchObject({ type: 'anchored', first: { time: 103 * 6000 } });
      expect(on.mode).toBe(mode);
    }
  });
});

describe('placing with the keyboard and the magnet (FR-INT-034, FR-INT-040)', () => {
  it('snaps the keyboard cursor to a bar and leaves it free between bars', () => {
    const d = placer('strong');
    // The cursor starts at the centre of the pane, (400, 200): on a bar, at its open.
    d.cursor = keyboardCursorStart('price', d.host);
    expect(d.cursor).toEqual(P(400, 200));
    d.run({ type: 'click', point: d.cursor ?? P(0, 0), button: 0 }, false);
    expect(d.progress).toMatchObject({ type: 'anchored', first: SNAPPED(400, 100) });
    expectIndicator(d.scene(), P(400, 200));
    // One bar to the right there is no bar: the anchor is free there.
    d.cursor = moveKeyboardCursor(d.cursor ?? P(0, 0), 1, 0, 'price', d.host);
    d.run({ type: 'move', point: d.cursor ?? P(0, 0) }, false);
    expect(d.progress).toMatchObject({ pointer: A(410, 200) });
    expectIndicator(d.scene(), null);
    d.run({ type: 'click', point: d.cursor ?? P(0, 0), button: 0 }, false);
    expect(d.store.list().map((drawing) => drawing.anchors)).toEqual([[SNAPPED(400, 100), A(410, 200)]]);
  });
});

describe('dragging a handle with the magnet (FR-INT-040, FR-INT-043)', () => {
  const drag = (magnet: MagnetMode) => {
    const host = createMockHost({ bars: BARS });
    const store = new DrawingStore([{ id: 'l', kind: 'trend-line', anchors: [A(100, 100), A(300, 100)] }]);
    const cache = new GeometryCache(host, { store });
    const original = store.get('l');
    if (original === undefined) throw new Error('missing drawing');
    const origin = P(300, 100);
    const point = P(303, 125);
    const anchors = dragHandle(original, 1, origin, point, false, host, magnet);
    if (anchors !== null) store.update('l', { anchors });
    const snap = handleSnap(original, 1, origin, point, false, host, magnet);
    const scene = buildScene(host, { drawings: store.list(), cache, selected: new Set(['l']), ...(snap === null ? {} : { snap }) });
    return { store, scene, snap };
  };

  it('moves the end to the snapped value and shows the indicator there', () => {
    const d = drag('strong');
    expect(d.store.get('l')?.anchors).toEqual([A(100, 100), SNAPPED(300, 140)]);
    expectIndicator(d.scene, P(300, 120));
  });

  it('moves the end freely and shows no indicator with the magnet off', () => {
    const d = drag('off');
    expect(d.store.get('l')?.anchors[1]?.time).toBe(303 * 6000);
    expect(d.store.get('l')?.anchors[1]?.price).toBeCloseTo(137.5, 9);
    expectIndicator(d.scene, null);
  });
});
