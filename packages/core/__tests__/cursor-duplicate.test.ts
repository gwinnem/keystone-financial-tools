import { describe, expect, it, vi } from 'vitest';
import type { HitPart, HitResult } from '../src/hit/hit-test';
import type { DrawingHost } from '../src/host';
import { cursorFor, CursorSync } from '../src/interaction/cursor';
import { DUPLICATE_OFFSET_PX, duplicateDrawing } from '../src/interaction/duplicate';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import type { Anchor, Drawing, DrawingKind } from '../src/types';

// The default pane: x is time / 6000, y is 400 - price * 2 (price = (400 - y) / 2).
const host: DrawingHost = createMockHost({ panes: [DEFAULT_MOCK_PANE, { yAxisId: 'volume', top: 400, height: 100, min: 0, max: 1000 }] });
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const hit = (part: HitPart, locked = false): HitResult => ({ id: 'd', part, locked });
const rect = (...anchors: Anchor[]): Drawing => ({ id: 'd', kind: 'rectangle', anchors });

describe('cursorFor (FR-INT-020)', () => {
  const body = rect(A(100, 100), A(300, 200));

  it('is the crosshair with a tool active, over anything', () => {
    expect(cursorFor('trend-line', null, undefined, host)).toBe('crosshair');
    expect(cursorFor('text-note', hit('body'), body, host)).toBe('crosshair');
    expect(cursorFor('rectangle', hit('handle:0', true), body, host)).toBe('crosshair');
  });

  it('is the default cursor over nothing', () => {
    expect(cursorFor(null, null, undefined, host)).toBe('default');
  });

  it.each(['body', 'level:0.5', 'label'] as const)('is a pointer over the %s of a drawing, locked or not', (part) => {
    expect(cursorFor(null, hit(part), body, host)).toBe('pointer');
    expect(cursorFor(null, hit(part, true), body, host)).toBe('pointer');
  });

  it('is not-allowed over a handle of a locked drawing, whatever the kind', () => {
    expect(cursorFor(null, hit('handle:0', true), body, host)).toBe('not-allowed');
    expect(cursorFor(null, hit('handle:5', true), body, host)).toBe('not-allowed');
    expect(cursorFor(null, hit('handle:0', true), undefined, host)).toBe('not-allowed');
  });

  it.each<[DrawingKind, number]>([
    ['trend-line', 0],
    ['trend-line', 1],
    ['text-note', 0],
    ['fibonacci-retracement', 1],
    ['fibonacci-arcs', 0],
    ['fibonacci-fans', 1],
    ['fibonacci-time-zones', 0],
  ])('is move over handle %s:%s', (kind, handle) => {
    const drawing: Drawing = { id: 'd', kind, anchors: [A(100, 100), A(300, 200)] };
    expect(cursorFor(null, hit(`handle:${handle}`), drawing, host)).toBe('move');
  });

  describe('horizontal line (FR-INT-010)', () => {
    const line: Drawing = { id: 'd', kind: 'horizontal-line', anchors: [A(100, 100)] };

    it.each(['body', 'label', 'handle:0'] as const)('is ns-resize over its %s, as dragging it changes only the price', (part) => {
      expect(cursorFor(null, hit(part), line, host)).toBe('ns-resize');
    });

    it('is a pointer over the body and label of a locked line, and not-allowed over its handle', () => {
      expect(cursorFor(null, hit('body', true), line, host)).toBe('pointer');
      expect(cursorFor(null, hit('label', true), line, host)).toBe('pointer');
      expect(cursorFor(null, hit('handle:0', true), line, host)).toBe('not-allowed');
    });

    it('is the crosshair with a tool active, as for every kind', () => {
      expect(cursorFor('horizontal-line', hit('handle:0'), line, host)).toBe('crosshair');
    });
  });

  it('is move over a handle of a drawing it knows nothing about', () => {
    expect(cursorFor(null, hit('handle:0'), undefined, host)).toBe('move');
    expect(cursorFor(null, hit('handle:4'), undefined, host)).toBe('move');
  });

  describe('rectangle handles', () => {
    const at = (drawing: Drawing, part: HitPart) => cursorFor(null, hit(part), drawing, host);

    it('shows the diagonal of each corner when anchor 1 is top left (down and right to anchor 2)', () => {
      const d = rect(A(100, 100), A(300, 200));
      expect([0, 1, 2, 3].map((n) => at(d, `handle:${n}`))).toEqual(['nwse-resize', 'nwse-resize', 'nesw-resize', 'nesw-resize']);
    });

    it('swaps the diagonals when anchor 1 is bottom left', () => {
      const d = rect(A(100, 200), A(300, 100));
      expect([0, 1, 2, 3].map((n) => at(d, `handle:${n}`))).toEqual(['nesw-resize', 'nesw-resize', 'nwse-resize', 'nwse-resize']);
    });

    it('follows the screen position when anchor 1 is bottom right or top right', () => {
      expect([0, 1, 2, 3].map((n) => at(rect(A(300, 200), A(100, 100)), `handle:${n}`))).toEqual(['nwse-resize', 'nwse-resize', 'nesw-resize', 'nesw-resize']);
      expect([0, 1, 2, 3].map((n) => at(rect(A(300, 100), A(100, 200)), `handle:${n}`))).toEqual(['nesw-resize', 'nesw-resize', 'nwse-resize', 'nwse-resize']);
    });

    it('treats a flat rectangle as the other diagonal for handles 0 and 1', () => {
      expect(at(rect(A(100, 100), A(300, 100)), 'handle:0')).toBe('nesw-resize');
      expect(at(rect(A(100, 100), A(100, 200)), 'handle:2')).toBe('nwse-resize');
    });

    it('shows the axis of each edge handle', () => {
      const d = rect(A(100, 100), A(300, 200));
      expect([4, 5, 6, 7].map((n) => at(d, `handle:${n}`))).toEqual(['ew-resize', 'ew-resize', 'ns-resize', 'ns-resize']);
    });

    it('is move for a rectangle without two anchors', () => {
      expect(at(rect(A(100, 100)), 'handle:0')).toBe('move');
      expect(at(rect(), 'handle:1')).toBe('move');
      expect(at(rect(), 'handle:5')).toBe('ew-resize');
    });
  });
});

