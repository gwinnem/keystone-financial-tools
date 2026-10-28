# keystone-financial-tools-core

Framework-neutral core of the Keystone drawing tools: the drawing model, validation, the drawing
store, the saved document format and the `DrawingHost` contract a chart implements.

## API

| Export | Purpose |
|---|---|
| `Anchor`, `Drawing`, `DrawingKind`, `DrawingStyle`, `LineStyle`, `KindOptions`, `FibonacciLevel`, `DrawingPatch`, `JsonValue` | Drawing model (anchors in time, price and y-axis id; style, kind options, `locked`, `hidden`, `zIndex`, `meta`) |
| `ANCHOR_COUNT`, `DRAWING_KINDS`, `isDrawingKind` | The drawing kinds and their anchor counts |
| `isValidAnchor`, `validateDrawing` | Validation; `validateDrawing` returns a list of `DrawingIssue` |
| `validateStyle`, `LINE_STYLES`, `STYLE_LIMITS` | Style validation and its allowed values |
| `DrawingTheme`, `LIGHT_THEME`, `DARK_THEME`, `resolveStyle`, `ResolvedStyle`, `StateStyle`, `HandleStyle` | Theme defaults applied at scene time |
| `validateOptions`, `defaultOptions`, `resolveOptions`, `KIND_OPTION_KEYS`, `MAX_LEVELS`, `MAX_SEQUENCE` | Kind options |
| `DEFAULT_RETRACEMENT_LEVELS`, `DEFAULT_ARC_FAN_LEVELS`, `DEFAULT_TIME_ZONE_SEQUENCE` | Fibonacci defaults |
| `DrawingError` | Thrown for invalid drawings or documents; `issues` says what is wrong |
| `createId`, `createIdGenerator`, `IdSource` | Collision-safe drawing ids (`crypto.randomUUID`, or time + counter + random suffix) |
| `DrawingStore` | `add`, `update`, `remove`, `clear`, `batch`, `restore`, `get`, `list`, `ordered`, `bringToFront`, `sendToBack`, `bringForward`, `sendBackward`, `subscribe`, `toJSON`, `fromJSON` |
| `StoreChange`, `StoreOperation`, `DrawingListener`, `ChangeOptions` | What listeners receive: the new list, the `add`/`update`/`remove` operations and whether history records the change |
| `History`, `HistoryOptions`, `HistoryState`, `HistoryTransaction` | Undo and redo with a depth limit, transactions and coalescing |
| `DrawingCommand`, `createCommand`, `invertCommand`, `composeCommands`, `applyCommand` | Changes as plain-data commands with inverses |
| `DOCUMENT_VERSION`, `SUPPORTED_DOCUMENT_VERSIONS`, `DrawingDocument`, `DrawingDocumentV1`, `DocumentScope` | The saved document format (version 2; version 1 is read and migrated) |
| `readDocument`, `migrateV1ToV2` | Reading and migrating saved documents |
| `importDocument`, `ImportMode`, `ImportOptions`, `ImportReport` | Importing a document in `merge` or `replace` mode, keeping the valid drawings |
| `DrawingStoreOptions` | `new DrawingStore(drawings, { scope })` |
| `DrawingHost`, `HOST_API_VERSION`, `HostPointerEvent`, `HostKeyEvent`, `DrawingCursor`, `Rect`, `Point`, `NearestBar`, `Ohlc`, `Modifiers`, `PointerPhase`, `PointerType`, `TextEditRequest` | What a chart supplies for the drawing tools (host contract version 2) |
| `validateHost`, `assertHost`, `REQUIRED_HOST_MEMBERS` | Checks a host against the contract (`KFT-E-HOST`) |
| `connectHost`, `HostHandlers`, `Disposables` | Subscribes to the host's events once and unsubscribes every one exactly once |

Every store change replaces the drawing list (the old list is never mutated) and notifies the
listeners. A failed change throws `DrawingError` and leaves the store and the listeners untouched.

## Store changes

Listeners are called as `(drawings, change)`. `change.operations` lists what changed, each with
`before` and/or `after`, in the order each drawing first changed:

```ts
store.subscribe((drawings, { operations }) => {
  for (const op of operations) {
    if (op.type === 'add') save(op.after);
    else if (op.type === 'update') save(op.after);
    else erase(op.before);
  }
});
```

`store.batch(fn)` makes the changes inside `fn` one change: one notification after `fn` returns,
with one operation per drawing (add + update reports one add of the final value, add + remove
reports nothing, update + remove reports a remove of the original, remove + add reports an update).
If `fn` throws, everything it changed is rolled back, nobody is notified and the error is rethrown.
A batch inside a batch joins the outer one; an empty batch does not notify. `clear()` is one batch.

`store.restore(drawings)` replaces the whole list as one change (removes, adds and updates; a
drawing whose position changed is reported as updated). It does nothing when the list would not
change.

## Undo and redo

