# Changelog

## 0.1.0 (unreleased)

- License context (E10-F01-S02, FR-LIC-001, FR-LIC-002, AR-1, DOC-004): `createDrawingTools(host, { license })` takes the
  `LicenseContext` that `getLicenseContext` of keystone-license returns, its manager, or any object with
  `canUseFeature(feature)`; the core imports nothing from keystone-license. Without a license the Community tier
  applies. New exports `FEATURE_TIERS` (the lowest tier of each feature, to pass as the `features` of
  `getLicenseContext`), `TOOL_FEATURES` (the feature of each kind), `createLicenseGate` and the types
  `DrawingFeature`, `FeatureTier`, `LicenseContext`, `LicenseSource` and `LicenseGate`. `DrawingTools` gets
  `canUseFeature(feature)` and `canUseTool(kind)`, which answer from the license each time and never throw. Nothing
  refuses a tool yet: that is E10-F02.

- Tier split (E10-F01-S01, FR-LIC-002, OD-2, DOC-004): the drawing tools follow the five tiers of keystone-license.
  Community has the trend line, horizontal line and selection (move/resize, delete) and the memory
  repository; Professional adds the rectangle, the text note, magnet snapping, undo/redo and the four Fibonacci tools; Professional Plus adds
  persistence (the Web Storage and IndexedDB repositories, the 0.1 helpers, import/export); Enterprise adds the plugin
  API and storage adapters; Developer passes every feature for 90 days with a watermark. `TOOL_CATALOG` now gives the
  `rectangle` and `text-note` the tier `professional`, and `REPOSITORY_TIERS` gives Web Storage and IndexedDB `professional-plus`
  (`RepositoryTier` is `'community' | 'professional-plus'`). Nothing checks a licence yet: the gate is E10-F02.

- Release pipeline (E09-F04, DOC-004, NFR-COMP-001, D-7): a tag `v*` runs the new Release workflow
  (`.github/workflows/release.yml`), which checks that the tag, the version of the five packages and the CHANGELOG.md
  section agree and that the tagged commit is on `main`, runs the type-check, lint, parity, unit tests with coverage,
  build, size budgets, the mutation tests of every package and the e2e tests, and then creates a GitHub release with
  the CHANGELOG.md section as the notes and the tarballs of the five packages. It never publishes to npm and holds no
  npm token. The packages `keystone-financial-tools-core`, `-typescript`, `-vue`, `-react` and `-angular` are
  publishable (`private` removed, `repository` added) and share one version. The Vue, React and TypeScript builds no
  longer write source maps, and the Angular library is built in partial compilation mode (the only mode npm may
  publish). New `release:*` scripts in `keystone-financial-tools-budgets`: `release:check` (one version, publishable
  manifests, the tag, a dated changelog section with notes), `release:notes` (the changelog section of a version),
  `release:prepare` (replaces `workspace:*` in `packages/angular/dist/package.json`) and `release:pack-check`
  (`npm pack --dry-run` of every package: no test, fixture, source or source map in a tarball). The manual publish
  checklist (core, typescript, vue, react, angular) is in CLAUDE.md and in the new docs guide *Release and publish*.
- Accessibility (E09-F03, NFR-A11Y-001): the controller raises a new `announce` event with a short message after a
  drawing is placed, selected, deleted, or an undo or redo (a text note once its editor confirms it), when a locked
  drawing refuses a delete, a nudge or a drag (`announce.blocked`, `announce.blockedMany`: "Trend line is locked"; a
  delete that removed other drawings says that instead) and when a keyboard shortcut chooses a tool
  (`announce.toolActive`: "Trend line tool active"; the toolbar button reports the tool itself with `aria-pressed`,
  so `activate` stays silent). Moving, nudging and hovering say nothing. The messages are the new `announce.*` keys of the messages
  table, so they can be translated; `formatMessage` fills their `{tool}` and `{count}` placeholders. The core exports
  `LIVE_REGION_ATTRIBUTES`, `VISUALLY_HIDDEN_STYLE` and `liveRegionText`. The Vue, React and Angular adapters take
  `announcements` (default on), expose `announcement`, and ship a live region (`KeystoneLiveRegion`,
  `keystone-live-region`). The playground renders one on every page, and its status line is `aria-live="off"`.
  e2e: announcements on all four pages, and a keyboard-only walkthrough of every tool. The keyboard guide notes that
  the arcs, fans and time zones tools have no default shortcut.
