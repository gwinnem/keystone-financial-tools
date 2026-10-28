import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { DrawingStore, type Drawing } from 'keystone-financial-tools-core';
import { useDrawings, type UseDrawings } from '../src/use-drawings';

const line = (id: string): Drawing => ({
  id,
  kind: 'trend-line',
  anchors: [
    { time: 1, price: 10, yAxisId: 'price' },
    { time: 2, price: 11, yAxisId: 'price' },
  ],
});

function inScope(create: () => UseDrawings): { result: UseDrawings; stop: () => void } {
  const scope = effectScope();
  const result = scope.run(create);
  if (result === undefined) throw new Error('scope did not run');
  return { result, stop: () => scope.stop() };
}

describe('useDrawings', () => {
  it('starts from the store and follows its changes', () => {
    const store = new DrawingStore([line('a')]);
    const { result } = inScope(() => useDrawings(store));
    expect(result.store).toBe(store);
    expect(result.drawings.value).toBe(store.list());

    store.add(line('b'));
    expect(result.drawings.value).toBe(store.list());
    expect(result.drawings.value).toEqual([line('a'), line('b')]);
  });

  it('creates an empty store when none is given', () => {
    const { result } = inScope(() => useDrawings());
    expect(result.store).toBeInstanceOf(DrawingStore);
    expect(result.drawings.value).toEqual([]);
  });

  it('stops following the store when the scope is disposed', () => {
    const store = new DrawingStore();
    const { result, stop } = inScope(() => useDrawings(store));
    stop();
    store.add(line('a'));
    expect(result.drawings.value).toEqual([]);
  });
});
