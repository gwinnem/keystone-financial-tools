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

| Spec | Covers |
|---|---|
| `tests/drawing-flows.spec.ts` | The toolbar and the first flows: a trend line placed with two clicks, select and clear, move, resize by a handle, delete (key and button), undo and redo, magnet snap, persistence across a reload. |
| `tests/tools.spec.ts` | The same flows for each of the eight tools (the `TOOLS` table in `support.ts`): place by click and by drag, magnet snap, select, move, resize by a handle (not the text note), multi-select (Shift+click, Ctrl+A), delete with undo, undo and redo, reload. The text note adds its editor: confirm, Escape, Enter and double-click to edit. |
| `tests/touch.spec.ts` | Tap-tap placement, select, delete and undo with touch. Runs only in the `mobile-chromium` project. |
| `tests/keyboard.spec.ts` | A keyboard-only run (no mouse): Tab to the chart, Alt+T to choose the tool, place with the keyboard cursor and Enter, select, nudge and delete. An axe scan (`@axe-core/playwright`) of the toolbar on the four demo pages fails on serious or critical findings. |
| `tests/keyboard-walkthrough.spec.ts` | The keyboard-only walkthrough of every tool: the toolbar route for all eight (Tab to the button, Enter, Tab to the chart, place with Enter and the arrow keys, select, nudge, delete, undo, redo), the shortcut route for the five tools with an Alt shortcut (cancel with Escape, Ctrl+D, Backspace), and editing a text note. |
| `tests/announcements.spec.ts` | The screen-reader announcements on the four demo pages: one polite live region, what it says for place, select, delete, undo and redo (by mouse and by keyboard), counts for several drawings, a repeated message that changes the text, silence for tool choice, hover and nudges, notes confirmed or cancelled, and an axe scan of the whole page. |
| `tests/embed.spec.ts` | The embed page of the docs site (`/embed.html?tool=<kind>`) for each tool: only its button, already active, place by click (the text note with its editor), the tool stays active, memory only (nothing after a reload), undo and redo, keyboard-only placement, the message for a missing or unknown tool, and an axe scan. `touch.spec.ts` adds taps on it. |
| viewport and demo page specs | Zoom and scroll, and the TypeScript, Vue, React and Angular pages. |

The projects are `chromium`, `firefox` and `webkit` (everything except `touch.spec.ts`) and
`mobile-chromium` (Pixel 7 in landscape, 915 x 412 so that the 800 px chart fits; only
`touch.spec.ts`). Touch drag is not covered: on touch the tools place on tap-tap.

`tests/support.ts` holds the helpers. It converts bars and prices to page pixels through the page's
`window.playground` test hook. The tests do not compute a drawing's pixels from its geometry: they ask the
tools' own `hitTest` across the price pane to find a body or a handle (`bodyPoint`, `handlePoint`), so they
hold for any shape and any later change of the geometry.
