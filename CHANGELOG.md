# Changelog

## 0.1.0 (unreleased)

- Fibonacci scene item for the new kinds (E12-F02-S03, FR-SC-004): `DrawingKind`, `FibonacciKind` and `ResolvedFibonacciOptions` get
  `fibonacci-trend-based` (3 anchors), `fibonacci-channel` (3), `fibonacci-time-extension` (3), `fibonacci-circles` (2), `fibonacci-spiral` (2)
  and `fibonacci-wedge` (3), each with fully resolved options in the `fibonacci` item (new option keys `turns` 1..8 and `clockwise`, new
  defaults and `MAX_TURNS` in `options`). They are registered with their geometry (`geometryOf`), have a theme style and a `tool.<kind>` message,
  but are not in the default `tools` or `TOOL_CATALOG` until their tool stories (D-8). `FIBONACCI_PARITY` is version 2 with cases for all ten
  kinds (level `distance` for the channel; labels still left out). The host guide describes the new kinds. The wedge follows the SDS text
  until D-13 is confirmed.
- Hit-testing of the new shapes (E12-F02-S02, FR-TOOL-037): `hitTest` hits a polyline by its segments, a polygon and an ellipse by their outline
  and, when the resolved `fillOpacity` is above 0, by their inside, a curve by its flattened path (within 0.25 px of the curve), an arrowhead
  anywhere in its triangle and a glyph anywhere in its box. Tolerance (6 px, 12 for touch), parts and tie-breaking are unchanged. New exports
  of `distanceToPath`, `distanceToPolygon` and `insidePolygon` live beside `distanceToShape`; the new benchmark task in NFR-PERF-002 measures 500
  drawings of the new shapes.
- New shapes (E12-F02-S01, FR-TOOL-036): the `Shape` union gets `polyline` (open), `polygon` (closed, fillable), `ellipse` (radii and rotation),
  `curve` (quadratic with one control point, cubic with two), `arrowhead` (a solid triangle from its tip) and `glyph` (text, emoji or a built-in
  icon in a box), with the types `PolylineShape`, `PolygonShape`, `EllipseShape`, `CurveShape`, `ArrowheadShape` and `GlyphShape` exported by every
  package. They take stroke, dash, fill and opacity from the resolved style of their item; `buildScene` and `SceneCache` need no change and keep
  their guarantees. The playground draws them; the host guide says how to draw each, and SDS §8.3 defines them.
- Handles of drawings with many anchors (E12-F01-S06, FR-TOOL-035): a selected drawing of any anchor count (3, 5, 64) shows one handle per
  anchor, and dragging one moves only that anchor, as one history entry; body drag and arrow keys move them all. A freehand kind shows four
  bounding-box handles instead (`handle:0` top left, `1` top right, `2` bottom right, `3` bottom left): dragging one scales every point about the opposite corner, mirrors past it, leaves an axis alone where the box has no
  size, never snaps and ignores Shift and the magnet. `cursorFor` gives `nwse-resize` or `nesw-resize` for them. A registry `handles`
  function may add handles that are not anchors; they show and can be hit, but dragging them changes nothing.
- Freehand placement (E12-F01-S05, FR-TOOL-034): a kind registered with `placement: 'freehand'` (new optional `KindDefinition` field,
  `isFreehandKind`; `registerKind` throws `RangeError` when its rule has `min` below two) is drawn by one pressed stroke. The pointer path is
  sampled every `FREEHAND_SAMPLE_PX` (3 px), simplified with Ramer–Douglas–Peucker at `FREEHAND_TOLERANCE_PX` (1 px) and kept to
  `FREEHAND_MAX_ANCHORS` (512) or the rule's `max` by widening the tolerance; `simplifyPath` is exported. The stroke is clipped at the edge of the
  pane, is never snapped and keeps the price axis of its first point. A click alone creates nothing, a stroke with fewer than the rule's `min`
  points starts over, Escape cancels, and the keyboard cannot draw a stroke (it needs a pointer).
- Placement of variable-anchor tools (E12-F01-S04, FR-TOOL-033): a kind whose rule has `min` below `max` takes one click per anchor and
  `max` completes it; `finish` (new `PlacementInput`) completes it with the anchors placed when there are at least `min`, and is ignored
  with fewer (nothing is created). The controller sends `finish` for Enter (when the pointer is in use or the keyboard cursor is on the
  last anchor, `enterInput`) and for a double click or a double tap. `remove-anchor` (new `PlacementInput`, Backspace through the new
  `remove-anchor` effect of the interaction machine) takes the last placed anchor back; the first one back returns to waiting. Escape
  still cancels the whole drawing. New message `announce.placeAnchorUpTo` (`Place anchor {index} of up to {count}`) for these tools, also
  said after an anchor is taken back.
