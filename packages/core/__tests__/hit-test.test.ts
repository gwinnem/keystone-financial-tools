import { describe, expect, it } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { HIT_TOLERANCE, hitTest, type HitResult, type HitTestOptions } from '../src/hit/hit-test';
import { createMockHost } from '../src/testing/mock-host';
import { LIGHT_THEME, type DrawingTheme } from '../src/theme';
import type { Anchor, Drawing } from '../src/types';

// The default mock host: x = time / 6000 and y = 400 - 2 * price, so a plot point maps to an anchor.
const A = (x: number, y: number, yAxisId = 'price'): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId });

const trend = (id: string, from: [number, number], to: [number, number], extra: Partial<Drawing> = {}): Drawing => ({ id, kind: 'trend-line', anchors: [A(...from), A(...to)], ...extra });
const rectangle = (id: string, from: [number, number], to: [number, number], extra: Partial<Drawing> = {}): Drawing => ({ id, kind: 'rectangle', anchors: [A(...from), A(...to)], ...extra });

const host = createMockHost();

function probe(drawings: readonly Drawing[], x: number, y: number, extra: Partial<HitTestOptions> = {}): HitResult | null {
  return hitTest({ x, y }, { drawings, cache: new GeometryCache(host), ...extra });
}

describe('tolerance (FR-HIT-001)', () => {
  const line = trend('l', [100, 100], [300, 100]);

  it('is 6 CSS px for a mouse and a pen, 12 for touch', () => {
    expect(HIT_TOLERANCE).toEqual({ mouse: 6, pen: 6, touch: 12 });
    expect(Object.isFrozen(HIT_TOLERANCE)).toBe(true);
  });

  it('hits a mouse exactly 6 px from a line, and misses it beyond', () => {
    expect(probe([line], 200, 106, { pointerType: 'mouse' })).toEqual({ id: 'l', part: 'body', locked: false });
    expect(probe([line], 200, 94, { pointerType: 'mouse' })).toEqual({ id: 'l', part: 'body', locked: false });
    expect(probe([line], 200, 106.01, { pointerType: 'mouse' })).toBeNull();
    expect(probe([line], 200, 93.99, { pointerType: 'mouse' })).toBeNull();
  });

  it('uses the mouse tolerance by default', () => {
    expect(probe([line], 200, 106)).not.toBeNull();
    expect(probe([line], 200, 107)).toBeNull();
  });

  it('gives a pen the same 6 px as a mouse', () => {
    expect(probe([line], 200, 106, { pointerType: 'pen' })).not.toBeNull();
    expect(probe([line], 200, 107, { pointerType: 'pen' })).toBeNull();
  });

  it('gives touch 12 px', () => {
    expect(probe([line], 200, 112, { pointerType: 'touch' })).not.toBeNull();
    expect(probe([line], 200, 88, { pointerType: 'touch' })).not.toBeNull();
    expect(probe([line], 200, 112.01, { pointerType: 'touch' })).toBeNull();
    expect(probe([line], 200, 107, { pointerType: 'touch' })).not.toBeNull();
  });

  it('measures to the ends of the segment, not to its extension', () => {
    expect(probe([line], 306, 100)).not.toBeNull();
    expect(probe([line], 307, 100)).toBeNull();
    expect(probe([line], 94, 100)).not.toBeNull();
    expect(probe([line], 93, 100)).toBeNull();
  });

  it('hits nothing without drawings', () => {
    expect(probe([], 200, 100)).toBeNull();
  });
});

