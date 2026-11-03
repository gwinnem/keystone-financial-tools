import { describe, expect, it } from 'vitest';
import { DrawingStore } from 'keystone-financial-tools-core';
import { saveDrawings } from '../src/persistence';
import { RepositoryError } from '../src/repository';
import { WebStorageRepository, type RepositoryStorage } from '../src/web-storage-repository';
import { AAPL, AAPL_1H, describeRepositoryContract, documentOf, line } from './repository-contract';

class FakeStorage implements RepositoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** A storage whose methods throw whatever `fail` says. */
function failing(methods: Partial<Record<'getItem' | 'setItem' | 'removeItem', unknown>>): FakeStorage {
  const storage = new FakeStorage();
  for (const [method, thrown] of Object.entries(methods)) {
    (storage as unknown as Record<string, () => never>)[method] = () => {
      throw thrown;
    };
  }
  return storage;
}

const EMPTY = { version: 2, drawings: [] };

describeRepositoryContract('WebStorageRepository', () => new WebStorageRepository(new FakeStorage()));

describe('WebStorageRepository keys', () => {
  it('stores the document as JSON text under keystone-drawings:<symbol>[:<timeframe>]', async () => {
    const storage = new FakeStorage();
    const repository = new WebStorageRepository(storage);
    await repository.save(AAPL, documentOf('AAPL', line('a')));
    await repository.save(AAPL_1H, documentOf('AAPL', line('b')));
    expect([...storage.items.keys()].sort()).toStrictEqual(['keystone-drawings:AAPL', 'keystone-drawings:AAPL:1h']);
    expect(storage.items.get('keystone-drawings:AAPL')).toBe(JSON.stringify(documentOf('AAPL', line('a'))));
  });

  it('starts every key with the prefix it is given', async () => {
    const storage = new FakeStorage();
    const repository = new WebStorageRepository(storage, 'my-app');
    await repository.save(AAPL_1H, documentOf('AAPL', line('a')));
    expect([...storage.items.keys()]).toStrictEqual(['my-app:AAPL:1h']);
    expect((await repository.load(AAPL_1H)).document.drawings).toStrictEqual([line('a')]);
    await repository.remove(AAPL_1H);
    expect(storage.items.size).toBe(0);
  });

  it('does not touch other keys', async () => {
    const storage = new FakeStorage();
    storage.items.set('other', 'value');
    const repository = new WebStorageRepository(storage);
    await repository.save(AAPL, documentOf('AAPL'));
    await repository.remove(AAPL);
    expect([...storage.items.entries()]).toStrictEqual([['other', 'value']]);
  });

  it('reads what the 0.1 saveDrawings wrote under the same key', async () => {
    const storage = new FakeStorage();
    saveDrawings(new DrawingStore([line('a')]), storage, 'keystone-drawings:AAPL');
    const { document, issue } = await new WebStorageRepository(storage).load(AAPL);
    expect(issue).toBeUndefined();
    expect(document).toStrictEqual({ version: 2, drawings: [line('a')] });
  });
});

describe('WebStorageRepository corrupt entries (FR-PER-004)', () => {
  const key = 'keystone-drawings:AAPL';
  const notJson = { code: 'KFT-E-JSON', message: `The drawings saved under ${key} are not valid JSON.` };
  const notDocument = { code: 'KFT-E-JSON', message: 'Expected a drawing document of version 1 or 2.' };

  it.each([
    ['text that is not JSON', '{oops', notJson],
    ['an empty string', '', notJson],
    ['a newer version', '{"version":9,"drawings":[]}', notDocument],
    ['an array', '[]', notDocument],
    ['null', 'null', notDocument],
    ['an invalid scope', '{"version":2,"scope":{"symbol":""},"drawings":[]}', { code: 'KFT-E-JSON', message: expect.stringContaining('scope') }],
  ])('resolves to an empty document plus the issue for %s, and leaves the entry in place', async (_name, text, issue) => {
    const storage = new FakeStorage();
    storage.items.set(key, text);
    expect(await new WebStorageRepository(storage).load(AAPL)).toStrictEqual({ document: EMPTY, issue });
    expect(storage.items.get(key)).toBe(text);
  });

  it('resolves to an empty document plus the KFT-E-SCOPE issue for an entry of another scope, and leaves the entry in place', async () => {
    const storage = new FakeStorage();
    const text = JSON.stringify(documentOf('MSFT', line('a')));
    storage.items.set(key, text);
    expect(await new WebStorageRepository(storage).load(AAPL)).toStrictEqual({
      document: EMPTY,
      issue: { code: 'KFT-E-SCOPE', message: 'The document belongs to MSFT, not to AAPL.' },
    });
    expect(storage.items.get(key)).toBe(text);
  });

  it('loads the valid part of a document and leaves the broken drawings for loadStore', async () => {
    const storage = new FakeStorage();
    storage.items.set(key, JSON.stringify({ version: 2, drawings: [line('a'), { id: 'broken' }] }));
    const { document, issue } = await new WebStorageRepository(storage).load(AAPL);
    expect(issue).toBeUndefined();
    expect(document.drawings).toStrictEqual([line('a'), { id: 'broken' }]);
  });
});

describe('WebStorageRepository failures', () => {
  const key = 'keystone-drawings:AAPL';

  it('rejects a save that the storage refuses with a clear message, keeping the previous document', async () => {
    const quota = new Error('QuotaExceededError: The quota has been exceeded.');
    const storage = new FakeStorage();
    storage.items.set(key, 'previous');
    storage.setItem = () => {
      throw quota;
    };
    const failure = await new WebStorageRepository(storage).save(AAPL, documentOf('AAPL', line('a'))).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RepositoryError);
    expect(failure).toMatchObject({
      name: 'RepositoryError',
      message: `Could not save the drawings under ${key}: QuotaExceededError: The quota has been exceeded.`,
      reason: quota,
    });
    expect(storage.items.get(key)).toBe('previous');
  });

  it('rejects instead of throwing, whatever the storage throws', async () => {
    const repository = new WebStorageRepository(failing({ setItem: 'full' }));
    let pending: Promise<void> | undefined;
    expect(() => {
      pending = repository.save(AAPL, documentOf('AAPL'));
    }).not.toThrow();
    await expect(pending).rejects.toMatchObject({ message: `Could not save the drawings under ${key}: full`, reason: 'full' });
  });

  it('writes nothing when the document cannot be written as JSON', async () => {
    const storage = new FakeStorage();
    const circular = { version: 2, drawings: [] } as Record<string, unknown>;
    circular.self = circular;
    await expect(new WebStorageRepository(storage).save(AAPL, circular as never)).rejects.toMatchObject({
      name: 'RepositoryError',
      message: expect.stringMatching(new RegExp(`^Could not save the drawings under ${key}: `)),
    });
    expect(storage.items.size).toBe(0);
  });

  it('rejects a load when the storage cannot be read', async () => {
    const denied = new Error('SecurityError: access denied');
    await expect(new WebStorageRepository(failing({ getItem: denied })).load(AAPL)).rejects.toMatchObject({
      name: 'RepositoryError',
      message: `Could not read the drawings under ${key}: SecurityError: access denied`,
      reason: denied,
    });
  });

  it('rejects a remove when the storage cannot be written', async () => {
    await expect(new WebStorageRepository(failing({ removeItem: new Error('locked') })).remove(AAPL)).rejects.toMatchObject({
      name: 'RepositoryError',
      message: `Could not remove the drawings under ${key}: locked`,
    });
  });
});
