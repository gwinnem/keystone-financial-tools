# keystone-financial-tools

Interactive drawing tools for financial charts, for TypeScript, Vue, React and Angular.

Trend lines, horizontal lines, rectangles, Fibonacci tools and text notes, stored in chart-agnostic
coordinates (time, price, y-axis id). The chart (keystone-charts-financial) implements the
`DrawingHost` contract; these packages never depend on the chart package itself.

Version 0.1.0. All published packages share one version.

## Packages

| Package | Folder | Purpose |
|---|---|---|
| `keystone-financial-tools-core` | `packages/core` | Framework-neutral core: drawing model, store, history, `DrawingHost` contract and interaction |
| `keystone-financial-tools-typescript` | `packages/typescript` | Framework-free API: the core plus persistence |
| `keystone-financial-tools-vue` | `packages/vue` | Vue 3 adapter |
| `keystone-financial-tools-react` | `packages/react` | React adapter |
| `keystone-financial-tools-angular` | `packages/angular` | Angular adapter |
| `keystone-financial-tools-docs` | `packages/docs` | The documentation site (private) |
| `keystone-financial-tools-budgets` | `packages/budgets` | Performance, size and release checks (private) |

The playground (`apps/playground`) is the reference host and the target of the end-to-end tests (`e2e`);
see the [playground README](apps/playground/README.md).

## Requirements

Node 22.22.3+ or 24.15+ (Node 24 recommended), pnpm 12+. The documentation site needs Node 22.23.4+ or 24.

## Releasing

A tag `v*` on `main` runs the Release workflow, which checks the release and creates a GitHub release with
the tarballs. It never publishes to npm: the maintainer publishes by hand. The checks are the `release:*`
scripts of `packages/budgets` (for example `pnpm --filter keystone-financial-tools-budgets release:check`).
The checklist is in [CLAUDE.md](CLAUDE.md) and in the docs guide *Release and publish*.

## Documentation

- The documentation site in `packages/docs`: getting started per framework, guides and one page per tool.
- [SDS](specs/SDS.md): scope, design and requirements.
- [CHANGELOG](CHANGELOG.md): what changed in each version.

## License

UNLICENSED. Proprietary.