- Size budgets (E09-F02-S02): `pnpm --filter keystone-financial-tools-budgets size:check` minifies (terser) and
  gzips the built core, TypeScript, Vue, React and Angular bundles and fails when the core is over 25 kB or a
  package over 3 kB (NFR-SIZE-001), naming the file and the sizes. A missing build says to run `pnpm build`. CI runs
  it after the build.
- Performance benchmarks with baselines (E09-F02-S01): new private package `keystone-financial-tools-budgets`. The
  core bench (`pnpm --filter keystone-financial-tools-core bench`) now has a test per time budget with 500
  drawings through the controller (`getScene()` 2 ms after a viewport change, `hitTest()` 0.5 ms, a pointer move
  during a drag 1 ms) and writes `reports/bench/results.json`. `bench:check` fails when a mean is over its budget or
  more than 20% above the recorded baseline (`packages/budgets/baseline/core-bench.json`, recorded with
  `bench:baseline`). A `bench` CI job runs both and uploads the results as the `bench-results` artifact.
- Live tool examples (E09-F01-S03): the page of each tool on the docs site has a *Try it* section with the playground
  embedded in an iframe, with only that tool enabled and already active, plus Undo, Redo, Delete and Magnet. The
  playground has a new `embed.html?tool=<kind>` page for it (in memory only; a missing or unknown tool says how to ask
  for one) and a `build:embed` build into `packages/docs/public/playground`, which the docs `build` and `dev` run
  first. e2e: the embed page for every tool (place, stays active, undo and redo, keyboard-only, no state across a
  reload, unknown tool, axe) and taps on touch.
- Generated API reference (E09-F01-S02): the docs site generates the API reference of the core, the core's
  `/testing` entry, and the TypeScript, Vue, React and Angular packages from their TSDoc with TypeDoc
  (`starlight-typedoc`), one sidebar group each, at build time. A public class, enum, function, interface, type
  alias or variable without a TSDoc comment fails the site build (`astro build` and `astro check`), so CI fails
  (NFR-DOC-001). `src/site/api.ts` lists the references; the generated pages are not committed.
- charts-financial integration (E08-F03): `keystone-financial-tools-core/testing` now exports `FIBONACCI_PARITY`
  (version `FIBONACCI_PARITY_VERSION`, 1), a versioned fixture for the renderer of a chart: the scales of a mock
  chart and seven cases for all four Fibonacci kinds (retracement up and reversed, fans, half and full arcs, time
  zones forward and backward) with the drawing, the expected level prices, radii or times and the expected pixel
  shapes (labels left out). The core tests check the fixture against `geometryOf` to 1e-9, and the chart's
  renderer tests can use the same data. The host guide now covers the transforms, events, the overlay pass,
  the Fibonacci items and the conformance suite, with code skeletons.
- End-to-end tests (E08-F02): Playwright runs every tool (trend line, horizontal line, rectangle, the four Fibonacci
  tools and the text note) through place by click and by drag, magnet snap, select, multi-select (Shift+click and
  Ctrl+A), move, resize by handle, delete, undo and redo and reload persistence, plus the text note's editor
  (confirm, Escape, Enter and double-click to edit) in Chromium, Firefox and WebKit, and the touch flows (tap-tap
  placement, select, delete, undo) in a `mobile-chromium` profile (Pixel 7, landscape). A keyboard-only test places,
  nudges, selects and deletes a trend line, and an axe scan (`@axe-core/playwright`) of the toolbar of the four
  demo pages must have no serious or critical finding. The TypeScript demo page now has a DOM text editor
  (`text-editor-dom.ts`), so notes can be typed there too. Traces and screenshots are kept on failure.
- Playground reference host and demo pages (E08-F01): the playground chart now has two panes, `price` above
  `volume` (a volume per candle derived from its prices), linear scales that fit the bars in view, and zoom and
  scroll: the wheel zooms around the pointer, Shift with the wheel or sideways movement scrolls, and while the
  chart has focus `+` and `-` zoom, Home and End go to the first and the last slot, Page Up and Page Down scroll
  half a screen (keys no tool handled; Ctrl, Alt and Cmd are left alone). Zoom and scroll tell the viewport
  listeners, so the tools redraw by themselves, and the host still passes `runHostConformance` for both panes. The
  same demo is a page for TypeScript, Vue, React and Angular on one Vite server (`index.html`, `vue.html`,
  `react.html`, `angular.html`): the toolbar is built from the tools' own toolbar state with the labels from
  `messages`, with Undo, Redo, Delete and a Magnet toggle, labelled and keyboard accessible, and the drawings are
  kept in localStorage. The Vue and React pages use render functions and `createElement`, and the Angular page
  is compiled in the browser, so no framework plugin is needed. e2e: the viewport and the four pages.
