---
title: Implement a host
description: What a chart supplies for the drawing tools to work on it, member by member, with a skeleton to start from.
---

The tools never depend on a chart package. A chart takes part by implementing `DrawingHost` (contract version 2) from `keystone-financial-tools-core`, and passes it to `createDrawingTools`, or to the composable, hook or service of your framework.

## Conventions

- Times are epoch milliseconds.
- `x`, `y` and rectangles are CSS pixels in plot coordinates: the origin is the top left corner of the plot area.
- Prices are converted per y-axis (per pane). Log and percentage scales are the host's concern, not the tools'.

## The members

| Member | What it does |
| --- | --- |
| `apiVersion` | Always `2`. |
| `timeToX(time)` | Time to x. It extrapolates beyond the first and last bar (future space). |
| `xToTime(x)` | The inverse of `timeToX`, also beyond the data. |
| `priceToY(price, yAxisId)` | Price to y on a y-axis. |
| `yToPrice(y, yAxisId)` | The inverse of `priceToY`. |
| `yAxisAt(x, y)` | The y-axis of the pane under a plot point, or `null` outside every pane. |
| `paneRect(yAxisId)` | The plot area of a pane, or `null` when the y-axis has no pane. |
| `nearestBar(time)` | The bar nearest to a time (its time and open, high, low and close) for magnet snapping, or `null` when there is no data. |
| `barInterval()` | Milliseconds between bars at the current timeframe. |
| `onPointer(listener)` | Subscribes to pointer events over the whole plot area and returns the unsubscribe function. |
| `onKey(listener)` | Subscribes to key events while the chart has the focus and returns the unsubscribe function. A listener that returns `true` handled the key: prevent its default action. |
| `onViewportChange(listener)` | Subscribes to zoom, scroll, resize, pane layout and timeframe changes and returns the unsubscribe function. |
| `setCursor(cursor)` | Shows a cursor: `default`, `crosshair`, `pointer`, `move`, `grab`, `grabbing`, `ns-resize`, `ew-resize`, `nwse-resize`, `nesw-resize`, `text` or `not-allowed`. |
| `requestRender()` | Asks the host to redraw its overlay layer. The host then paints `tools.getScene()`. |
| `editText(request)` | Optional. Edits a text note in place and resolves with the new text, or `null` when cancelled. |

A pointer event has a `phase` (`down`, `move`, `up`, `cancel` or `leave`), the position in plot coordinates, the `pointerType` (`mouse`, `touch` or `pen`), the `button` and the modifier keys. A key event has `key` (the value of `KeyboardEvent.key`), the modifier keys and, optionally, `code` (the value of `KeyboardEvent.code`): with it the tool shortcuts work on a Mac, where Option changes the character of a letter.

## A skeleton

```ts
import { createDrawingTools, type DrawingHost } from 'keystone-financial-tools-core';

const host: DrawingHost = {
  apiVersion: 2,
  timeToX: (time) => chart.timeScale.toPixel(time),
  xToTime: (x) => chart.timeScale.fromPixel(x),
  priceToY: (price, yAxisId) => chart.axis(yAxisId).toPixel(price),
  yToPrice: (y, yAxisId) => chart.axis(yAxisId).fromPixel(y),
  yAxisAt: (x, y) => chart.paneAt(x, y)?.yAxisId ?? null,
  paneRect: (yAxisId) => chart.pane(yAxisId)?.rect ?? null,
  nearestBar: (time) => chart.nearestBar(time),
  barInterval: () => chart.barIntervalMs,
  onPointer: (listener) => chart.onPointer(listener),
  onKey: (listener) => chart.onKey(listener),
  onViewportChange: (listener) => chart.onViewportChange(listener),
  setCursor: (cursor) => chart.setCursor(cursor),
  requestRender: () => chart.requestOverlayRender(),
};

const tools = createDrawingTools(host);
```

`chart` stands for your own chart. `createDrawingTools` checks the host and throws `KFT-E-HOST` when it does not satisfy the contract.

## Draw the scene

Paint `tools.getScene()` in the overlay of your chart each time the host's render pass runs. The scene is the same array until something changes, so it is cheap to ask for. `tools.hitTest(x, y)` tells what is under a point, for example for your own tooltips.

The scene is a list of items in paint order:

- `shape` items have pixel shapes (lines, rectangles, arcs, labels and text) for trend lines, horizontal lines, rectangles and text notes.
- `fibonacci` items have the anchors and the resolved options of a Fibonacci tool in chart coordinates. Paint them with your own Fibonacci renderer; the tools do not draw them for you.
- `preview` items show the drawing being placed and the snap indicator, and `handles` items the handles of the selected drawings.

Every `shape` and `fibonacci` item has its `state` (`normal`, `hover`, `selected` or `locked`) and the style resolved from the theme.

## Test your host

`keystone-financial-tools-core/testing` has `createMockHost`, a host with pointer, key and viewport events you can trigger from a test. The `apps/playground` package of this repository is a complete reference host: a minimal canvas chart that implements the contract.

## Next

Connect the tools to your framework with a [getting started](/getting-started/typescript/) page, and read the [keyboard reference](/guides/keyboard/) for the keys your `onKey` listener passes on. To add a toolbar, see [Build a toolbar](/guides/toolbar/).
