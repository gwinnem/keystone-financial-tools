import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DrawingStore, type Drawing } from 'keystone-financial-tools-core';
import { useDrawings } from '../src/use-drawings';

const line = (id: string): Drawing => ({
  id,
  kind: 'trend-line',
  anchors: [
    { time: 1, price: 10, yAxisId: 'price' },
    { time: 2, price: 11, yAxisId: 'price' },
  ],
});

describe('useDrawings', () => {
  it('starts from the store and re-renders on its changes', () => {
    const store = new DrawingStore([line('a')]);
    const { result } = renderHook(() => useDrawings(store));
    expect(result.current.store).toBe(store);
    expect(result.current.drawings).toBe(store.list());

    act(() => store.add(line('b')));
    expect(result.current.drawings).toEqual([line('a'), line('b')]);
  });

  it('creates an empty store when none is given and keeps it across renders', () => {
    const { result, rerender } = renderHook(() => useDrawings());
    const first = result.current.store;
    expect(first).toBeInstanceOf(DrawingStore);
    expect(result.current.drawings).toEqual([]);
    rerender();
    expect(result.current.store).toBe(first);
  });

  it('switches to a new store passed in', () => {
    const a = new DrawingStore([line('a')]);
    const b = new DrawingStore([line('b')]);
    const { result, rerender } = renderHook(({ store }) => useDrawings(store), {
      initialProps: { store: a },
    });
    rerender({ store: b });
    expect(result.current.store).toBe(b);
    expect(result.current.drawings).toEqual([line('b')]);

    act(() => b.add(line('c')));
    expect(result.current.drawings).toEqual([line('b'), line('c')]);
  });

  it('stops following the store after unmount', () => {
    const store = new DrawingStore();
    const { result, unmount } = renderHook(() => useDrawings(store));
    unmount();
    store.add(line('a'));
    expect(result.current.drawings).toEqual([]);
  });
});