- Parity and i18n (E07-F06): every export of the core is now in the Vue, React and Angular packages (types,
  constants, validation, document import, shortcut and message helpers and more), so an application never
  imports from the core; the engine behind the tools (geometry, hit-testing, the interaction machine, snapping,
  the history internals) is the allow-list, with a reason each. A parity test (FR-FW-050) reads the entries of
  the packages and fails for a core export that a framework package neither exports nor wraps nor lists; it
  runs in the unit tests and in its own CI step. Message table (NFR-I18N-001): `DEFAULT_MESSAGES` has the English
  text of the tool labels (`tool.<kind>`, the `labelKey` of a toolbar entry), the toolbar groups, the toolbar and
  the note editor (`editor.note`, `editor.confirm`, `editor.cancel`); the `messages` option of `createDrawingTools`
  merges your texts over them (an unknown key or an empty text throws a `RangeError`), `DrawingTools.messages`
  is the result, and the adapters give it as `messages` (`useDrawingTools` in Vue and React, a signal in the
  Angular service). `TEXT_EDITOR_LABEL` is now `DEFAULT_MESSAGES['editor.note']`, and `ToolCatalogEntry.labelKey`
  is a `MessageKey`. A test fails for a user-visible text written outside the table. Core: `resolveMessages`,
  `Messages`, `MessageKey`, `MessageOverrides`. Docs: Translate the texts in the guide Build a toolbar.
- Headless toolbar model (E07-F05): `TOOL_CATALOG` lists the eight tools with `id`, `labelKey` (`tool.<id>`),
  `group`, `icon`, `shortcut` and `tier`; `DrawingToolsState.toolbar` has every tool with `active` and
  `enabled` (the `tools` option) and the shortcut in use, the same array until an entry changes. The Vue,
  React and Angular adapters expose it (`toolbar`, and `toolbar$` in Angular). Keyboard shortcuts through
  `host.onKey` (FR-FW-041): Alt+T, Alt+H, Alt+R, Alt+F and Alt+N choose a tool, configurable with the
  `shortcuts` option (`null` turns one off; invalid, reserved and duplicate shortcuts throw at creation),
  and Ctrl or Cmd with Z undoes, with Shift and Z or with Y redoes. `HostKeyEvent` gains the optional
  `code`, so the shortcuts work with Option on a Mac. Core: `resolveShortcuts`, `parseShortcut`,
  `formatShortcut`, `matchShortcut`, `shortcutAction`, `shortcutKey`, `toolbarEntries`, `IDLE_TOOLBAR`.
  The licence check of `enabled` follows with E10. Docs: the guide Build a toolbar, a toolbar example on
  each getting started page, the shortcuts in the keyboard reference.
- Documentation site scaffold (E09-F01-S01, pulled forward): `packages/docs` is an Astro and Starlight
  site with a getting started page for TypeScript, Vue, React and Angular, a host guide, a persistence
  guide, a keyboard reference and one page for each of the eight tools. Broken links fail the build
  (`starlight-links-validator`); the CI `verify` job builds it and the `mutation` job covers its data
  modules. The API reference and the live examples follow in E09-F01-S02 and S03.
- Angular controller adapter (E07-F04): `KeystoneDrawingToolsService` (`attach(host, options?)`, `detach()`,
  signals and observables for `tools`, `state`, `drawings` and `textEdit`, and the actions; destroyed
  with its component through `DestroyRef`; zone.js and zoneless) and `KeystoneTextEditorComponent`, the
  default text editor, the same as the Vue and React ones.
- React controller adapter (E07-F03): `useDrawingTools(host, options?)` (the host may be missing until
  the chart exists) returns the controller or null, the store, `state`, `drawings`, `textEdit` and the
  actions; it is StrictMode safe (one controller per mount). `KeystoneTextEditor` is the default text
  editor, the same as the Vue one. Core: `shouldRestoreFocus`. Vue: the editor no longer takes the
  focus back from an element the user moved it to.
