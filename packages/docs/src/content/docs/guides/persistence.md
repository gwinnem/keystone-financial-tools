---
title: Save and load drawings
description: Keep drawings between sessions with repositories, auto-save, safe loading and export and import.
---

Persistence is in `keystone-financial-tools-typescript`, which every framework package can use. A repository stores one document per scope: a symbol and, optionally, a timeframe. Drawings are timeframe independent by default, so leave `timeframe` out unless your application keeps separate markup per timeframe.

## Repositories

All repositories have the same asynchronous interface, so you choose where drawings live without changing any other code.

```ts
interface DrawingRepository {
  load(scope: DrawingScope): Promise<RepositoryLoad>;
  save(scope: DrawingScope, document: DrawingDocument): Promise<void>;
  remove(scope: DrawingScope): Promise<void>;
}
```

- `MemoryRepository` keeps documents in memory, for tests and server-side rendering.
- `WebStorageRepository(storage, prefix?)` uses `localStorage`, `sessionStorage` or any object with `getItem`, `setItem` and `removeItem`.
- `IndexedDbRepository({ dbName })` keeps one IndexedDB record per scope. It rejects when IndexedDB is missing (for example on the server) or the database has a newer version, and tries again on the next call.

```ts
import { WebStorageRepository } from 'keystone-financial-tools-typescript';

const repository = new WebStorageRepository(localStorage);
await repository.save({ symbol: 'AAPL' }, store.toJSON());
const { document, issue } = await repository.load({ symbol: 'AAPL' });
```

## Load safely

`loadStore` loads the drawings of a scope into a new store and resolves whatever is stored. A stored entry that is not a drawing document (`KFT-E-JSON`) or belongs to another symbol or timeframe (`KFT-E-SCOPE`) gives an empty store and the issue in the report. Drawings that cannot be read are skipped and listed in the report; the others are loaded.

```ts
import { autoSave, loadStore, WebStorageRepository } from 'keystone-financial-tools-typescript';

const repository = new WebStorageRepository(localStorage);
const { store, report } = await loadStore(repository, { symbol: 'AAPL' });
if (report.issue !== undefined) console.warn(report.issue.message); // the stored entry was not used
if (report.skipped.length > 0) console.warn(`${report.skipped.length} drawings could not be read`);
```

A backend that fails (storage full, database unavailable) rejects with a `RepositoryError`. An empty store there would hide the saved drawings and be saved over them.

## Save as the user draws

`autoSave` saves the store once its changes have settled, so dragging a drawing writes once instead of on every frame.

```ts
const saver = autoSave(store, repository, { symbol: 'AAPL' }, {
  debounceMs: 300, // default 500
  onError: (error) => console.warn('Drawings were not saved', error),
});

await saver.flush(); // save pending changes now and wait until they are written
await saver.stop(); // flush, then stop watching the store
```

Saves run one after the other, so an older document never overwrites a newer one. A failed save calls `onError` and never throws into the store; the changes stay pending until the next change, `flush()` or `stop()`.

## Export and import

`exportDrawings` turns the store into JSON text, and `importDrawings` reads such text back. Text that is not a drawing document changes nothing and returns a report with the `KFT-E-JSON` issue instead of throwing.

```ts
import { exportDrawings, importDrawings } from 'keystone-financial-tools-typescript';

const text = exportDrawings(store, { pretty: true });
const report = importDrawings(store, text, { mode: 'merge' }); // or 'replace'
if (report.issue !== undefined) console.warn(report.issue.message);
```

`merge` adds the drawings and renames ids that are taken; `replace` swaps the content of the store. The import is one change (one store notification). Pass `history: false` to keep it out of the undo history.

## Migrate from the 0.1 helpers

The synchronous Web Storage helpers of 0.1 (`saveDrawings`, `loadDrawings` and the storage form `autoSave(store, storage, key)`) keep working with unchanged signatures and are marked `@deprecated`. They take a raw storage key and share the text format, the key rules and the `KFT-E-JSON` issue of `WebStorageRepository`: under the key `keystone-drawings:AAPL` they read and write the same entry as `WebStorageRepository(localStorage)` does for `{ symbol: 'AAPL' }`.

```ts
// before
saveDrawings(store, localStorage, 'chart-aapl');
const restored = loadDrawings(localStorage, 'chart-aapl');

// after
const repository = new WebStorageRepository(localStorage);
await repository.save({ symbol: 'AAPL' }, store.toJSON());
const { document, issue } = await repository.load({ symbol: 'AAPL' });
```

- Data saved under a custom key is not found by a repository, which uses `scopeKey`. Move it once: read it with `loadDrawings(localStorage, 'chart-aapl')`, then `repository.save` it.
- `autoSave(store, repository, scope)` (debounced) replaces the storage form of `autoSave`, and `loadStore(repository, scope)` replaces `loadDrawings`: it never throws for stored data and reports what it skipped.

## Your own backend

Implement the three methods and use `readStored(value, scope)` so that corrupt data and documents of another scope follow the same rules as the built-in repositories.

```ts
import { readStored, scopeKey, type DrawingDocument, type DrawingRepository, type DrawingScope } from 'keystone-financial-tools-typescript';

class RestRepository implements DrawingRepository {
  private url = (scope: DrawingScope) => `/api/drawings/${encodeURIComponent(scopeKey(scope))}`;

  async load(scope: DrawingScope) {
    const response = await fetch(this.url(scope));
    return response.status === 404 ? readStored(undefined) : readStored(await response.json(), scope);
  }
  async save(scope: DrawingScope, document: DrawingDocument) {
    await fetch(this.url(scope), { method: 'PUT', body: JSON.stringify(document) });
  }
  async remove(scope: DrawingScope) {
    await fetch(this.url(scope), { method: 'DELETE' });
  }
}
```

The package's `__tests__/repository-contract.ts` is the contract every repository passes (empty load, round trip, copies, scopes kept apart, remove); run it against your own implementation the way the three repositories do.

## Next

Start from a [getting started](/getting-started/typescript/) page for your framework, and see how a chart connects in the [host guide](/guides/host/).
