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
