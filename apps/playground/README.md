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

- 100 hourly candles from a seeded generator (`generateBars`) on one pane, `price`, with linear scales
  and 20 empty bar slots after the last candle (future space).
- A toolbar (`role="toolbar"`) with a button for each of the eight tools, Undo, Redo, Delete and
  Magnet. Tool and magnet buttons are toggles (`aria-pressed`); the status line is a live region.
- The scene of `createDrawingTools(host)` on an overlay canvas: shapes, handles, the placement
  preview and the snap indicator, plus a simple Fibonacci renderer (the line between the anchors and
  the levels of a retracement; the other three kinds show the line only).
- Persistence: drawings are loaded with `loadStore` from `localStorage` (`WebStorageRepository`,
  symbol `PLAYGROUND`) and saved 100 ms after every change with `autoSave`.

## How a host is built

| File | Role | Tested by |
|---|---|---|
| `src/plot-host.ts` | `createPlotHost`: the `DrawingHost` (scales, `nearestBar`, listeners) and `dispatchPointer`, `dispatchKey`, `changeViewport` | Unit tests and `runHostConformance`, 100% coverage |
| `src/input.ts` | `toHostPointer`, `toHostKey`: DOM events to contract events (plot coordinates, phase names) | Unit tests, 100% coverage |
| `src/data.ts`, `src/toolbar.ts` | The data set, labels and status text | Unit tests, 100% coverage |
| `src/dom.ts` | `bindInput`: pointer events (with capture) and key events on the chart element | e2e |
| `src/render.ts` | Candles and the scene on the two canvases | e2e |
| `src/main.ts` | Wires the page together and exposes `window.playground` | e2e |

To write a host for your own chart, copy `createPlotHost`, replace the scales with the chart's own and
call `dispatchPointer` and `dispatchKey` from its input handling; then run
`runHostConformance` from `keystone-financial-tools-core/testing` against it, as
`__tests__/plot-host.test.ts` does.

## The test hook

The page sets `window.playground = { host, tools, store, bars }` so the e2e tests can convert a bar
and a price to a pixel (`host.timeToX`, `host.priceToY`) and read the store and the tools' state.
It is a test hook, not part of any API.

## Not yet here

Second pane, zoom and scroll, the text editor, the toolbar from `TOOL_CATALOG` and the Vue, React
and Angular demo pages are part of E08 (E08-F01-S01, E08-F01-S02) and come later.
