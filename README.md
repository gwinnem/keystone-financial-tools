# keystone-financial-tools

Interactive drawing tools for financial charts, for TypeScript, Vue, React and Angular.

Trend lines, horizontal lines, rectangles, Fibonacci tools and text notes, stored in chart-agnostic
coordinates (time, price, y-axis id) so they survive zoom, scroll and layout changes. The chart
(keystone-charts-financial) implements the `DrawingHost` contract; these packages never depend on
the chart package itself.

## Packages

| Package | Folder | Purpose |
|---|---|---|
| `keystone-financial-tools-core` | `packages/core` | Drawing model, validation, `DrawingStore`, history, saved document format, `DrawingHost` contract, pixel geometry per kind (`geometryOf`), hit-testing (`hitTest`, `GeometryCache`), the scene a host draws (`buildScene`, `SceneCache`); `/testing` entry with a mock host and the host conformance kit |
| `keystone-financial-tools-typescript` | `packages/typescript` | Framework-free API: the core plus persistence: async repositories (`MemoryRepository`, `WebStorageRepository`, `IndexedDbRepository`) and the 0.1 Web Storage helpers (`saveDrawings`, `loadDrawings`, `autoSave`) |
| `keystone-financial-tools-vue` | `packages/vue` | Vue 3 composables (`useDrawingTools`, `useDrawings`) and components (`KeystoneTextEditor`, `KeystoneLiveRegion`) |
| `keystone-financial-tools-react` | `packages/react` | React hooks (`useDrawingTools`, `useDrawings`) and components (`KeystoneTextEditor`, `KeystoneLiveRegion`) |
| `keystone-financial-tools-angular` | `packages/angular` | Angular services (`KeystoneDrawingToolsService`, `KeystoneDrawingService`) and components (`keystone-text-editor`, `keystone-live-region`) |
| `keystone-financial-tools-docs` | `packages/docs` | The documentation site (Astro and Starlight): getting started per framework, host and persistence guides, keyboard reference and one page per tool |
| `keystone-financial-tools-budgets` | `packages/budgets` | Private checks for CI and for releases: the performance budgets and baseline of the core bench (NFR-PERF), the bundle size budgets (NFR-SIZE-001) and the release checks (one version, changelog notes, tarball contents) |

