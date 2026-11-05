# SDS: Keystone Financial Tools

Software Design Specification for the interactive drawing tools of the Keystone financial charting
family.

| | |
|---|---|
| Status | Draft 1.0 (2026-10-28) |
| Repository | `gwinnem/keystone-financial-tools` |
| Packages | `keystone-financial-tools-core`, `-typescript`, `-vue`, `-react`, `-angular` |
| First host | keystone-charts-financial |
| Backlog | [specs/backlog/backlog.json](backlog/backlog.json), created as GitHub issues by `scripts/create-backlog.ps1` |

Requirement ids (for example `FR-INT-004`) are referenced by the backlog and by tests. A change of
scope updates this document first, then the backlog, then code (see §16).

## 1. Purpose

Traders mark up charts: they draw trend lines through swing points, mark support and resistance,
box ranges, pin notes and measure retracements with Fibonacci tools. This solution provides those
**interactive drawing tools**: the user places, snaps, selects, moves, resizes, edits, locks, hides,
deletes, undoes and saves drawings on a chart.

The tools are chart-agnostic. They work on any chart that implements the `DrawingHost` contract
(§7). keystone-charts-financial is the first host.

## 2. Goals and non-goals

### 2.1 Goals

- G-1: A complete, production-grade drawing workflow (place, snap, select, edit, delete, undo,
  persist) with mouse, touch, pen and keyboard.
- G-2: Eight tools in the first release: trend line, horizontal line, rectangle, text note,
  Fibonacci retracement, Fibonacci arcs, Fibonacci fans, Fibonacci time zones.
- G-3: Drawings stored in chart-agnostic coordinates so they survive zoom, scroll, resize, pane
  layout changes and timeframe changes.
- G-4: All logic in a framework-neutral core; Vue, React and Angular packages are thin adapters.
- G-5: A versioned, validated document format with migration, import and export.
- G-6: A host conformance kit so any chart can prove it implements the host contract correctly.

### 2.2 Non-goals

- NG-1: Rendering infrastructure (canvas, WebGL, scene graph, clipping). The host renders (§8.3).
- NG-2: Programmatic Fibonacci overlays from given anchors, Fibonacci levels from a selected data
  range, and the range selector. These live in keystone-charts-financial (decided 2026-10-28). This
  repo reuses that renderer for interactive Fibonacci drawings.
- NG-3: Indicator calculations (keystone-financial-indicators) and trading signals
  (keystone-financial-signal).
- NG-4: A visual toolbar component. Adapters expose a headless toolbar model (§10.5); the UI is
  the application's.
- NG-5: Multi-user real-time collaboration. The document format allows it later; no sync protocol
  is specified here.

## 3. Definitions

| Term | Meaning |
|---|---|
| Anchor | A point in data space: `{ time, price, yAxisId }` |
| Drawing | A persisted object of one kind with its anchors, style and flags |
| Kind | The drawing type, for example `trend-line` |
| Tool | The interactive behaviour that creates and edits drawings of one kind |
| Host | The chart that implements `DrawingHost` |
| Pane | A chart area with its own y-axis; identified by `yAxisId` |
| Scene | The list of render items the host draws on its overlay layer for the current frame |
| Handle | A grab point of a selected drawing (one per anchor, plus kind-specific handles) |
| Part | What a hit test found: `body`, `handle:<n>`, `level:<ratio>`, `label` |
| Magnet | Snapping an anchor to the open, high, low or close of the nearest bar |
| Controller | The core object that ties a host, a store, the tools and history together |
| Document | The saved form of a store: version, scope and drawings |

## 4. Architecture

### 4.1 Packages

| Package | Folder | Contents |
|---|---|---|
| `keystone-financial-tools-core` | `packages/core` | Model, validation, store, history, geometry, hit-testing, scene, interaction engine, tools, controller, host contract, conformance kit (`/testing` entry) |
| `keystone-financial-tools-typescript` | `packages/typescript` | Core re-export; storage repositories (Web Storage, IndexedDB, memory); auto-save |
| `keystone-financial-tools-vue` | `packages/vue` | `useDrawings`, `useDrawingTools` composables |
| `keystone-financial-tools-react` | `packages/react` | `useDrawings`, `useDrawingTools` hooks |
| `keystone-financial-tools-angular` | `packages/angular` | `KeystoneDrawingService`, `KeystoneDrawingToolsService` (signals and observables) |
| docs | `packages/docs` | Astro/Starlight documentation site (§14) |
| playground | `apps/playground` | Reference canvas host and demo pages used by e2e tests (§13) |

### 4.2 Dependency rules

- AR-1: `core` has no runtime dependencies and no DOM access. Everything environment-specific comes
  through `DrawingHost`.
- AR-2: Framework packages depend on `core` only and contain no business logic: they adapt the
  core's public contracts (state, events, actions) to framework reactivity.
- AR-3: No package depends on keystone-charts-financial. The chart implements `DrawingHost`; the
  integration lives in the chart repository (§11).
- AR-4: The `typescript` package may use browser APIs (Web Storage, IndexedDB) behind interfaces
  that also have in-memory implementations for tests and server rendering.
- AR-5: Every core feature is reachable through every framework package without extra adapter code
  (parity, §10.6).

### 4.3 Decisions

- **D-1 Data-space anchors.** Drawings store `{ time, price, yAxisId }`, never pixels. Pixel
  geometry is recomputed from the host transforms for every frame.
- **D-2 Host contract, not chart dependency.** The chart implements `DrawingHost` (§7). This keeps
  release cycles independent and lets other charts host the tools.
- **D-3 Split rendering.** The core computes pixel geometry for every kind (used for hit-testing
  and handles). Primitive kinds are rendered by the host from shape items in the scene. Fibonacci
  kinds are rendered by the host's own Fibonacci overlay renderer from a `fibonacci` scene item in
  data space, so interactive and programmatic Fibonacci look identical. A parity fixture keeps the
  core's Fibonacci hit geometry and the host renderer in line (QA-007).
- **D-4 Pull-based scene.** The host calls `controller.getScene()` in its overlay render pass,
  after the controller has called `host.requestRender()`. The core never paints.
- **D-5 Time zones keep full anchors.** `fibonacci-time-zones` uses the normal anchor shape; the
  price is stored (so the anchor stays valid and handles have a y position) but ignored by the
  geometry. Closes the earlier open question about time-only anchors.
- **D-6 Commands for every change.** Every user change goes through a command (§6.4), which makes
  undo/redo, change events and persistence consistent.
- **D-7 Manual npm publishing (decided 2026-10-28).** The maintainer publishes releases to the
  public npm registry by hand. CI builds and tests releases but never publishes. Packages keep their
  un-scoped names (`keystone-financial-tools-*`) and are published in dependency order: core,
  typescript, vue, react, angular (the Angular package from its ng-packagr `dist`). Closes the
  publishing question raised in the backlog (E09-F04-S02).

## 5. Data model

### 5.1 Anchor

```ts
interface Anchor {
  readonly time: number;    // epoch milliseconds; may lie beyond the last bar (future space)
  readonly price: number;   // finite
  readonly yAxisId: string; // non-empty; the pane the price belongs to
}
```

- FR-DM-001: An anchor is valid when `time` and `price` are finite numbers and `yAxisId` is a
  non-empty string (`isValidAnchor`).
- FR-DM-002: All anchors of one drawing share the same `yAxisId` (`KFT-E-AXIS`).

### 5.2 Drawing

```ts
interface Drawing {
  readonly id: string;
  readonly kind: DrawingKind;
  readonly anchors: readonly Anchor[];
  readonly style?: DrawingStyle;
  readonly text?: string;
  readonly locked?: boolean;    // default false
  readonly hidden?: boolean;    // default false
  readonly zIndex?: number;     // default 0; ties broken by insertion order
  readonly options?: KindOptions; // kind-specific, §5.4
  readonly meta?: Readonly<Record<string, JsonValue>>; // application data, round-tripped untouched
}
```

| Kind | Anchors | Notes |
|---|---|---|
| `trend-line` | 2 | Options: `extendLeft`, `extendRight` |
| `horizontal-line` | 1 | Spans the pane width; only the price matters for geometry; carries a price label (FR-SC-001) |
| `rectangle` | 2 | Opposite corners |
| `text-note` | 1 | Requires `text` (may be empty while editing) |
| `fibonacci-retracement` | 2 | Options: `levels`, `reverse`, `extendLeft`, `extendRight`, `showLabels`, `showPrices` |
| `fibonacci-arcs` | 2 | Options: `levels`, `fullCircles`, `showLabels` |
| `fibonacci-fans` | 2 | Options: `levels`, `showLabels` |
| `fibonacci-time-zones` | 2 | Options: `sequence`, `showLabels`; prices ignored (D-5) |

- FR-DM-003: `id` is unique within a store; `createId()` returns a collision-safe id
  (`crypto.randomUUID` when available, otherwise a counter plus time-based fallback).
- FR-DM-004: The anchor count must match the kind (`ANCHOR_COUNT`, `KFT-E-ANCHORS`).
- FR-DM-005: `locked` drawings can be selected but not moved, resized, edited or deleted by
  interaction. API calls may still change them.
- FR-DM-006: `hidden` drawings are excluded from the scene and from hit-testing.
- FR-DM-007: `meta` is validated as JSON-safe and round-trips unchanged.

### 5.3 Style

```ts
interface DrawingStyle {
  readonly color?: string;        // CSS color; default from theme
  readonly lineWidth?: number;    // 1..10 CSS px
  readonly lineStyle?: 'solid' | 'dashed' | 'dotted';
  readonly fillColor?: string;
  readonly fillOpacity?: number;  // 0..1
  readonly textColor?: string;
  readonly fontSize?: number;     // 8..72 CSS px
}
```

- FR-DM-010: Style values are validated (`KFT-E-STYLE`); unknown keys are rejected.
- FR-DM-011: Missing style values resolve from a `DrawingTheme` (light and dark presets plus
  per-kind defaults) at scene time, not at storage time, so changing the theme restyles existing
  drawings that do not override a value.

