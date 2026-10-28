import { DrawingError, DrawingStore } from 'keystone-financial-tools-core';

/** The part of the Web Storage API the helpers use; `localStorage` and `sessionStorage` fit. */
export interface DrawingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Writes the store's drawings to `storage` under `key`. */
export function saveDrawings(store: DrawingStore, storage: DrawingStorage, key: string): void {
  storage.setItem(key, JSON.stringify(store.toJSON()));
}

/**
 * Reads drawings saved by `saveDrawings`. Returns an empty store when nothing is saved under `key`,
 * and throws `DrawingError` (`KFT-E-JSON`) when the saved text is not valid.
 */
export function loadDrawings(storage: DrawingStorage, key: string): DrawingStore {
  const raw = storage.getItem(key);
  if (raw === null) return new DrawingStore();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DrawingError([{ code: 'KFT-E-JSON', message: `The drawings saved under ${key} are not valid JSON.` }]);
  }
  return DrawingStore.fromJSON(parsed);
}

/** Saves the store after every change; returns the function that stops saving. */
export function autoSave(store: DrawingStore, storage: DrawingStorage, key: string): () => void {
  return store.subscribe(() => saveDrawings(store, storage, key));
}