describe('parts (FR-HIT-003)', () => {
  const retracement = (extra: Partial<Drawing> = {}): Drawing => ({ id: 'f', kind: 'fibonacci-retracement', anchors: [A(100, 100), A(300, 300)], ...extra });
  // Levels at y = 100 + 200 * ratio: 0 -> 100, 0.5 -> 200, 1 -> 300.

  it('reports the body of a line', () => {
    expect(probe([trend('l', [100, 100], [300, 100])], 200, 100)).toEqual({ id: 'l', part: 'body', locked: false });
  });

  it('reports the level of a Fibonacci retracement', () => {
    expect(probe([retracement()], 200, 200)).toEqual({ id: 'f', part: 'level:0.5', locked: false });
    expect(probe([retracement()], 200, 300)).toEqual({ id: 'f', part: 'level:1', locked: false });
    expect(probe([retracement()], 200, 100)).toEqual({ id: 'f', part: 'level:0', locked: false });
  });

  it('reports the label when the point is on its anchor, the left end of the level', () => {
    expect(probe([retracement()], 100, 200)).toEqual({ id: 'f', part: 'label', locked: false });
    expect(probe([retracement()], 104, 203)).toEqual({ id: 'f', part: 'label', locked: false });
    expect(probe([retracement()], 106, 200)).toEqual({ id: 'f', part: 'label', locked: false });
    expect(probe([retracement()], 107, 200)).toEqual({ id: 'f', part: 'level:0.5', locked: false });
  });

  it('lets a label win over the line it belongs to, although the line is nearer', () => {
    expect(probe([retracement()], 105, 201)).toEqual({ id: 'f', part: 'label', locked: false });
  });

  it('has no label to hit when labels and prices are off', () => {
    const plain = retracement({ options: { showLabels: false, showPrices: false } });
    expect(probe([plain], 100, 200)).toEqual({ id: 'f', part: 'level:0.5', locked: false });
  });

  it('reports the nearest level, not the first one within tolerance', () => {
    // Levels 0.025 and 0.04 lie at y = 105 and 108.
    const close = retracement({
      options: {
        levels: [
          { ratio: 0.025, visible: true },
          { ratio: 0.04, visible: true },
        ],
        showLabels: false,
        showPrices: false,
      },
    });
    expect(probe([close], 200, 107.5)).toEqual({ id: 'f', part: 'level:0.04', locked: false });
    expect(probe([close], 200, 105.5)).toEqual({ id: 'f', part: 'level:0.025', locked: false });
  });

  it('reports the first shape on a tie: where every ray of a fan starts', () => {
    const fan: Drawing = { id: 'fan', kind: 'fibonacci-fans', anchors: [A(100, 200), A(300, 100)] };
    expect(probe([fan], 100, 200)).toEqual({ id: 'fan', part: 'level:0.382', locked: false });
  });

  it('reports the nearest ray of a fan', () => {
    const fan: Drawing = { id: 'fan', kind: 'fibonacci-fans', anchors: [A(100, 200), A(300, 100)] };
    expect(probe([fan], 300, 150)).toEqual({ id: 'fan', part: 'level:0.5', locked: false });
    expect(probe([fan], 300, 161)).toEqual({ id: 'fan', part: 'level:0.618', locked: false });
    expect(probe([fan], 300, 139)).toEqual({ id: 'fan', part: 'level:0.382', locked: false });
  });

  it('reports the arc of a Fibonacci arcs drawing where it covers the point, and nothing off its ends', () => {
    // Half circles around (200, 200) opening to the left, with radius 38.2, 50 and 61.8.
    const arcs: Drawing = { id: 'arc', kind: 'fibonacci-arcs', anchors: [A(100, 200), A(200, 200)] };
    expect(probe([arcs], 150, 200)).toEqual({ id: 'arc', part: 'level:0.5', locked: false });
    expect(probe([arcs], 161.8, 200)).toEqual({ id: 'arc', part: 'level:0.382', locked: false });
    expect(probe([arcs], 138.2, 200)).toEqual({ id: 'arc', part: 'level:0.618', locked: false });
    expect(probe([arcs], 250, 200)).toBeNull();
    expect(probe([arcs], 200, 150)).toEqual({ id: 'arc', part: 'level:0.5', locked: false });
  });

  it('reports the time-zone line it is on', () => {
    const zones: Drawing = { id: 'z', kind: 'fibonacci-time-zones', anchors: [A(100, 100), A(110, 100)], options: { sequence: [1, 2] } };
    expect(probe([zones], 120, 300)).toEqual({ id: 'z', part: 'level:2', locked: false });
    expect(probe([zones], 110, 5)).toEqual({ id: 'z', part: 'level:1', locked: false });
  });

  it('hits a horizontal line across the whole pane', () => {
    const line: Drawing = { id: 'h', kind: 'horizontal-line', anchors: [A(10, 100)] };
    expect(probe([line], 700, 103)).toEqual({ id: 'h', part: 'body', locked: false });
  });

  it('hits the box of a text note', () => {
    // Font size 10 and text "ab": a box from (100, 100) that is 12 wide and 13 high.
    const note: Drawing = { id: 'n', kind: 'text-note', anchors: [A(100, 100)], text: 'ab', style: { fontSize: 10 } };
    expect(probe([note], 106, 106)).toEqual({ id: 'n', part: 'body', locked: false });
    expect(probe([note], 106, 118.9)).toEqual({ id: 'n', part: 'body', locked: false });
    expect(probe([note], 106, 119.1)).toBeNull();
    expect(probe([note], 117.9, 106)).toEqual({ id: 'n', part: 'body', locked: false });
    expect(probe([note], 118.1, 106)).toBeNull();
  });
});