### 5.4 Kind options

```ts
interface FibonacciLevel { readonly ratio: number; readonly visible: boolean; readonly color?: string }
```

- FR-DM-020: Default retracement levels: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1; optional
  extension levels 1.272, 1.618, 2.618, 4.236 (not visible by default).
- FR-DM-021: Default arcs and fans levels: 0.382, 0.5, 0.618.
- FR-DM-022: Default time-zone sequence: Fibonacci numbers 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89
  (bar counts from the first anchor; the second anchor sets the unit, §8.1).
- FR-DM-023: Level ratios are finite, unique within a drawing and at most 24 per drawing
  (`KFT-E-OPTIONS`).

### 5.5 Document

```ts
interface DrawingDocument {
  readonly version: 2;
  readonly scope?: { readonly symbol?: string; readonly timeframe?: string };
  readonly drawings: readonly Drawing[];
}
```

- FR-DM-030: `toJSON` writes the current version. `fromJSON` accepts versions 1 and 2; version 1
  is migrated in memory (defaults for new fields). Newer versions are rejected with `KFT-E-JSON`.
- FR-DM-031: Migrations are pure functions `vN -> vN+1`, chained, each covered by a fixture.
- FR-DM-032: Import modes: `replace` (validate all, then swap atomically) and `merge` (add valid
  drawings, rename id collisions). Both return an `ImportReport`
  (`added`, `renamed`, `skipped: { index, issues }[]`) instead of throwing on individual bad drawings.

### 5.6 Diagnostics

| Code | Meaning |
|---|---|
| `KFT-E-SHAPE` | The drawing is not an object |
| `KFT-E-ID` | Missing, empty or duplicate id |
| `KFT-E-KIND` | Unknown kind |
| `KFT-E-ANCHORS` | Anchors missing or the wrong count for the kind |
| `KFT-E-ANCHOR` | An anchor without a finite time and price or a y-axis id |
| `KFT-E-AXIS` | Anchors of one drawing on different y-axes |
| `KFT-E-TEXT` | Text that is not a string, or missing on a text note |
| `KFT-E-STYLE` | Invalid style value or unknown style key |
| `KFT-E-OPTIONS` | Invalid kind options (levels, sequence, flags) |
| `KFT-E-META` | `meta` is not JSON-safe |
| `KFT-E-MISSING` | Update or remove of a drawing that is not in the store |
| `KFT-E-LOCKED` | Interaction tried to change a locked drawing (reported as an event, not thrown) |
| `KFT-E-JSON` | A document that is not valid JSON or has an unsupported version |
| `KFT-E-SCOPE` | A loaded document belongs to another symbol or timeframe than the one it was loaded for (reported, not thrown) |
| `KFT-E-HOST` | The host does not satisfy the contract (wrong `apiVersion`, missing member) |
| `KFT-E-LICENSE` | A tool or feature is not included in the active license tier (§12) |

- FR-DM-040: Validation returns all issues in a stable order; `DrawingError` carries them.
- FR-DM-041: Every store mutation is atomic: on error the store and listeners are untouched.

## 6. Store, history and events

### 6.1 Store

- FR-ST-001: `DrawingStore` holds the drawings of one chart; `list`, `get`, `add`, `update`,
  `remove`, `clear`, `subscribe`, `toJSON`, `fromJSON` (delivered in 0.1).
- FR-ST-002: Every change replaces the list (structural sharing; the previous list is never
  mutated) so adapters can compare by reference.
- FR-ST-003: `batch(fn)` groups changes: one notification and one history entry.
- FR-ST-004: `ordered()` returns drawings sorted by `zIndex` then insertion order; `bringToFront`,
  `sendToBack`, `bringForward`, `sendBackward` adjust `zIndex`.

### 6.2 Change events

- FR-ST-010: Listeners receive a `StoreChange` with the new list and the operations
  (`{ type: 'add' | 'update' | 'remove', id, before?, after? }[]`) so persistence and sync can work
  incrementally, plus `history: boolean` (false for changes made with `{ history: false }`).
- FR-ST-011: `restore(drawings)` replaces the whole list as one change; drawings whose relative
  position changed are reported as `update`, so a pure reorder still notifies. History applies undo
  and redo through it.

### 6.3 Selection

- FR-ST-020: Selection is controller state, not stored in the document. It is cleared of ids that
  no longer exist after every store change.

### 6.4 History

- FR-HI-001: `History` records commands with their inverse. A command is plain data
  `{ operations, before, after }`: the store operations of one change (one operation is an add,
  update or remove; several are a batch) and the drawing ids in list order before and after it, so
  applying the inverse restores the exact list including order (`createCommand`, `invertCommand`,
  `composeCommands`, `applyCommand`).
- FR-HI-002: `undo()` and `redo()` apply the inverse or the command again through the store;
  `canUndo` and `canRedo` are observable.
- FR-HI-003: A continuous drag (pointer down to up) is one history entry (coalescing).
- FR-HI-004: The depth limit defaults to 100 (configurable 1..1000); the oldest entries are dropped.
- FR-HI-005: Changes made with `{ history: false }` (for example applying a remote document) are
  not recorded and clear the redo stack.

## 7. Host contract

### 7.1 Interface (api version 2)

```ts
interface DrawingHost {
  readonly apiVersion: 2;
  timeToX(time: number): number;               // extrapolates beyond the data (future space)
  xToTime(x: number): number;
  priceToY(price: number, yAxisId: string): number;
  yToPrice(y: number, yAxisId: string): number;
  yAxisAt(x: number, y: number): string | null;
  paneRect(yAxisId: string): Rect | null;      // plot area of the pane in CSS px
  nearestBar(time: number): { time: number; ohlc: Ohlc } | null;
  barInterval(): number;                        // ms between bars at the current timeframe
  onPointer(listener: (e: HostPointerEvent) => void): () => void;
  onKey(listener: (e: HostKeyEvent) => boolean): () => void; // return true = handled
  onViewportChange(listener: () => void): () => void;
  setCursor(cursor: DrawingCursor): void;
  requestRender(): void;
  editText?(request: TextEditRequest): Promise<string | null>; // optional inline editor
}

interface HostPointerEvent {
  readonly phase: 'down' | 'move' | 'up' | 'cancel' | 'leave';
  readonly x: number; readonly y: number;          // plot coordinates, CSS px
  readonly pointerType: 'mouse' | 'touch' | 'pen';
  readonly button: number;                         // 0 primary, 2 secondary
  readonly shiftKey: boolean; readonly ctrlKey: boolean;
  readonly altKey: boolean; readonly metaKey: boolean;
}

interface HostKeyEvent {
  readonly key: string;                            // KeyboardEvent.key
  readonly shiftKey: boolean; readonly ctrlKey: boolean;
  readonly altKey: boolean; readonly metaKey: boolean;
}

type DrawingCursor = 'default' | 'crosshair' | 'pointer' | 'move' | 'grab' | 'grabbing'
  | 'ns-resize' | 'ew-resize' | 'nwse-resize' | 'nesw-resize' | 'text' | 'not-allowed';
```

- FR-HOST-001: `createDrawingTools` rejects a host whose `apiVersion` is not supported or that
  lacks a required member (`KFT-E-HOST`, listing what is missing).
- FR-HOST-002: `timeToX`/`xToTime` and `priceToY`/`yToPrice` are inverses within 0.5 px / one
  price tick; log and percentage scales are the host's concern.
- FR-HOST-003: `timeToX` extrapolates beyond the first and last bar using `barInterval`, so anchors
  in future space stay in place.
- FR-HOST-004: The host forwards pointer events for the whole plot area and key events while the
  chart has focus. A key listener returning `true` means the tools handled it; the host then
  prevents the default action.
- FR-HOST-005: The host calls registered viewport listeners after zoom, scroll, resize, pane layout
  or timeframe changes.
- FR-HOST-006: The host calls `controller.getScene()` during its overlay render pass and draws the
  items above the series, clipped to `paneRect` (D-4).
- FR-HOST-007: Contract version 1 (0.1 `DrawingHost`) is replaced; no compatibility shim (no host
  implemented version 1).

### 7.2 Conformance kit

- FR-HOST-010: `keystone-financial-tools-core/testing` exports `runHostConformance(factory, test)`
  that checks a host against FR-HOST-001..006 with any test runner (`describe`/`it` passed in).
- FR-HOST-011: `createMockHost(options)` (same entry) is a deterministic in-memory host with linear
  scales, scripted pointer and key input and a recorded scene, used by this repo's tests and by host
  implementers.

## 8. Geometry, hit-testing and scene

### 8.1 Geometry

- FR-GEO-001: `geometryOf(drawing, host, options?)` returns pixel geometry per kind: shapes
  (lines, rectangles, arcs, text boxes, Fibonacci level labels), each tagged with its part, and
  handle points with stable ids (`handle:<n>`). Pure and deterministic; null when the y-axis has no
  pane. Handles: one per anchor; a horizontal line's handle at the pane's horizontal centre;
  time-zone handles at the anchor times, vertically centred; rectangles add the other two corners
  (`handle:2` at (x1, y2), `handle:3` at (x2, y1)) and the edge midpoints (`handle:4..7`: x1, x2,
  y1, y2 edges).
- FR-GEO-002: Trend line extensions are clipped to `paneRect`. Left and right mean the end with the
  smaller and the larger x (for a vertical line: anchor 1 and anchor 2). An extension never shortens
  the segment; a line that misses the pane, or has zero length, is not extended.
- FR-GEO-003: Retracement level price = `p1 + (p2 - p1) * ratio` (`reverse` swaps p1 and p2);
  level lines span from the left to the right anchor, or to the pane edge when extended (never
  shorter). With `showLabels` or `showPrices` each visible level has a label at the left end of its
  line, whose `text` is the ratio (`0.618`), the price (`111.80`) or both (`0.618 (111.80)`); the
  price is formatted by `priceFormatter(price, yAxisId)` like the label of a horizontal line
  (FR-SC-001, default 2 decimals) and only when it is shown. The label also keeps `ratio`, `price`
  and the two flags, so a host with its own Fibonacci renderer can format them itself. Hidden
  levels (`visible: false`) have neither a line nor a label, and are not hit (FR-HIT-003).
