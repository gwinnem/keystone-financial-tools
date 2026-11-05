---
title: Trend line
description: A straight line through two anchors that can be extended to the left or to the right.
---

A trend line is a straight line through two anchors. Both anchors are on the same y-axis, so a trend line belongs to one pane.

## Place it

```ts
tools.activate('trend-line');
```

Click the first anchor and then the second, or press at the first, drag and release at the second. With the keyboard, move the keyboard cursor with the arrow keys and place each anchor with Enter. Hold Shift while you place the second anchor to keep the angle to 45 degree steps. With the magnet on, anchors snap to the nearest bar. See the [keyboard reference](/guides/keyboard/).

## Try it

The chart below has only the trend line enabled, and the tool is already active. Click to place the anchors, or Tab to the chart and use the keyboard. It works with touch too.

<iframe src="/playground/embed.html?tool=trend-line" title="Trend line example" width="100%" height="560" loading="lazy"></iframe>

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `extendLeft` | `false` | Extends the line to the left edge of the pane. |
| `extendRight` | `false` | Extends the line to the right edge of the pane. |

## Example

Add a trend line from code, for example to restore a saved analysis:

```ts
import { createId } from 'keystone-financial-tools-core';

store.add({
  id: createId(),
  kind: 'trend-line',
  anchors: [
    { time: Date.UTC(2026, 9, 1), price: 100, yAxisId: 'price' },
    { time: Date.UTC(2026, 9, 9), price: 112, yAxisId: 'price' },
  ],
  options: { extendRight: true },
  style: { color: '#e91e63', lineWidth: 2, lineStyle: 'dashed' },
});
```

Colors, line width and line style come from the theme. Override them for one drawing with `style`.
