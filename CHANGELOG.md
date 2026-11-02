# Changelog

## 0.1.0 (unreleased)

- Initial monorepo: core, typescript, vue, react and angular packages.
- Core: drawing model (`Anchor`, `Drawing`, `DrawingKind` with eight kinds), `ANCHOR_COUNT`,
  `DRAWING_KINDS`, `isDrawingKind`, `isValidAnchor`, `validateDrawing` and `DrawingError`.
- Core: `DrawingStore` (add, update, remove, clear, subscribe) with the version 1 saved document
  (`toJSON`, `fromJSON`).
- Core: `DrawingHost`, the contract a chart implements for the drawing tools.
- TypeScript: core re-export plus `saveDrawings`, `loadDrawings` and `autoSave` for Web Storage.
- Vue and React: `useDrawings`. Angular: `KeystoneDrawingService`.
- Core (E01-F01): all anchors of a drawing must share one y-axis (`KFT-E-AXIS`); drawings gain
  optional `locked`, `hidden`, `zIndex` and JSON-safe `meta` (`KFT-E-META`, with the path of the
  first unsafe value; flag type errors are `KFT-E-SHAPE`); `createId` and `createIdGenerator` for
  collision-safe ids; `JsonValue` type.
- Core (E01-F02): full `DrawingStyle` (`lineStyle`, `fillColor`, `fillOpacity`, `textColor`,
  `fontSize`) validated by `validateStyle` (`KFT-E-STYLE`); `DrawingTheme` with `LIGHT_THEME` and
  `DARK_THEME` presets and `resolveStyle` (drawing over kind over global defaults, at scene time);
  kind `options` (`KindOptions`: Fibonacci levels, time-zone sequence, extension and label flags)
  with defaults, `resolveOptions` and `validateOptions` (`KFT-E-OPTIONS`).
- Core (E01-F03): store listeners receive `(drawings, change)`; `StoreChange` carries the
  `add`/`update`/`remove` operations with `before`/`after`. `batch(fn)` notifies once with folded
  operations and rolls back when `fn` throws; `clear()` is one change. `ordered()` and the z-order
  commands `bringToFront`, `sendToBack`, `bringForward` and `sendBackward` (minimal zIndex writes,
  one change each).
- Core (E01-F04): saved documents are version 2 with an optional `scope` (`{ symbol?, timeframe? }`,
  `new DrawingStore(drawings, { scope })`); `fromJSON` still reads version 1 through `readDocument` and
  the pure `migrateV1ToV2`. `importDocument(store, json, { mode })` imports in `merge` or `replace`
  mode as one change and returns an `ImportReport` (`added`, `renamed`, `skipped`) instead of failing
  on individual bad drawings.
- Core (E01-F05): `History` with undo, redo, a depth limit (default 100), transactions
  (`commit`/`cancel`) and time-based coalescing of `nudge` transactions; changes made with
  `{ history: false }` (`ChangeOptions` on store calls, `batch`, `importDocument`) are not recorded and
  clear the redo stack, stale entries are dropped with an error event. Plain-data commands
  (`DrawingCommand`, `createCommand`, `invertCommand`, `composeCommands`, `applyCommand`) restore the
  exact list. `StoreChange.history` and `store.restore(drawings)`.
- Core (E02-F01), **breaking**: `DrawingHost` is now contract version 2 (`apiVersion: 2`) in
  `host.ts`: adds `paneRect`, `nearestBar` (replaces `ohlcAt`), `barInterval`, `onKey`,
  `onViewportChange`, `setCursor` and optional `editText`; `HostPointerEvent` gains `pointerType`,
  `button` and the `cancel`/`leave` phases; new `HostKeyEvent`, `DrawingCursor`, `Rect`, `Point`,
  `NearestBar`, `TextEditRequest`. The 0.1 interface is removed without a shim (FR-HOST-007; no host
  implemented it). `validateHost`/`assertHost` (`KFT-E-HOST`), `Disposables` and `connectHost`.
- Core (E02-F02): `anchorToPoint` and `pointToAnchor` projection helpers, with property tests for
  round trips over random linear scales and for zooming in and back out.
- Core (E02-F03): new entry `keystone-financial-tools-core/testing` (ESM and CommonJS, built by
  `vite.testing.config.ts`) with `createMockHost` (deterministic linear host with scripted input and
  recorded output) and `runHostConformance` (host conformance suite for Vitest or Jest). The main
  entry never imports it.
