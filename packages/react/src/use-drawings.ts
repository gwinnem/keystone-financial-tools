import { useMemo, useSyncExternalStore } from 'react';
import { DrawingStore, type Drawing } from 'keystone-financial-tools-core';

export interface UseDrawings {
  /** The store; change drawings through it. */
  readonly store: DrawingStore;
  /** The current drawings; the component re-renders on every store change. */
  readonly drawings: readonly Drawing[];
}

/**
 * Tracks a drawing store in a React component. Uses a new store, kept across renders, when none
 * is given.
 */
export function useDrawings(store?: DrawingStore): UseDrawings {
  const resolved = useMemo(() => store ?? new DrawingStore(), [store]);
  const drawings = useSyncExternalStore(
    (onChange) => resolved.subscribe(onChange),
    () => resolved.list()
  );
  return { store: resolved, drawings };
}
