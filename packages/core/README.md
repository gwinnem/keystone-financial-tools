# keystone-financial-tools-core

Framework-neutral core of the Keystone drawing tools: the drawing model, validation, the drawing
store, the saved document format, the `DrawingHost` contract a chart implements and the pixel
geometry of every drawing kind.

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
| `anchorToPoint`, `pointToAnchor` | Anchors to plot points and back through the host transforms |
| `geometryOf`, `DrawingGeometry`, `GeometryOptions`, `Shape`, `LineShape`, `RectShape`, `ArcShape`, `TextShape`, `LabelShape`, `HandlePoint`, `GeometryPart`, `TEXT_CHAR_WIDTH`, `TEXT_LINE_HEIGHT` | Pixel geometry of a drawing for the current frame: shapes and handles |
| `hitTest`, `HitResult`, `HitPart`, `HitTestOptions`, `HIT_TOLERANCE`, `GeometryCache`, `GeometryCacheOptions` | What is under a plot point (drawing id, part, locked), and the geometry cache it reads from |
| `buildScene`, `SceneCache`, `SceneItem`, `ShapeItem`, `FibonacciItem`, `HandlesItem`, `PreviewItem`, `SceneOptions`, `ItemState`, `FibonacciKind`, `ResolvedFibonacciOptions`, `SNAP_INDICATOR_RADIUS` | The scene a host draws: items in paint order with state, resolved style, preview, snap indicator and handles |
| `GestureRecogniser`, `Gesture`, `GestureBase`, `GestureOptions` | Pointer events to `move`, `click`, `double-click`, `drag-start`, `drag`, `drag-end`, `cancel` and `leave` gestures (3 px, 300 ms, 400 ms and 6 px by default, injectable clock) |
| `reduceInteraction`, `IDLE_STATE`, `InteractionState`, `InteractionInput`, `InteractionEffect`, `InteractionContext`, `InteractionResult` | The pure interaction state machine (idle, placing, selected, dragging-handle, moving, editing-text) |

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

`anchorToPoint(anchor, host)` gives the plot point of an anchor; `pointToAnchor(point, yAxisId, host)`
gives the anchor at a point on a y-axis (also for points outside that pane), or null when the y-axis
has no pane. Anchors beyond the last bar follow the host's extrapolation, so they stay in place
relative to the bars when the chart scrolls or zooms.

## Geometry

`geometryOf(drawing, host, { theme?, measureText? })` computes a drawing's pixel geometry for the
current frame from the host transforms: `{ drawingId, kind, shapes, handles }`, or null when the
drawing's y-axis has no pane. It is pure and deterministic; anchors stay in data space and the
geometry is recomputed whenever the viewport changes.

| Kind | Shapes |
|---|---|
| `trend-line` | One `line` from left to right; `extendLeft`/`extendRight` extend the end with the smaller/larger x to the pane edge (for a vertical line: anchor 1/anchor 2). An extension never shortens the line |
| `horizontal-line` | One `line` across the pane |
| `rectangle` | One `rect`, normalised to `x`, `y`, `width`, `height` |
| `text-note` | One `text` box with its top left corner at the anchor; lines split on `\n`, `fontSize * TEXT_CHAR_WIDTH` (0.6) per character and `fontSize * TEXT_LINE_HEIGHT` (1.3) per line unless `measureText` is given; at least one character wide |
| `fibonacci-retracement` | Per visible level a `line` (`level:<ratio>`) at `p1 + (p2 - p1) * ratio` (`reverse` swaps p1 and p2), then its `label` position when `showLabels` or `showPrices` |
| `fibonacci-fans` | Per visible level a `line` from anchor 1 through `(t2, p2 + (p1 - p2) * ratio)`, clipped to the pane |
| `fibonacci-arcs` | Per visible level an `arc` around anchor 2 with radius `ratio` times the pixel distance between the anchors: half circles curving towards anchor 1, full circles with `fullCircles` |
| `fibonacci-time-zones` | Per sequence value a vertical `line` (`level:<n>`) at `t1 + n * (t2 - t1)` across the pane; lines outside the pane are left out, prices play no part |

Every shape carries its `part` (`body`, `label` or `level:<value>`) for hit-testing. Degenerate
drawings (anchors on one point, a time unit of 0) produce no Fibonacci shapes and never NaN. Arc
angles are radians in the canvas convention.

Handles are `{ id: 'handle:<n>', x, y }` with ids that stay the same across frames: one per anchor;
a horizontal line's at the pane's horizontal centre; time-zone handles at the anchor times,
vertically centred; rectangles add `handle:2` (x1, y2) and `handle:3` (x2, y1), the other corners,
and the edge midpoints `handle:4` (x1 edge), `handle:5` (x2 edge), `handle:6` (y1 edge) and
`handle:7` (y2 edge).

```ts
import { geometryOf } from 'keystone-financial-tools-core';

const geometry = geometryOf(drawing, host);
for (const shape of geometry?.shapes ?? []) {
  if (shape.type === 'line') drawLine(shape.from, shape.to);
}
```

## Hit-testing