- FR-GEO-004: Fans: rays from anchor 1 through `(t2, p2 + (p1 - p2) * ratio)`, clipped to the pane.
  Rays without a direction or outside the pane are left out.
- FR-GEO-005: Arcs: centre at anchor 2, radius = `ratio` times the **pixel** distance between the
  anchors, recomputed every frame. Arcs therefore keep their shape on screen and change in data
  space when the price/time aspect changes (zoom). Half circles (opening away from anchor 1, so
  the curve faces it) by default, full circles with `fullCircles`. Levels with a radius of 0 or less
  are left out.
- FR-GEO-006: Time zones: unit `u = t2 - t1`; vertical lines at `t1 + n * u` for each `n` in the
  sequence, across the full pane height. Lines outside the pane's horizontal range are left out; a
  unit of 0 produces no lines.
- FR-GEO-007: Text note box: top left corner at its anchor, lines split on `\n`, text measured by a
  host-independent estimate (`fontSize * 0.6` per character, line height `fontSize * 1.3`) unless
  the host supplies `measureText` in the options; at least one character wide, so an empty note
  stays clickable. A line is never wrapped or cut: the box is as wide as the widest line, however
  long a word is, and as high as the number of lines (an empty line and a trailing line break count).
  The font size and the text colour are those of the resolved style (the scene item's `style`).

### 8.2 Hit-testing

- FR-HIT-001: `hitTest(point, { drawings, cache, selected?, pointerType?, theme? })` returns
  `{ id, part, locked } | null` for the topmost visible drawing within tolerance: 6 CSS px for mouse
  and pen (the default), 12 for touch (`HIT_TOLERANCE`). A distance of exactly the tolerance hits.
  Distances are measured to segments (not to their extensions), rays as clipped by the geometry,
  rectangle borders, arcs (to the nearer end where the arc does not cover the direction of the
  point) and text boxes (solid). Hidden drawings are never hit (FR-DM-006); locked drawings are,
  with `locked: true`, so they can be selected, and the caller decides what a locked drawing allows
  (FR-DM-005).
- FR-HIT-002: Handles of the selected drawings win over every body, including bodies with a higher
  `zIndex`; the nearest handle of a drawing wins and the lowest index on a tie. Among drawings the
  highest `zIndex` (default 0) wins, then the one added last: `drawings` is passed in insertion order
  (`store.list()`), and `hitTest` resolves the order itself. Handles of locked selected drawings are
  hit too and reported with `locked: true`. Within one drawing the nearest shape wins, the first one
  on a tie (so the point where all rays of a fan start reports the first level).
- FR-HIT-003: Parts: `body`, `handle:<n>`, `level:<ratio>` (Fibonacci levels and time-zone values)
  and `label`. Fills (rectangle) hit only when the resolved `fillOpacity` (the drawing's style over
  the theme) is above 0, otherwise only the border hits; text notes are always solid. The core cannot
  know the extent of the text a renderer draws, so a `label` is the tolerance disc around the label
  anchor (the left end of its level line), and it wins over the lines of its drawing.
- FR-HIT-004: `GeometryCache(host, { store?, theme?, measureText? })` keeps the geometry of each
  drawing between pointer moves, including a null geometry for a drawing without a pane. An entry
  is used only while the drawing is the same object it was computed from, and the store replaces a
  drawing on every change, so a changed drawing is recomputed and the others are not (no stale
  geometry). A viewport change clears every entry; with a `store` the entries of removed drawings
  are dropped. The theme and `measureText` are fixed per cache: a change of either needs a new
  cache. `destroy()` unsubscribes and is safe to call twice.

### 8.3 Scene

```ts
type SceneItem =
  | { type: 'shape'; drawingId: string; shapes: Shape[]; style: ResolvedStyle; opacity: number; state: ItemState }
  | { type: 'fibonacci'; drawingId: string; kind: FibonacciKind; anchors: Anchor[];
      options: ResolvedFibonacciOptions[FibonacciKind]; style: ResolvedStyle; opacity: number; state: ItemState }
  | { type: 'handles'; drawingId: string; points: Point[]; active?: number; style: HandleStyle; locked: boolean }
  | { type: 'preview'; shapes: Shape[]; style: ResolvedStyle };
type ItemState = 'normal' | 'hover' | 'selected' | 'locked';

buildScene(host, { drawings, cache, theme?, selected?, hover?, active?, preview?, snap? }): SceneItem[];
new SceneCache(host).get(options): readonly SceneItem[]; // same array until an input or the viewport changes
```

- FR-SC-001: `buildScene` returns items in paint order (`zIndex`, then insertion), then the preview
  items, then handles last. Primitive kinds are `shape` items; hidden drawings and drawings without
  a pane have no item. The scene is a pure function of the host and its options (drawings, geometry
  cache, theme, selection, hover, active handle, preview, snap); `SceneCache` returns the same array
  until one of them (compared by reference) or the viewport changes, so `getScene()` costs nothing
  between changes. The controller (E04) holds the state and wraps `SceneCache` as `getScene()`.
- FR-SC-001 (price label, E05-F02): a horizontal line's geometry holds, after its body line, a
  `text` shape of the part `label` with the price of its anchor. The text is
  `priceFormatter(price, yAxisId)`, by default `price.toFixed(2)`. `priceFormatter` is a runtime
  option, not a drawing option: a function cannot be stored in `Drawing.options`, which is JSON. A
  host passes it to `createDrawingTools`, `GeometryCache` or `geometryOf`; the placement preview
  uses the one of the scene's cache. The label's right edge is the right edge of the pane and its
  bottom edge is on the line, with the font size of the drawing's resolved style; it is not clamped
  to the pane, so a line at the very top has its label above the pane. The label is part of the
  drawing: hit-testing reports it as `label` and a drag on it moves the line.
- FR-SC-002: The placement preview of a drawing in progress is a `preview` item with the drawing's
  shapes (the pointer is its missing anchor) and resolved style. A snapped point is a second `preview`
  item: a circle of `SNAP_INDICATOR_RADIUS` (5 px) in the theme's default style. Both are absent from
  the scene once placement completes or is cancelled.
- FR-SC-003: Every drawing item has its `state` (`locked`, else `selected`, else `hover`, else
  `normal`) and a fully resolved `style`: `resolveStyle` with the state's `lineWidthDelta` added to
  `lineWidth` (hover and selected: +1). `opacity` is the state's opacity (locked 0.6, otherwise 1) and
  multiplies strokes, fills and text. A selected drawing also gets a `handles` item with the theme's
  handle style (8 px squares) and `locked`, so the host draws lock markers instead of grab handles on
  a locked drawing; `active` is the index of the handle being dragged.
- FR-SC-004: Fibonacci items are in data space for the host's Fibonacci overlay (D-3): `kind`,
  `anchors` and `options` fully resolved (every key of the kind, every level including hidden ones
  with `visible: false`; no defaults left for the host to guess), plus `style`, `opacity` and
  `state`. Their handles still come as `handles` items.

Decisions made while implementing (E03-F03): `opacity` is an item field because `ResolvedStyle`
has no stroke opacity; `handles` items carry `style` and `locked` so the host needs no theme lookup;
the snap indicator is a `preview` item with an arc, not a new item type; locked wins over selected
and hover; there is no polyline shape (geometry has none); the scene theme must be the theme of the
`GeometryCache`, which has fixed styles per cache; preview geometry uses the default text estimate
(no `measureText`).

## 9. Interaction engine

### 9.1 States

| State | Entered by | Left by |
|---|---|---|
| `idle` | start, Escape, completed action | pointer over drawing (hover), tool activation, pointer down on drawing |
| `placing` | tool activated | last anchor placed (-> `selected` or `idle` per `stayInTool`), Escape (cancel) |
| `selected` | click on a drawing, placement done | click on empty space, Escape, delete |
| `dragging-handle` | pointer down on a handle of a selected, unlocked drawing | pointer up (commit) or Escape (revert) |
| `moving` | pointer down on a selected, unlocked body and drag beyond 3 px | pointer up (commit) or Escape (revert) |
| `editing-text` | double-click a text note, Enter on a selected note | editor resolves or is cancelled |

- FR-INT-001: The engine is a pure state machine driven by host events and API calls; it is fully
  testable with the mock host. `reduceInteraction(state, input, ctx)` is a pure reducer returning
  `{ state, effects, ignored }`: it never reads the host or the store (`ctx.lookup(id)` supplies kind
  and lock flag), never throws, and an input that means nothing in the current state returns the same
  state with `ignored: true` (the controller logs it at debug level). The caller performs the effects
  (`remove`, `blocked`, `drag-start`, `drag-update`, `drag-commit`, `drag-revert`, `edit-text`,
  `apply-text`, `cancel-placement`, `select-all`, `duplicate`, `nudge`, `keyboard-move`, `keyboard-place`). Pointer cancel and leave during a drag revert like Escape.
- FR-INT-002: A pointer down and up within 3 px and 300 ms is a click; beyond 3 px it is a drag. The
  `GestureRecogniser` turns host pointer events into `move`, `click`, `double-click`, `drag-start`,
  `drag`, `drag-end`, `cancel` and `leave` gestures. A press held longer than 300 ms without moving is
  neither. A double-click is two clicks of the same button within 400 ms (between releases) and 6 px;
  it follows its second `click`, and a third click starts again. While one button is pressed the other
  buttons are ignored. All thresholds and the clock are injectable.

Decisions made while implementing (E04-F01): a click selects (a drag from an unselected drawing does
nothing; select it first); with `stayInTool` a completed placement stays in `placing`, without it the
new drawing is selected (the table's "idle" is read as the tool being left); a drag of a locked drawing
and deleting locked drawings raise `blocked` (`KFT-E-LOCKED`) and keep them selected; `sync` after a
store change drops selected, hovered and edited drawings that are gone (FR-ST-020) and reverts a drag
whose drawings are gone; Escape is ignored while a text editor is open (the editor owns it).

### 9.2 Placement

- FR-INT-010: Two-anchor tools support **click-click** (click anchor 1, move, click anchor 2) and
  **drag** (down at anchor 1, up at anchor 2). One-anchor tools place on click.
- FR-INT-011: The preview follows the pointer between anchors; Escape cancels without a store
  change; the right button cancels too.
- FR-INT-012: Placing outside any pane does nothing. Anchor 2 uses the y-axis of anchor 1 (the
  pointer price is projected onto that axis even when the pointer is over another pane).
- FR-INT-013: `stayInTool` (default false) keeps the tool active after placement for repeated use.
- FR-INT-014: Placement creates the drawing through one command (one history entry).

`reducePlacement(tool, progress, input, host)` is the pure part that decides where anchors go; it
runs while `reduceInteraction` is in `placing` and never touches the store. `PlacementProgress` is
`waiting` or `anchored` (the first anchor, the anchor under the pointer as the preview, and whether
the pointer is held). It returns the next progress and, when the drawing is complete, its anchors;
the controller creates the drawing in one store change (`placement-complete` to the machine) and
`placementPreview` feeds the scene's `preview` option. Escape, the right button, `deactivate` and a
new `activate` belong to the machine: on its `cancel-placement` effect the controller resets the
progress to `PLACEMENT_START`.

Decisions made while implementing (E04-F02): both modes share one path (a release or a second click
with the first anchor set completes, so a press-and-drag at anchor 2 of a click-click placement also
completes it); a press with the first anchor set but no drag starts the drag mode; the zero-length
test compares the two anchors in pixels, within 1 px in both x and y (`ZERO_LENGTH_PX`): a drag that
ends there starts over, a second click there is ignored and waits for another; a pane that
disappears during placement makes the pointer input ignored until Escape; only left-button input
places; a press with a one-anchor tool does nothing; the preview exists only for two-anchor tools
(a one-anchor tool places on the click, and a text note has no text yet to draw); the first anchor
needs a pane under the pointer, the second does not. A `drag-start` gesture carries the press origin
and the current pointer: the controller passes a `drag-start` with the origin and then a `drag` with
the point. `placement-complete` has `edit` (a text note opens the editor, FR-INT-050); a note
placed with `stayInTool` returns to its tool when the editor closes (`editing-text.resume`),
otherwise it is selected.

### 9.3 Selection and hover

- FR-INT-020: Hover sets the cursor (`pointer` on bodies, resize cursors on handles) and the
  `hover` item state.
- FR-INT-021: Click selects the hit drawing; Shift-click toggles it in a multi-selection; a click
  on empty space clears the selection.
- FR-INT-022: Delete and Backspace remove the selected unlocked drawings (one history entry);
  locked ones stay and raise a `blocked` event with `KFT-E-LOCKED`.
- FR-INT-023: Escape clears the selection (or cancels the current placement/drag first).
- FR-INT-024: Ctrl/Cmd+A selects all visible drawings; Ctrl/Cmd+D duplicates the selection offset
  by one bar and 10 px.

`cursorFor(tool, hit, drawing, host)` is the pure cursor mapping and `CursorSync` passes cursors to
`host.setCursor` only when they change. `reduceInteraction` takes a `select` input (the API, or the
answer to an effect) and Ctrl/Cmd+A and Ctrl/Cmd+D as `key` inputs with `ctrl`; it answers them with
the effects `select-all` and `duplicate`, which the controller performs. `duplicateDrawing(drawing,
id, host)` builds one copy.

Decisions made while implementing (E04-F03): the cursor is `crosshair` while a tool is active (over
anything), `default` over nothing, `pointer` over a body, level or label (locked or not),
`not-allowed` over a handle of a locked drawing, a resize cursor over a rectangle handle and `move`
over any other handle; a horizontal line that is not locked shows `ns-resize` over its body, label
and handle (E05-F02), as dragging any of them changes only the price, and the handle of time zones that are not locked shows `ew-resize` (E05-F08), as dragging it changes only a time; a rectangle corner shows the diagonal it sits on as it is on the screen (so it
stays right when the anchors are dragged past each other) and an edge handle its axis. `select` keeps
the ids that exist, once each, in the given order, keeps the hover, goes idle for none and returns
the same state object when the selection does not change, so the controller raises `selection` when
the state reference changes. Ctrl/Cmd+A works in `idle` and `selected` and is answered with a `select`
of every visible drawing; Ctrl/Cmd+D works in `selected` on the drawings that still exist (locked
ones too) and is answered with a `select` of the copies; the key counts as handled when the input
was not ignored (a Delete, Ctrl+A or Ctrl+D with nothing to act on is not). A copy keeps everything
of its original, is never locked, and moves one bar later and `DUPLICATE_OFFSET_PX` (10) down in
pixels on its own y-axis; a drawing whose pane is gone gets no copy. The controller adds the copies
in one `batch`, which is one history entry.

### 9.4 Move and resize

- FR-INT-030: Dragging a handle moves that anchor; dragging the body moves all anchors of all
  selected unlocked drawings by the same time and price delta (in data space).
- FR-INT-031: Shift while placing the second anchor of, or dragging an anchor of, a trend line or
  fans locks the angle to multiples of 45° in pixel space, measured from the other anchor; an
  angle-locked anchor does not snap to the magnet and the keyboard cursor is not locked; Shift while
  moving locks to horizontal or vertical movement.
- FR-INT-032: Rectangle handles: four corners and four edge midpoints; edge handles move one
  coordinate only.
- FR-INT-033: Escape during a drag reverts to the state at pointer down without a history entry.
- FR-INT-034: Arrow keys nudge the selection by one bar (left/right) or one pixel-equivalent price
  step (up/down); with Shift by ten. Consecutive nudges within 500 ms coalesce into one history entry.
- FR-INT-035: With a tool active and no pointer, a keyboard cursor starts at the centre of the pane;
  the arrow keys move it (one bar or one pixel, Shift ten), Enter places an anchor at it and Escape
  cancels the placement. A key counts as handled only when it changed something.

The pure part is in `move.ts`: `dragHandle(drawing, handle, origin, point, shift, host)` returns the
anchors of a handle drag, `moveDrawings(drawings, origin, point, shift, host)` those of a body move,
`nudgeAnchors(drawing, bars, pixels, host)` one nudge, `keyboardCursorStart` and `moveKeyboardCursor`
the keyboard cursor, with `constrainMove` and `constrainAngle` as the Shift rules. All take the
pointer origin and the current point and return new anchors without touching the store, so a drag is
stateless: the controller keeps the drawings as they were at pointer down, applies the result in one
store change per pointer move inside `history.transaction('drag')`, commits it on `drag-commit` and
cancels it on `drag-revert` (nothing is recorded and listeners see the restore as the last change).
The machine's effects are `nudge` (`ids`, `bars`, `pixels`, done in a `nudge` transaction so quick
nudges coalesce), `keyboard-move` (`bars`, `pixels`) and `keyboard-place`.

Decisions made while implementing (E04-F04): a handle or body drag applies the pointer's travel to the
original anchors (not the pointer position), so the grab offset is kept; time moves by the travel in
x and each anchor's price by the travel in y on its own pane's scale, so drawings on other panes move
by the same time delta and their own price delta; a drawing with a missing pane is left out. Rectangle
edge handles (`handle:4..7`) change one coordinate (x1, x2, y1, y2), corners change both, the other
kinds change both unless they use one (a horizontal line only the price, time zones only the time);
an unknown handle changes nothing. Shift while moving locks to the axis with the larger delta (the
horizontal on a tie). Shift on a trend-line or fan handle keeps the other anchor fixed and rounds the
angle to the nearest of eight directions in pixels, keeping the length; Shift is read at every move,
so releasing it removes the constraint at the next move. A body move that starts with locked drawings
in the selection moves the others and emits one `blocked` effect for the locked ones at drag start;
an arrow key does the same per key press; a handle of a locked drawing is `blocked` and nothing
starts. Arrow keys work in `selected` (`ctrl` is not an arrow key) and while `placing`; Enter in
`placing` places at the keyboard cursor. One keyboard step is one bar in x and one pixel in y; the
keyboard cursor is kept `KEYBOARD_CURSOR_INSET_PX` (1) inside the pane and uses the bar width at its
position. An arrow key with nothing selected, or only drawings that are gone, is ignored (not handled).

### 9.5 Magnet

- FR-INT-040: Magnet modes: `off`, `weak` (snap when within 12 px of an OHLC value of the nearest
  bar), `strong` (always snap to the nearest OHLC value). Default `off`.
- FR-INT-041: With magnet on, the anchor time snaps to the nearest bar time; in future space no
  snapping happens.
- FR-INT-042: Holding Ctrl/Cmd inverts the magnet temporarily (off becomes strong, on becomes off).
- FR-INT-043: The snapped point is shown in the preview and handle (snap indicator in the scene).

The pure part is in `snap.ts`: `snapAnchor(anchor, magnet, host)` returns the snapped anchor and its
point in the plot, or `null` where nothing snaps; `effectiveMagnet(mode, invert)` applies the
Ctrl/Cmd inversion. `reducePlacement` and `dragHandle` take the effective magnet as a last argument
(default `off`, so callers that do not use the magnet are unchanged) and snap the anchors they
produce. `placementSnap(progress, point, magnet, host)` and `handleSnap(drawing, handle, origin,
point, shift, host, magnet)` return the point the pointer will snap to, which the controller passes
to `buildScene` as `snap` (FR-SC-002). The controller reads Ctrl/Cmd from each pointer or key event,
so the stored mode (`setMagnet`) never changes.

Decisions made while implementing (E04-F05): the time snaps to the nearest bar when it lies within
half a `barInterval` of it; further away (future space, or a gap in the data) there is no snapping
at all, neither time nor price, so the anchor stays free. The price snaps to the open, high, low or
close of that bar nearest to the pointer in pixels on the anchor's own y-axis (the first of open,
high, low, close on a tie). `strong` always snaps where a bar is found; `weak` snaps the whole point,
time and price together, only when the nearest value is within `WEAK_MAGNET_PX` (12, exactly 12
snaps) Euclidean pixels of the pointer, otherwise the anchor stays free. A second anchor snaps on
the y-axis of the first (FR-INT-012). Handle drags snap the handles that set both time and price
(trend line, fans, arcs, retracements, rectangle corners, a text note); rectangle edge handles,
horizontal lines and time zones set one coordinate and do not snap, a body move does not snap, and
a Shift angle-locked drag keeps its angle and does not snap. A keyboard cursor snaps like a
pointer. The indicator is absent when the magnet is off, outside a pane or where nothing snaps.

