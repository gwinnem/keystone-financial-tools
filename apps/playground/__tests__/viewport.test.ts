import { describe, expect, it } from 'vitest';
import { clampViewport, MAX_PX_PER_BAR, scrollViewport, viewportKeyAction, zoomViewport, ZOOM_STEP } from '../src/viewport';

const WIDTH = 800;
const TOTAL = 120;
const FIT = WIDTH / TOTAL;

describe('clampViewport', () => {
  it('leaves a viewport that is allowed as it is', () => {
    expect(clampViewport({ pxPerBar: 20, offset: 10 }, WIDTH, TOTAL)).toStrictEqual({ pxPerBar: 20, offset: 10 });
  });

  it('never makes a bar narrower than the one that shows everything, and then there is no scroll', () => {
    expect(clampViewport({ pxPerBar: 1, offset: 5 }, WIDTH, TOTAL)).toStrictEqual({ pxPerBar: FIT, offset: 0 });
  });

  it('never makes a bar wider than the maximum', () => {
    expect(MAX_PX_PER_BAR).toBe(60);
    expect(clampViewport({ pxPerBar: 500, offset: 0 }, WIDTH, TOTAL).pxPerBar).toBe(60);
  });

  it('allows the width that shows everything even when it is above the maximum', () => {
    expect(clampViewport({ pxPerBar: 500, offset: 0 }, WIDTH, 10)).toStrictEqual({ pxPerBar: 80, offset: 0 });
  });

  it('keeps the offset from going before the first slot', () => {
    expect(clampViewport({ pxPerBar: 20, offset: -4 }, WIDTH, TOTAL).offset).toBe(0);
  });

  it('keeps the offset from going past the last slot: the right edge shows the last slot at most', () => {
    // 800 / 20 = 40 slots on screen, so the first of them is at most 120 - 40.
    expect(clampViewport({ pxPerBar: 20, offset: 500 }, WIDTH, TOTAL).offset).toBe(80);
    expect(clampViewport({ pxPerBar: 20, offset: 80 }, WIDTH, TOTAL).offset).toBe(80);
  });
});

describe('zoomViewport', () => {
  const view = { pxPerBar: 20, offset: 30 };

  it('multiplies the bar width by the factor', () => {
    expect(zoomViewport(view, 2, 0, WIDTH, TOTAL).pxPerBar).toBe(40);
    expect(zoomViewport(view, 0.5, 0, WIDTH, TOTAL).pxPerBar).toBe(10);
  });

  it('keeps the slot under the anchor where it is', () => {
    const anchorX = 300;
    const zoomed = zoomViewport(view, 2, anchorX, WIDTH, TOTAL);
    expect(zoomed.offset + anchorX / zoomed.pxPerBar).toBeCloseTo(view.offset + anchorX / view.pxPerBar, 9);
  });

  it('does not move the left edge when the anchor is there', () => {
    expect(zoomViewport(view, 2, 0, WIDTH, TOTAL).offset).toBe(30);
  });

  it('stops at the widest bar', () => {
    expect(zoomViewport({ pxPerBar: 50, offset: 0 }, 10, 0, WIDTH, TOTAL).pxPerBar).toBe(60);
  });

  it('stops at showing everything, from the first slot', () => {
    expect(zoomViewport(view, 0.01, 400, WIDTH, TOTAL)).toStrictEqual({ pxPerBar: FIT, offset: 0 });
  });

  it('keeps the offset inside the data when the anchor would move it out', () => {
    const zoomed = zoomViewport({ pxPerBar: 20, offset: 80 }, 0.5, 800, WIDTH, TOTAL);
    expect(zoomed.pxPerBar).toBe(10);
    expect(zoomed.offset).toBe(40);
  });

  it('zooms in and out by one step and back to where it was', () => {
    const there = zoomViewport(view, ZOOM_STEP, 400, WIDTH, TOTAL);
    const back = zoomViewport(there, 1 / ZOOM_STEP, 400, WIDTH, TOTAL);
    expect(back.pxPerBar).toBeCloseTo(view.pxPerBar, 9);
    expect(back.offset).toBeCloseTo(view.offset, 9);
  });
});

describe('scrollViewport', () => {
  const view = { pxPerBar: 20, offset: 30 };

  it('moves right for a positive number of bars and left for a negative one', () => {
    expect(scrollViewport(view, 5, WIDTH, TOTAL).offset).toBe(35);
    expect(scrollViewport(view, -5, WIDTH, TOTAL).offset).toBe(25);
  });

  it('keeps the bar width', () => {
    expect(scrollViewport(view, 5, WIDTH, TOTAL).pxPerBar).toBe(20);
  });

  it('stops at the edges, and Infinity goes all the way', () => {
    expect(scrollViewport(view, -1000, WIDTH, TOTAL).offset).toBe(0);
    expect(scrollViewport(view, 1000, WIDTH, TOTAL).offset).toBe(80);
    expect(scrollViewport(view, -Infinity, WIDTH, TOTAL).offset).toBe(0);
    expect(scrollViewport(view, Infinity, WIDTH, TOTAL).offset).toBe(80);
  });
});

describe('viewportKeyAction', () => {
  const NONE = { ctrlKey: false, altKey: false, metaKey: false };

  it('zooms in with plus and equals, out with minus and underscore', () => {
    expect(['+', '='].map((key) => viewportKeyAction({ key, ...NONE }))).toStrictEqual(['zoom-in', 'zoom-in']);
    expect(['-', '_'].map((key) => viewportKeyAction({ key, ...NONE }))).toStrictEqual(['zoom-out', 'zoom-out']);
  });

  it('goes to the edges with Home and End, and by half a screen with Page Up and Page Down', () => {
    expect(['Home', 'End', 'PageUp', 'PageDown'].map((key) => viewportKeyAction({ key, ...NONE }))).toStrictEqual(['scroll-start', 'scroll-end', 'page-back', 'page-forward']);
  });

  it('has nothing for other keys, also those that are map members by name only', () => {
    expect(viewportKeyAction({ key: 'a', ...NONE })).toBe(null);
    expect(viewportKeyAction({ key: 'Delete', ...NONE })).toBe(null);
    expect(viewportKeyAction({ key: 'constructor', ...NONE })).toBe(null);
  });

  it('leaves a key held with Ctrl, Alt or Cmd to the browser and the tools', () => {
    expect(viewportKeyAction({ key: '+', ...NONE, ctrlKey: true })).toBe(null);
    expect(viewportKeyAction({ key: '+', ...NONE, altKey: true })).toBe(null);
    expect(viewportKeyAction({ key: 'Home', ...NONE, metaKey: true })).toBe(null);
  });
});