The first five packages (core, typescript, vue, react, angular) are published to npm, by hand, all with one version; the docs site, the budgets, the playground and the e2e tests are private. See [Releasing](#releasing).

## Apps and end-to-end tests

| Name | Folder | Purpose |
|---|---|---|
| `keystone-financial-tools-playground` | `apps/playground` | A minimal canvas chart that implements `DrawingHost` v2: the reference host to try the tools and the target of the e2e tests |
| `keystone-financial-tools-e2e` | `e2e` | Playwright tests of the drawing flows on the playground, in Chromium, Firefox and WebKit |

```bash
pnpm --filter keystone-financial-tools-playground dev        # http://localhost:4173
pnpm --filter keystone-financial-tools-e2e test:e2e:install  # once: the browsers
pnpm --filter keystone-financial-tools-e2e test:e2e
```

See the [playground README](apps/playground/README.md).

## Quick start

```ts
import { DrawingStore } from 'keystone-financial-tools-core';

const store = new DrawingStore();
store.subscribe((drawings) => console.log(drawings.length));

store.add({
  id: 'fib-1',
  kind: 'fibonacci-retracement',
  anchors: [
    { time: Date.UTC(2026, 0, 2), price: 182.4, yAxisId: 'price' },
    { time: Date.UTC(2026, 1, 9), price: 201.7, yAxisId: 'price' },
  ],
});

const saved = JSON.stringify(store); // { "version": 2, "drawings": [...] }
const restored = DrawingStore.fromJSON(JSON.parse(saved)); // also reads version 1
```

`importDocument(store, text, { mode: 'merge' | 'replace' })` imports a saved document and keeps the
valid drawings when some are broken; it returns which were added, renamed or skipped.

`new History(store)` adds undo and redo: every store change (a batch counts as one) is one step,
`history.transaction('drag')` groups a gesture into one step, and changes made with
`{ history: false }` are not recorded.

Invalid drawings throw a `DrawingError` whose `issues` list what is wrong (`KFT-E-ID`,
`KFT-E-KIND`, `KFT-E-ANCHORS`, `KFT-E-AXIS`, `KFT-E-META`, ...). `validateDrawing` returns the
same list without throwing. All anchors of a drawing must be on one y-axis.

Drawings can also be `locked` (selectable but not editable by interaction), `hidden`, ordered with
`zIndex`, and carry JSON-safe application data in `meta`. Each drawing can override the theme's
style (`LIGHT_THEME`, `DARK_THEME`, applied at scene time) and set kind options such as Fibonacci
levels, the time-zone sequence or trend-line extensions. The controller raises an `announce` event with a translatable message after a drawing is placed, selected, deleted, undone or redone, and the Vue, React and Angular packages render it into a polite live region (NFR-A11Y-001). `createId()` returns collision-safe ids
(`crypto.randomUUID` when available). See the [core README](packages/core/README.md) for the field
rules and every issue code.

## Drawing kinds

| Kind | Anchors |
|---|---|
| `trend-line` | 2 |
| `horizontal-line` | 1 |
| `rectangle` | 2 |
| `fibonacci-retracement` | 2 |
| `fibonacci-arcs` | 2 |
| `fibonacci-fans` | 2 |
| `fibonacci-time-zones` | 2 |
| `text-note` | 1 |

## Development

```bash
pnpm install
pnpm build
pnpm test:coverage
pnpm test:mutation
pnpm --filter keystone-financial-tools-e2e test:e2e
pnpm --filter keystone-financial-tools-docs dev   # the documentation site
pnpm --filter keystone-financial-tools-core bench && pnpm --filter keystone-financial-tools-budgets bench:check
pnpm --filter keystone-financial-tools-budgets size:check   # after pnpm build
```

Requirements: Node 22.22.3+ or 24.15+ (Node 24 recommended), pnpm 12+. The documentation site
(`packages/docs`) needs Node 22.23.4+ or 24 (Astro 7).

## Releasing

A tag `v*` on `main` runs the Release workflow (`.github/workflows/release.yml`): it checks that the tag, the
version of the five packages and the CHANGELOG.md section agree, runs the full verification, the mutation tests
and the e2e tests, and creates a GitHub release with the release notes and the tarballs of the packages. It never
publishes to npm (D-7): the maintainer publishes the tarballs by hand, in the order core, typescript, vue, react,
angular. The checklist is in [CLAUDE.md](CLAUDE.md) and in the docs guide *Release and publish*.

```bash
pnpm --filter keystone-financial-tools-budgets release:check          # version, packages, changelog (add --tag v1.0.0)
pnpm --filter keystone-financial-tools-budgets release:notes --version 1.0.0
pnpm --filter keystone-financial-tools-budgets release:prepare        # after pnpm build: Angular's workspace range
pnpm --filter keystone-financial-tools-budgets release:pack-check     # npm pack --dry-run of the five packages
```

## Documentation

- [SDS](specs/SDS.md): scope, the split with keystone-charts-financial, the drawing model, the host
  contract, interaction, persistence, licensing and quality gates (requirement ids such as
  FR-INT-010).
- [Backlog](specs/backlog/backlog.json): 10 epics, 44 features and 119 stories with acceptance
  criteria, traced to the SDS. Create them as linked GitHub issues with
  `./scripts/create-backlog.ps1` (Windows PowerShell 5.1 or PowerShell 7; run with `-DryRun`
  first to preview). The script is idempotent: re-running it creates nothing twice.

## License

UNLICENSED. Proprietary.
