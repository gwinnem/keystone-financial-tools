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
| `horizontal-line` | 1 | Spans the pane width; only the price matters for geometry |
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

- FR-GEO-001: `geometryOf(drawing, host)` returns pixel geometry per kind: segments, rays (for
  extensions), rectangles, arcs, text boxes and handle points. Pure and deterministic.
- FR-GEO-002: Trend line extensions are clipped to `paneRect`.
- FR-GEO-003: Retracement level price = `p1 + (p2 - p1) * ratio` (`reverse` swaps p1 and p2);
  level lines span from the left to the right anchor, or to the pane edge when extended.
- FR-GEO-004: Fans: rays from anchor 1 through `(t2, p2 + (p1 - p2) * ratio)`, clipped to the pane.
- FR-GEO-005: Arcs: centre at anchor 2, radius = `ratio` times the **pixel** distance between the
  anchors, recomputed every frame. Arcs therefore keep their shape on screen and change in data
  space when the price/time aspect changes (zoom). Half circles (opening away from anchor 1) by
  default, full circles with `fullCircles`.
- FR-GEO-006: Time zones: unit `u = t2 - t1`; vertical lines at `t1 + n * u` for each `n` in the
  sequence, across the full pane height.
- FR-GEO-007: Text note box: anchored at its anchor, text measured by a host-independent estimate
  (`fontSize * 0.6` per character, line height `fontSize * 1.3`) unless the host supplies
  `measureText` in the scene options.

### 8.2 Hit-testing

- FR-HIT-001: `hitTest(x, y)` returns `{ id, part } | null` for the topmost visible drawing within
  tolerance: 6 CSS px for mouse and pen, 12 for touch.
- FR-HIT-002: Handles of the selected drawings win over bodies; among bodies the highest `zIndex`
  (then the latest) wins.
- FR-HIT-003: Fibonacci level lines report `level:<ratio>`; fills (rectangle) hit only when
  `fillOpacity > 0`, otherwise only the border hits.
- FR-HIT-004: Hit-testing uses a per-frame geometry cache invalidated by store or viewport changes.

### 8.3 Scene

```ts
type SceneItem =
  | { type: 'shape'; drawingId: string; shapes: Shape[]; style: ResolvedStyle; state: ItemState }
  | { type: 'fibonacci'; drawingId: string; kind: FibonacciKind; anchors: Anchor[];
      options: ResolvedFibonacciOptions; style: ResolvedStyle; state: ItemState }
  | { type: 'handles'; drawingId: string; points: Point[]; active?: number }
  | { type: 'preview'; shapes: Shape[]; style: ResolvedStyle };
type ItemState = 'normal' | 'hover' | 'selected' | 'locked';
```

- FR-SC-001: `getScene()` returns items in paint order (`zIndex`, then insertion), handles last.
- FR-SC-002: The placement preview of a drawing in progress is a `preview` item.
- FR-SC-003: Hover and selected states are visible (host-styled, defaults in the theme: hover
  lineWidth + 1, selected handles 8 px squares).
- FR-SC-004: Fibonacci items are in data space for the host's Fibonacci overlay (D-3); their
  `options` are fully resolved (no defaults left for the host to guess).

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
  testable with the mock host.
- FR-INT-002: A pointer down and up within 3 px and 300 ms is a click; beyond 3 px it is a drag.

### 9.2 Placement

- FR-INT-010: Two-anchor tools support **click-click** (click anchor 1, move, click anchor 2) and
  **drag** (down at anchor 1, up at anchor 2). One-anchor tools place on click.
- FR-INT-011: The preview follows the pointer between anchors; Escape cancels without a store
  change; the right button cancels too.
- FR-INT-012: Placing outside any pane does nothing. Anchor 2 uses the y-axis of anchor 1 (the
  pointer price is projected onto that axis even when the pointer is over another pane).
- FR-INT-013: `stayInTool` (default false) keeps the tool active after placement for repeated use.
- FR-INT-014: Placement creates the drawing through one command (one history entry).

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

### 9.4 Move and resize

- FR-INT-030: Dragging a handle moves that anchor; dragging the body moves all anchors of all
  selected unlocked drawings by the same time and price delta (in data space).
- FR-INT-031: Shift while dragging a trend-line or fan anchor locks the angle to multiples of 45° in
  pixel space; Shift while moving locks to horizontal or vertical movement.
- FR-INT-032: Rectangle handles: four corners and four edge midpoints; edge handles move one
  coordinate only.
- FR-INT-033: Escape during a drag reverts to the state at pointer down without a history entry.
- FR-INT-034: Arrow keys nudge the selection by one bar (left/right) or one pixel-equivalent price
  step (up/down); with Shift by ten. Consecutive nudges within 500 ms coalesce into one history entry.

### 9.5 Magnet

- FR-INT-040: Magnet modes: `off`, `weak` (snap when within 12 px of an OHLC value of the nearest
  bar), `strong` (always snap to the nearest OHLC value). Default `off`.
- FR-INT-041: With magnet on, the anchor time snaps to the nearest bar time; in future space no
  snapping happens.
- FR-INT-042: Holding Ctrl/Cmd inverts the magnet temporarily (off becomes strong, on becomes off).
- FR-INT-043: The snapped point is shown in the preview and handle (snap indicator in the scene).

### 9.6 Text editing

- FR-INT-050: Text notes are edited with `host.editText` when present, otherwise through the
  adapter's default editor (§10); the core only requests and applies the result.
- FR-INT-051: Text is plain text; it is never interpreted as HTML (NFR-SEC-002).

### 9.7 Controller API

```ts
const tools = createDrawingTools(host, {
  store?, history?: { limit?: number }, magnet?: MagnetMode, theme?: DrawingTheme,
  stayInTool?: boolean, tools?: DrawingKind[], license?: LicenseContext,
});
tools.activate('trend-line'); tools.deactivate();
tools.select(ids); tools.clearSelection(); tools.remove(ids);
tools.undo(); tools.redo(); tools.setMagnet('weak'); tools.setTheme(theme);
tools.getState(); // { activeTool, interaction, selection, hover, canUndo, canRedo, magnet }
tools.on('change' | 'selection' | 'tool' | 'interaction' | 'blocked' | 'error', listener);
tools.getScene(); tools.hitTest(x, y); tools.destroy();
```

- FR-INT-060: `destroy()` unsubscribes from the host, clears listeners and is idempotent.
- FR-INT-061: State is exposed as an immutable snapshot that changes reference only when it
  changes (adapter-friendly, like the store).

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

## 11. Integration with keystone-charts-financial

- FR-INTG-001: The chart implements `DrawingHost` v2 in its repository (tracked there; the chart's
  EPIC E19 placeholder is replaced by this integration).
- FR-INTG-002: The chart passes `runHostConformance` in its own test suite.
- FR-INTG-003: The chart renders `fibonacci` scene items with its Fibonacci overlay renderer and
  `shape` items with its Painter on the overlay layer.
- FR-INTG-004: This repo's `apps/playground` contains a minimal canvas reference host (not the
  chart) so e2e tests do not depend on the chart's release cycle.

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