```ts
import { History } from 'keystone-financial-tools-core';

const history = new History(store); // { limit: 100, coalesceKeys: ['nudge'], coalesceMs: 500 }
history.subscribe(({ canUndo, canRedo }) => updateButtons(canUndo, canRedo));
history.onError((issue) => console.warn(issue.message));

store.add(line);
history.undo(); // the line is gone
history.redo(); // it is back

const drag = history.transaction('drag');
store.update(line.id, { anchors: step1 });
store.update(line.id, { anchors: step2 });
drag.commit(); // one undo step; drag.cancel() would revert both

store.add(remoteDrawing, { history: false }); // not recorded; clears the redo stack
```

- Every store change is one entry: a batch, a z-order command and an import each undo as one step.
- Changes made with `{ history: false }` (on `add`, `update`, `remove`, `clear`, `restore`, `batch`,
  or `importDocument(..., { history: false })`) are not recorded and clear the redo stack.
- The depth limit (1 to 1000, default 100) drops the oldest entries.
- `transaction(key)` groups changes until `commit()`; `cancel()` reverts them. One transaction can be
  open at a time; undo and redo return false while it is. Transactions with a key in `coalesceKeys`
  (default `nudge`) merge into the previous entry with the same key when committed within
  `coalesceMs` (default 500 ms).
- Undo and redo restore the exact list (values and order). An entry that no longer fits the store,
  because a drawing it touches was removed or re-added outside the history, is dropped and reported
  through `onError` (`KFT-E-MISSING` or `KFT-E-ID`) instead of throwing.
- `getState()` returns `{ canUndo, canRedo, undoDepth, redoDepth }`, a new object only when it
  changes; `subscribe` is called with each new state. `destroy()` stops following the store.

Commands are plain data: `{ operations, before, after }` (the operations of a change and the drawing
ids in list order around it). `invertCommand` gives the inverse, `composeCommands` joins two, and
`applyCommand(store, command)` applies one to the current store, returning an issue instead of
throwing when it no longer fits.

## Paint order

`ordered()` returns the drawings bottom to top: by `zIndex` (default 0), ties in insertion order.
`bringToFront`, `sendToBack`, `bringForward` and `sendBackward` take one id or a list. Each is one
change (one notification): the moved drawings keep their relative order, and only the zIndex values
that must change to produce the new order are written, so the rest keep theirs. They return false
when nothing moves (for example a drawing already at the front) and throw `KFT-E-MISSING` for an
unknown id. Locked and hidden drawings can be reordered through the API.

## Host contract (version 2)

A chart hosts the tools by implementing `DrawingHost`. Times are epoch milliseconds; x, y and
rectangles are CSS px in plot coordinates.

| Member | Purpose |
|---|---|
| `apiVersion` | Always `2` |
| `timeToX`, `xToTime` | Time and x, both ways; extrapolated beyond the data (future space) |
| `priceToY`, `yToPrice` | Price and y on a y-axis, both ways |
| `yAxisAt(x, y)` | The y-axis of the pane under a point, or null |
| `paneRect(yAxisId)` | The plot area of a pane, or null |
| `nearestBar(time)` | `{ time, ohlc }` of the nearest bar (magnet snapping), or null |
| `barInterval()` | Milliseconds between bars |
| `onPointer`, `onKey`, `onViewportChange` | Event subscriptions; each returns its unsubscribe function. A key listener returns true when it handled the key |
| `setCursor(cursor)` | Shows a `DrawingCursor` |
| `requestRender()` | Asks for an overlay redraw |
| `editText(request)` | Optional in-place text editor; resolves with the text or null |

`validateHost(host)` lists what is missing (`KFT-E-HOST`: wrong `apiVersion`, then one issue naming
every missing function; `editText` is optional but must be a function when present).
`assertHost(host)` throws `DrawingError` with those issues.

`connectHost(host, { pointer, key, viewport })` subscribes once to each event and returns a
`Disposables`: `dispose()` unsubscribes every listener exactly once, even when one unsubscribe
throws, and returns the errors instead of throwing. A key handler's result reaches the host as a
strict boolean. A subscribe method that returns no function is `KFT-E-HOST`.

## Saved documents

`store.toJSON()` writes `{ version: 2, scope?, drawings }`; the scope (`{ symbol?, timeframe? }`)
comes from `new DrawingStore(drawings, { scope })` or from the loaded document. `DrawingStore.fromJSON`
reads versions 1 and 2 (version 1 is migrated in memory by the pure `migrateV1ToV2`) and throws on
the first invalid drawing. Anything that is not a readable document (wrong version, no `drawings`
array, bad scope) is `KFT-E-JSON`.

`importDocument(store, json, { mode })` takes a JSON string or a parsed value and applies it as one
change, keeping every valid drawing:

| Mode | Behaviour |
|---|---|
| `merge` (default) | Adds the drawings; a taken id gets a new one (`createId`, injectable) and is listed in `renamed` |
| `replace` | Removes everything and adds the drawings; a repeated id in the document is skipped (`KFT-E-ID`) |