### 9.6 Text editing

- FR-INT-050: Text notes are edited with `host.editText` when present, otherwise through the
  adapter's default editor (§10); the core only requests and applies the result. A new note is
  placed with empty text and its editor is opened at once. Cancelling that editor (it answers
  `null`) removes the note and leaves no history entry; confirming it stores the text, and the note
  with its text is one history entry (undo removes both). Editing an existing note (double-click, or
  Enter on a selected, unlocked note) is one history entry; cancelling it changes nothing.
- FR-INT-051: Text is plain text; it is never interpreted as HTML (NFR-SEC-002).

### 9.7 Controller API

```ts
const tools = createDrawingTools(host, {
  store?, history?: { limit?: number }, magnet?: MagnetMode, theme?: DrawingTheme,
  stayInTool?: boolean, tools?: DrawingKind[], license?: LicenseContext, // license: E10, not yet
  gestures?: GestureOptions, defaultYAxisId?: string, createId?: () => string, debug?: (message: string) => void,
});
tools.activate('trend-line'); tools.deactivate();
tools.select(ids); tools.clearSelection(); tools.remove(ids);
tools.undo(); tools.redo(); tools.setMagnet('weak'); tools.setTheme(theme);
tools.getState(); // { activeTool, interaction, selection, hover, canUndo, canRedo, magnet }
tools.setOptions({ stayInTool?, tools? });
tools.on('change' | 'selection' | 'tool' | 'interaction' | 'state' | 'blocked' | 'error', listener); // returns unsubscribe
tools.getScene(); tools.hitTest(x, y); tools.destroy();
```

