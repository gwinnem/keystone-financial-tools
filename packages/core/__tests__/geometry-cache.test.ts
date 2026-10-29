import { describe, expect, it, vi } from 'vitest';
import type { TextShape } from '../src/geometry/types';
import { GeometryCache } from '../src/hit/geometry-cache';
import { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import { LIGHT_THEME, type DrawingTheme } from '../src/theme';
import type { Drawing } from '../src/types';

const line = (id: string, price = 100): Drawing => ({
  id,
  kind: 'trend-line',
  anchors: [
    { time: 600_000, price, yAxisId: 'price' },
    { time: 1_800_000, price: 100, yAxisId: 'price' },
  ],
});

describe('GeometryCache (FR-HIT-004)', () => {
  it('computes a drawing once and returns the same geometry again', () => {
    const host = createMockHost();
    const timeToX = vi.spyOn(host, 'timeToX');
    const cache = new GeometryCache(host);
    const a = line('a');
    const first = cache.get(a);
    expect(first).not.toBeNull();
    expect(first?.drawingId).toBe('a');
    const calls = timeToX.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(cache.get(a)).toBe(first);
    expect(timeToX).toHaveBeenCalledTimes(calls);
    expect(cache.size).toBe(1);
  });

  it('keeps one entry per drawing', () => {
    const cache = new GeometryCache(createMockHost());
    const a = line('a');
    const b = line('b', 50);
    const ga = cache.get(a);
    const gb = cache.get(b);
    expect(ga).not.toBe(gb);
    expect(ga?.drawingId).toBe('a');
    expect(gb?.drawingId).toBe('b');
    expect(cache.get(a)).toBe(ga);
    expect(cache.get(b)).toBe(gb);
    expect(cache.size).toBe(2);
  });

  it('recomputes a changed drawing and only that one, never returning stale geometry', () => {
    const host = createMockHost();
    const timeToX = vi.spyOn(host, 'timeToX');
    const cache = new GeometryCache(host);
    const a = line('a', 50);
    const b = line('b', 60);
    const before = cache.get(a);
    const kept = cache.get(b);
    const calls = timeToX.mock.calls.length;

    const changed = { ...a, anchors: [a.anchors[0], { ...a.anchors[1], price: 150 }] };
    const after = cache.get(changed);
    expect(timeToX.mock.calls.length).toBeGreaterThan(calls);
    expect(after).not.toBe(before);
    expect(after?.shapes).not.toEqual(before?.shapes);
    expect(after?.shapes).toEqual([{ type: 'line', part: 'body', from: { x: 100, y: 300 }, to: { x: 300, y: 100 } }]);

    const afterChange = timeToX.mock.calls.length;
    expect(cache.get(b)).toBe(kept);
    expect(cache.get(changed)).toBe(after);
    expect(timeToX).toHaveBeenCalledTimes(afterChange);
    expect(cache.size).toBe(2);
  });

  it('follows a drawing replaced in the store', () => {
    const host = createMockHost();
    const a = line('a', 50);
    const store = new DrawingStore([a, line('b')]);
    const cache = new GeometryCache(host, { store });
    const before = cache.get(store.get('a') as Drawing);
    store.update('a', { zIndex: 3 });
    const after = cache.get(store.get('a') as Drawing);
    expect(after).not.toBe(before);
    expect(after).toEqual(before);
    expect(cache.size).toBe(1);
  });

  it('forgets everything on a viewport change and computes against the new viewport', () => {
    const host = createMockHost();
    const cache = new GeometryCache(host);
    const a = line('a', 50);
    const before = cache.get(a);
    cache.get(line('b'));
    expect(cache.size).toBe(2);
    host.scroll(50);
    expect(cache.size).toBe(0);
    const after = cache.get(a);
    expect(after).not.toBe(before);
    expect(after?.shapes).toEqual([{ type: 'line', part: 'body', from: { x: 150, y: 300 }, to: { x: 350, y: 200 } }]);
    host.zoom(2);
    expect(cache.size).toBe(0);
    expect(cache.get(a)).not.toBe(after);
  });

  it('drops the entries of drawings removed from the store, and only those', () => {
    const host = createMockHost();
    const store = new DrawingStore([line('a'), line('b'), line('c')]);
    const cache = new GeometryCache(host, { store });
    const b = store.get('b') as Drawing;
    const kept = cache.get(b);
    cache.get(store.get('a') as Drawing);
    cache.get(store.get('c') as Drawing);
    expect(cache.size).toBe(3);
    store.remove('a');
    expect(cache.size).toBe(2);
    expect(cache.get(b)).toBe(kept);
    store.remove('c');
    expect(cache.size).toBe(1);
    store.clear();
    expect(cache.size).toBe(0);
  });

  it('keeps entries when drawings are added or updated', () => {
    const host = createMockHost();
    const store = new DrawingStore([line('a'), line('b')]);
    const cache = new GeometryCache(host, { store });
    cache.get(store.get('a') as Drawing);
    cache.get(store.get('b') as Drawing);
    store.update('a', { zIndex: 1 });
    expect(cache.size).toBe(2);
    store.add(line('c'));
    expect(cache.size).toBe(2);
    store.batch(() => {
      store.update('b', { zIndex: 2 });
      store.add(line('d'));
    });
    expect(cache.size).toBe(2);
  });

  it('prunes removed drawings in a batch together with other operations', () => {
    const host = createMockHost();
    const store = new DrawingStore([line('a'), line('b'), line('c')]);
    const cache = new GeometryCache(host, { store });
    for (const drawing of store.list()) cache.get(drawing);
    store.batch(() => {
      store.update('a', { zIndex: 1 });
      store.remove('b');
      store.add(line('d'));
    });
    expect(cache.size).toBe(2);
  });

  it('does not follow a store it was not given', () => {
    const host = createMockHost();
    const store = new DrawingStore([line('a')]);
    const cache = new GeometryCache(host);
    cache.get(store.get('a') as Drawing);
    store.remove('a');
    expect(cache.size).toBe(1);
  });

  it('caches a drawing without a pane as null', () => {
    const host = createMockHost();
    const paneRect = vi.spyOn(host, 'paneRect');
    const cache = new GeometryCache(host);
    const orphan: Drawing = { id: 'o', kind: 'horizontal-line', anchors: [{ time: 0, price: 1, yAxisId: 'volume' }] };
    expect(cache.get(orphan)).toBeNull();
    const calls = paneRect.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(cache.get(orphan)).toBeNull();
    expect(paneRect).toHaveBeenCalledTimes(calls);
    expect(cache.size).toBe(1);
  });

  it('clears on demand', () => {
    const cache = new GeometryCache(createMockHost());
    const a = line('a');
    const first = cache.get(a);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get(a)).not.toBe(first);
    expect(cache.get(a)).toEqual(first);
  });

  it('passes the theme and measureText to the geometry', () => {
    const host = createMockHost();
    const note: Drawing = { id: 'n', kind: 'text-note', anchors: [{ time: 0, price: 100, yAxisId: 'price' }], text: 'ab' };
    const theme: DrawingTheme = { ...LIGHT_THEME, kinds: { ...LIGHT_THEME.kinds, 'text-note': { fontSize: 20 } } };
    expect((new GeometryCache(host, { theme }).get(note)?.shapes[0] as TextShape).fontSize).toBe(20);
    expect((new GeometryCache(host).get(note)?.shapes[0] as TextShape).fontSize).toBe(14);
    const measureText = vi.fn(() => 77);
    expect((new GeometryCache(host, { measureText }).get(note)?.shapes[0] as TextShape).width).toBe(77);
    expect(measureText).toHaveBeenCalledWith('ab', 14);
  });

  it('stops following the host and the store when destroyed, and can be destroyed twice', () => {
    const host = createMockHost();
    const store = new DrawingStore([line('a')]);
    const before = host.listenerCount('viewport');
    const cache = new GeometryCache(host, { store });
    expect(host.listenerCount('viewport')).toBe(before + 1);
    cache.get(store.get('a') as Drawing);
    cache.destroy();
    expect(cache.size).toBe(0);
    expect(host.listenerCount('viewport')).toBe(before);
    expect(() => cache.destroy()).not.toThrow();

    const a = store.get('a') as Drawing;
    cache.get(a);
    expect(cache.size).toBe(1);
    store.remove('a');
    expect(cache.size).toBe(1);
    host.scroll(10);
    expect(cache.size).toBe(1);
  });

  it('subscribes to the host only once and to nothing else', () => {
    const host = createMockHost();
    const cache = new GeometryCache(host);
    expect(host.listenerCount('viewport')).toBe(1);
    expect(host.listenerCount('pointer')).toBe(0);
    expect(host.listenerCount('key')).toBe(0);
    cache.destroy();
  });
});
