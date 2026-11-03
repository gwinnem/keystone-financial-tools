# keystone-financial-tools-typescript

Framework-free API for the Keystone drawing tools. Re-exports `keystone-financial-tools-core` and
adds persistence: asynchronous repositories (memory, Web Storage, IndexedDB) and the 0.1
synchronous Web Storage helpers.

## Repositories

A repository stores one document per scope (a symbol and, optionally, a timeframe). All of them
implement the same asynchronous interface, so an application chooses where drawings live without
changing any other code.

```ts
interface DrawingRepository {
  load(scope: DrawingScope): Promise<RepositoryLoad>;
  save(scope: DrawingScope, document: DrawingDocument): Promise<void>;
  remove(scope: DrawingScope): Promise<void>;
}
```

| Export | Purpose | Tier (FR-LIC-002, OD-2 open) |
|---|---|---|
| `MemoryRepository` | Keeps documents in memory, for tests and server-side rendering | Community |
| `WebStorageRepository(storage, prefix?)` | `localStorage`, `sessionStorage` or any `getItem`/`setItem`/`removeItem` object | Community |
| `IndexedDbRepository({ dbName, factory? })` | One IndexedDB record per scope, for many drawings per symbol | Professional |
| `scopeKey(scope, prefix?)` | The storage key of a scope: `keystone-drawings:<symbol>[:<timeframe>]`, URL-encoded | |
| `readStored(value)` | For your own repository: turns what you stored into the result of `load` | |
| `RepositoryError` | What a failing backend rejects with; `reason` is what it threw | |
| `REPOSITORY_TIERS` | The tier of each repository under the proposed split | |

`scope` is `{ symbol, timeframe? }`. Drawings are timeframe independent by default: leave
`timeframe` out unless an application keeps separate markup per timeframe.

```ts
import { IndexedDbRepository, WebStorageRepository } from 'keystone-financial-tools-typescript';

const repository = new WebStorageRepository(localStorage); // or new IndexedDbRepository({ dbName: 'my-app' })
await repository.save({ symbol: 'AAPL' }, store.toJSON());
const { document, issue } = await repository.load({ symbol: 'AAPL' });
```

### What `load` and `save` do

- `load` resolves with `{ document, issue? }`. Nothing stored gives an empty document and no issue. A
  stored entry that is not a drawing document (text that is not JSON, a newer version, an invalid
  scope) gives an empty document plus the `KFT-E-JSON` issue, and the entry is left in place. Older
  documents (version 1) are migrated.
- `load` does not validate the drawings; `importDocument` skips the invalid ones and reports them.
- `save` replaces the document of the scope as a whole; the stored document is a copy. `remove`
  deletes it, and removing a scope that was never saved resolves too.
- A backend that fails rejects with a `RepositoryError`: `Could not <read|save|remove> the drawings
  under <key>: <what the backend said>`. `WebStorageRepository` writes with a single `setItem`, so a
  full storage leaves the previous document untouched and nothing partial behind.
- `IndexedDbRepository` opens its database (version 1, created or upgraded as needed) on first use
  and keeps it open. It rejects when IndexedDB is missing (for example on the server) or the database
  has a newer version, and tries again on the next call.

### Your own backend

Implement the three methods and use `readStored` so that corrupt data follows the same rules. A REST
repository:

```ts
import { readStored, scopeKey, type DrawingRepository, type DrawingScope } from 'keystone-financial-tools-typescript';

class RestRepository implements DrawingRepository {
  private url = (scope: DrawingScope) => `/api/drawings/${encodeURIComponent(scopeKey(scope))}`;

  async load(scope: DrawingScope) {
    const response = await fetch(this.url(scope));
    return response.status === 404 ? readStored(undefined) : readStored(await response.json());
  }
  async save(scope: DrawingScope, document: DrawingDocument) {
    await fetch(this.url(scope), { method: 'PUT', body: JSON.stringify(document) });
  }
  async remove(scope: DrawingScope) {
    await fetch(this.url(scope), { method: 'DELETE' });
  }
}
```

The package's `__tests__/repository-contract.ts` is the contract every repository passes (empty load,
round trip, copies, scopes kept apart, remove); run it against your own implementation the same way
the three repositories here do.

## Synchronous Web Storage helpers (0.1, deprecated)

The helpers keep working with unchanged signatures and behaviour, and are marked `@deprecated`.
They are synchronous and take a raw storage key, so they cannot call the asynchronous
`WebStorageRepository`; they share its text format, key rules and `KFT-E-JSON` issue instead.

| Export | Purpose |
|---|---|
| `saveDrawings(store, storage, key)` | Writes the store's saved document under `key` |
| `loadDrawings(storage, key)` | Reads it back (version 1 documents are migrated); an empty store when nothing is saved, `DrawingError` (`KFT-E-JSON`) for invalid text |
| `autoSave(store, storage, key)` | Saves after every change; returns the function that stops saving |
| `DrawingStorage` | The part of the Web Storage API used; `localStorage` fits |

```ts
import { autoSave, loadDrawings } from 'keystone-financial-tools-typescript';

const store = loadDrawings(localStorage, 'chart-aapl');
const stopSaving = autoSave(store, localStorage, 'chart-aapl');
```

Under the key `keystone-drawings:AAPL` they read and write the same entry as
`WebStorageRepository(localStorage)` does for `{ symbol: 'AAPL' }`.

### Migrating to repositories

```ts
// before
saveDrawings(store, localStorage, 'chart-aapl');
const restored = loadDrawings(localStorage, 'chart-aapl');

// after
const repository = new WebStorageRepository(localStorage);
await repository.save({ symbol: 'AAPL' }, store.toJSON());
const { document, issue } = await repository.load({ symbol: 'AAPL' });
```

- Data saved under a custom key is not found by the repository (it uses `scopeKey`). Move it once:
  read it with `loadDrawings(localStorage, 'chart-aapl')`, then `repository.save` it.
- `autoSave(store, repository, scope)` (debounced) replaces the storage form of `autoSave`, and
  `loadStore(repository, scope)` replaces `loadDrawings`; both arrive with the rest of E06.

The core's `importDocument(store, json, { mode })` is also available here for importing a file
while keeping the valid drawings of a partly broken document.
