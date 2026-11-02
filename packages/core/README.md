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
| `reducePlacement`, `placementPreview`, `lockAngle`, `PLACEMENT_START`, `ZERO_LENGTH_PX`, `PlacementProgress`, `PlacementInput`, `PlacementResult` | Pure placement of new drawings: one-anchor click, two-anchor click-click and drag, preview, pane rules, the Shift 45 degree lock |
| `cursorFor`, `CursorSync` | The cursor for what is under the pointer, and a setter that calls `host.setCursor` only on a change |
| `duplicateDrawing`, `DUPLICATE_OFFSET_PX` | The copy Ctrl/Cmd+D adds: one bar later, 10 px down, unlocked |
| `dragHandle`, `moveDrawings`, `nudgeAnchors`, `MovedDrawing`, `constrainMove`, `constrainAngle`, `SHIFT_STEP_FACTOR` | New anchors for a handle drag, a body move and an arrow-key nudge, and the Shift rules |
| `keyboardCursorStart`, `moveKeyboardCursor`, `KEYBOARD_CURSOR_INSET_PX` | The keyboard cursor for placing without a pointer |
| `snapAnchor`, `effectiveMagnet`, `placementSnap`, `handleSnap`, `MagnetMode`, `SnapResult`, `WEAK_MAGNET_PX` | Magnet snapping to the open, high, low or close of the nearest bar, the Ctrl/Cmd inversion and the point for the snap indicator |
| `createDrawingTools`, `DrawingTools`, `DrawingToolsOptions`, `DrawingToolsRuntimeOptions`, `DrawingToolsState`, `DrawingToolsEvents`, `DrawingToolsEventName`, `DrawingToolsBlocked`, `DrawingToolsError`, `DrawingToolsErrorSource` | The controller: ties a host, a store, the history and the tools together (actions, state snapshot, typed events, scene, hit test, destroy) |

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
  `drag-start`, `drag-update`, `drag-commit`, `drag-revert`, `edit-text`, `apply-text`, `cancel-placement`,
  `select-all`, `duplicate` (see [Selection, cursors and duplicate](#selection-cursors-and-duplicate)),
  `nudge`, `keyboard-move`, `keyboard-place` (see [Move, resize and nudge](#move-resize-and-nudge)).
- `reduceInteraction` never throws. An input that means nothing in a state returns the same state object
  with `ignored: true` and no effects. Send `{ type: 'sync' }` after every store change so selected, hovered
  and edited drawings that were removed are dropped.

## Placement

`reducePlacement(tool, progress, input, host)` decides where the anchors of a new drawing go while the
machine is in `placing`. Like `reduceInteraction` it is pure: it reads the host and returns the next
`PlacementProgress` and, when the drawing is complete, its `anchors`. The caller creates the drawing,
then sends `{ type: 'placement-complete', id, stay, edit }` to the machine.

```ts
import { PLACEMENT_START, placementPreview, reducePlacement } from 'keystone-financial-tools-core';

let progress = PLACEMENT_START;
// for each gesture while the machine is in `placing` and did not cancel:
const result = reducePlacement(tool, progress, { type: 'click', point: gesture.point, button: gesture.button }, host);
progress = result.progress;
if (result.anchors !== null) {
  const id = createId();
  store.add({ id, kind: tool, anchors: result.anchors }); // one change, one history entry
  state = reduceInteraction(state, { type: 'placement-complete', id, stay: stayInTool, edit: tool === 'text-note' }, ctx).state;
}
const preview = placementPreview(tool, progress, 'preview'); // the scene's `preview` option
// when the machine reports `cancel-placement`: progress = PLACEMENT_START
```

- **Inputs**: `move`, `click` and `drag-start` (with `button`), `drag`, `drag-end` and `cancel`, taken from
  the gestures. A `drag-start` gesture has the press origin and the current point: pass a `drag-start`
  with the origin, then a `drag` with the point. Only the left button (0) places.
- **One anchor** (`horizontal-line`, `text-note`): a click inside a pane gives one anchor. A click outside
  every pane does nothing and the tool stays active.
- **Two anchors**: click, move, click, or press, drag, release. The first anchor needs a pane under the
  pointer. The second is projected onto the first anchor's y-axis wherever the pointer is, over another
  pane or outside every pane. Until then `progress` is `anchored` and `placementPreview` returns the
  drawing to show.
- **Zero length**: a second anchor within `ZERO_LENGTH_PX` (1 px) of the first in both x and y creates
  nothing. A release there starts over; a second click there is ignored.
- **Cancel**: Escape, the right button, `deactivate` and a new `activate` are handled by
  `reduceInteraction` (effect `cancel-placement`); reset the progress then. A pointer `cancel` during a
  drag gives the `cancel` input and starts over with the tool still active.
- **Stay in tool**: `stay` on `placement-complete` keeps the machine in `placing` without selecting the
  new drawing; without it the drawing is selected. A text note (`edit: true`) opens the editor first
  (`edit-text` effect) and, with `stay`, returns to its tool after `edit-result`.

## Selection, cursors and duplicate

```ts
import { cursorFor, CursorSync, duplicateDrawing, reduceInteraction } from 'keystone-financial-tools-core';

const cursors = new CursorSync(host);
// on a `move` gesture, with `hit` from hitTest:
cursors.set(cursorFor(state.type === 'placing' ? state.tool : null, hit, hit && store.get(hit.id), host));

host.onKey((event) => !apply({ type: 'key', key: event.key, ctrl: event.ctrlKey || event.metaKey }).ignored);

function perform(effect) {
  if (effect.type === 'select-all') apply({ type: 'select', ids: store.list().filter((d) => !d.hidden).map((d) => d.id) });
  if (effect.type === 'duplicate') {
    const copies = effect.ids.flatMap((id) => duplicateDrawing(store.get(id), createId(), host) ?? []);
    store.batch(() => copies.forEach((copy) => store.add(copy))); // one history entry
    apply({ type: 'select', ids: copies.map((copy) => copy.id) });
  }
}
```

- **Cursor** (`cursorFor(tool, hit, drawing, host)`): `crosshair` while a tool is active; `default` over
  nothing; `pointer` over a body, level or label (locked or not); `not-allowed` over a handle of a locked
  drawing; over a rectangle handle the resize cursor of its corner (`nwse-resize` or `nesw-resize`, by the
  diagonal it sits on in pixels) or edge (`ew-resize`, `ns-resize`); `move` over any other handle.
  `CursorSync.set(cursor)` calls `host.setCursor` only when the cursor changes and returns whether it did;
  `reset()` makes the next `set` call the host again.
- **`select` input**: selects exactly these drawings, in this order. Ids that do not exist and repeated ids
  are dropped; none left means `idle`; the hover is kept. When nothing changes the machine returns the same
  state object, so a `selection` event can be raised when the state reference changes.
- **Ctrl/Cmd+A** (`key` with `ctrl: true`, any letter case) in `idle` or `selected`: effect `select-all`; the
  caller answers with a `select` of every visible drawing. **Ctrl/Cmd+D** in `selected`: effect `duplicate`
  with the selected drawings that still exist (locked ones too); the caller adds the copies and answers with
  a `select` of them. Both are ignored in the other states, without `ctrl`, and Ctrl+D with no drawing to
  copy.
- **Keys handled**: return `!result.ignored` from the key listener, so the host only prevents the default
  action when the key did something (Delete with nothing selected does not).
- **`duplicateDrawing(drawing, id, host)`**: the same drawing under a new id, each anchor one `barInterval()`
  later and `DUPLICATE_OFFSET_PX` (10) px down on its own y-axis, never locked. Null when an anchor's y-axis
  has no pane.

## Move, resize and nudge

The move functions are pure: they take the drawings as they were at pointer down, the press origin and
the current point, and return new anchors. The controller applies them, so a drag needs no state of its own.

```ts
import { dragHandle, moveDrawings, nudgeAnchors } from 'keystone-financial-tools-core';

let session; // { handle, originals, origin, tx }
function perform(effect) {
  if (effect.type === 'drag-start') {
    const originals = (effect.mode === 'handle' ? [effect.drawingId] : effect.ids).flatMap((id) => store.get(id) ?? []);
    session = { handle: effect.mode === 'handle' ? effect.handle : null, originals, origin: effect.origin, tx: history.transaction('drag') };
  }
  if (effect.type === 'drag-update' || effect.type === 'drag-commit') {
    store.batch(() => {
      if (session.handle !== null) {
        const anchors = dragHandle(session.originals[0], session.handle, session.origin, effect.point, shift, host);
        if (anchors !== null) store.update(session.originals[0].id, { anchors });
      } else {
        for (const m of moveDrawings(session.originals, session.origin, effect.point, shift, host)) store.update(m.id, { anchors: m.anchors });
      }
    });
    if (effect.type === 'drag-commit') session.tx.commit(); // one history entry
  }
  if (effect.type === 'drag-revert') session.tx.cancel(); // no entry, listeners see the restore
  if (effect.type === 'nudge') {
    const tx = history.transaction('nudge'); // quick nudges coalesce (500 ms)
    store.batch(() => effect.ids.forEach((id) => store.update(id, { anchors: nudgeAnchors(store.get(id), effect.bars, effect.pixels, host) })));
    tx.commit();
  }
}

host.onKey((event) => !apply({ type: 'key', key: event.key, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey }).ignored);
```

- **Drag a handle** (`dragHandle(drawing, handle, origin, point, shift, host)`): the pointer's travel is
  applied to that anchor, so the grab offset is kept. Rectangle handles `handle:0..3` are corners and
  `handle:4..7` edges that change one coordinate (x1, x2, y1, y2). A horizontal line changes only its price,
  time zones only the time. Returns null when nothing can move (unknown handle, a pane is gone).
- **Move** (`moveDrawings(drawings, origin, point, shift, host)`): every anchor moves by the same time delta
  and by its own pane's price delta for the same pointer travel, so drawings on other panes follow. A
  drawing whose pane is gone is left out. Locked drawings in the selection are not moved; the machine raises
  one `blocked` effect for them when the drag starts, and a handle of a locked drawing is `blocked` and
  starts nothing.
- **Shift**: `constrainMove` locks a move to the axis with the larger delta; on a trend-line or fan handle
  `constrainAngle` rounds the line to a multiple of 45 degrees in pixels around the other anchor, keeping its
  length. Shift is read at every move, so releasing it frees the next move.
- **Escape** (or a pointer cancel) during a drag gives `drag-revert`: cancel the history transaction.
- **Arrow keys** with a selection give `nudge` (`ids` of the unlocked drawings, `bars`, `pixels`): one bar left
  or right, one pixel up or down on the drawing's pane, ten with Shift. Locked drawings give `blocked`.
  `nudgeAnchors(drawing, bars, pixels, host)` is also what duplicate uses.
- **Keyboard placement**: with a tool active, `keyboardCursorStart(yAxisId, host)` is the centre of the pane;
  arrows give `keyboard-move` and `moveKeyboardCursor(cursor, bars, pixels, yAxisId, host)` moves it (one bar
  at its position, Shift ten, kept `KEYBOARD_CURSOR_INSET_PX` inside the pane); Enter gives `keyboard-place`,
  which you pass to `reducePlacement` as a `click` at the cursor, and Escape gives `cancel-placement`. Keys
  the machine does nothing with return `ignored: true`, so only a key that changed something is handled.

## Magnet snapping

The magnet snaps an anchor to the open, high, low or close of the nearest bar. `reducePlacement` and
`dragHandle` take the effective magnet as a last argument (default `'off'`, so nothing changes for callers
that do not pass it); `placementSnap` and `handleSnap` return the point the pointer will snap to, for the
scene's `snap` option.

```ts
import { buildScene, effectiveMagnet, placementSnap, reducePlacement } from 'keystone-financial-tools-core';

let magnet = 'weak'; // the stored mode (setMagnet); never changed by Ctrl/Cmd
host.onPointer((event) => {
  const mode = effectiveMagnet(magnet, event.ctrlKey || event.metaKey); // read at every event
  const result = reducePlacement(tool, progress, input, host, mode);
  progress = result.progress;
  snap = placementSnap(progress, input.point, mode, host); // null: no indicator
  host.requestRender();
});
// in the overlay render pass: buildScene(host, { drawings, cache, preview, snap })
```

| Mode | Behaviour |
|---|---|
| `off` | Nothing snaps (the default) |
| `weak` | Snaps the whole point (time and price) only when the nearest value is within `WEAK_MAGNET_PX` (12) px of the pointer, otherwise the anchor stays free |
| `strong` | Always snaps where a bar is found |

- **Time**: the time snaps to the nearest bar when it lies within half a `barInterval()` of it. Beyond that
  (future space, a gap in the data) nothing snaps, neither time nor price.
- **Price**: the nearest of the bar's open, high, low and close in pixels on the anchor's own y-axis; the
  first of them in that order on a tie. A second anchor snaps on the first anchor's y-axis.
- **Ctrl/Cmd**: `effectiveMagnet(mode, invert)` turns `off` into `strong` and `weak` or `strong` into `off`.
  The stored mode is not changed.
- **`snapAnchor(anchor, magnet, host)`**: the snapped `{ anchor, point }` or null where nothing snaps (magnet
  off, no pane, no bar, too far from a bar, outside the weak reach).
- **Placement**: both anchors of a two-anchor tool, the drag mode and a keyboard cursor placement snap; the
  preview follows the snapped anchor.
- **Handle drags**: `dragHandle(..., magnet)` snaps the handles that set both time and price (trend line,
  fans, arcs, retracements, rectangle corners, text note). Rectangle edge handles, horizontal lines, time
  zones and body moves do not snap, and a Shift angle-locked drag keeps its angle. `handleSnap` takes the same
  arguments as `dragHandle`.

## Controller

`createDrawingTools(host, options)` wires every piece above to a host. It subscribes to the host's pointer,
key and viewport events, runs the gesture recogniser, the interaction machine, placement, move and snap
functions, writes to a `DrawingStore` through a `History`, and answers the host's render pass with
`getScene()`.

```ts
import { createDrawingTools } from 'keystone-financial-tools-core';

const tools = createDrawingTools(host, { store, magnet: 'weak', stayInTool: false });
const off = tools.on('state', (state) => updateToolbar(state)); // returns an unsubscribe function
tools.on('blocked', ({ code, ids }) => toast(`Locked: ${ids.join(', ')}`)); // KFT-E-LOCKED
tools.on('error', ({ source, message }) => report(source, message));

tools.activate('trend-line'); // click-click or press-drag-release on the chart
tools.undo();
// in the host's overlay render pass (it is called after host.requestRender()):
for (const item of tools.getScene()) draw(item);
tools.destroy(); // when the chart goes away
```

| Option | Meaning | Default |
|---|---|---|
| `store` | The `DrawingStore` to draw into | a new one |
| `history` | `{ limit?, now? }` for the `History` | 100 entries |
| `magnet` | `off`, `weak` or `strong` | `off` |
| `theme` | The `DrawingTheme` | `LIGHT_THEME` |
| `stayInTool` | Keep the tool active after a placement | `false` |
| `tools` | The kinds that can be activated | all kinds |
| `gestures` | `GestureOptions` (thresholds, clock) | defaults |
| `defaultYAxisId` | The pane keyboard placement starts in when no anchor is set | `price` |
| `createId` | Id of a new drawing | `createId` |
| `debug` | Receives a message for every input the state machine ignores | none |

- **Actions**: `activate(kind)` (throws `KFT-E-KIND` for a kind that is not available), `deactivate()`,
  `select(ids)`, `clearSelection()`, `remove(ids)` (one history entry), `undo()` and `redo()` (return whether
  anything happened), `setMagnet(mode)`, `setTheme(theme)`, `setOptions({ stayInTool?, tools? })`,
  `hitTest(x, y)`. Undo and redo are API actions; the application binds the shortcuts.
- **`getState()`**: `{ activeTool, interaction, selection, hover, canUndo, canRedo, magnet }`. The same object
  comes back until a value changes, and `selection` keeps its array while the ids are the same, so adapters
  can compare by reference.
- **Events** (`on(event, listener)`, payload typed per name): `change` (`StoreChange`), `selection` (ids),
  `tool` (kind or null), `interaction` (the interaction state), `state` (every new snapshot, including magnet,
  `canUndo` and `canRedo` changes), `blocked` (`{ code: 'KFT-E-LOCKED', ids }`, once per drag or key press)
  and `error` (`{ source, message, error }`).
- **Errors never reach the host** (NFR-REL-001): an exception in a handler, an action, a listener, the text
  editor or the history is caught and raised as an `error` event; an open drag is reverted and the store is
  left as it was. A listener that throws does not stop the other listeners.
- **Magnet**: Ctrl/Cmd inverts the mode for the event it comes with; the stored mode never changes.
- **Text notes**: a new note is created with empty text and `host.editText` (when the host has it) is asked
  for the text; a cancelled or failed editor keeps the empty text.
- **`destroy()`**: reverts a drag in progress, resets the cursor, unsubscribes from the host and the store and
  clears the listeners. It is idempotent; afterwards every call does nothing and emits nothing, `getScene()`
  returns an empty scene and `hitTest` returns null.

## Trend line

`trend-line` has two anchors. Activate it and place it on the chart, then select it to edit it:

```ts
const tools = createDrawingTools(host, { store });
tools.activate('trend-line');
// click, move, click  or  press, drag, release: the second anchor goes on the first anchor's y-axis

// later: extend it to the pane edges (one history entry, undo takes it back)
store.update(id, { options: { extendRight: true } });
```

- **Placing**: click-click or press-drag-release. A second anchor on the first one (within 1 px) creates
  nothing. Escape and the right button cancel without a store change; undo removes the line.
- **Editing**: a selected line has two handles (`handle:0`, `handle:1`), one per anchor; dragging one resizes
  the line, dragging the body moves it. Each gesture is one history entry; Escape puts a drag back. Delete
  removes it.
- **Shift** locks the angle to a multiple of 45 degrees (in pixels, around the other anchor, keeping the
  pixel length) while placing the second anchor and while dragging an endpoint. The locked anchor does not
  snap to the magnet. Releasing Shift frees the next move. The keyboard cursor is not locked (Shift makes
  its step ten times as long). `lockAngle(tool, progress, input, shift, host)` is the placement half.
- **Extensions**: `options.extendLeft` and `options.extendRight` (default false) draw a ray from the end with
  the smaller (larger) x to the edge of the pane; for a vertical line anchor 1 is the left end. The ray is
  computed from the host transforms, so it stays correct in future space right of the last bar. It never
  shortens the line, and a line that misses the pane or has no length is not extended. The extension is
  part of the `body`, so `hitTest` finds the line along it, with the same tolerance.

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