- Placement of tools with three or more anchors (E12-F01-S03, FR-TOOL-032): `reducePlacement` takes one click (or tap) per anchor up to
  the number the kind's rule allows; the first two anchors also work by drag, the last one completes the drawing in one history entry.
  `PlacementProgress` `anchored` gets `more`, the anchors placed after the first (empty for a two-anchor tool), and `placementPreview` shows
  `first`, `more` and the pointer as the next anchor. A point within `ZERO_LENGTH_PX` of the previous anchor is ignored and waits for another
  (a first drag that ends where it began still starts over). Escape and the right button cancel without a store change, the keyboard cursor
  places each anchor with Enter and `stayInTool` repeats the tool. New message `announce.placeAnchor` (`Place anchor {index} of {count}`),
  said after each anchor of a tool with more than two; the last anchor is announced as the drawing placed. A kind registered at run time
  without a `tool.<id>` message is named by its id in the announcements.
- Pane-anchored kinds (E12-F01-S02, FR-TOOL-031, D-10): a kind registered with `space: 'pane'` has one anchor that only names the pane
  (its time and price play no part in the geometry) and `options.position`, the place in the pane as `PanePosition` fractions
  0..1 of its width and height (`KFT-E-OPTIONS` outside; the default is the middle of the pane). `geometryOf` places such a drawing from
  `paneRect`, so zoom, scroll and resize keep it where it is in the pane, and it has no geometry (and so no scene item) when its pane is gone,
  while the drawing stays in the store. Placing it stores the position of the click; dragging its body or its one handle, the arrow keys and
  duplicate change the position, clamped to the pane, so the drawing stays partly inside. Moves go through the new `dragPatch`
  and `nudgeDrawing` (a patch for `DrawingStore.update`); `MovedDrawing` gets an optional `options`. Undo, redo, export and import keep
  the position. A pane kind must take exactly one anchor (`registerKind` throws `RangeError` otherwise).
- Kind registry (E12-F01-S01, FR-TOOL-030, D-8, D-15): the drawing kinds live in one registry. An entry (`KindDefinition`) holds the
  id, the anchor rule (`AnchorRule`, `{ min, max }`), the option defaults, the catalog group, the geometry function and
  optionally the handles; the eight kinds of 1.0 are registered this way and keep their ids, anchors and documents. New:
  `registerKind` (returns a function that removes the kind), `kindDefinition`, `ANCHOR_RULES` and `DEFAULT_TOOLS` (the
  eight tools, still the default of the `tools` option; a registered kind is opt-in by id). `ANCHOR_COUNT` stays and holds the
  kinds with a fixed count. `KFT-E-ANCHORS` names the range (`A triangle needs 3 to 5 anchors.`; a fixed kind keeps
  `A trend-line needs 2 anchor(s).`). `geometryOf` returns null for a kind that is not registered. A document with an unknown kind
  fails that drawing with `KFT-E-KIND`; `importDocument` leaves it out and lists it in `skipped`.

- Host contract version 3 (E11-F04-S01, FR-TOOL-019, FR-HOST-008, D-11): `HOST_API_VERSION` is 3 and the host adds `paneIds()`
  (the y-axes of the panes, top to bottom), `barsBetween(from, to)` (bars on the bar axis, signed) and the optional
  `volumeBetween(from, to)`. Migration: a host written for version 2 keeps working (`MIN_HOST_API_VERSION` is 2) and
  keeps the eight tools; to use the tools that come later set `apiVersion: 3` and add the members (`createDrawingTools` throws
  `KFT-E-HOST` for a version 3 host without `paneIds` or `barsBetween`). New: `hostFeatures`, `missingHostFeatures`,
  `missingToolFeatures`, `REQUIRED_HOST_MEMBERS_V3`, the type `HostFeature`, the optional `requires` of a catalog entry and
  `missing` of a toolbar entry. A tool whose host features are missing is disabled; `activate` emits `blocked` with the new
  code `KFT-E-CAPABILITY` (`DrawingToolsBlocked` is now `DrawingToolsLocked | DrawingToolsUnsupported`) and throws it.
  The mock host (`apiVersion` and `volumeBetween` options), the conformance kit (a second suite for the version 3 members),
  the playground host and the host guide are updated.
- Tier split (E10-F01-S01, FR-LIC-002, OD-2, DOC-004): the drawing tools follow the five tiers of keystone-license.
  Community has the trend line, horizontal line and selection (move/resize, delete) and the memory
  repository; Professional adds the rectangle, the text note, magnet snapping, undo/redo and the four Fibonacci tools; Professional Plus adds
  persistence (the Web Storage and IndexedDB repositories, the 0.1 helpers, import/export); Enterprise adds the plugin
  API and storage adapters; Developer passes every feature for 90 days with a watermark. `TOOL_CATALOG` now gives the
  `rectangle` and `text-note` the tier `professional`, and `REPOSITORY_TIERS` gives Web Storage and IndexedDB `professional-plus`
  (`RepositoryTier` is `'community' | 'professional-plus'`). Nothing checks them yet: the licensing is built after the other issues are closed, so every tool works.

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
