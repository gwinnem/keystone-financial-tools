import { onScopeDispose, shallowRef, type Ref } from 'vue';
import { DrawingStore, type Drawing } from 'keystone-financial-tools-core';

export interface UseDrawings {
  /** The store; change drawings through it. */
  readonly store: DrawingStore;
  /** The current drawings, replaced on every store change. */
  readonly drawings: Readonly<Ref<readonly Drawing[]>>;
}

/**
 * Tracks a drawing store as a Vue ref. Uses a new store when none is given. The subscription ends
 * when the calling effect scope (for example the component) is disposed.
 */
export function useDrawings(store: DrawingStore = new DrawingStore()): UseDrawings {
  const drawings = shallowRef<readonly Drawing[]>(store.list());
  const stop = store.subscribe((next) => {
    drawings.value = next;
  });
  onScopeDispose(stop);
  return { store, drawings };
}
