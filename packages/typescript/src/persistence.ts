import { DrawingError, DrawingStore } from 'keystone-financial-tools-core';
import { invalidJsonIssue, serializeDocument } from './repository';

/** The part of the Web Storage API the helpers use; `localStorage` and `sessionStorage` fit. */
export interface DrawingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Writes the store's drawings to `storage` under `key`.
 *
 * The helpers are synchronous and take a raw storage key, so they cannot call the asynchronous
 * `WebStorageRepository`; they share its text format and key rules instead. A document saved here
 * under `scopeKey(scope)` loads with `new WebStorageRepository(storage).load(scope)`, and the other
 * way round.
 *
 * @deprecated Use `WebStorageRepository.save`, which reports a full or blocked storage as a
 * `RepositoryError` instead of throwing from the storage.
 *
 * @example Migrating
 * ```ts
 * // before
 * saveDrawings(store, localStorage, 'chart-1');
 * // after
 * await new WebStorageRepository(localStorage).save({ symbol: 'AAPL' }, store.toJSON());
 * ```
 */
export function saveDrawings(store: DrawingStore, storage: DrawingStorage, key: string): void {
  storage.setItem(key, serializeDocument(store.toJSON()));
}

/**
 * Reads drawings saved by `saveDrawings`. Returns an empty store when nothing is saved under `key`,
 * and throws `DrawingError` (`KFT-E-JSON`) when the saved text is not valid.
 *
 * @deprecated Use `loadStore(repository, scope)` (E06-F04), which never throws for stored data and
 * reports what it skipped. To move data saved under a custom key, read it once with this helper and
 * save it with `WebStorageRepository.save`.
 *
 * @example Migrating
 * ```ts
 * // before
 * const store = loadDrawings(localStorage, 'chart-1');
 * // after
 * const { store, report } = await loadStore(new WebStorageRepository(localStorage), { symbol: 'AAPL' });
 * ```
 */
export function loadDrawings(storage: DrawingStorage, key: string): DrawingStore {
  const raw = storage.getItem(key);
  if (raw === null) return new DrawingStore();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DrawingError([invalidJsonIssue(key)]);
  }
  return DrawingStore.fromJSON(parsed);
}

/**
 * Saves the store after every change; returns the function that stops saving.
 *
 * Exported from the package index as the storage form of `autoSave`, which also accepts a repository.
 *
 * @deprecated Use `autoSave(store, repository, scope)`: it saves once changes settle instead of on
 * every change, reports failures and can be flushed.
 *
 * @example Migrating
 * ```ts
 * // before
 * const stop = autoSave(store, localStorage, 'chart-1');
 * // after
 * const saver = autoSave(store, new WebStorageRepository(localStorage), { symbol: 'AAPL' });
 * ```
 */
export function autoSave(store: DrawingStore, storage: DrawingStorage, key: string): () => void {
  return store.subscribe(() => saveDrawings(store, storage, key));
}