- Core (E03-F01): `geometryOf(drawing, host, options)` with pixel geometry for all eight kinds:
  trend lines with Liang-Barsky clipped extensions, horizontal lines, normalised rectangles, text
  note boxes (estimate or `measureText`), Fibonacci retracement levels and label positions, fans
  clipped to the pane, arcs in pixel space and time zones; handle points with stable ids (eight on
  a rectangle). Shape types (`Shape`, `LineShape`, `RectShape`, `ArcShape`, `TextShape`,
  `LabelShape`), `HandlePoint`, `GeometryPart`, `TEXT_CHAR_WIDTH`, `TEXT_LINE_HEIGHT`. Golden
  fixtures per kind in `__fixtures__/geometry`.
- Core (E03-F02): `hitTest(point, { drawings, cache, selected?, pointerType?, theme? })` returns
  `{ id, part, locked }` for the topmost visible drawing within 6 CSS px (mouse, pen) or 12 (touch,
  `HIT_TOLERANCE`). Parts `body`, `handle:<n>`, `level:<ratio>` and `label`; the handles of selected
  drawings win, then the highest `zIndex`, then the latest drawing; a rectangle hits inside only with
  a resolved `fillOpacity` above 0; hidden drawings are never hit, locked ones are (`locked: true`).
  `GeometryCache(host, { store?, theme?, measureText? })` keeps geometry per drawing object, clears on
  viewport changes and drops removed drawings. `pnpm bench` in the core package measures 500 drawings
  with a warm cache.
- Core (E03-F03): `buildScene(host, options)` returns the scene items in paint order (`zIndex`, then
  insertion; hidden drawings and drawings without a pane left out): `shape` items with pixel shapes,
  `fibonacci` items in data space with fully resolved options, `preview` items (the placement preview
  and a snap indicator circle) and, last, `handles` items for selected drawings. Every drawing item has
  its `state` (`locked`, `selected`, `hover`, `normal`), the style resolved from the theme with the
  state's line width change, and the state's `opacity`. `SceneCache(host)` keeps the scene until an
  option or the viewport changes. Types `SceneItem`, `ShapeItem`, `FibonacciItem`, `HandlesItem`,
  `PreviewItem`, `SceneOptions`, `ItemState`, `FibonacciKind`, `ResolvedFibonacciOptions` and
  `SNAP_INDICATOR_RADIUS`.
- Core (E04-F01): `GestureRecogniser` turns host pointer events into `move`, `click`, `double-click`,
  `drag-start`, `drag`, `drag-end`, `cancel` and `leave` gestures (click: 3 px and 300 ms; double-click:
  400 ms and 6 px; configurable, injectable clock). `reduceInteraction(state, input, ctx)` is the pure
  interaction state machine of SDS 9.1 (idle, placing, selected, dragging-handle, moving, editing-text)
  returning the next state, effects and an `ignored` flag; it never throws. `IDLE_STATE` and the
  `InteractionState`, `InteractionInput`, `InteractionEffect`, `InteractionContext` and
  `InteractionResult` types. Scenario tests drive it from the mock host.
- Core (E04-F02): `reducePlacement(tool, progress, input, host)` is the pure placement of SDS 9.2: a
  one-anchor tool places on a left click inside a pane; a two-anchor tool places by click, move, click
  or by press, drag, release, with the second anchor projected onto the first anchor's y-axis even over
  another pane; a second anchor within 1 px (`ZERO_LENGTH_PX`) of the first creates nothing; a click
  outside every pane does nothing. It returns the new `PlacementProgress` and the anchors of the
  drawing to create (one store change, one history entry). `placementPreview` gives the drawing for the
  scene's `preview` option, `PLACEMENT_START` the start progress. `placement-complete` takes `edit` to
  open the text editor for a note; a note placed with `stayInTool` returns to its tool afterwards
  (`editing-text` has an optional `resume`).
