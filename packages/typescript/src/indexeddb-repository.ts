import type { DrawingDocument } from 'keystone-financial-tools-core';
import { readStored, repositoryFailure, type DrawingRepository, type DrawingScope, type RepositoryAction, type RepositoryLoad } from './repository';
import { scopeKey } from './scope';

const STORE = 'drawings';
const DB_VERSION = 1;

/** The upgrade to each database version, from the one before it: `UPGRADES[n]` takes version n to n + 1. */
const UPGRADES: readonly ((db: IDBDatabase) => void)[] = [
  (db) => {
    db.createObjectStore(STORE);
  },
];

function openDatabase(factory: IDBFactory | undefined, name: string): Promise<IDBDatabase> {
  if (factory === undefined) return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = (event) => {
      for (let version = event.oldVersion; version < DB_VERSION; version++) UPGRADES[version](request.result);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Options of an `IndexedDbRepository`. */
export interface IndexedDbRepositoryOptions {
  /** The name of the database; the documents live in its `drawings` object store. */
  readonly dbName: string;
  /** The IndexedDB to use. Default: the global `indexedDB`. */
  readonly factory?: IDBFactory;
}

/**
 * Stores each document as one record, keyed `keystone-drawings:<symbol>[:<timeframe>]`, in an
 * IndexedDB database. The database is opened on first use, at version 1 (created or upgraded as
 * needed), and kept open.
 *
 * - A corrupt record, or one that belongs to another scope, loads as an empty document plus the
 *   issue and is left in place.
 * - Every failure (no IndexedDB, a newer database version, a blocked or aborted transaction, a
 *   document that cannot be stored) rejects with a `RepositoryError`; a failed open is retried by
 *   the next call.
 *
 * @example
 * ```ts
 * const repository = new IndexedDbRepository({ dbName: 'my-app-drawings' });
 * await repository.save({ symbol: 'AAPL' }, store.toJSON());
 * ```
 */
export class IndexedDbRepository implements DrawingRepository {
  private readonly dbName: string;
  private readonly factory: IDBFactory | undefined;
  private connection: Promise<IDBDatabase> | undefined;

  constructor(options: IndexedDbRepositoryOptions) {
    this.dbName = options.dbName;
    this.factory = options.factory;
  }

  async load(scope: DrawingScope): Promise<RepositoryLoad> {
    const key = scopeKey(scope);
    return readStored(await this.run('read', key, 'readonly', (store) => store.get(key)), scope);
  }

  async save(scope: DrawingScope, document: DrawingDocument): Promise<void> {
    const key = scopeKey(scope);
    await this.run('save', key, 'readwrite', (store) => store.put(document, key));
  }

  async remove(scope: DrawingScope): Promise<void> {
    const key = scopeKey(scope);
    await this.run('remove', key, 'readwrite', (store) => store.delete(key));
  }

  private open(): Promise<IDBDatabase> {
    if (this.connection === undefined) {
      const connection = openDatabase(this.factory ?? globalThis.indexedDB, this.dbName);
      this.connection = connection;
      // A failed open is not kept: the next call tries again.
      connection.catch(() => {
        this.connection = undefined;
      });
    }
    return this.connection;
  }

  /** Runs one request in its own transaction and resolves with its result once the transaction has completed. */
  private async run<T>(action: RepositoryAction, key: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    try {
      const db = await this.open();
      return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch (error) {
      throw repositoryFailure(action, key, error);
    }
  }
}