describe('rectangles: fill only with fillOpacity above 0 (FR-HIT-003)', () => {
  const box = rectangle('r', [100, 100], [200, 200]);

  it('hits inside a rectangle with the default fill of the theme', () => {
    expect(probe([box], 150, 150)).toEqual({ id: 'r', part: 'body', locked: false });
  });

  it('hits only the border when the drawing sets fillOpacity 0', () => {
    const hollow = rectangle('r', [100, 100], [200, 200], { style: { fillOpacity: 0 } });
    expect(probe([hollow], 150, 150)).toBeNull();
    expect(probe([hollow], 150, 105)).toEqual({ id: 'r', part: 'body', locked: false });
    expect(probe([hollow], 150, 106)).not.toBeNull();
    expect(probe([hollow], 150, 107)).toBeNull();
    expect(probe([hollow], 195, 150)).not.toBeNull();
    expect(probe([hollow], 150, 195)).not.toBeNull();
    expect(probe([hollow], 105, 150)).not.toBeNull();
  });

  it('hits inside with the smallest positive fillOpacity', () => {
    expect(probe([rectangle('r', [100, 100], [200, 200], { style: { fillOpacity: 0.01 } })], 150, 150)).not.toBeNull();
  });

  it('hits outside the border within the tolerance, filled or not', () => {
    expect(probe([box], 206, 150)).not.toBeNull();
    expect(probe([box], 207, 150)).toBeNull();
    expect(probe([rectangle('r', [100, 100], [200, 200], { style: { fillOpacity: 0 } })], 150, 94)).not.toBeNull();
  });

  it('asks the theme given in the options', () => {
    const hollowTheme: DrawingTheme = { ...LIGHT_THEME, kinds: { ...LIGHT_THEME.kinds, rectangle: { fillOpacity: 0 } } };
    const filledTheme: DrawingTheme = { ...LIGHT_THEME, kinds: { ...LIGHT_THEME.kinds, rectangle: { fillOpacity: 0.5 } } };
    expect(probe([box], 150, 150, { theme: hollowTheme })).toBeNull();
    expect(probe([box], 150, 150, { theme: filledTheme })).not.toBeNull();
    expect(probe([rectangle('r', [100, 100], [200, 200], { style: { fillOpacity: 0.3 } })], 150, 150, { theme: hollowTheme })).not.toBeNull();
  });

  it('never fills a line, whatever the fill of the theme', () => {
    const fillTheme: DrawingTheme = { ...LIGHT_THEME, defaults: { ...LIGHT_THEME.defaults, fillOpacity: 1 } };
    expect(probe([trend('l', [100, 100], [300, 100])], 200, 120, { theme: fillTheme })).toBeNull();
  });
});

describe('hidden and locked drawings', () => {
  it('never hits a hidden drawing', () => {
    expect(probe([trend('l', [100, 100], [300, 100], { hidden: true })], 200, 100)).toBeNull();
    expect(probe([trend('l', [100, 100], [300, 100], { hidden: false })], 200, 100)).not.toBeNull();
  });

  it('hits the drawing below a hidden one', () => {
    const under = trend('under', [100, 100], [300, 100]);
    const hiddenTop = trend('top', [100, 100], [300, 100], { hidden: true, zIndex: 5 });
    expect(probe([hiddenTop, under], 200, 100)?.id).toBe('under');
    expect(probe([under, hiddenTop], 200, 100)?.id).toBe('under');
  });

  it('hits a locked drawing and says so', () => {
    expect(probe([trend('l', [100, 100], [300, 100], { locked: true })], 200, 100)).toEqual({ id: 'l', part: 'body', locked: true });
    expect(probe([trend('l', [100, 100], [300, 100], { locked: false })], 200, 100)).toEqual({ id: 'l', part: 'body', locked: false });
    expect(probe([trend('l', [100, 100], [300, 100])], 200, 100)?.locked).toBe(false);
  });

  it('hits the handles of a locked selected drawing, with locked: true', () => {
    const locked = trend('l', [100, 100], [300, 100], { locked: true });
    expect(probe([locked], 100, 100, { selected: new Set(['l']) })).toEqual({ id: 'l', part: 'handle:0', locked: true });
  });

  it('does not hit the handles of a hidden selected drawing', () => {
    const hidden = trend('l', [100, 100], [300, 100], { hidden: true });
    expect(probe([hidden], 100, 100, { selected: new Set(['l']) })).toBeNull();
  });
});