The `ImportReport` lists `added` ids, `renamed` (`{ from, to }`) and `skipped` (`{ index, issues }`)
drawings. An unreadable document throws `KFT-E-JSON` and changes nothing; the store scope is never
changed by an import.

```ts
const report = importDocument(store, fileText, { mode: 'merge' });
console.log(`${report.added.length} imported, ${report.skipped.length} skipped`);
```

## Drawing fields

| Field | Rule | Default |
|---|---|---|
| `id` | Non-empty string, unique within a store; use `createId()` | |
| `kind`, `anchors` | Anchor count per kind (`ANCHOR_COUNT`); all anchors on one `yAxisId` | |
| `text` | String | |
| `style` | See [Style and theme](#style-and-theme) | theme |
| `options` | See [Kind options](#kind-options) | `defaultOptions(kind)` |
| `locked` | Boolean: selectable, but interaction cannot move, resize, edit or delete it | `false` |
| `hidden` | Boolean: left out of the scene and hit-testing | `false` |
| `zIndex` | Finite integer; higher paints on top, ties keep insertion order | `0` |
| `meta` | Plain object of JSON-safe values (no functions, `undefined`, cycles, `NaN`/`Infinity`, dates); round-trips untouched | none |

## Style and theme

| Field | Rule |
|---|---|
| `color`, `fillColor`, `textColor` | Non-empty string (CSS color; the host checks syntax) |
| `lineWidth` | Number from 1 to 10 (CSS px) |
| `lineStyle` | `solid`, `dashed` or `dotted` |
| `fillOpacity` | Number from 0 to 1 |
| `fontSize` | Number from 8 to 72 (CSS px) |

Unknown style keys are rejected. A missing value comes from the theme when the scene is built, not
when the drawing is stored: `resolveStyle(drawing, theme)` merges the drawing's style over the
theme's per-kind defaults over its global defaults. Switching between `LIGHT_THEME` and `DARK_THEME`
(or your own `DrawingTheme`) therefore restyles every drawing that does not override a value. A
theme also holds the hover, selected and locked state styles and the handle style (8 px squares).

```ts
import { DARK_THEME, resolveStyle } from 'keystone-financial-tools-core';

resolveStyle({ kind: 'rectangle', style: { color: '#e91e63' } }, DARK_THEME);
// { color: '#e91e63', fillOpacity: 0.2, lineWidth: 2, lineStyle: 'solid', ... }
```

## Kind options

| Kind | Options (defaults) |
|---|---|
| `trend-line` | `extendLeft` (false), `extendRight` (false) |
| `fibonacci-retracement` | `levels` (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1 shown; 1.272, 1.618, 2.618, 4.236 hidden), `reverse` (false), `extendLeft` (false), `extendRight` (false), `showLabels` (true), `showPrices` (true) |
| `fibonacci-arcs` | `levels` (0.382, 0.5, 0.618), `fullCircles` (false), `showLabels` (true) |
| `fibonacci-fans` | `levels` (0.382, 0.5, 0.618), `showLabels` (true) |
| `fibonacci-time-zones` | `sequence` (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89), `showLabels` (true) |
| `horizontal-line`, `rectangle`, `text-note` | none |

A level is `{ ratio, visible, color? }`: finite ratios, unique within a drawing, at most 24. A
sequence has at most 32 non-negative integers in strictly ascending order. Options on a kind that
does not use them are rejected. `resolveOptions(kind, options)` fills in the defaults.

## Issue codes

`validateDrawing` returns every issue in a stable order (id, kind, anchors, axis, text, style,
options, locked, hidden, zIndex, meta) and never throws.

| Code | Meaning |
|---|---|
| `KFT-E-SHAPE` | Not an object, or `locked`/`hidden` not a boolean, or `zIndex` not a finite integer |
| `KFT-E-ID` | Missing, empty or duplicate id |
| `KFT-E-KIND` | Unknown kind |
| `KFT-E-ANCHORS` | Anchors missing or the wrong count for the kind |
| `KFT-E-ANCHOR` | An anchor without a finite time and price or a y-axis id |
| `KFT-E-AXIS` | Anchors of one drawing on different y-axes |
| `KFT-E-TEXT` | Text that is not a string |
| `KFT-E-STYLE` | Style that is not a plain object, a value out of range, an unknown line style or an unknown key |
| `KFT-E-OPTIONS` | Options that are not a plain object, a key the kind does not use, a flag that is not a boolean, bad levels or a bad sequence |
| `KFT-E-META` | `meta` is not a plain object, or holds a value that is not JSON-safe (the message names its path, e.g. `meta.a.b[3]`) |
| `KFT-E-MISSING` | Update or reorder of a drawing that is not in the store |
| `KFT-E-JSON` | Not valid JSON, or not a document of version 1 or 2, or an invalid scope |
| `KFT-E-HOST` | The host does not satisfy contract version 2 |

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