`hitTest(point, options)` finds what is under a plot point and returns `{ id, part, locked }`, or null.

```ts
import { GeometryCache, hitTest } from 'keystone-financial-tools-core';

const cache = new GeometryCache(host, { store }); // follows the viewport and the store
const hit = hitTest(
  { x: event.x, y: event.y },
  { drawings: store.list(), cache, selected: new Set(selection), pointerType: event.pointerType },
);
if (hit !== null) console.log(hit.id, hit.part, hit.locked);
cache.destroy(); // when the chart is torn down
```

| Option | Meaning | Default |
|---|---|---|
| `drawings` | The drawings to test, in insertion order (`store.list()`) | required |
| `cache` | A `GeometryCache` that supplies the pixel geometry | required |
| `selected` | Ids of the selected drawings; only their handles can be hit | none |
| `pointerType` | `mouse`, `pen` or `touch`; sets the tolerance | `mouse` |
| `theme` | Decides whether a rectangle has a fill | `LIGHT_THEME` |

- **Tolerance** (`HIT_TOLERANCE`): 6 CSS px for a mouse and a pen, 12 for touch. A distance equal to the
  tolerance hits.
- **Parts**: `body`, `handle:<n>`, `level:<ratio>` (Fibonacci levels; the value of a time-zone line),
  `label`. A rectangle hits inside only when its resolved `fillOpacity` is above 0 (the rectangle
  default of the theme is 0.15); otherwise only its border hits. A text note is solid. The core does not
  know how wide a renderer draws a label, so a `label` is the tolerance disc around the label anchor
  (the left end of its level line) and wins over the lines of its drawing.
- **Priority**: the handles of selected drawings win over every body. Otherwise the highest `zIndex`
  wins, then the drawing added last. Within a drawing the nearest shape wins, the first one on a tie.
  The nearest handle wins, the lowest index on a tie.
- **Hidden** drawings are never hit. **Locked** drawings are, with `locked: true` (also their handles
  when selected), so the caller decides what a locked drawing allows. A drawing without a pane is
  never hit.

`GeometryCache(host, { store?, theme?, measureText? })` keeps the geometry of each drawing between
pointer moves, so `hitTest` over many drawings does no geometry work. An entry is used only while the
drawing is the same object it was computed from; the store replaces a drawing on every change, so a
changed drawing is recomputed and the others are not. A viewport change clears the whole cache. With a
`store` the entries of removed drawings are dropped (`size` says how many drawings are held). The
theme and `measureText` are fixed per cache: create a new one when they change. `destroy()` stops
following the host and the store and is safe to call twice.

`pnpm --filter keystone-financial-tools-core bench` measures `hitTest` over 500 drawings with a warm
cache (budget: 0.5 ms).

## Scene

`buildScene(host, options)` returns the items the host draws on its overlay, in paint order. It is a
pure function of its inputs; the controller (E04) will hold the state and expose it as `getScene()`.

```ts
import { buildScene, GeometryCache, SceneCache } from 'keystone-financial-tools-core';

const cache = new GeometryCache(host, { store }); // use the same theme here as in the scene
const scenes = new SceneCache(host);
// in the overlay render pass:
for (const item of scenes.get({ drawings: store.list(), cache, selected, hover, preview, snap })) {
  if (item.type === 'shape') drawShapes(item.shapes, item.style, item.opacity);
  else if (item.type === 'fibonacci') drawFibonacci(item);
  else if (item.type === 'handles') drawHandles(item);
  else drawPreview(item);
}
```

| Option | Meaning | Default |
|---|---|---|
| `drawings` | The drawings in insertion order (`store.list()`) | required |
| `cache` | The `GeometryCache` that supplies pixel geometry (same theme as `theme`) | required |
| `theme` | Styles and state styles | `LIGHT_THEME` |
| `selected` | Ids of selected drawings; each gets a `handles` item | none |
| `hover` | Id of the drawing under the pointer | none |
| `active` | `{ drawingId, index }` of the handle being dragged | none |
| `preview` | The drawing being placed, with the pointer as its missing anchor | none |
| `snap` | The snapped plot point | none |

- **Order**: drawings by `zIndex` (default 0), ties in insertion order; then the `preview` item, then the
  snap indicator (also a `preview` item); the `handles` items of the selected drawings come last, in paint
  order. Hidden drawings and drawings without a pane have no item.
- **`shape` items** (primitive kinds): `{ drawingId, shapes, style, opacity, state }` with pixel shapes.
- **`fibonacci` items** (the four Fibonacci kinds): `{ drawingId, kind, anchors, options, style, opacity,
  state }` in data space. `options` is fully resolved: every key of the kind, and every level including
  the hidden ones with `visible: false`. The host renders them with its Fibonacci overlay.
- **`state`**: `locked`, else `selected`, else `hover`, else `normal`. `style` is `resolveStyle` with the
  state's `lineWidthDelta` added to `lineWidth`; `opacity` is the state's opacity (1 for normal, 0.6 for
  locked in the presets) and multiplies strokes, fills and text.