describe('handles of selected drawings win (FR-HIT-002)', () => {
  const selectedLine = trend('sel', [100, 100], [300, 100]);

  it('reports a handle of a selected drawing', () => {
    expect(probe([selectedLine], 100, 100, { selected: new Set(['sel']) })).toEqual({ id: 'sel', part: 'handle:0', locked: false });
    expect(probe([selectedLine], 300, 100, { selected: new Set(['sel']) })).toEqual({ id: 'sel', part: 'handle:1', locked: false });
  });

  it('ignores the handles of drawings that are not selected', () => {
    expect(probe([selectedLine], 100, 100)).toEqual({ id: 'sel', part: 'body', locked: false });
    expect(probe([selectedLine], 100, 100, { selected: new Set(['other']) })).toEqual({ id: 'sel', part: 'body', locked: false });
    expect(probe([selectedLine], 100, 100, { selected: new Set() })).toEqual({ id: 'sel', part: 'body', locked: false });
  });

  it('prefers the handle of the selected drawing over the body of a drawing above it', () => {
    const above = trend('above', [50, 100], [150, 100], { zIndex: 10 });
    expect(probe([selectedLine, above], 100, 100, { selected: new Set(['sel']) })).toEqual({ id: 'sel', part: 'handle:0', locked: false });
    expect(probe([selectedLine, above], 100, 100)?.id).toBe('above');
  });

  it('falls back to the bodies when no handle is near, selected or not', () => {
    expect(probe([selectedLine], 200, 100, { selected: new Set(['sel']) })).toEqual({ id: 'sel', part: 'body', locked: false });
    const other = trend('other', [100, 300], [300, 300]);
    expect(probe([selectedLine, other], 200, 300, { selected: new Set(['sel']) })?.id).toBe('other');
  });

  it('hits a handle exactly at the tolerance and not beyond', () => {
    const selected = { selected: new Set(['sel']) };
    expect(probe([selectedLine], 94, 100, selected)?.part).toBe('handle:0');
    expect(probe([selectedLine], 93.99, 100, selected)).toBeNull();
    expect(probe([selectedLine], 88, 100, { ...selected, pointerType: 'touch' })?.part).toBe('handle:0');
    expect(probe([selectedLine], 87.99, 100, { ...selected, pointerType: 'touch' })).toBeNull();
    expect(probe([selectedLine], 304, 104, selected)?.part).toBe('handle:1');
  });

  it('reports the nearest handle', () => {
    const short = trend('short', [100, 100], [110, 100]);
    const selected = { selected: new Set(['short']) };
    expect(probe([short], 104, 100, selected)?.part).toBe('handle:0');
    expect(probe([short], 106, 100, selected)?.part).toBe('handle:1');
    expect(probe([short], 107, 100, selected)?.part).toBe('handle:1');
  });

  it('reports the lowest handle index on a tie', () => {
    const point = rectangle('r', [100, 100], [100, 100]);
    expect(probe([point], 100, 100, { selected: new Set(['r']) })?.part).toBe('handle:0');
    const short = trend('short', [100, 100], [110, 100]);
    expect(probe([short], 105, 100, { selected: new Set(['short']) })?.part).toBe('handle:0');
  });

  it('reports the edge and corner handles of a rectangle', () => {
    const box = rectangle('r', [100, 100], [200, 200]);
    const selected = { selected: new Set(['r']) };
    expect(probe([box], 100, 200, selected)?.part).toBe('handle:2');
    expect(probe([box], 200, 100, selected)?.part).toBe('handle:3');
    expect(probe([box], 100, 150, selected)?.part).toBe('handle:4');
    expect(probe([box], 200, 150, selected)?.part).toBe('handle:5');
    expect(probe([box], 150, 100, selected)?.part).toBe('handle:6');
    expect(probe([box], 150, 200, selected)?.part).toBe('handle:7');
    expect(probe([box], 150, 150, selected)).toEqual({ id: 'r', part: 'body', locked: false });
  });

  it('lets the topmost selected drawing win where handles overlap', () => {
    const a = trend('a', [100, 100], [300, 100], { zIndex: 2 });
    const b = trend('b', [100, 100], [300, 200], { zIndex: 1 });
    const c = trend('c', [100, 100], [300, 300]);
    expect(probe([a, b, c], 100, 100, { selected: new Set(['a', 'b', 'c']) })?.id).toBe('a');
    expect(probe([b, a, c], 100, 100, { selected: new Set(['a', 'b', 'c']) })?.id).toBe('a');
    expect(probe([c, b, a], 100, 100, { selected: new Set(['b', 'c']) })?.id).toBe('b');
    expect(probe([a, b], 100, 100, { selected: new Set(['b']) })?.id).toBe('b');
  });
});