- Vue controller adapter (E07-F02): `useDrawingTools(host, options?)` returns the controller, the store,
  the refs `state`, `drawings` and `textEdit` and the actions, and destroys the tools with the scope;
  `KeystoneTextEditor` is the default text editor (textarea, Ctrl or Cmd with Enter confirms, Escape
  cancels, blur confirms; keys and pointer events do not reach the chart). Core: `TextEditor`,
  `TextEditSession`, `textEditorKeyAction`, `TEXT_EDITOR_LABEL`, and the option
  `DrawingToolsOptions.editText`, the editor for a host that has none.
- Playground and e2e (pulled forward from E08, QA-006, QA-008): `apps/playground` is a minimal canvas
  chart that implements `DrawingHost` v2 (`createPlotHost`, one pane, candles, a toolbar, undo and redo,
  magnet, persistence to `localStorage`) and passes `runHostConformance`; `e2e/` holds the Playwright
  tests (place, magnet snap, select, move, resize, delete, undo and redo, reload) for Chromium, Firefox
  and WebKit, run by the CI job `e2e`. The workspace now includes `apps/*` and `e2e`.

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
- Core (E05-F01): the trend line tool. Shift while placing now locks the second anchor of a trend line
  (and of fans) to multiples of 45 degrees around the first, as it already did for a handle drag
  (`lockAngle`, used by the controller; `ANGLE_KINDS` is exported from the move module); an
  angle-locked anchor does not snap and the keyboard cursor is not locked. Scenario tests through the
  controller cover placing by click-click and drag, resizing, moving, deleting, undo, the
  `extendLeft`/`extendRight` rays (including future space), hit-testing along an extension and
  toggling an extension as one history entry.
- Core (E05-F02), **breaking** for hosts that draw every shape of a horizontal line: its geometry
  now holds a price label after the body line (a `text` shape of the part `label`, FR-SC-001)
  formatted by the new `priceFormatter` option (`PriceFormatter`, default `formatPrice`: 2
  decimals) of `createDrawingTools`, `GeometryCache` and `geometryOf`; scene previews use the one of
  the scene's cache. Dragging the body of a horizontal line changes only its price (`moveDrawings`),
  like its handle, and `cursorFor` shows `ns-resize` over the body, label and handle of a horizontal
  line that is not locked. Scenario tests cover placing across the pane, price-only moves, delete,
  undo and the label following the line.
- Core (E05-F03): scenario tests for the rectangle through the controller (placing by two opposite
  corners in all four directions, click-click and drag, the eight handles with their cursors and
  one-coordinate edge handles, resize, move, delete, undo, and the fill and border hit rules with the
  default fill opacity of 0.15). No source change: the behaviour was already implemented.
- Core (E05-F04): the text note tool. Cancelling the editor of a new note (`host.editText` resolves with
  `null`) now removes the note without a history entry; before, the empty note stayed. A confirmed note
  and its text are one history entry (undo removes both), and `undo()` and `redo()` return false while
  the editor of a new note is open. A host without `editText` and an editor that fails still keep the empty
  note. Editing an existing note (double-click, or Enter on a selected unlocked note) is one history
  entry. Scenario tests cover placing and cancelling (also with `stayInTool` and the keyboard), editing,
  plain text (`<b>` stays literal), the multi-line box (line breaks, the longest line, long words, font
  size and text colour from the style) and hit-testing on the box.
- Core (E05-F05): the Fibonacci retracement tool. `LabelShape` gains `text`: the ratio, the price or both
  (`0.618 (111.80)`), with the price formatted by `priceFormatter(price, yAxisId)` like the label of a
  horizontal line (2 decimals by default) and only when `showPrices` is on; `retracementShapes` takes the
  price formatter as its last argument. The README has a Fibonacci retracement section. Scenario tests cover
  placing (click-click, drag, undo, Escape), the `fibonacci` scene item with resolved options and handles,
  selecting by `level:<ratio>` and by the label, resize, move, delete, hidden levels (neither drawn nor hit),
  `levels`, `reverse`, `extendLeft` and `extendRight` (one history entry each) and the label texts.
- Core (E05-F06): scenario tests for the Fibonacci arcs tool through the controller (placing by click-click and
  drag with anchor 2 as the centre, half circles opening away from anchor 1 and `fullCircles`, hit-testing by
  `level:<ratio>` on the circle, resize, move, delete, undo, hidden and zero-radius levels). The README documents
  the zoom rule: the radius is the ratio times the pixel distance between the anchors, so an arc keeps its
  shape on the screen and changes in data space when the axes are zoomed; regression tests zoom the price axis
  and the time axis. No source change: the behaviour was already implemented.