- FR-INT-060: `destroy()` unsubscribes from the host, clears listeners and is idempotent.
- FR-INT-061: State is exposed as an immutable snapshot that changes reference only when it
  changes (adapter-friendly, like the store).
- FR-INT-062: Every entry point (pointer, key and viewport handlers, store and history callbacks,
  actions, `getScene`, `hitTest`, listeners) catches exceptions (NFR-REL-001): the open drag is
  reverted, an `error` event carries `{ source, message, error }` and the store is left as it was.
  After `destroy()` every call is a no-op that emits nothing and `getScene()` returns an empty scene.

`createDrawingTools` is `DrawingToolsController` in `controller.ts`. It owns the interaction state, the
placement progress and snap, the keyboard cursor and the drag session, and wires the pure parts of
9.1 to 9.5: host events go through `GestureRecogniser`, `reduceInteraction` returns effects and the
controller performs them against the `DrawingStore` and the `History`.

Decisions made while implementing (E04-F06): the construction order is `assertHost`, option checks
(`RangeError` for a bad magnet or history limit, `KFT-E-KIND` for unknown kinds in `tools`), then the
history, geometry cache, scene cache, gesture recogniser and the host subscriptions; if one step
throws, everything already subscribed is released before the error propagates. `activate` of a kind
outside `tools` throws `KFT-E-KIND`; `setOptions({ tools })` deactivates an active tool that is no
longer allowed. `getState()` keeps its object while `interaction`, `canUndo`, `canRedo` and `magnet`
are unchanged and keeps the `selection` array while the ids are the same; the `hover` is part of
`interaction`. Besides the six events of the story there is a `state` event that fires for every new
snapshot (a magnet, `canUndo` or `canRedo` change has no other event); `tool`, `selection` and
`interaction` fire first, only for what changed. `blocked` carries `{ code: 'KFT-E-LOCKED', ids }`, once
per drag or key press. `error` sources are `pointer`, `key`, `viewport`, `store`, `history`, `action`,
`scene`, `text-editor` and `listener`; a listener that throws is reported as a `listener` error (a throwing
`error` listener is ignored, so there is no loop) and the other listeners are still called. A
failed drag is reverted (the history transaction cancelled, the anchors restored) and the state returns
to `selected`. After every handled input the controller publishes the state and calls
`host.requestRender()`. `activate` and `deactivate` set the `crosshair` or `default` cursor. Tool shortcuts and
the undo and redo keys are bound by the controller through `host.onKey` (FR-FW-041, §10.5); `undo()`
and `redo()` remain API actions too.
Keyboard placement needs a pane; it uses the pane of the first anchor, otherwise `defaultYAxisId`
(default `price`). A text note is created with `text: ''` and the editor (`host.editText`) is opened when
the host has one. A cancelled editor removes the new note without a history entry (FR-INT-050); a host
without an editor, and an editor that fails, keep the empty note. The history entry of a new note stays
open while its editor is: `undo()` and `redo()` return false then, and changes made to the store
meanwhile belong to that entry. The answer of an editor that arrives after `destroy()` is dropped. `destroy()` reverts an open drag, resets the cursor and releases
every subscription. The `license` option belongs to E10 and is not implemented here.

## 10. Framework packages

### 10.1 TypeScript (`keystone-financial-tools-typescript`)

- FR-FW-001: Re-exports core; adds repositories (§10.7) and `autoSave` (delivered for Web Storage
  in 0.1).

### 10.2 Vue

- FR-FW-010: `useDrawings(store)` (0.1) and `useDrawingTools(host, options)` returning reactive
  `state`, `drawings` and the controller actions; destroyed with the effect scope.

### 10.3 React

- FR-FW-020: `useDrawings(store)` (0.1) and `useDrawingTools(host, options)` built on
  `useSyncExternalStore`; StrictMode-safe (double mount creates one controller per mount and
  destroys it).

### 10.4 Angular

- FR-FW-030: `KeystoneDrawingService` (0.1) and `KeystoneDrawingToolsService` exposing Angular
  signals and observables for state and drawings; cleanup on `DestroyRef`.

### 10.5 Headless toolbar model

- FR-FW-040: `TOOL_CATALOG`: id, label, group (`lines`, `shapes`, `fibonacci`, `annotations`),
  icon name, keyboard shortcut, license tier. Adapters expose it with the active tool and enabled
  state; the application renders the toolbar.
- FR-FW-041: Default shortcuts: Alt+T trend line, Alt+H horizontal line, Alt+R rectangle, Alt+N
  text note, Alt+F Fibonacci retracement; configurable.

### 10.6 Parity

- FR-FW-050: A parity test lists every public core export and asserts that each framework package
  re-exports it or exposes it through its adapter.

### 10.7 Persistence

- FR-PER-001: `DrawingRepository { load(scope), save(scope, doc), remove(scope) }` (async).
  Implementations: `WebStorageRepository`, `IndexedDbRepository`, `MemoryRepository`.
- FR-PER-002: `autoSave(store, repository, scope, { debounceMs = 500 })`: saves after changes,
  coalesced; reports failures through an `error` callback; `flush()` and `stop()`.
- FR-PER-003: Scope key: `keystone-drawings:<symbol>[:<timeframe>]`; drawings are timeframe
  independent by default (D-1), per-timeframe scoping is opt-in.
- FR-PER-004: Loading never throws on a bad stored document: it returns an empty store plus the
  `ImportReport` / `KFT-E-JSON` issue.

Decisions of E06-F02 (repositories):

- `DrawingScope` is `{ symbol, timeframe? }` (the symbol is required; `DocumentScope` keeps both optional).
  `load(scope)` resolves `{ document, issue? }`: the stored document migrated to version 2, an empty
  document when nothing is stored, and an empty document plus the `KFT-E-JSON` issue when the entry is
  not a drawing document (the entry is left in place). It does not validate the drawings; `loadStore`
  (E06-F04) and `importDocument` do, and report the skipped ones. `readStored` is exported so that a
  custom backend follows the same rules.
- A failing backend rejects with `RepositoryError` (`Could not <read|save|remove> the drawings under
  <key>: <reason>`, `reason` holds what the backend threw); the sync `DrawingError` codes are not
  used for storage failures.
- Keys are `scopeKey(scope, prefix = 'keystone-drawings')`; the Web Storage repository writes with a
  single `setItem`, so a refused write leaves the previous document and nothing partial. The
  IndexedDB repository keeps one record per scope in the `drawings` object store of a version 1
  database (`UPGRADES[n]` takes version n to n + 1) and retries a failed open on the next call.
- Tiers: `REPOSITORY_TIERS` records Web Storage and memory as Community and IndexedDB as
  Professional, following the proposal of FR-LIC-002; OD-2 stays open; `TOOL_CATALOG` (E07-F05) carries
  the same proposal in its `tier`, to be changed when OD-2 is decided.

Decisions of E06-F01 (0.1 helpers):

- `saveDrawings`, `loadDrawings` and `autoSave(store, storage, key)` stay with unchanged signatures and
  behaviour and are marked `@deprecated`. They are synchronous and take a raw key, so they cannot
  delegate to the asynchronous `WebStorageRepository`; they share its codec instead
  (`serializeDocument`, `invalidJsonIssue`). A document saved under `scopeKey(scope)` loads in either
  direction.
- The repository form of `autoSave(store, repository, scope, options)` (E06-F03) is an overload of
  the same export, told apart by its third argument (a string key versus a scope); the helper that
  takes a storage keeps working.

Decisions of E06-F03 (auto-save and scopes):

- `autoSave(store, repository, scope, { debounceMs = 500, onError, scheduler })` returns
  `{ flush(), stop() }`. Every store change restarts the timer; nothing is saved until the store
  changes. Saves run one after the other (a queue), so an older document never lands after a newer
  one, and a change made during a save is saved afterwards. `flush()` saves pending changes at once
  and resolves when written, also after a save that was already running; `stop()` flushes, then
  unsubscribes, and can be called twice.
