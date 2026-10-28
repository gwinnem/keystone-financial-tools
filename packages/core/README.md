# keystone-financial-tools-core

Framework-neutral core of the Keystone drawing tools: the drawing model, validation, the drawing
store, the saved document format and the `DrawingHost` contract a chart implements.

## API

| Export | Purpose |
|---|---|
| `Anchor`, `Drawing`, `DrawingKind`, `DrawingStyle`, `DrawingPatch`, `JsonValue` | Drawing model (anchors in time, price and y-axis id; `locked`, `hidden`, `zIndex`, `meta`) |
| `ANCHOR_COUNT`, `DRAWING_KINDS`, `isDrawingKind` | The drawing kinds and their anchor counts |
| `isValidAnchor`, `validateDrawing` | Validation; `validateDrawing` returns a list of `DrawingIssue` |
| `DrawingError` | Thrown for invalid drawings or documents; `issues` says what is wrong |
| `createId`, `createIdGenerator`, `IdSource` | Collision-safe drawing ids (`crypto.randomUUID`, or time + counter + random suffix) |
| `DrawingStore` | `add`, `update`, `remove`, `clear`, `get`, `list`, `subscribe`, `toJSON`, `fromJSON` |
| `DOCUMENT_VERSION`, `DrawingDocument` | The saved document format (version 1) |
| `DrawingHost`, `HostPointerEvent`, `Ohlc` | What a chart supplies for the drawing tools |

Every store change replaces the drawing list (the old list is never mutated) and notifies the
listeners.

## Drawing fields

| Field | Rule | Default |
|---|---|---|
| `id` | Non-empty string, unique within a store; use `createId()` | |
| `kind`, `anchors` | Anchor count per kind (`ANCHOR_COUNT`); all anchors on one `yAxisId` | |
| `text` | String | |
| `locked` | Boolean: selectable, but interaction cannot move, resize, edit or delete it | `false` |
| `hidden` | Boolean: left out of the scene and hit-testing | `false` |
| `zIndex` | Finite integer; higher paints on top, ties keep insertion order | `0` |
| `meta` | Plain object of JSON-safe values (no functions, `undefined`, cycles, `NaN`/`Infinity`, dates); round-trips untouched | none |

## Issue codes

`validateDrawing` returns every issue in a stable order (id, kind, anchors, axis, text, locked,
hidden, zIndex, meta) and never throws.

| Code | Meaning |
|---|---|
| `KFT-E-SHAPE` | Not an object, or `locked`/`hidden` not a boolean, or `zIndex` not a finite integer |
| `KFT-E-ID` | Missing, empty or duplicate id |
| `KFT-E-KIND` | Unknown kind |
| `KFT-E-ANCHORS` | Anchors missing or the wrong count for the kind |
| `KFT-E-ANCHOR` | An anchor without a finite time and price or a y-axis id |
| `KFT-E-AXIS` | Anchors of one drawing on different y-axes |
| `KFT-E-TEXT` | Text that is not a string |
| `KFT-E-META` | `meta` is not a plain object, or holds a value that is not JSON-safe (the message names its path, e.g. `meta.a.b[3]`) |
| `KFT-E-MISSING` | Update of a drawing that is not in the store |
| `KFT-E-JSON` | Not a version 1 document |

```ts
import { createId, DrawingStore } from 'keystone-financial-tools-core';

const store = new DrawingStore();
const stop = store.subscribe((drawings) => render(drawings));
store.add({
  id: createId(),
  kind: 'horizontal-line',
  anchors: [{ time: Date.UTC(2026, 9, 28), price: 100, yAxisId: 'price' }],
});
stop();
```
