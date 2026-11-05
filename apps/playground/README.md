# keystone-financial-tools-playground

A minimal canvas chart that implements the `DrawingHost` contract (version 2). It is the reference
host for the drawing tools and the page the Playwright tests in [`e2e/`](../../e2e) run against, so
the tests do not depend on the release cycle of keystone-charts-financial (FR-INTG-004, QA-006,
QA-008). It is private and not published.

```bash
pnpm --filter keystone-financial-tools-playground dev    # http://localhost:4173
pnpm --filter keystone-financial-tools-playground test   # unit tests of the host
```

It runs against the sources of `packages/core` and `packages/typescript`: no build is needed first.

## What it shows

- 100 hourly candles from a seeded generator (`generateBars`) on two panes, `price` above `volume` (a
  volume per candle derived from its prices), with linear scales that fit the bars in view and 20
  empty bar slots after the last candle (future space).
- Zoom and scroll (`viewport.ts`): the wheel zooms around the pointer, Shift with the wheel or sideways
  movement scrolls, and while the chart has focus `+` and `-` zoom, Home and End go to the first and the
  last slot and Page Up and Page Down scroll half a screen. These are keys no tool handled; Ctrl, Alt and
  Cmd are left alone. Zoom and scroll tell the viewport listeners, so the tools redraw by themselves.
- A toolbar (`role="toolbar"`) built from the tools' own toolbar state, with the labels from `messages`: a
  button for each of the eight tools, Undo, Redo, Delete and Magnet. Tool and magnet buttons are toggles
  (`aria-pressed`); the status line is an `<output>` with `aria-live="off"`, so that the announcements are not spoken twice.
- A visually hidden polite live region (`#announcer`, `live-region-dom.ts` on the TypeScript and embed pages, `KeystoneLiveRegion` on
  the framework pages) that says what was placed, selected, deleted, undone or redone (NFR-A11Y-001).
- The scene of `createDrawingTools(host)` on an overlay canvas: shapes, handles, the placement
  preview and the snap indicator, plus a simple Fibonacci renderer (the line between the anchors and
  the levels of a retracement; arcs, fans and time zones show the line only, although the tools
  hit-test their real shapes).
- A DOM text editor for the text note on the TypeScript page (`text-editor-dom.ts`, over the core's
  `TextEditor`).
- Persistence: drawings are loaded with `loadStore` from `localStorage` (`WebStorageRepository`,
  symbol `PLAYGROUND`) and saved 100 ms after every change with `autoSave`.

## The four demo pages

The same demo is a page for each package, on one Vite server (multi-page build):

| Page | Package | File |
|---|---|---|
| `index.html` | `keystone-financial-tools-typescript` | `src/main.ts` |
| `vue.html` | `keystone-financial-tools-vue` | `src/vue-page.ts` |
| `react.html` | `keystone-financial-tools-react` | `src/react-page.ts` |
| `angular.html` | `keystone-financial-tools-angular` | `src/angular-page.ts` |

The Vue and React pages use render functions and `createElement`, and the Angular page is compiled in the
browser, so no framework plugin is needed. `src/demo.ts` is the code the pages share.

## The embed page

`embed.html?tool=<kind>` (`src/embed.ts`) is the chart with only one tool enabled (`tools: [kind]`) and already
active (`stayInTool`), plus Undo, Redo, Delete and Magnet; the drawings are kept in memory only. Without a valid
`tool` it says how to ask for one and shows no chart. `toolFromSearch` and `unknownToolMessage`
(`src/embed-params.ts`) are unit tested; the page is covered by `e2e/tests/embed.spec.ts`. The docs site embeds it
in the page of each tool: `pnpm --filter keystone-financial-tools-playground build:embed` builds only this page, with
the base `/playground/`, into `packages/docs/public/playground` (`vite.embed.config.ts`).

## How a host is built

| File | Role | Tested by |
|---|---|---|
| `src/plot-host.ts` | `createPlotHost`: the `DrawingHost` (scales, `nearestBar`, listeners) and `dispatchPointer`, `dispatchKey`, `changeViewport` | Unit tests and `runHostConformance`, 100% coverage |
| `src/input.ts` | `toHostPointer`, `toHostKey`: DOM events to contract events (plot coordinates, phase names) | Unit tests, 100% coverage |
| `src/data.ts`, `src/toolbar.ts`, `src/viewport.ts` | The data set, labels and status text, zoom and scroll | Unit tests, 100% coverage |
| `src/dom.ts` | `bindInput`: pointer events (with capture) and key events on the chart element | e2e |
| `src/render.ts` | Candles, volume and the scene on the canvases | e2e |
| `src/text-editor-dom.ts` | `mountTextEditor`: the DOM editor of the text note | e2e |
| `src/live-region-dom.ts` | `mountLiveRegion`: the announcements live region of the TypeScript and embed pages | e2e |
| `src/embed-params.ts` | `toolFromSearch`, `unknownToolMessage`: the `?tool=` of the embed page | Unit tests, 100% coverage |
| `src/main.ts`, `src/embed.ts`, `src/demo.ts`, the framework pages | Wire the pages together; the pages expose `window.playground` | e2e |

To write a host for your own chart, copy `createPlotHost`, replace the scales with the chart's own and
call `dispatchPointer` and `dispatchKey` from its input handling; then run
`runHostConformance` from `keystone-financial-tools-core/testing` against it, as
`__tests__/plot-host.test.ts` does.

## The test hook

The page sets `window.playground = { host, tools, store, bars }` so the e2e tests can convert a bar
and a price to a pixel (`host.timeToX`, `host.priceToY`) and read the store and the tools' state.
It is a test hook, not part of any API.

## Known gap

The playground does not draw the arcs, fans and time zones of the Fibonacci tools. The chart's own
Fibonacci renderer does that; the shared fixture `FIBONACCI_PARITY` from `keystone-financial-tools-core/testing`
is what a renderer is tested against (E08-F03).
