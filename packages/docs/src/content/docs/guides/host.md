---
title: Implement a host
description: What a chart supplies for the drawing tools to work on it, member by member, with a skeleton to start from.
---

The tools never depend on a chart package. A chart takes part by implementing `DrawingHost` (contract version 3) from `keystone-financial-tools-core`, and passes it to `createDrawingTools`, or to the composable, hook or service of your framework.

## Conventions

- Times are epoch milliseconds.
- `x`, `y` and rectangles are CSS pixels in plot coordinates: the origin is the top left corner of the plot area.
- Prices are converted per y-axis (per pane). Log and percentage scales are the host's concern, not the tools'.

## The members

| Member | What it does |
| --- | --- |
| `apiVersion` | `3`. A host written for contract version 2 declares `2` and is still accepted (see below). |
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
| `paneIds()` | Version 3. The y-axis ids of the panes, top to bottom, each once. A tool that spans every pane draws in each of them. |
| `barsBetween(from, to)` | Version 3. The number of bars from `from` to `to`, counted on the bar axis so that gaps in time (nights, weekends) do not count. It is negative when `to` is before `from` and 0 for equal times. Beyond the last bar every `barInterval()` counts as one bar. |
| `volumeBetween(from, to)` | Version 3, optional. The total volume of the bars from `from` (inclusive) to `to` (exclusive), in either order, or `null` when the data has no volume. |

A pointer event has a `phase` (`down`, `move`, `up`, `cancel` or `leave`), the position in plot coordinates, the `pointerType` (`mouse`, `touch` or `pen`), the `button` and the modifier keys. A key event has `key` (the value of `KeyboardEvent.key`), the modifier keys and, optionally, `code` (the value of `KeyboardEvent.code`): with it the tool shortcuts work on a Mac, where Option changes the character of a letter.

## A skeleton

```ts
import { createDrawingTools, type DrawingHost } from 'keystone-financial-tools-core';

const host: DrawingHost = {
  apiVersion: 3,
  timeToX: (time) => chart.timeScale.toPixel(time),
  xToTime: (x) => chart.timeScale.fromPixel(x),
  priceToY: (price, yAxisId) => chart.axis(yAxisId).toPixel(price),
  yToPrice: (y, yAxisId) => chart.axis(yAxisId).fromPixel(y),
  yAxisAt: (x, y) => chart.paneAt(x, y)?.yAxisId ?? null,
  paneRect: (yAxisId) => chart.pane(yAxisId)?.rect ?? null,
  nearestBar: (time) => chart.nearestBar(time),
  barInterval: () => chart.barIntervalMs,
  paneIds: () => chart.panes.map((pane) => pane.yAxisId),
  barsBetween: (from, to) => chart.timeScale.barsBetween(from, to),
  volumeBetween: (from, to) => chart.volumeBetween(from, to), // optional
  onPointer: (listener) => chart.onPointer(listener),
  onKey: (listener) => chart.onKey(listener),
  onViewportChange: (listener) => chart.onViewportChange(listener),
  setCursor: (cursor) => chart.setCursor(cursor),
  requestRender: () => chart.requestOverlayRender(),
};

const tools = createDrawingTools(host);
```

`chart` stands for your own chart. `createDrawingTools` checks the host and throws `KFT-E-HOST` when it does not satisfy the contract.

## Version 2 hosts

A host that declares `apiVersion: 2` and has none of `paneIds`, `barsBetween` and `volumeBetween` keeps working: the eight tools of 1.0 need none of them. A tool that needs one of these members is disabled on such a host: its toolbar entry has `enabled: false` and `missing` lists the features it lacks (`panes`, `bars` or `volume`), and `activate` throws `KFT-E-CAPABILITY` after emitting the `blocked` event `{ code: 'KFT-E-CAPABILITY', tool, missing }`. `hostFeatures(host)` tells which features a host has. To migrate, set `apiVersion: 3` and add `paneIds` and `barsBetween` (and `volumeBetween` when your data has volume); `createDrawingTools` throws `KFT-E-HOST` for a version 3 host without them.

The conformance kit (`runHostConformance`) checks the version 3 members of a version 3 host: `paneIds` lists every listed pane once, top to bottom; `barsBetween` is 0 for equal times and counts five intervals beyond the last bar in both directions; `volumeBetween` is a number of at least 0, or `null`.

## Draw the scene

Paint `tools.getScene()` in the overlay of your chart each time the host's render pass runs. The scene is the same array until something changes, so it is cheap to ask for. `tools.hitTest(x, y)` tells what is under a point, for example for your own tooltips.

The scene is a list of items in paint order:

- `shape` items have pixel shapes (lines, rectangles, arcs, labels and text) for trend lines, horizontal lines, rectangles and text notes.
- `fibonacci` items have the anchors and the resolved options of a Fibonacci tool in chart coordinates. Paint them with your own Fibonacci renderer; the tools do not draw them for you.
- `preview` items show the drawing being placed and the snap indicator, and `handles` items the handles of the selected drawings.

Every `shape` and `fibonacci` item has its `state` (`normal`, `hover`, `selected` or `locked`) and the style resolved from the theme.

## Transforms

The transforms are the part of the contract that is easiest to get subtly wrong. Keep these rules:

