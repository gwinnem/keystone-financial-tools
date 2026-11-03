# keystone-financial-tools-e2e

Playwright end-to-end tests of the drawing tools on the playground host
([`apps/playground`](../apps/playground)), in Chromium, Firefox and WebKit (QA-006). Private.

```bash
pnpm --filter keystone-financial-tools-e2e test:e2e:install   # once: downloads the browsers
pnpm --filter keystone-financial-tools-e2e test:e2e
pnpm --filter keystone-financial-tools-e2e test:e2e --project=chromium   # one browser
pnpm --filter keystone-financial-tools-e2e test:e2e --ui                 # Playwright's UI mode
```

`playwright.config.ts` builds the playground and serves the build (`vite preview`) on port 4173
itself, and reuses a server that is already running (not in CI). The build is served instead of the
dev server because one bundle loads much faster than the dev server's many modules when three
browsers open the page at once. After changing the playground, stop a server you started by hand,
or the tests run against the old build. Screenshots and traces are kept for failed tests; the CI job
`e2e` uploads them as the `playwright-report` artifact.

## What is covered

`tests/drawing-flows.spec.ts`: the toolbar, placing a trend line with two clicks, select and clear,
move, resize by a handle, delete (key and button), undo and redo, magnet snap, and persistence
across a reload. `tests/support.ts` converts bars and prices to page pixels through the page's
`window.playground` test hook.

Still to come with E08-F02: placing by drag, every tool, multi-select, text edit, the touch profile,
the keyboard-only test and the axe scan.
