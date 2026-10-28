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
