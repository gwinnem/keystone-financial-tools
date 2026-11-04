---
title: Fibonacci retracement
description: Horizontal lines at Fibonacci levels between two prices, with ratio and price labels.
---

A Fibonacci retracement has two anchors. For each visible level it has a horizontal line at `p1 + (p2 - p1) * ratio`, from the left to the right anchor, with a label.

In the scene the tool is one `fibonacci` item with its anchors and every option resolved, hidden levels included. The chart paints it with its own Fibonacci renderer; the tools use the lines above for hit-testing and handles.

## Place it

```ts
tools.activate('fibonacci-retracement');
```

Click the first anchor and then the second, or press at the first, drag and release at the second. With the keyboard, move the keyboard cursor with the arrow keys and place each anchor with Enter. See the [keyboard reference](/guides/keyboard/).

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `levels` | 0, 0.236, 0.382, 0.5, 0.618, 0.786 and 1 visible; 1.272, 1.618, 2.618 and 4.236 hidden | The levels, at most 24, each with a unique `ratio`, a `visible` flag and an optional `color`. |
| `reverse` | `false` | Measures from the second anchor back to the first. |
| `extendLeft` | `false` | Extends the lines to the left edge of the pane. |
| `extendRight` | `false` | Extends the lines to the right edge of the pane. |
| `showLabels` | `true` | Labels each line with its ratio. |
| `showPrices` | `true` | Labels each line with its price. With `showLabels` the label reads `0.618 (111.80)`. |

## Example

```ts
import { createId } from 'keystone-financial-tools-core';

store.add({
  id: createId(),
  kind: 'fibonacci-retracement',
  anchors: [
    { time: Date.UTC(2026, 9, 1), price: 100, yAxisId: 'price' },
    { time: Date.UTC(2026, 9, 9), price: 120, yAxisId: 'price' },
  ],
  options: {
    extendRight: true,
    levels: [
      { ratio: 0.382, visible: true },
      { ratio: 0.618, visible: true, color: '#f7525f' },
      { ratio: 1.618, visible: true },
    ],
  },
});
```