- Core (E04-F03): `cursorFor(tool, hit, drawing, host)` is the pure cursor mapping (`crosshair` with a
  tool, `pointer` over bodies, resize cursors over rectangle handles, `move` over other handles,
  `not-allowed` over a locked handle) and `CursorSync` calls `host.setCursor` only on a change. The
  interaction machine takes a `select` input (ids that exist, deduplicated, the same state when
  unchanged) and Ctrl/Cmd+A and Ctrl/Cmd+D as `key` inputs with `ctrl`, answered with the effects
  `select-all` and `duplicate`. `duplicateDrawing` builds the copy: one bar later, `DUPLICATE_OFFSET_PX`
  (10) px down, unlocked.
- Core (E04-F04): `dragHandle`, `moveDrawings` and `nudgeAnchors` compute new anchors for a handle
  drag, a body move and an arrow-key nudge from the pointer travel (same time delta everywhere, each
  pane's own price delta; rectangle edge handles change one coordinate); `constrainMove` and
  `constrainAngle` are the Shift rules (axis lock, 45° steps for trend-line and fan anchors).
  `keyboardCursorStart` and `moveKeyboardCursor` give keyboard placement. The machine takes `shift` on
  `key` inputs and answers arrow keys with `nudge` (Shift: ten steps), arrows, Enter and Escape while
  placing with `keyboard-move`, `keyboard-place` and `cancel-placement`; a move or nudge that includes
  locked drawings emits one `blocked` effect for them. Escape and pointer cancel revert a drag (the
  controller cancels the history transaction). `duplicateDrawing` now uses `nudgeAnchors`.
- Core (E04-F05): magnet snapping (SDS 9.5). `snapAnchor(anchor, magnet, host)` snaps to the open, high,
  low or close of the nearest bar (time within half a bar interval, otherwise no snapping, so future
  space stays free); `MagnetMode` is `off`, `weak` (within `WEAK_MAGNET_PX`, 12 px) or `strong`.
  `reducePlacement` and `dragHandle` take the effective magnet as a last argument (default `off`);
  `effectiveMagnet(mode, invert)` is the Ctrl/Cmd inversion; `placementSnap` and `handleSnap` return the
  point for the scene's `snap` indicator. Rectangle edge handles, horizontal lines, time zones, body
  moves and Shift angle drags do not snap.
- Core (E04-F06): `createDrawingTools(host, options)` is the controller of SDS 9.7. It connects the host
  to the gesture recogniser, the interaction machine, placement, move and snap functions, the store,
  the history and the scene cache, and returns `activate`, `deactivate`, `select`, `clearSelection`,
  `remove`, `undo`, `redo`, `setMagnet`, `setTheme`, `setOptions`, `getState`, `on`, `getScene`,
  `hitTest` and `destroy`. `getState()` returns `{ activeTool, interaction, selection, hover, canUndo,
  canRedo, magnet }` and keeps the same object until a value changes. `on` takes `change`,
  `selection`, `tool`, `interaction`, `state`, `blocked` and `error` with a payload type per name and
  returns an unsubscribe function. Every entry point catches exceptions, reverts an open drag and
  raises an `error` event (`DrawingToolsError`, with a `source`); `destroy()` is idempotent and turns
  every later call into a no-op. Options: `store`, `history`, `magnet`, `theme`, `stayInTool`, `tools`,
  `gestures`, `defaultYAxisId`, `createId` and `debug`.

### Specification and backlog

- SDS 1.0: drawing model v2, store and history, host contract v2, geometry and scene, interaction
  engine, eight tools, persistence, framework adapters, chart integration, licensing, quality gates.
- Backlog: 10 epics, 44 features, 119 stories with acceptance criteria and tasks
  (`specs/backlog/backlog.json`), and `scripts/create-backlog.ps1` to create them as linked GitHub
  issues with labels and milestones.

### Dependency update

- Tooling: pnpm 12, Turbo 2 (`tasks`), TypeScript 6.0, ESLint 10 with a flat config
  (`eslint.config.mjs`, `typescript-eslint`), Prettier 3.9, lint-staged 17.
- Packages: Vite 8 (`rolldownOptions`, `oxc`), Vitest 5, Stryker 10, jsdom 30, Vue 3.5, React 19.3,
  Angular 22 and ng-packagr 22 (adds the missing `@angular/compiler-cli`), zone.js 0.16.
- Angular package peer range raised to Angular 22+. Node 22.22.3+ or 24.15+ is required.
- CI: Node 24, `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`,
  `actions/upload-artifact@v7`.
