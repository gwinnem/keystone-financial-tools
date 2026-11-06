# keystone-financial-tools-budgets

Private package (not published). It holds the performance and size budgets of the project and the checks CI runs
against them, and the checks of a release (E09-F04). The CLI is TypeScript run by Node's type stripping
(`node src/cli.ts`), so it needs no build.

## Budgets

| Id | Budget | Measured by |
|---|---|---|
| NFR-PERF-001 | `getScene()` with 500 drawings: at most 2 ms | `packages/core/__tests__/perf.bench.ts`, after a viewport change (geometry and scene built again) |
| NFR-PERF-002 | `hitTest()` with 500 drawings: at most 0.5 ms | the same file, cache warm |
| NFR-PERF-003 | pointer move during a drag with 500 drawings: at most 1 ms | the same file |
| NFR-SIZE-001 | core ESM bundle at most 25 kB min+gzip; each framework package at most 3 kB | the built files, minified with terser and gzipped |

1 kB is 1000 bytes. The numbers and files are in `src/budgets.ts`.

## Commands

```bash
pnpm --filter keystone-financial-tools-core bench           # writes packages/core/reports/bench/results.json
pnpm --filter keystone-financial-tools-budgets bench:check  # time budgets and the baseline
pnpm --filter keystone-financial-tools-budgets bench:baseline
pnpm build
pnpm --filter keystone-financial-tools-budgets size:check   # needs the build
```

Exit codes: 0 all within budget, 1 a budget or the baseline is broken (or the input is missing), 2 wrong usage.
Options: `--results <file>`, `--baseline <file>`, `--root <folder>`, and for the release commands `--tag <vX.Y.Z>`,
`--version <X.Y.Z>` and `--out <file>`.

## Release checks

The published packages and their order are in `src/release.ts`: core, typescript, vue, react, angular (Angular is
packed from `packages/angular/dist`). All have the version of the root `package.json`.

```bash
pnpm --filter keystone-financial-tools-budgets release:check [--tag v1.0.0]
pnpm --filter keystone-financial-tools-budgets release:notes --tag v1.0.0 [--out release/notes.md]   # or --version 1.0.0
pnpm build
pnpm --filter keystone-financial-tools-budgets release:prepare
pnpm --filter keystone-financial-tools-budgets release:pack-check
```

- `release:check` fails for a package with another version than the root, a private package, a package without
  `files` with `dist`, `exports` or `types`, a tag that is not `v` and the version, and a CHANGELOG.md without a
  section `## <version>` that has notes or whose heading still says `(unreleased)`.
- `release:notes` prints the CHANGELOG.md section of the version (used as the release notes), or writes it to `--out`.
- `release:prepare` replaces the `workspace:` ranges in `packages/angular/dist/package.json` by the version (the
  built manifest is not a pnpm package, so pnpm cannot do it). Run it after every build of Angular.
- `release:pack-check` runs `npm pack --dry-run --json` in the publish folder of each package and fails for a test,
  fixture, source file, source map, build or test configuration or report in a tarball, and for a manifest npm
  cannot publish. It needs npm on the path.

The checklist for a release and for the manual publish is in the root CLAUDE.md and in the docs guide *Release and
publish*; the Release workflow runs these checks and never publishes.

## Baseline

`baseline/core-bench.json` holds the mean time of every benchmark of the core bench. `bench:check` fails when a
benchmark is more than 20% slower than its entry, or when an entry has no result any more. A benchmark that is not
in the baseline is reported only. Without the file only the time budgets are checked.

Record or refresh the baseline from the `bench-results` artifact of a CI run (CI's speed, not a laptop's):

1. Download `results.json` from the artifact to `packages/core/reports/bench/results.json`.
2. `pnpm --filter keystone-financial-tools-budgets bench:baseline`
3. Commit `baseline/core-bench.json`.

A test in `perf.bench.ts` per budget has a name that starts with the requirement id. Rename one only together with
`PERF_BUDGETS` and the baseline.
