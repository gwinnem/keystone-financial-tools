# keystone-financial-tools

Interactive drawing tools for financial charts, for TypeScript, Vue, React and Angular.

Trend lines, horizontal lines, rectangles, Fibonacci tools and text notes, stored in chart-agnostic
coordinates (time, price, y-axis id) so they survive zoom, scroll and layout changes. The chart
(keystone-charts-financial) implements the `DrawingHost` contract; these packages never depend on
the chart package itself.

## Packages

| Package | Folder | Purpose |
|---|---|---|
| `keystone-financial-tools-core` | `packages/core` | Drawing model, validation, `DrawingStore`, saved document format, `DrawingHost` contract |
| `keystone-financial-tools-typescript` | `packages/typescript` | Framework-free API: the core plus Web Storage persistence (`saveDrawings`, `loadDrawings`, `autoSave`) |
| `keystone-financial-tools-vue` | `packages/vue` | Vue 3 composable (`useDrawings`) |
| `keystone-financial-tools-react` | `packages/react` | React hook (`useDrawings`) |
| `keystone-financial-tools-angular` | `packages/angular` | Angular service (`KeystoneDrawingService`) |

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

const saved = JSON.stringify(store); // { "version": 1, "drawings": [...] }
const restored = DrawingStore.fromJSON(JSON.parse(saved));
```

Invalid drawings throw a `DrawingError` whose `issues` list what is wrong (`KFT-E-ID`,
`KFT-E-KIND`, `KFT-E-ANCHORS`, `KFT-E-AXIS`, `KFT-E-META`, ...). `validateDrawing` returns the
same list without throwing. All anchors of a drawing must be on one y-axis.

Drawings can also be `locked` (selectable but not editable by interaction), `hidden`, ordered with
`zIndex`, and carry JSON-safe application data in `meta`. `createId()` returns collision-safe ids
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
```

Requirements: Node 22.22.3+ or 24.15+ (Node 24 recommended), pnpm 12+.

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
