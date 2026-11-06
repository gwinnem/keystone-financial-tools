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
- The chart supplies the host contract (`DrawingHost` version 2 in `packages/core/src/host.ts`,
  SDS §7): time/price to pixel transforms per y-axis, pane rectangles, the y-axis under a point,
  nearest bar for magnet snapping, bar interval, pointer, key and viewport events, cursor, a redraw
  request and an optional text editor. This repo never depends on the chart package itself.

The design is specified in [specs/SDS.md](specs/SDS.md) (requirement ids such as FR-INT-010,
decisions D-1..D-7, open decisions OD-n). Work items live in
[specs/backlog/backlog.json](specs/backlog/backlog.json) (epics E01-E10 > features > stories) and
are created as linked GitHub issues (sub-issues plus Parent/Children links in the bodies, labels,
milestones M1-M5) by `scripts/create-backlog.ps1`, which is idempotent. Changes to scope update the
SDS first, then `backlog.json`, then re-run the script with `-UpdateExisting`.

## Architecture

- `packages/core` (`keystone-financial-tools-core`): drawing model, validation, `DrawingStore`,
  saved document format and the `DrawingHost` contract. All logic lives here.
- `packages/typescript` (`keystone-financial-tools-typescript`): framework-free API for plain
  TypeScript/JavaScript apps (re-exports the core, adds Web Storage persistence helpers).
- `apps/playground` (`keystone-financial-tools-playground`): a minimal canvas chart that implements
  `DrawingHost` v2. `e2e/` (`keystone-financial-tools-e2e`): Playwright tests that run against it.
- `packages/vue`, `packages/react`, `packages/angular`: thin adapters (composables, hooks,
  services). No business logic in framework packages: they adapt the core's public contracts only.
- `packages/docs` (`keystone-financial-tools-docs`): the Astro/Starlight documentation site. Pages are
  Markdown in `src/content/docs`; the navigation and the keyboard table come from `src/site`. The build
  fails on a broken link. Needs Node 22.23.4+ or 24 (Astro 7).
- `packages/budgets` (`keystone-financial-tools-budgets`): the performance and size budgets and the CLI that
  checks them (`bench:check`, `bench:baseline`, `size:check`). Runs as TypeScript through Node type stripping.

Drawings are stored in chart-agnostic coordinates (time, price, y-axis id), never pixels, so they
survive zoom, scroll and layout changes.

Package names are un-scoped (`keystone-financial-tools-*`). The five library packages (core, typescript, vue,
react, angular) are publishable to npm, `UNLICENSED`, and share one version (the `version` of the root
`package.json`); the root, docs, budgets, playground and e2e are private. Nothing publishes automatically (D-7):
see Releasing.

## Stack

- Node 22.22.3+ or 24.15+ (CI: Node 24)
- TypeScript 6.0 (strict). Held below 6.1: Angular 22 and typescript-eslint require `<6.1`
- pnpm 12 workspaces + Turbo 2 (dependency build scripts are approved in `pnpm-workspace.yaml` `allowBuilds`)
- Vite 8 + Vitest 5 (core, typescript, vue, react)
- Astro 7 + Starlight (docs, `packages/docs`)
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
pnpm --filter keystone-financial-tools-core bench   # then: pnpm --filter keystone-financial-tools-budgets bench:check
pnpm --filter keystone-financial-tools-budgets size:check   # after pnpm build
pnpm --filter keystone-financial-tools-e2e test:e2e   # Playwright, needs test:e2e:install once
pnpm --filter keystone-financial-tools-budgets release:check   # version, packages and changelog of a release (see Releasing)
```

## Quality gates

- Coverage floor: 90% lines, functions, branches and statements in every package.
- Mutation testing: Stryker in every package, floor 100% (`break: 100`). Mutants that cannot be
  killed get a `// Stryker disable next-line <Mutator>` comment with a stated reason.
- Husky pre-commit runs lint-staged (ESLint, Prettier), format check, type-check, lint and unit
  tests with coverage. Mutation testing runs in CI for changes headed to main, and in the Release workflow.
- No source maps in the published builds (a map embeds the TypeScript source), and Angular builds in partial
  compilation mode (`tsconfig.lib.json`), the only mode npm may publish.

## Releasing

Two separate steps. The workflow `.github/workflows/release.yml` runs on a tag `v*` and **never publishes to npm**
(D-7, no npm token): it checks the release, runs the full verification, the mutation tests of every package and the
e2e tests, then creates a GitHub release with the CHANGELOG.md section as notes and the five tarballs. Publishing is
manual. The checks are the `release:*` scripts of `packages/budgets` (`packages/budgets/README.md`); the same steps
are in the docs guide *Release and publish* (`packages/docs/src/content/docs/guides/releasing.md`).

**Release checklist**

1. Bump the version in the root `package.json` and in `packages/core`, `typescript`, `vue`, `react` and `angular`
   together (one version for all).
2. Date the section in `CHANGELOG.md`: `## 1.0.0 (2026-11-10)`, no `(unreleased)`. It is the release notes.
3. `pnpm --filter keystone-financial-tools-budgets release:check` passes.
4. Build, unit (coverage), mutation (0 survivors) and e2e are green; merge `dev` into `main` through a pull request.
5. Tag the commit on `main` and push the tag: `git tag v1.0.0; git push origin v1.0.0`. The Release workflow
   verifies and creates the GitHub release with the tarballs.

**Publish checklist (manual, after the release)**

1. `pnpm install --frozen-lockfile; pnpm build`
2. `pnpm --filter keystone-financial-tools-budgets release:prepare` (replaces `workspace:*` in
   `packages/angular/dist/package.json`; `pnpm pack` does it for the others)
3. `pnpm --filter keystone-financial-tools-budgets release:pack-check` (the dry run: `npm pack --dry-run` of every
   package; no tests, fixtures, sources or source maps in a tarball)
4. Pack: `pnpm --dir packages/<core|typescript|vue|react> pack --pack-destination <abs>\release` for each, and
   `npm pack ./packages/angular/dist --pack-destination <abs>\release` (or take the tarballs of the GitHub release)
5. `npm publish release/<name>-<version>.tgz` in the order core, typescript, vue, react, angular (add `--tag next`
   for a version with a hyphen). Never `npm publish` from a package folder: it keeps `workspace:*` in the manifest.
6. `npm view keystone-financial-tools-core version` shows the new version; the published Angular manifest lists the
   core at that version.

The release workflow must never contain an `npm publish` step or an npm token (D-7).

## Working agreement

- Deliver complete solutions, not partial patches.
- Update README files (root and packages) and docs together with code changes.
- Prefer named exports and explicit return types.
- Never commit secrets, tokens, or credentials.
