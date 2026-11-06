---
title: Release and publish
description: How a version is released on GitHub and published to npm by hand, with the checklist the maintainer follows.
---

A release has two parts that never run together. A tag `v*` makes the **Release** workflow verify the version and create a GitHub release with the release notes and the tarballs. Publishing to npm is **manual**: no workflow publishes and none holds an npm token (decision D-7). This page is the checklist for both.

All five packages are published with one version: `keystone-financial-tools-core`, `-typescript`, `-vue`, `-react` and `-angular`. The version is the `version` of the root `package.json` and of each of the five packages. Every command below runs from the repository root.

## Release a version

1. **Bump the versions together.** Set the same `version` in the root `package.json` and in `packages/core`, `typescript`, `vue`, `react` and `angular`.
2. **Date the changelog.** In `CHANGELOG.md` the section of the version has the heading `## 1.0.0 (2026-11-10)`; a heading that says `(unreleased)` fails the check. The section is the release notes of the GitHub release.
3. **Check the release.** It fails for a version that differs between the packages, a package that is private, a missing `files`, `exports` or `types`, and a changelog without notes for the version.

   ```bash
   pnpm --filter keystone-financial-tools-budgets release:check
   ```

4. **Run everything once.** Unit tests with coverage, mutation tests (0 survivors) and the end-to-end tests are green; CI runs the same on the pull request from `dev` into `main`.
5. **Tag the commit on `main`.** The tag is `v` and the version.

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

The **Release** workflow then checks that the commit is on `main` and that the tag, the packages and the changelog agree (`release:check --tag`); runs type-check, lint, parity, unit tests with coverage, the build and the size budgets; runs the mutation tests of every package and the end-to-end tests; and, when all of them pass, creates the GitHub release for the tag with the notes and the five tarballs. A version with a hyphen, such as `1.0.0-beta.1`, is marked as a pre-release.

## Publish to npm

Publish from the tarballs of the release, or make them yourself as below. The four packages that are packed from their own folder have `workspace:*` ranges in their `package.json`; `pnpm pack` replaces them with the version, which `npm publish` from the folder would not. Angular is built by ng-packagr into `packages/angular/dist`, so it is packed from there after `release:prepare` has replaced the range in the built manifest.

1. **Build.**

   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   ```

2. **Prepare Angular and dry-run every package.** `release:pack-check` runs `npm pack --dry-run` for the five packages and fails when a tarball would hold a test, a fixture, a source file, a source map or a build or test configuration, or when a manifest cannot be published.

   ```bash
   pnpm --filter keystone-financial-tools-budgets release:prepare
   pnpm --filter keystone-financial-tools-budgets release:pack-check
   ```

3. **Pack.** In PowerShell:

   ```powershell
   $out = "$PWD\release"
   foreach ($package in 'core', 'typescript', 'vue', 'react') { pnpm --dir "packages/$package" pack --pack-destination $out }
   npm pack ./packages/angular/dist --pack-destination $out
   ```

4. **Publish in this order**, as the other packages depend on the core. Log in with `npm login` first; npm asks for the one-time password of the account. Add `--tag next` for a pre-release.

   ```powershell
   npm publish release/keystone-financial-tools-core-1.0.0.tgz
   npm publish release/keystone-financial-tools-typescript-1.0.0.tgz
   npm publish release/keystone-financial-tools-vue-1.0.0.tgz
   npm publish release/keystone-financial-tools-react-1.0.0.tgz
   npm publish release/keystone-financial-tools-angular-1.0.0.tgz
   ```

5. **Check.** `npm view keystone-financial-tools-core version` shows the new version, and the published `keystone-financial-tools-angular` has `keystone-financial-tools-core` at that version in its dependencies, not `workspace:*`.

## What the tarballs hold

Each of `core`, `typescript`, `vue` and `react` publishes `package.json`, the README and `dist`; Angular publishes the contents of `packages/angular/dist`. The builds write no source maps, as a map embeds the original TypeScript, and the Angular library is built in partial compilation mode, which is the only mode npm may publish.