- **`handles` items**: `{ drawingId, points, active?, style, locked }`. `style` is the theme handle style
  (8 px squares); a `locked` drawing gets lock markers instead of grab handles in the host.
- **`preview` items**: `{ shapes, style }`. The placement preview is the drawing's shapes in its resolved
  style; the snap indicator is a circle of `SNAP_INDICATOR_RADIUS` (5 px) in the theme default style.
  Both vanish when the options no longer carry `preview` or `snap` (after placement or cancel).

`SceneCache(host)` returns the same array until something changes: any option (compared by reference, so
pass the same object for an unchanged value) or the viewport. `invalidate()` forgets the scene and
`destroy()` stops following the host; both are safe to repeat. `pnpm --filter keystone-financial-tools-core bench`
also measures `buildScene` over 500 drawings (budget: 2 ms).

## Interaction state machine

The interaction engine is two pure pieces; the controller (E04) will wire them to the host.

```ts
import { GestureRecogniser, hitTest, IDLE_STATE, reduceInteraction } from 'keystone-financial-tools-core';

const recogniser = new GestureRecogniser(); // { moveThreshold: 3, clickMs: 300, doubleClickMs: 400, doubleClickPx: 6, now: Date.now }
let state = IDLE_STATE;
const ctx = { lookup: (id) => store.get(id) && { kind: store.get(id).kind, locked: store.get(id).locked === true } };

host.onPointer((event) => {
  for (const gesture of recogniser.handle(event)) {
    const input = toInput(gesture); // resolve `target` with hitTest at the click point, or at the drag origin
    const result = reduceInteraction(state, input, ctx);
    state = result.state;
    if (result.ignored) console.debug('ignored', input.type, state.type);
    for (const effect of result.effects) perform(effect);
  }
});
```

- **Gestures**: a press released within 3 px and 300 ms is a `click`; moving further starts a drag
  (`drag-start` with the press `origin`, then `drag`, then `drag-end`); a press held longer without moving
  is neither. A second click of the same button within 400 ms and 6 px also gives a `double-click`.
  Pointer `cancel` and `leave` during a drag give `cancel`; `leave` also gives `leave`.
- **States**: `idle`, `placing`, `selected`, `dragging-handle`, `moving`, `editing-text`. A click selects
  (shift-click toggles, empty space clears); Escape leaves `placing` and `selected`, and the right button leaves `placing`;
  a drag from a handle or body of a selected unlocked drawing starts `dragging-handle` or `moving`;
  Delete and Backspace remove the unlocked selected drawings; a double-click or Enter on an unlocked text
  note starts `editing-text`.
- **Effects** (what the caller does): `remove`, `blocked` (locked drawings were asked to change),
  `drag-start`, `drag-update`, `drag-commit`, `drag-revert`, `edit-text`, `apply-text`, `cancel-placement`.
- `reduceInteraction` never throws. An input that means nothing in a state returns the same state object
  with `ignored: true` and no effects. Send `{ type: 'sync' }` after every store change so selected, hovered
  and edited drawings that were removed are dropped.

## Testing entry: `keystone-financial-tools-core/testing`

Test helpers live in a separate entry so they never end up in production bundles.

```ts
import { createMockHost, runHostConformance } from 'keystone-financial-tools-core/testing';
```

`createMockHost(options)` is a deterministic in-memory host with linear scales:

| Option | Default |
|---|---|
| `width` | 800 (CSS px) |
| `panes` | `DEFAULT_MOCK_PANE`: `price`, 400 px high, prices 0 to 200 |
| `barInterval` | 60 000 ms |
| `pxPerBar` | 10 |
| `startTime` | 0 (time at x = 0) |
| `bars` | none (for `nearestBar`) |
| `editText` | none |

Scripted input: `pointer(phase, x, y, options?)`, `key(key, modifiers?)` (returns whether a listener
handled it), `zoom(factor, aroundX?)`, `scroll(px)`. Recorded output: `cursors`, `renderRequests`,
`listenerCount(kind)`.

`runHostConformance(factory, { describe, it, expect })` registers the host conformance tests with
Vitest or Jest. `factory` returns a fresh subject for every test: the `host`, the `yAxisIds` to
check, the `lastBarTime`, and `changeViewport`, `firePointer` and `fireKey` wired to the chart's
own input. It checks contract version 2, time and price round trips within 0.5 px across every pane,
linear extrapolation beyond the last bar, `yAxisAt` agreeing with `paneRect`, listeners called until
they unsubscribe (twice is harmless) and handled keys reported as handled. This repo runs it
against the mock host.

```ts
import { describe, it, expect } from 'vitest';
import { runHostConformance } from 'keystone-financial-tools-core/testing';

runHostConformance(
  () => {
    const chart = createTestChart();
    return {
      host: chart.drawingHost,
      yAxisIds: ['price'],
      lastBarTime: chart.lastBarTime,
      changeViewport: () => chart.zoom(2),
      firePointer: (event) => chart.dispatchPointer(event),
      fireKey: (event) => chart.dispatchKey(event),
    };
  },
  { describe, it, expect },
);
```

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