- Core (E05-F07): scenario tests for the Fibonacci fans tool through the controller (placing by click-click and
  drag, Shift locking anchor 2 to 45 degree steps while placing and while dragging its handle, rays from anchor 1
  through `(t2, p2 + (p1 - p2) * ratio)` clipped to the pane, hit-testing by `level:<ratio>` also in future
  space, resize, move, delete, undo, hidden levels and rays that leave the pane). The README has a Fibonacci fans
  section. No source change: the behaviour was already implemented.
- Core (E05-F08): the Fibonacci time zones tool. `cursorFor` shows `ew-resize` over a handle of time zones that
  are not locked (before: `move`), as dragging it changes only a time; a locked one still shows `not-allowed`.
  Scenario tests cover placing (click-click, drag, undo, Escape, preview, a unit of 0), the lines (the default
  sequence across the pane height, a negative unit, a zoom of the time axis, prices ignored), selecting by
  `level:<n>`, resize and move in time only (no snapping to a bar), delete, undo, and the `sequence` option
  (updates re-render at once as one history entry; invalid sequences are rejected with `KFT-E-OPTIONS` and leave
  the drawing unchanged). The README has a Fibonacci time zones section.
- TypeScript (E06-F02): asynchronous repositories. `DrawingRepository` (`load`, `save`, `remove` per
  `DrawingScope`, `{ symbol, timeframe? }`) with `MemoryRepository`, `WebStorageRepository(storage, prefix?)`
  and `IndexedDbRepository({ dbName, factory? })`, all passing one contract suite. `load` resolves
  `{ document, issue? }`: an empty document when nothing is stored, and an empty document plus the
  `KFT-E-JSON` issue when the entry is corrupt (the entry stays); the drawings are not validated, so
  `importDocument` can report the skipped ones. A failing backend (storage full, IndexedDB missing, a newer
  database version, an aborted transaction) rejects with `RepositoryError`; a refused Web Storage write keeps
  the previous document. `scopeKey(scope, prefix?)` gives `keystone-drawings:<symbol>[:<timeframe>]`,
  URL-encoded; `readStored` helps custom backends follow the same rules (the README shows a REST
  repository); `REPOSITORY_TIERS` records IndexedDB as Professional and the others as Community (OD-2 open).
  New dev dependency `fake-indexeddb` for the IndexedDB tests.
- TypeScript (E06-F01), **deprecation**: `saveDrawings`, `loadDrawings` and `autoSave` (storage form) are marked
  `@deprecated` with migration examples; signatures and behaviour are unchanged. They are synchronous, so
  they share the repository's text format, key rules and `KFT-E-JSON` issue (`serializeDocument`,
  `invalidJsonIssue`) instead of calling `WebStorageRepository`; a document saved under `scopeKey(scope)`
  loads in either direction. The README has a migration section.
- Core (E06-F03): new issue code `KFT-E-SCOPE` in `DrawingIssueCode`.
- TypeScript (E06-F03): `autoSave(store, repository, scope, { debounceMs = 500, onError, scheduler })` saves
  once changes settle and returns `{ flush(), stop() }`; saves run in order, a failed save calls `onError`
  and is retried by the next change, `flush()` or `stop()`, and nothing throws into the store. It is an
  overload of the existing `autoSave(store, storage, key)`, which keeps working. `checkScope(document,
  scope)` reports a document of another symbol or timeframe as `KFT-E-SCOPE`; the three repositories (and
  `readStored(value, scope)`) use it, so `load` resolves an empty document plus the issue and leaves the
  entry in place.
- TypeScript (E06-F04): `exportDrawings(store, { pretty })` returns the document as JSON text and
  `importDrawings(store, text, { mode, createId, history })` imports it with the core import, returning the
  `ImportReport` plus an `issue` (`KFT-E-JSON`) instead of throwing for text that is not a drawing document
  (`DrawingsReport`). `loadStore(repository, scope)` resolves `{ store, report }` whatever is stored: an
  empty store for nothing or an unusable entry (`report.issue`: `KFT-E-JSON` or `KFT-E-SCOPE`), the valid
  drawings of a partly broken document (`report.skipped`), and a store whose `scope` is the one asked for. A
  failing backend still rejects with `RepositoryError`. `loadStore` replaces the deprecated `loadDrawings`.

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
