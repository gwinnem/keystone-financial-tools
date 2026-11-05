---
title: Fibonacci fans
description: Rays from the first anchor through Fibonacci levels of the move to the second anchor.
---

Fibonacci fans have two anchors. For each visible level they have a ray from the first anchor through the point at the time of the second anchor and the price `p2 + (p1 - p2) * ratio`, clipped to the pane. A ray without a direction, or one that misses the pane, is left out.

In the scene the tool is one `fibonacci` item with its anchors and every option resolved, hidden levels included. The chart paints it with its own Fibonacci renderer; the tools use the rays above for hit-testing and handles.

## Place it

```ts
tools.activate('fibonacci-fans');
```

Click the first anchor and then the second, or press at the first, drag and release at the second. With the keyboard, move the keyboard cursor with the arrow keys and place each anchor with Enter. Hold Shift while you place the second anchor to keep the angle to 45 degree steps. See the [keyboard reference](/guides/keyboard/).

## Try it

The chart below has only the Fibonacci fans enabled, and the tool is already active. Click to place the two anchors, or Tab to the chart and use the keyboard. It works with touch too. The example page draws the fans as a line between the anchors; your chart's own renderer draws the fans.

<iframe src="/playground/embed.html?tool=fibonacci-fans" title="Fibonacci fans example" width="100%" height="560" loading="lazy"></iframe>

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `levels` | 0.382, 0.5 and 0.618 visible | The levels, at most 24, each with a unique `ratio`, a `visible` flag and an optional `color`. |
| `showLabels` | `true` | Labels each ray with its ratio. |

## Example

```ts
import { createId } from 'keystone-financial-tools-core';

store.add({
  id: createId(),
  kind: 'fibonacci-fans',
  anchors: [
    { time: Date.UTC(2026, 9, 1), price: 100, yAxisId: 'price' },
    { time: Date.UTC(2026, 9, 9), price: 120, yAxisId: 'price' },
  ],
  options: { levels: [{ ratio: 0.5, visible: true }, { ratio: 0.786, visible: true, color: '#f7525f' }] },
});
```
