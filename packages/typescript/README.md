# keystone-financial-tools-typescript

Framework-free API for the Keystone drawing tools. Re-exports `keystone-financial-tools-core` and
adds Web Storage persistence.

| Export | Purpose |
|---|---|
| `saveDrawings(store, storage, key)` | Writes the store's saved document under `key` |
| `loadDrawings(storage, key)` | Reads it back; an empty store when nothing is saved, `DrawingError` (`KFT-E-JSON`) for invalid text |
| `autoSave(store, storage, key)` | Saves after every change; returns the function that stops saving |
| `DrawingStorage` | The part of the Web Storage API used; `localStorage` fits |

```ts
import { autoSave, loadDrawings } from 'keystone-financial-tools-typescript';

const store = loadDrawings(localStorage, 'chart-aapl');
const stopSaving = autoSave(store, localStorage, 'chart-aapl');
```