describe('CursorSync (FR-INT-020)', () => {
  it('calls the host only when the cursor changes', () => {
    const setCursor = vi.fn();
    const cursors = new CursorSync({ setCursor });
    expect(cursors.set('pointer')).toBe(true);
    expect(cursors.set('pointer')).toBe(false);
    expect(cursors.set('default')).toBe(true);
    expect(cursors.set('pointer')).toBe(true);
    expect(cursors.set('pointer')).toBe(false);
    expect(setCursor.mock.calls).toEqual([['pointer'], ['default'], ['pointer']]);
  });

  it('calls the host for the first cursor even when it is the default one', () => {
    const setCursor = vi.fn();
    expect(new CursorSync({ setCursor }).set('default')).toBe(true);
    expect(setCursor).toHaveBeenCalledWith('default');
  });

  it('calls the host again for the same cursor after a reset', () => {
    const setCursor = vi.fn();
    const cursors = new CursorSync({ setCursor });
    cursors.set('crosshair');
    cursors.reset();
    expect(cursors.set('crosshair')).toBe(true);
    expect(setCursor).toHaveBeenCalledTimes(2);
  });

  it('works with a real host and records its cursors', () => {
    const mock = createMockHost();
    const cursors = new CursorSync(mock);
    cursors.set('grab');
    cursors.set('grab');
    cursors.set('text');
    expect(mock.cursors).toEqual(['grab', 'text']);
  });
});

describe('duplicateDrawing (FR-INT-024)', () => {
  it('moves each anchor one bar later and ten pixels down, keeping the y-axis', () => {
    const original: Drawing = { id: 'a', kind: 'trend-line', anchors: [A(100, 100), A(300, 200)] };
    const copy = duplicateDrawing(original, 'b', host);
    expect(copy).toMatchObject({ id: 'b', kind: 'trend-line', locked: false });
    expect(copy?.anchors.map((anchor) => anchor.time)).toEqual([100 * 6000 + 60_000, 300 * 6000 + 60_000]);
    expect(copy?.anchors.map((anchor) => anchor.yAxisId)).toEqual(['price', 'price']);
    expect(copy?.anchors[0]?.price).toBeCloseTo((400 - 110) / 2, 9);
    expect(copy?.anchors[1]?.price).toBeCloseTo((400 - 210) / 2, 9);
    expect(DUPLICATE_OFFSET_PX).toBe(10);
  });

  it('uses the bar interval and the scale of the anchor pane', () => {
    const custom = createMockHost({ barInterval: 1000, panes: [DEFAULT_MOCK_PANE, { yAxisId: 'volume', top: 400, height: 100, min: 0, max: 1000 }] });
    const original: Drawing = { id: 'a', kind: 'horizontal-line', anchors: [{ time: 5000, price: 500, yAxisId: 'volume' }] };
    // 500 on the volume pane is y = 450; ten pixels down is y = 460 = price 400.
    const anchor = duplicateDrawing(original, 'b', custom)?.anchors[0];
    expect(anchor).toMatchObject({ time: 6000, yAxisId: 'volume' });
    expect(anchor?.price).toBeCloseTo(400, 9);
  });

  it('keeps everything else of the drawing and does not touch the original', () => {
    const original: Drawing = {
      id: 'a',
      kind: 'text-note',
      anchors: [A(100, 100)],
      text: 'hello',
      style: { color: '#ff0000' },
      options: {},
      hidden: true,
      zIndex: 3,
      meta: { k: 'v' },
    };
    const frozen = JSON.stringify(original);
    expect(duplicateDrawing(original, 'b', host)).toMatchObject({ id: 'b', text: 'hello', style: { color: '#ff0000' }, options: {}, hidden: true, zIndex: 3, meta: { k: 'v' } });
    expect(JSON.stringify(original)).toBe(frozen);
  });

  it('makes the copy of a locked drawing unlocked, and of an unlocked one too', () => {
    expect(duplicateDrawing({ id: 'a', kind: 'horizontal-line', anchors: [A(100, 100)], locked: true }, 'b', host)?.locked).toBe(false);
    expect(duplicateDrawing({ id: 'a', kind: 'horizontal-line', anchors: [A(100, 100)] }, 'b', host)?.locked).toBe(false);
  });

  it('is null when a y-axis has no pane, also for a later anchor', () => {
    const lost: Anchor = { time: 0, price: 1, yAxisId: 'gone' };
    expect(duplicateDrawing({ id: 'a', kind: 'horizontal-line', anchors: [lost] }, 'b', host)).toBeNull();
    expect(duplicateDrawing({ id: 'a', kind: 'trend-line', anchors: [A(100, 100), lost] }, 'b', host)).toBeNull();
  });
});
