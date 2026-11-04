---
title: Fibonacci time zones
description: Vertical lines at Fibonacci multiples of the time between two anchors.
---

Fibonacci time zones have two anchors. With the unit `t2 - t1`, the tool has a vertical line across the pane at `t1 + n * unit` for each `n` in the sequence. A negative unit runs to the left. Lines outside the pane are left out, and so is everything when both anchors have the same time. Prices play no part.

In the scene the tool is one `fibonacci` item with its anchors and every option resolved. The chart paints it with its own Fibonacci renderer; the tools use the lines above for hit-testing and handles.

## Place it

```ts
tools.activate('fibonacci-time-zones');
```

Click the first anchor and then the second, or press at the first, drag and release at the second. With the keyboard, move the keyboard cursor with the arrow keys and place each anchor with Enter. See the [keyboard reference](/guides/keyboard/).

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `sequence` | 0, 1, 2, 3, 5, 8, 13, 21, 34, 55 and 89 | The multiples of the unit: non-negative integers, strictly ascending, at most 32. |
| `showLabels` | `true` | Labels each line with its multiple. |

## Example

```ts
import { createId } from 'keystone-financial-tools-core';

store.add({
  id: createId(),
  kind: 'fibonacci-time-zones',
  anchors: [
    { time: Date.UTC(2026, 9, 1), price: 100, yAxisId: 'price' },
    { time: Date.UTC(2026, 9, 3), price: 100, yAxisId: 'price' },
  ],
  options: { sequence: [0, 1, 2, 3, 5, 8, 13] },
});
```
