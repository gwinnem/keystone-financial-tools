import type { DrawingDocument } from 'keystone-financial-tools-core';
import { parseStored, repositoryFailure, serializeDocument, type DrawingRepository, type DrawingScope, type RepositoryLoad } from './repository';
import { DEFAULT_KEY_PREFIX, scopeKey } from './scope';

/** The part of the Web Storage API the repository uses; `localStorage` and `sessionStorage` fit. */
export interface RepositoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Stores each document as JSON text under `<prefix>:<symbol>[:<timeframe>]` in `localStorage`,
 * `sessionStorage` or any object with the same three methods.
 *
 * - A corrupt entry loads as an empty document plus the issue and is left in place.
 * - A storage that refuses a write (quota, private mode) makes `save` reject with a
 *   `RepositoryError`; the document is written with one `setItem`, so nothing partial is stored and
 *   the previous document stays.
 *
 * @example
 * ```ts
 * const repository = new WebStorageRepository(localStorage);
 * await repository.save({ symbol: 'AAPL' }, store.toJSON());
 * ```
 */
export class WebStorageRepository implements DrawingRepository {
  private readonly storage: RepositoryStorage;
  private readonly prefix: string;

  /** `prefix` replaces `keystone-drawings` at the start of every key. */
  constructor(storage: RepositoryStorage, prefix: string = DEFAULT_KEY_PREFIX) {
    this.storage = storage;
    this.prefix = prefix;
  }

  async load(scope: DrawingScope): Promise<RepositoryLoad> {
    const key = scopeKey(scope, this.prefix);
    let text: string | null;
    try {
      text = this.storage.getItem(key);
    } catch (error) {
      throw repositoryFailure('read', key, error);
    }
    return parseStored(text, key);
  }

  async save(scope: DrawingScope, document: DrawingDocument): Promise<void> {
    const key = scopeKey(scope, this.prefix);
    try {
      this.storage.setItem(key, serializeDocument(document));
    } catch (error) {
      throw repositoryFailure('save', key, error);
    }
  }

  async remove(scope: DrawingScope): Promise<void> {
    const key = scopeKey(scope, this.prefix);
    try {
      this.storage.removeItem(key);
    } catch (error) {
      throw repositoryFailure('remove', key, error);
    }
  }
}