- A failed save calls `onError` and never throws into the store; `flush()` and `stop()` still resolve.
  The changes stay pending, so the next change, `flush()` or `stop()` tries again. An error thrown by
  `onError` itself is ignored. The `scheduler` (`setTimeout`/`clearTimeout`) is injectable; the default
  is the global timer.
- `checkScope(document, scope)` returns the `KFT-E-SCOPE` issue when a document names a symbol or a
  timeframe other than the ones it was loaded for. A document without a scope (version 1, written by
  hand) matches every scope, and a document that names no timeframe is timeframe independent and matches
  every timeframe. The repositories call it in `load` (through `readStored(value, scope)`): a mismatch
  resolves like a corrupt entry, with an empty document plus the issue, and the entry is left in place.
- `KFT-E-SCOPE` is a new issue code (§5.6); `DrawingIssueCode` in the core gains it.

Decisions of E06-F04 (import, export and safe loading):

- `exportDrawings(store, { pretty })` is `store.toJSON()` as text through the same codec the
  repositories use (`serializeDocument`), so an export is what `WebStorageRepository` stores; `pretty`
  indents with two spaces. `importDrawings(store, text, options)` is `importDocument` with the core
  options (`mode`, `createId`, `history`) and one difference: a document that cannot be read does not
  throw but returns a report.
- The report is `DrawingsReport`: the core `ImportReport` plus an optional `issue` for the whole
  document (`KFT-E-JSON`, or `KFT-E-SCOPE` from a repository). The core `ImportReport` has no place
  for it and stays unchanged, because `importDocument` throws for such a document. Only a
  `DrawingError` becomes a report; any other error (a store listener that throws) is rethrown, since
  the store has changed by then. The scope of the store is not changed by the imported document.
- `loadStore(repository, scope)` resolves `{ store, report }`. The store is new, holds the valid
  drawings (loaded as `replace`, so a repeated id is skipped with `KFT-E-ID` and never renamed) and
  has the requested scope (`{ symbol, timeframe? }`), also when nothing could be loaded, so the next
  save stamps the document. A repository issue (`KFT-E-JSON`, `KFT-E-SCOPE`) is returned as
  `report.issue`; a document the repository hands over that is not readable is reported the same way.
- FR-PER-004 covers what is stored, not the backend: a repository that fails still rejects with its
  `RepositoryError`. An empty store there would hide the saved drawings, and `autoSave` would then
  save over them.
- The tests build their documents inline instead of importing the core's `__fixtures__` (the
  packages do not share them); the same shapes (version 1, version 2 with scope, a broken drawing, a
  repeated id) are covered.

Decisions of E07-F02 (Vue controller adapter):

- AR-2 (no business logic in adapters) decides where the default text editor lives. The editing
  session is the core's: `TextEditor` holds the open `TextEditSession` (`request`, `confirm(text)`,
  `cancel()`), settles it once, replaces an open one (the first resolves with null) and tells its
  subscribers when the session changes. `textEditorKeyAction` maps a key to `confirm` (Ctrl or Cmd with
  Enter), `cancel` (Escape) or nothing, and nothing while an input method is composing. Vue, React and
  Angular only show the session, so they cannot differ in behaviour.
- `DrawingToolsOptions.editText` is a new core option: the editor for a host that has no `editText`.
  A host's own editor wins. This lets an adapter offer an editor without wrapping the host (a proxy
  would break hosts that are classes with private fields). The controller's rules for the answer are
  unchanged: null removes a new note without a history entry, an unavailable or failing editor keeps
  the empty note and reports `text-editor`, and an answer after `destroy()` is dropped.
- `useDrawingTools(host, options?)` takes the options of `createDrawingTools`, except that `editText`
  can also be `false`. Left out it is the default `TextEditor`, a function replaces it and `false`
  means no editor. It returns the controller, the store (`useDrawings`), the refs `state`, `drawings`
  and `textEdit`, and the controller's actions. The refs are shallow and are replaced, never mutated.
  When the scope is disposed it unsubscribes, destroys the controller, then cancels an open editor, so
  that answer is dropped and not applied.
- `KeystoneTextEditor` renders a textarea for `textEdit` at `request.x`, `request.y` and
  `request.fontSize`, inside the chart's positioned element. Ctrl or Cmd with Enter confirms, Escape
  cancels and leaving the textarea confirms (once: the session ignores later answers). Keydown and the
  pointer events stop at the textarea, so Delete, Backspace and clicks do not reach the host's
  listeners. The text is a `value`, never HTML (NFR-SEC-002). Focus moves into the textarea and back to
  the element that had it. Each session gets its own textarea (its own text, selection and focus).
  `TEXT_EDITOR_LABEL` is the default accessible name (`DEFAULT_MESSAGES['editor.note']` since E07-F06);
  `label` replaces it, for example with the translated text of the message table.

Decisions of E07-F03 (React controller adapter):

- `useDrawingTools(host, options?)` takes a host that may be `null` or `undefined` (a chart is often
  not there on the first render) and returns `tools: DrawingTools | null`. Until a host exists the
  state is `IDLE_STATE`, the actions do nothing (`undo` and `redo` give `false`) and `drawings` is
  empty. This is a deviation from the Vue adapter, where the host is required.
- The controller is created in an effect, not during render, and kept in state. A StrictMode double
  mount therefore creates and destroys one controller per mount and leaves no listeners on the host.
  A new host (or store) destroys the old controller and creates a new one. The options are read when
  the controller is created (through a ref), so changing them later does not rebuild it; use `setTheme`,
  `setMagnet` and `setOptions`.
- The state is read with `useSyncExternalStore` over the controller's `state` event and `getState()`;
  the text-edit session the same way over `TextEditor.subscribe` and `session`. The actions are stable
  callbacks that change only with the controller. On cleanup the controller is destroyed, then an open
  editor is cancelled, so its answer is dropped.
- `editText` is `undefined` (the default `TextEditor`), a function, or `false` (no editor), as in Vue.
- `KeystoneTextEditor` is an uncontrolled textarea: its text is set once per session, so typing is
  never overwritten by a re-render. Its listeners are native listeners on the textarea, not React
  props: React handles events at the root, after the listeners of the chart's own elements, so
  `stopPropagation` in a prop could not keep Delete, Backspace or pointer events from the chart.
- `shouldRestoreFocus(active, editor, body)` (core, shared by all adapters) decides whether closing
  the editor moves the focus back: only when nothing, the editor or the body has it. If the user moved
  the focus to another element (a blur that confirmed the text), it stays there. The Vue editor had
  always moved the focus back; E07-F03 fixes that with the same rule.

Decisions of E07-F04 (Angular controller adapter):

- `KeystoneDrawingToolsService` is not provided in root: it is one chart's service, provided on the
  component that holds the chart (`providers: [KeystoneDrawingToolsService]`) and destroyed with it
  through `DestroyRef`. `attach(host, options?)` and `detach()` replace the host argument of the Vue
  and React hooks, as an Angular chart has no host until its view exists. Like the React hook it has
  no controller until a host is attached: `tools` is null, the state is idle, the actions do nothing
  (`undo` and `redo` give false), and the options are read when `attach` creates the controller.
  `attach` destroys the controller it had, `detach` and destroying the service destroy it and then
  cancel an open editor, so its answer is dropped.
- Every value is offered as a signal (`tools`, `state`, `drawings`, `textEdit`) and as an observable
  (`tools$`, `state$`, `drawings$`, `textEdit$`). A small internal `Channel` sets both together, so they
  never differ, and the observables complete with the service. Signals make the service work with zone.js
  and zoneless; both are tested.
- `store` is the one in the options, otherwise the service's own, which is kept across `attach` calls.
  `KeystoneDrawingService` (providedIn root, `attach(store)`) is unchanged.
- `KeystoneTextEditorComponent` (`keystone-text-editor`) builds its textarea with the DOM, not with a
  template: its inputs are setters (`session`, `label`) that open and close the textarea at once. The
  signal `input()` function needs Angular's compiler transform, which the package's vitest tests do not
  run, and the DOM route keeps the text a `value` (NFR-SEC-002), with native listeners that run before
  the chart's own. Behaviour is the same as the Vue and React editors; `shouldRestoreFocus` decides
  whether the focus goes back.
- The `editText` rule (left out: default editor, function: replaces it, `false`: none) is in each of the
  three adapters; E07-F06 left it there: each adapter maps it to its own editor, and the core keeps the
  framework-neutral `TextEditor`.

Decisions of E07-F05 (headless toolbar model, FR-FW-040, FR-FW-041):

- `TOOL_CATALOG` is a frozen list in the order of `DRAWING_KINDS`. An entry has `id`, `labelKey`
  (`tool.<id>`, the key of the label in the message table, `DEFAULT_MESSAGES` of E07-F06), `group`, `icon` (the id, a name for the application to map to an icon), `shortcut`
  (the default, or null) and `tier`. Groups: `lines` (trend line, horizontal line), `shapes` (rectangle),
  `fibonacci` (the four Fibonacci tools) and `annotations` (text note). Tiers follow the proposal of
  FR-LIC-002: text note, lines and rectangle `community`, the Fibonacci tools `professional`; OD-2 stays
  open.
- The toolbar is part of the controller's state, `DrawingToolsState.toolbar`, not computed in each adapter,
  so the three adapters cannot differ: one `ToolbarEntry` (the catalog entry with `active`, `enabled`
  and the shortcut in use) per tool. `active` is the tool placing drawings now (also while its note is
  edited and `stayInTool` returns to the tool), `enabled` is membership of the `tools` option. The array
  is rebuilt only when an entry changes (an unchanged one is the same object, so `toolbar$` of Angular
  and the memo of a framework can compare by reference); `setOptions({ tools })` publishes a new state
  when the enabled set changes. Without a host the adapters give `IDLE_TOOLBAR`: every entry disabled.
  Vue and React return `toolbar`, Angular `toolbar` (signal) and `toolbar$`.
