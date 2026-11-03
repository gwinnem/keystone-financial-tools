import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { IndexedDbRepository } from '../src/indexeddb-repository';
import { RepositoryError } from '../src/repository';
import { AAPL, AAPL_1H, describeRepositoryContract, documentOf, line } from './repository-contract';

const newFactory = (): IDBFactory => new FakeIDBFactory();
const KEY = 'keystone-drawings:AAPL';
const EMPTY = { version: 2, drawings: [] };

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Opens a database directly, without the repository; `upgrade` runs when the database is created or upgraded. */
function rawOpen(factory: IDBFactory, name: string, version: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  const r = factory.open(name, version);
  if (upgrade !== undefined) r.onupgradeneeded = () => upgrade(r.result);
  return request(r);
}

const withDrawingsStore = (db: IDBDatabase): void => {
  db.createObjectStore('drawings');
};

function rawGet(db: IDBDatabase, key: string): Promise<unknown> {
  return request(db.transaction('drawings').objectStore('drawings').get(key));
}

function rawPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drawings', 'readwrite');
    transaction.objectStore('drawings').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/** A factory whose database cannot be opened, or whose transactions abort, with `error`. */
function brokenFactory(kind: 'open' | 'transaction', error: unknown): IDBFactory {
  const store = { get: () => ({ result: undefined }), put: () => ({ result: undefined }), delete: () => ({ result: undefined }) };
  const database = {
    transaction: () => {
      const transaction: Record<string, unknown> = { error, objectStore: () => store };
      queueMicrotask(() => (transaction.onabort as () => void)());
      return transaction;
    },
  };
  return {
    open: () => {
      const opening: Record<string, unknown> = kind === 'open' ? { error } : { result: database };
      queueMicrotask(() => (opening[kind === 'open' ? 'onerror' : 'onsuccess'] as () => void)());
      return opening;
    },
  } as unknown as IDBFactory;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describeRepositoryContract('IndexedDbRepository', () => new IndexedDbRepository({ dbName: 'contract', factory: newFactory() }));

describe('IndexedDbRepository storage', () => {
  it('creates the database at version 1 with one drawings object store', async () => {
    const factory = newFactory();
    await new IndexedDbRepository({ dbName: 'db', factory }).save(AAPL, documentOf('AAPL'));
    const db = await rawOpen(factory, 'db', 1);
    expect(db.version).toBe(1);
    expect([...db.objectStoreNames]).toStrictEqual(['drawings']);
  });

  it('keeps each document as one record under keystone-drawings:<symbol>[:<timeframe>]', async () => {
    const factory = newFactory();
    const repository = new IndexedDbRepository({ dbName: 'db', factory });
    await repository.save(AAPL, documentOf('AAPL', line('a')));
    await repository.save(AAPL_1H, documentOf('AAPL', line('b')));
    const db = await rawOpen(factory, 'db', 1);
    expect(await rawGet(db, KEY)).toStrictEqual(documentOf('AAPL', line('a')));
    expect(await rawGet(db, 'keystone-drawings:AAPL:1h')).toStrictEqual(documentOf('AAPL', line('b')));
    await repository.remove(AAPL);
    expect(await rawGet(db, KEY)).toBeUndefined();
  });

  it('opens an existing version 1 database without upgrading it', async () => {
    const factory = newFactory();
    const db = await rawOpen(factory, 'db', 1, withDrawingsStore);
    await rawPut(db, KEY, documentOf('AAPL', line('a')));
    expect((await new IndexedDbRepository({ dbName: 'db', factory }).load(AAPL)).document).toStrictEqual(documentOf('AAPL', line('a')));
  });

  it('opens the database once, at version 1, for all calls', async () => {
    const factory = newFactory();
    const open = vi.spyOn(factory, 'open');
    const repository = new IndexedDbRepository({ dbName: 'db', factory });
    await repository.save(AAPL, documentOf('AAPL'));
    await repository.load(AAPL);
    await repository.remove(AAPL);
    await Promise.all([repository.load(AAPL), repository.load(AAPL_1H)]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('db', 1);
  });

  it('shares the documents between repositories on the same database and keeps other databases apart', async () => {
    const factory = newFactory();
    await new IndexedDbRepository({ dbName: 'one', factory }).save(AAPL, documentOf('AAPL', line('a')));
    expect((await new IndexedDbRepository({ dbName: 'one', factory }).load(AAPL)).document.drawings).toStrictEqual([line('a')]);
    expect((await new IndexedDbRepository({ dbName: 'two', factory }).load(AAPL)).document.drawings).toStrictEqual([]);
  });
});

describe('IndexedDbRepository corrupt records (FR-PER-004)', () => {
  const notDocument = { code: 'KFT-E-JSON', message: 'Expected a drawing document of version 1 or 2.' };

  it.each([
    ['text', 'drawings'],
    ['null', null],
    ['an array', []],
    ['a newer version', { version: 9, drawings: [] }],
  ])('resolves to an empty document plus the issue for %s, and leaves the record in place', async (_name, value) => {
    const factory = newFactory();
    const db = await rawOpen(factory, 'db', 1, withDrawingsStore);
    await rawPut(db, KEY, value);
    expect(await new IndexedDbRepository({ dbName: 'db', factory }).load(AAPL)).toStrictEqual({ document: EMPTY, issue: notDocument });
    expect(await rawGet(db, KEY)).toStrictEqual(value);
  });

  it('resolves to an empty document plus the KFT-E-SCOPE issue for a record of another scope, and leaves the record in place', async () => {
    const factory = newFactory();
    const db = await rawOpen(factory, 'db', 1, withDrawingsStore);
    await rawPut(db, KEY, documentOf('MSFT', line('a')));
    expect(await new IndexedDbRepository({ dbName: 'db', factory }).load(AAPL)).toStrictEqual({
      document: EMPTY,
      issue: { code: 'KFT-E-SCOPE', message: 'The document belongs to MSFT, not to AAPL.' },
    });
    expect(await rawGet(db, KEY)).toStrictEqual(documentOf('MSFT', line('a')));
  });

  it('migrates a version 1 record', async () => {
    const factory = newFactory();
    const db = await rawOpen(factory, 'db', 1, withDrawingsStore);
    await rawPut(db, KEY, { version: 1, drawings: [line('a')] });
    expect(await new IndexedDbRepository({ dbName: 'db', factory }).load(AAPL)).toStrictEqual({ document: { version: 2, drawings: [line('a')] } });
  });
});

describe('IndexedDbRepository failures', () => {
  it('rejects with a clear message when the database has a newer version than this one', async () => {
    const factory = newFactory();
    await rawOpen(factory, 'db', 2, withDrawingsStore);
    const repository = new IndexedDbRepository({ dbName: 'db', factory });
    const failure = await repository.load(AAPL).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RepositoryError);
    expect(failure).toHaveProperty('name', 'RepositoryError');
    expect((failure as RepositoryError).reason).toHaveProperty('name', 'VersionError');
    expect((failure as RepositoryError).message).toMatch(/^Could not read the drawings under keystone-drawings:AAPL: .+/);
    await expect(repository.save(AAPL, documentOf('AAPL'))).rejects.toThrow(/^Could not save the drawings under keystone-drawings:AAPL: .+/);
    await expect(repository.remove(AAPL)).rejects.toThrow(/^Could not remove the drawings under keystone-drawings:AAPL: .+/);
  });

  it('rejects a document that cannot be stored and stores nothing', async () => {
    const factory = newFactory();
    const repository = new IndexedDbRepository({ dbName: 'db', factory });
    const broken = { version: 2, drawings: [], callback: () => 1 } as never;
    const failure = await repository.save(AAPL, broken).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RepositoryError);
    expect((failure as RepositoryError).reason).toHaveProperty('name', 'DataCloneError');
    expect((failure as RepositoryError).message).toMatch(/^Could not save the drawings under keystone-drawings:AAPL: .+/);
    expect(await repository.load(AAPL)).toStrictEqual({ document: EMPTY });
  });

  it('rejects when the database cannot be opened', async () => {
    const denied = new Error('denied');
    await expect(new IndexedDbRepository({ dbName: 'db', factory: brokenFactory('open', denied) }).load(AAPL)).rejects.toMatchObject({
      name: 'RepositoryError',
      message: `Could not read the drawings under ${KEY}: denied`,
      reason: denied,
    });
  });

  it('rejects when a transaction is aborted, whichever the action', async () => {
    const aborted = new Error('aborted');
    const repository = new IndexedDbRepository({ dbName: 'db', factory: brokenFactory('transaction', aborted) });
    await expect(repository.load(AAPL)).rejects.toMatchObject({ message: `Could not read the drawings under ${KEY}: aborted`, reason: aborted });
    await expect(repository.save(AAPL, documentOf('AAPL'))).rejects.toMatchObject({ message: `Could not save the drawings under ${KEY}: aborted` });
    await expect(repository.remove(AAPL)).rejects.toMatchObject({ message: `Could not remove the drawings under ${KEY}: aborted` });
  });
});