- `timeToX` and `xToTime` are exact inverses, and so are `priceToY` and `yToPrice` for one y-axis. The conformance suite accepts a round trip that lands within 0.5 px.
- `timeToX` is linear beyond the last bar: a drawing may be anchored in the future space and must stay where it was when the chart scrolls.
- Convert to plot coordinates. If your chart reports positions relative to the page or to the canvas, subtract the origin of the plot area before you pass a point on, and add it back when you paint.
- Answer for the current frame. After zoom, scroll, resize or a new timeframe call the listeners of `onViewportChange`; the tools then compute their geometry again with your new transforms.

## Events

- `onPointer` receives every pointer event over the whole plot area, including the events of a drag that leaves the plot: send `up`, `cancel` or `leave` so a drag in progress can end. Report `pointerType` (`mouse`, `touch` or `pen`) as the device says: the tools use a larger hit tolerance for touch.
- `onKey` is for the keys that go to the chart while it has the focus. Return the result of the listener to your event handling: when it is `true`, call `preventDefault()`. Do not forward the key when an input outside the chart has the focus.
- Every `on...` member returns the function that removes the listener. The tools call it when you destroy them.

## The overlay pass

The tools never draw. Your chart runs one overlay pass after it has painted its own layers:

1. Call `tools.getScene()`.
2. Paint the items in the order they come, clipped to the plot area. A `shape` item is a list of pixel shapes with its resolved `style`, `opacity` and `state`; a `handles` item is a list of points to draw as grab handles, or as lock markers when `locked` is set.
3. When `requestRender()` is called, schedule that pass. Do not paint from inside `requestRender()`: it can be called many times in one frame, so coalesce the calls into one animation frame.

## Fibonacci items

The four Fibonacci tools reach your chart as `fibonacci` items, in data space, so that your own Fibonacci renderer draws them with the line styles and labels of your chart (decision D-3). An item has the `kind`, the `anchors` (time and price, with the `yAxisId`) and the `options` with every key resolved:

| Kind | What the renderer draws |
| --- | --- |
| `fibonacci-retracement` | One horizontal line for each level at `from + (to − from) × ratio` (the line is mirrored when `reverse` is set), between the two anchors in time, extended to the left or right when `extendLeft` or `extendRight` is set. The label holds the ratio and, with `showPrices`, the price. |
| `fibonacci-arcs` | For each level a circle around the second anchor with a radius of the ratio times the pixel distance of the two anchors; a half circle that faces the first anchor, or a full circle when `fullCircles` is set. |
| `fibonacci-fans` | For each level a ray from the first anchor through the second anchor's x at the level price, clipped to the pane. |
| `fibonacci-time-zones` | A vertical line at `t1 + n × (t2 − t1)` for each number `n` in `sequence`, across the pane. |

If you would rather not write this yourself, `geometryOf(drawing, host)` from the core returns the same pixel shapes the tools use for hit testing, and your renderer can paint those.

### Check your renderer against the shared fixture

`keystone-financial-tools-core/testing` exports `FIBONACCI_PARITY` (version `FIBONACCI_PARITY_VERSION`). It holds the scales of a mock chart and cases for all four kinds, each with the drawing, the expected level prices (or radii or times) and the expected pixel lines, arcs and times. Build a host from `scales`, give your renderer each `drawing`, and compare what it draws with `shapes` and `levels`. Labels are not part of the fixture, because every chart draws its own. The core tests use the same fixture, so your renderer and the tools agree to within 1e-9.

```ts
import { FIBONACCI_PARITY } from 'keystone-financial-tools-core/testing';

const { scales, cases } = FIBONACCI_PARITY;
const chart = createTestChart({ width: scales.width, pane: scales.pane, barInterval: scales.barInterval, pxPerBar: scales.pxPerBar, startTime: scales.startTime });

for (const { name, drawing, shapes } of cases) {
  it(name, () => {
    expect(chart.renderFibonacci(drawing)).toEqual(shapes);
  });
}
```

`createTestChart` and `renderFibonacci` stand for your own chart and renderer. Use a tolerance such as Vitest's `toBeCloseTo` where your renderer rounds.

## Test your host

`keystone-financial-tools-core/testing` has `createMockHost`, a host with pointer, key and viewport events you can trigger from a test. It also has `runHostConformance`, the suite that checks your host against the contract: pass it a factory that makes your chart, the means to fire events, and your runner (Vitest's or Jest's `describe`, `it` and `expect`). Run it in the continuous integration of your chart. The `apps/playground` package of this repository is a complete reference host: a minimal canvas chart that implements the contract.

```ts
import { describe, it, expect } from 'vitest';
import { runHostConformance } from 'keystone-financial-tools-core/testing';

runHostConformance(
  () => ({
    host: chart.drawingHost,
    yAxisIds: ['price'],
    lastBarTime: chart.lastBarTime,
    changeViewport: () => chart.zoom(2),
    firePointer: (event) => chart.dispatchPointer(event),
    fireKey: (event) => chart.dispatchKey(event),
  }),
  { describe, it, expect },
);
```

## Next

Connect the tools to your framework with a [getting started](/getting-started/typescript/) page, and read the [keyboard reference](/guides/keyboard/) for the keys your `onKey` listener passes on. To add a toolbar, see [Build a toolbar](/guides/toolbar/).