- The licence half of `enabled` (FR-LIC) waits for E10: nothing checks a licence yet, and `tier` is data
  only. When E10 lands the licence gate feeds the same `enabled` flag, so the adapters do not change.
- Shortcuts are handled in the controller's key handler, before the interaction machine, so they work
  with any host that passes keys on. A shortcut is `Ctrl` or `Cmd`, `Alt` and `Shift` joined with `+`
  before a letter or a digit, with Ctrl or Alt among them; `parseShortcut` reads it and `formatShortcut`
  gives the canonical text (`Ctrl+Alt+L`) the toolbar shows. The `shortcuts` option maps kinds to
  shortcuts: a kind left out keeps its default, `null` turns one off. `resolveShortcuts` throws at creation:
  `KFT-E-KIND` for a name that is not a kind, `RangeError` for an invalid shortcut, for Ctrl/Cmd with A,
  D, Z or Y (the keys of select all, duplicate, undo and redo) and for one shortcut given to two tools.
- Undo is Ctrl/Cmd+Z, redo is Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y. These keys are fixed, not options. A key is
  reported as handled only when it did something: nothing to undo or redo, and the open entry of a note
  editor (`undo()` returns false then), leave the key to the host; a tool shortcut is handled when the
  tool is in `tools` and the machine accepts `activate` (idle, selected or placing, so a drag or a note
  editor is not interrupted). Choosing a tool while placing starts that tool over (`cancel-placement`).
- `HostKeyEvent` gains the optional `code`, a compatible addition to contract version 2. A key matches by
  `key` when it is a letter or a digit (either case) and otherwise by the letter or digit of `code`, as
  Option on a Mac changes the character of a letter. A host that does not pass `code` still gets the
  shortcuts on Windows and Linux. The playground does not pass `code` yet.

Decisions of E07-F06 (parity and i18n, FR-FW-050, NFR-I18N-001, AR-5):

- The parity test lives in `packages/typescript/__tests__/parity.test.ts`: the typescript package is the one
  that depends on the core and runs in Node, and no package may depend on the framework packages. It reads
  the entries of the packages as text (the `export { ... } from` lists and the declarations behind
  `export * from './lib/...'`) and does not import them, so it checks what an application can import. For
  each of Vue, React and Angular, every name the core exports is exported by the package, wrapped (the
  wrapper is named and must be exported), or on the allow-list (`parity-exceptions.ts`, a reason for each).
  The test also fails for an allow-list entry that the core does not export, one that a package exports
  anyway, and a wrapper that is missing, so the list cannot go stale. The typescript package exports the
  core as a whole (`export *`).
- Every package re-exports by name, not with `export *` (AR-5 keeps the surface visible in each entry): the
  types, constants, validation, document import and export, style and option helpers, shortcut and
  message helpers, the host contract, the scene and geometry types that `getScene()` returns, the store, the
  text editor and the controller. The allow-list is the engine behind the tools: geometry and hit-test
  functions, the caches, the gesture recogniser, the interaction, placement, snap and move functions and
  their types, the commands, the history internals and the host wiring. A chart integration that needs
  those uses the core directly, as it did before. `History`, `HistoryState`, `hitTest` and `buildScene` are
  wrapped: `undo`, `redo`, `canUndo`, `canRedo`, `hitTest` and `getScene` of the controller.
- CI runs the parity test in its own step as well as in the unit tests: it reads the source of every
  package, which a cached unit test run of one package would not notice changing.
- The message table is `DEFAULT_MESSAGES`, a frozen record of English texts under 16 keys: `tool.<kind>`
  (the `labelKey` of a catalog entry), `group.<group>`, `toolbar.label`, `editor.note`, `editor.confirm` and
  `editor.cancel`. `MessageKey` is the union of the keys, so a misspelt key is a type error. The `messages`
  option of `createDrawingTools` takes any of the keys; `resolveMessages` merges it over the English texts
  and throws a `RangeError` for a key that is not in the table (a typo would otherwise leave a text
  untranslated without a word) and for a text that is empty or not a string (an empty accessible name is
  no name); a key set to `undefined` keeps its English text. The result is `DrawingTools.messages`, frozen.
- The toolbar entries do not carry the text: `messages[entry.labelKey]` is the label, so the state and its
  reference identity do not depend on the language, and the texts are read once, when the tools are created.
  The adapters give the table as `messages`: Vue and React as a plain object (React from the first render,
  also before a host exists, read once like the other options), Angular as a signal that is the English
  table until `attach` and again after `detach`.
- The default note editor still has only its accessible name. `editor.confirm` and `editor.cancel` are in
  the table for an editor of the application's own, so that its buttons are translated with the rest.
- No user-visible text is written outside the table: a test (`messages-literals.test.ts`) fails when any
  source of the core, Vue, React or Angular has an English text of the table as a string literal, or gives an
  accessible name, a placeholder or the text of an element with a literal. This is a test and not a lint rule
  because it needs the table itself to know what to look for. Error messages for developers are not user
  texts and stay in English in the code.

## 11. Integration with keystone-charts-financial

- FR-INTG-001: The chart implements `DrawingHost` v2 in its repository (tracked there; the chart's
  EPIC E19 placeholder is replaced by this integration).
- FR-INTG-002: The chart passes `runHostConformance` in its own test suite.
- FR-INTG-003: The chart renders `fibonacci` scene items with its Fibonacci overlay renderer and
  `shape` items with its Painter on the overlay layer.
- FR-INTG-004: This repo's `apps/playground` contains a minimal canvas reference host (not the
  chart) so e2e tests do not depend on the chart's release cycle.

Decisions of the playground slice (pulled forward from E08-F01-S01 and E08-F02-S01 so the e2e suite
can start while E07 is still open):

- `apps/playground` is a workspace app (`apps/*` in `pnpm-workspace.yaml`) and `e2e/` a workspace
  package with the Playwright tests (`pnpm --filter keystone-financial-tools-e2e test:e2e`). The
  playground resolves the packages from their sources, so neither needs a build first.
- The host logic has no DOM: `createPlotHost` (scales, `nearestBar`, listener registries,
  `dispatchPointer`, `dispatchKey`, `changeViewport`) is unit tested under Node with 100% coverage
  and passes `runHostConformance` (QA-008). `main.ts`, `dom.ts` and `render.ts` only wire it to the
  DOM and the canvas; the e2e tests cover them and they are left out of the coverage gate.
- Pulled forward: one pane (`price`), a fixed viewport (100 candles and 20 empty slots), candles from
  a seeded generator, a simple Fibonacci renderer, a toolbar of all eight kinds, undo, redo, delete
  and magnet, persistence to `localStorage` through `WebStorageRepository`, `loadStore` and
  `autoSave`. The page exposes `window.playground` (`host`, `tools`, `store`, `bars`) for the tests.
- Still in E08: the second pane, zoom and scroll, the text editor (`editText`), the toolbar from
  `TOOL_CATALOG` (E07), the Vue, React and Angular demo pages, the keyboard-only and axe tests,
  multi-select, per-tool coverage of the e2e flows and the touch profile.
- The e2e suite runs in Chromium, Firefox and WebKit (CI job `e2e`); it is not part of the
  pre-commit hook.

## 12. Licensing

- FR-LIC-001: Tools and features are gated by a `LicenseContext` from keystone-license; without a
  license the Community tier applies.
- FR-LIC-002: Proposed tiers (OD-2): **Community**: trend line, horizontal line, rectangle, text
  note, selection, move/resize, delete, undo/redo, Web Storage persistence. **Professional**: the
  four Fibonacci tools, magnet snapping, IndexedDB repository, import/export with merge.
- FR-LIC-003: Activating a gated tool emits a `blocked` event with `KFT-E-LICENSE`; loaded documents
  that contain gated kinds are still rendered read-only (data is never lost).

## 13. Testing and quality

| Id | Requirement |
|---|---|
| QA-001 | Unit test coverage ≥ 90% lines, functions, branches and statements in every package |
| QA-002 | Stryker mutation score 100% per package (`break: 100`); justified `Stryker disable` comments only |
| QA-003 | Geometry golden fixtures per kind (input anchors, mock host scales, expected pixel geometry) |
| QA-004 | Property tests: projection round-trip, undo/redo restores the exact store, command inverse, validation never throws |
| QA-005 | Interaction scenario tests on the mock host for every state transition in §9.1 |
| QA-006 | Playwright e2e on `apps/playground` for place, snap, select, move, resize, delete, undo, persist in Chromium, Firefox and WebKit |
| QA-007 | Fibonacci parity fixture shared with keystone-charts-financial (same level set and geometry) |
| QA-008 | Host conformance kit self-test against the mock host and the playground host |

Pre-commit runs lint-staged, format check, type-check, lint and unit tests with coverage. Mutation
testing runs in CI for changes headed to `main`.

## 14. Documentation

- DOC-001: Root and package READMEs updated with every public change.
- DOC-002: TSDoc on every public export with an example (NFR-DOC-001); API reference generated
  with TypeDoc into the docs site.
- DOC-003: Astro/Starlight docs site (`packages/docs`): getting started per framework, every tool
  with an interactive example, host implementation guide, persistence guide, keyboard reference.
- DOC-004: CHANGELOG per release.

Decisions of E09-F01-S01 (docs site scaffold, pulled forward from M5 while E07 is open; S02, the API
reference, and S03, the live examples, stay in E09):

- `packages/docs` (`keystone-financial-tools-docs`) is an Astro 7 and Starlight site. The pages are plain
  Markdown under `src/content/docs` (no MDX: S01 needs no components, and Prettier leaves `.md` alone).
  Its only code is the data modules in `src/site` (`pages`, `sidebar`, `shortcuts`, `config`), which
  `astro.config.ts` imports so that the configuration can be tested; they have unit tests and Stryker
  like every package, and `src/content.config.ts` and the config file are left out as they only wire
  Astro.
- The tests tie the pages to the core instead of to themselves: one tool page for each entry of
  `DRAWING_KINDS`, each documenting exactly the options of `KIND_OPTION_KEYS`; the keyboard table has
  one row for each entry of `SHORTCUTS`; every page is in the sidebar and has a title and a description.