describe('IndexedDbRepository without a factory option', () => {
  it('rejects with a clear message when IndexedDB is not available (for example while rendering on the server)', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(new IndexedDbRepository({ dbName: 'db' }).load(AAPL)).rejects.toMatchObject({
      name: 'RepositoryError',
      message: `Could not read the drawings under ${KEY}: IndexedDB is not available in this environment.`,
    });
  });

  it('tries again after a failed open', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const repository = new IndexedDbRepository({ dbName: 'db' });
    await expect(repository.save(AAPL, documentOf('AAPL', line('a')))).rejects.toBeInstanceOf(RepositoryError);
    vi.stubGlobal('indexedDB', newFactory());
    await repository.save(AAPL, documentOf('AAPL', line('a')));
    expect((await repository.load(AAPL)).document.drawings).toStrictEqual([line('a')]);
  });

  it('uses the global indexedDB', async () => {
    const ambient = newFactory();
    vi.stubGlobal('indexedDB', ambient);
    await new IndexedDbRepository({ dbName: 'db' }).save(AAPL, documentOf('AAPL', line('a')));
    expect(await rawGet(await rawOpen(ambient, 'db', 1), KEY)).toStrictEqual(documentOf('AAPL', line('a')));
  });

  it('prefers the factory option to the global indexedDB', async () => {
    const ambient = newFactory();
    const chosen = newFactory();
    vi.stubGlobal('indexedDB', ambient);
    await new IndexedDbRepository({ dbName: 'db', factory: chosen }).save(AAPL, documentOf('AAPL', line('a')));
    expect(await rawGet(await rawOpen(chosen, 'db', 1), KEY)).toStrictEqual(documentOf('AAPL', line('a')));
    expect(await ambient.databases()).toStrictEqual([]);
  });
});
