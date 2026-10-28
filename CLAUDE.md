# Keystone Financial Tools

## Purpose

Interactive drawing tools for financial charts: trend lines, horizontal lines, rectangles,
Fibonacci tools and text notes, with placement, magnet snapping, selection and handles, editing
and persistence. Framework-neutral core with thin TypeScript, Vue, React and Angular packages.

## Scope split with keystone-charts-financial (decided 2026-10-28)

- keystone-charts-financial renders programmatic Fibonacci overlays (retracement, arcs, fans,
  time zones, levels from a selected data range) and owns the range selector.
- This repo owns the interactive layer only: placing anchors with the pointer, snapping, selecting,
  editing and saving drawings. It reuses the chart's renderers instead of drawing its own.
- The chart supplies the host contract (`DrawingHost` in `packages/core/src/types.ts`): time/price
  to pixel transforms per y-axis, the y-axis under a point, OHLC lookup for magnet snapping,
  pointer events with modifier keys, and a redraw request. This repo never depends on the chart
  package itself.

The design is specified in [specs/SDS.md](specs/SDS.md) (requirement ids such as FR-INT-010,
decisions D-1..D-6, open decisions OD-n). Work items live in
[specs/backlog/backlog.json](specs/backlog/backlog.json) (epics E01-E10 > features > stories) and
are created as linked GitHub issues (sub-issues plus Parent/Children links in the bodies, labels,
milestones M1-M5) by `scripts/create-backlog.ps1`, which is idempotent. Changes to scope update the
SDS first, then `backlog.json`, then re-run the script with `-UpdateExisting`.

## Architecture

- `packages/core` (`keystone-financial-tools-core`): drawing model, validation, `DrawingStore`,
  saved document format and the `DrawingHost` contract. All logic lives here.
- `packages/typescript` (`keystone-financial-tools-typescript`): framework-free API for plain
  TypeScript/JavaScript apps (re-exports the core, adds Web Storage persistence helpers).
- `packages/vue`, `packages/react`, `packages/angular`: thin adapters (composables, hooks,
  services). No business logic in framework packages: they adapt the core's public contracts only.

Drawings are stored in chart-agnostic coordinates (time, price, y-axis id), never pixels, so they
survive zoom, scroll and layout changes.

Package names are un-scoped (`keystone-financial-tools-*`). Packages are private, `UNLICENSED`.

## Stack

- Node 22.22.3+ or 24.15+ (CI: Node 24)
- TypeScript 6.0 (strict). Held below 6.1: Angular 22 and typescript-eslint require `<6.1`
- pnpm 12 workspaces + Turbo 2 (dependency build scripts are approved in `pnpm-workspace.yaml` `allowBuilds`)
- Vite 8 + Vitest 5 (core, typescript, vue, react)
- Angular 22, ng-packagr 22 + Vitest 5 (angular)
- Stryker 10 (mutation testing)
- ESLint 10 (flat config, `eslint.config.mjs`) + Prettier, Husky + lint-staged

## Commands

```bash
pnpm install
pnpm lint
pnpm type-check
pnpm test
pnpm test:coverage
pnpm test:mutation
pnpm build
```

## Quality gates

- Coverage floor: 90% lines, functions, branches and statements in every package.
- Mutation testing: Stryker in every package, floor 100% (`break: 100`). Mutants that cannot be
  killed get a `// Stryker disable next-line <Mutator>` comment with a stated reason.
- Husky pre-commit runs lint-staged (ESLint, Prettier), format check, type-check, lint and unit
  tests with coverage. Mutation testing runs in CI for changes headed to main.

## Working agreement

- Deliver complete solutions, not partial patches.
- Update README files (root and packages) and docs together with code changes.
- Prefer named exports and explicit return types.
- Never commit secrets, tokens, or credentials.