describe('overlapping drawings: highest zIndex, then the latest (FR-HIT-002)', () => {
  const line = (id: string, extra: Partial<Drawing> = {}): Drawing => trend(id, [100, 100], [300, 100], extra);

  it('takes the drawing added last when the zIndex is equal', () => {
    expect(probe([line('a'), line('b')], 200, 100)?.id).toBe('b');
    expect(probe([line('b'), line('a')], 200, 100)?.id).toBe('a');
    expect(probe([line('a'), line('b'), line('c')], 200, 100)?.id).toBe('c');
  });

  it('takes the highest zIndex wherever it was added', () => {
    expect(probe([line('a', { zIndex: 1 }), line('b')], 200, 100)?.id).toBe('a');
    expect(probe([line('a', { zIndex: 2 }), line('b', { zIndex: 1 }), line('c')], 200, 100)?.id).toBe('a');
    expect(probe([line('a'), line('b', { zIndex: 1 }), line('c', { zIndex: 1 })], 200, 100)?.id).toBe('c');
    expect(probe([line('a', { zIndex: 1 }), line('b', { zIndex: 2 }), line('c', { zIndex: 1 })], 200, 100)?.id).toBe('b');
  });

  it('counts a missing zIndex as 0, also against negative values', () => {
    expect(probe([line('a', { zIndex: 0 }), line('b')], 200, 100)?.id).toBe('b');
    expect(probe([line('a'), line('b', { zIndex: 0 })], 200, 100)?.id).toBe('b');
    expect(probe([line('a'), line('b', { zIndex: -1 })], 200, 100)?.id).toBe('a');
    expect(probe([line('b', { zIndex: -1 }), line('a')], 200, 100)?.id).toBe('a');
    expect(probe([line('a', { zIndex: -2 }), line('b', { zIndex: -1 })], 200, 100)?.id).toBe('b');
    expect(probe([line('a', { zIndex: -1 }), line('b', { zIndex: -2 })], 200, 100)?.id).toBe('a');
  });

  it('hits a drawing whose zIndex is negative when nothing else is there', () => {
    expect(probe([line('a', { zIndex: -5 })], 200, 100)?.id).toBe('a');
  });

  it('skips a higher drawing that is not under the point', () => {
    const far = trend('far', [100, 300], [300, 300], { zIndex: 9 });
    expect(probe([far, line('a', { zIndex: 1 })], 200, 100)?.id).toBe('a');
    expect(probe([line('a', { zIndex: 1 }), far], 200, 100)?.id).toBe('a');
  });

  it('takes a higher drawing that is hit only by the tolerance over one the point is on', () => {
    const near = trend('near', [100, 104], [300, 104], { zIndex: 1 });
    expect(probe([line('on'), near], 200, 100)?.id).toBe('near');
  });
});

describe('drawings without a pane', () => {
  const orphan: Drawing = { id: 'orphan', kind: 'trend-line', anchors: [A(100, 100, 'volume'), A(300, 100, 'volume')] };

  it('never hits a drawing whose y-axis has no pane', () => {
    expect(probe([orphan], 200, 100)).toBeNull();
    expect(probe([orphan], 100, 100, { selected: new Set(['orphan']) })).toBeNull();
  });

  it('still hits the other drawings', () => {
    const line = trend('l', [100, 100], [300, 100], { zIndex: -1 });
    expect(probe([line, { ...orphan, zIndex: 5 }], 200, 100)?.id).toBe('l');
    expect(probe([line, orphan], 100, 100, { selected: new Set(['orphan', 'l']) })).toEqual({ id: 'l', part: 'handle:0', locked: false });
  });
});

describe('the cache', () => {
  it('sees a drawing replaced under the same id', () => {
    const cache = new GeometryCache(host);
    const line = trend('l', [100, 100], [300, 100]);
    expect(hitTest({ x: 200, y: 100 }, { drawings: [line], cache })).not.toBeNull();
    const moved = trend('l', [100, 300], [300, 300]);
    expect(hitTest({ x: 200, y: 100 }, { drawings: [moved], cache })).toBeNull();
    expect(hitTest({ x: 200, y: 300 }, { drawings: [moved], cache })?.id).toBe('l');
    expect(cache.size).toBe(1);
  });
});