- Broken links fail the build: `starlight-links-validator` runs inside `astro build`, and CI already
  runs `pnpm build` for every package, so no separate job is needed. Mutation testing of the package
  runs in the CI matrix like the others.
- The docs build needs Node 22.23.4+ or 24 (Astro 7). It is the only package that does; the floor of
  NFR-COMP-001 for the other tooling does not change, and CI uses Node 24.
- The pages describe the fibonacci scene items as the chart's to paint (FR-INTG-003, the scope split);
  the geometry the tools compute for them is for hit-testing and handles.

Decisions of E08-F01 (playground reference host and demo pages; `apps/playground`):

- The existing host (`createPlotHost`) is extended, not replaced: pane `price` keeps its id and the
  test hook `window.playground` stays, so the e2e tests only changed where coordinates move. There are
  now two panes, `price` above `volume` (a quarter of the height), each with a linear scale. The volume
  of a bar is derived from its prices (`volumeOf`), so the seeded data set and every price stay as they
  were.
- The viewport (`src/viewport.ts`) is a pure function of the bar width and the left edge in bar slots:
  the smallest zoom shows every bar and the future space, the largest is 60 px per bar, and the view
  never leaves the first slot or the end of the future space. The price and volume scales fit the bars
  in view (every bar when the view is in the future space and none is shown). `zoom` and `scroll` tell
  the viewport listeners, which is how the tools redraw (FR-HOST); the host still passes
  `runHostConformance` for both panes (QA-008).
- Input: the wheel zooms around the pointer, and sideways movement or Shift with the wheel scrolls;
  `+`, `-`, Home, End, Page Up and Page Down act only on a key no tool handled, and never with Ctrl,
  Alt or Cmd, so the tools' shortcuts and the browser's zoom win. No touch zoom (not in the acceptance
  criteria).
- Demo pages (E08-F01-S02): one Vite server with four entry points (`index.html` for TypeScript,
  `vue.html`, `react.html`, `angular.html`). The toolbar is built from `state.toolbar` with the labels
  from `messages` (`TOOL_CATALOG` through the adapters), with `role="toolbar"`, a name, `aria-pressed`
  and `disabled` from the entries (NFR-A11Y-001). Undo, Redo, Delete and Magnet have no entry in the
  message table, so the demo owns those four English labels. Drawings are loaded from and saved to
  localStorage on every page (`loadStore`, `autoSave`).
- No framework plugin and no build step for the adapters: the Vue and React pages use render functions
  and `createElement` instead of `.vue` and JSX files, and the Angular page is compiled in the browser
  (`@angular/compiler`, decorators and `@Input` setters, no zone.js, zoneless by default in Angular 22)
  as the Angular package's own tests do. The Analog Vite plugin was considered and not needed.
- Coverage: the host logic (`data`, `plot-host`, `input`, `toolbar`, `viewport`) is unit tested at
  100%; `main`, `demo`, `dom`, `render` and the framework pages only wire it to the DOM and are covered
  by the e2e tests (QA-006): the viewport and the four pages.

Decisions of E08-F02 (end-to-end tests; `e2e/`):

- Table-driven flows (E08-F02-S01): `tools.spec.ts` runs the same flows for each of the eight tools (`TOOLS` in
  `support.ts`: kind, button label, anchor count): place by click, place by drag (two-anchor tools), magnet
  snap, select and deselect, move, resize by handle, multi-select (Shift+click, Ctrl+A), delete with undo,
  undo and redo, reload persistence. The text note adds its editor (confirm, Escape takes back a new note,
  Enter and double-click edit, text survives a reload). Resize is not run for the text note (no handle).
- No pixel arithmetic from the drawings' geometry: the tests place at fixed plot positions and find a drawing's
  body or handle by asking the tools' own `hitTest` across the price pane (`bodyPoint`, `handlePoint`), so
  the tests hold for any shape (arcs, fans, time zones) and any later change of the geometry.
- Browsers and touch: the three desktop projects run everything except `touch.spec.ts`; one `mobile-chromium`
  project (Pixel 7, landscape 915 x 412 so the 800 px chart fits) runs only `touch.spec.ts`: tap-tap placement,
  select, delete and undo. Touch drag is not covered (the tools place on tap-tap on touch). CI needs no change:
  the `e2e` job runs every project, headless, and uploads the traces and screenshots kept on failure.
- Keyboard-only and a11y (E08-F02-S02): `keyboard.spec.ts` reaches the chart with Tab, chooses the tool with
  Alt+T, places both anchors with the keyboard cursor and Enter, selects with Ctrl+A, nudges (one bar, ten px
  with Shift) and deletes; no mouse call. An axe scan (`@axe-core/playwright`) of `[role="toolbar"]` on the four
  pages fails on serious or critical findings.
- The TypeScript page mounts a DOM text editor (`text-editor-dom.ts`, over the core's `TextEditor`) so a note
  can be typed there; it is DOM glue and excluded from coverage like `dom` and `render`.
- Stryker does not apply to the e2e package (tests only).

Decisions of E08-F03 (keystone-charts-financial integration):

- Shared Fibonacci fixture (E08-F03-S02, QA-007, D-3): `FIBONACCI_PARITY` is published from the `/testing` entry
  (never from the main entry), versioned by `FIBONACCI_PARITY_VERSION` (raise it when an expectation changes).
  It holds the scales of a mock chart (800 px wide, one pane `price` 0 to 200 over 400 px, 60 s bars of 10 px)
  and seven cases for the four kinds: each has the drawing, the `levels` (ratio or sequence value with the
  expected price, radius or time) and the expected pixel `shapes`. Labels are left out (every chart draws its
  own text). The numbers were derived by hand from the golden fixtures, not from the code under test.
- Core use: `fibonacci-parity.test.ts` checks `geometryOf` against the shapes to 1e-9 and checks that the
  levels agree with the pixels, so the fixture cannot drift from the geometry; `entries.test.ts` pins the export.
- Host guide (E08-F03-S01, FR-INTG-001, DOC-003): `guides/host.md` is extended (no new page) with transforms,
  events, the overlay pass, the Fibonacci items, the fixture and `runHostConformance`, each with a skeleton.
- The chart's side (the issue in keystone-charts-financial that replaces its E19 placeholder, the reconciliation
  of its tier plan with FR-LIC-002 (OD-2, deferred) and its CI run of `runHostConformance`, FR-INTG-002) is
  tracked in the chart repository.

## 15. Non-functional requirements

| Id | Requirement |
|---|---|
| NFR-PERF-001 | `getScene()` for 500 visible drawings ≤ 2 ms on the reference machine (Node 24, CI baseline recorded) |
| NFR-PERF-002 | `hitTest()` for 500 drawings ≤ 0.5 ms (geometry cache warm) |
| NFR-PERF-003 | Pointer-move handling during a drag ≤ 1 ms excluding host rendering |
| NFR-SIZE-001 | `core` ESM bundle ≤ 25 kB min+gzip; each framework package ≤ 3 kB |
| NFR-COMP-001 | ES2020 output; evergreen browsers; Node 22.22.3+ or 24.15+ for tooling |
| NFR-SEC-001 | No `eval`/`Function`, no network access in core |
| NFR-SEC-002 | Text is never interpreted as HTML; imported documents are validated before use |
| NFR-REL-001 | Interaction never throws into the host: errors become `error` events and leave the store unchanged |
| NFR-A11Y-001 | All actions are possible with the keyboard (placement via keyboard cursor, §9.4 nudging); playground toolbar meets WCAG 2.1 AA |
| NFR-DOC-001 | Every public export has TSDoc with an example |
| NFR-I18N-001 | All user-visible strings (labels, tool names) come from a replaceable message table |

## 16. Delivery

| Milestone | Scope | Epics |
|---|---|---|
| M1 Foundation | Model v2, store, history, host contract v2, geometry, scene | E01, E02, E03 |
| M2 Interaction | Interaction engine, primitive tools | E04, E05 (F01-F04) |
| M3 Fibonacci and persistence | Fibonacci tools, repositories, import/export | E05 (F05-F08), E06 |
| M4 Adapters and integration | Framework adapters, toolbar model, playground, e2e, chart integration | E07, E08 |
| M5 Release | Licensing, docs site, performance, accessibility, release pipeline | E09, E10 |

Releases are published to npm manually (D-7); the release workflow only builds, tests and tags.

Change flow: SDS update, then backlog update (`backlog.json`, re-run the script with
`-UpdateExisting`), then code, then tests and docs. Source-of-truth precedence: this SDS > code >
tests > docs > backlog.

## 17. Traceability

| Requirements | Epic |
|---|---|
| FR-DM-001..041 | E01 |
| FR-ST-001..020, FR-HI-001..005 | E01 |
| FR-HOST-001..011 | E02 |
| FR-GEO-001..007, FR-HIT-001..004, FR-SC-001..004 | E03 |
| FR-INT-001..061 | E04 |
| Tools (§5.2 kinds, FR-GEO per kind) | E05 |
| FR-PER-001..004, FR-DM-030..032 | E06 |
| FR-FW-001..050 | E07 |
| FR-INTG-001..004, QA-006, QA-007 | E08 |
| QA-001..008, DOC-001..004, NFR-* | E09 |
| FR-LIC-001..003 | E10 |

## 18. Open decisions

| Id | Question | Proposal | Owner |
|---|---|---|---|
| OD-1 | Time-only anchors for time zones | Closed by D-5 | - |
| OD-2 | Tier split between Community and Professional | Proposal in FR-LIC-002. **Deferred (2026-10-28):** decided later, before E10-F01-S02 and E10-F02 start | gwinnem |
| OD-3 | Drawings per timeframe visibility (show a drawing only on some timeframes) | Defer to after 1.0; document field reserved in `meta` | gwinnem |
| OD-4 | Additional tools after 1.0 (ray, parallel channel, arrow, price range, date range, pitchfork) | Separate epic after M5 | gwinnem |
