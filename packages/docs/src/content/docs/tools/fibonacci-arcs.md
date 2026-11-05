---
title: Fibonacci arcs
description: Arcs around the second anchor at Fibonacci fractions of the distance between the anchors.
---

Fibonacci arcs have two anchors. For each visible level they have an arc around the second anchor with a radius of `ratio` times the distance between the anchors in pixels, so the arcs keep their shape on screen at every zoom. Half circles face the first anchor.

In the scene the tool is one `fibonacci` item with its anchors and every option resolved, hidden levels included. The chart paints it with its own Fibonacci renderer; the tools use the arcs above for hit-testing and handles.

## Place it

```ts
tools.activate('fibonacci-arcs');
```

Click the first anchor and then the second, or press at the first, drag and release at the second. With the keyboard, move the keyboard cursor with the arrow keys and place each anchor with Enter. See the [keyboard reference](/guides/keyboard/).

## Try it

The chart below has only the Fibonacci arcs enabled, and the tool is already active. Click to place the two anchors, or Tab to the chart and use the keyboard. It works with touch too. The example page draws the arcs as a line between the anchors; your chart's own renderer draws the arcs.

<iframe src="/playground/embed.html?tool=fibonacci-arcs" title="Fibonacci arcs example" width="100%" height="560" loading="lazy"></iframe>

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `levels` | 0.382, 0.5 and 0.618 visible | The levels, at most 24, each with a unique `ratio`, a `visible` flag and an optional `color`. |
| `fullCircles` | `false` | Draws full circles instead of half circles. |
| `showLabels` | `true` | Labels each arc with its ratio. |

## Example

```ts
import { createId } from 'keystone-financial-tools-core';

store.add({
  id: createId(),
  kind: 'fibonacci-arcs',
  anchors: [
    { time: Date.UTC(2026, 9, 1), price: 100, yAxisId: 'price' },
    { time: Date.UTC(2026, 9, 9), price: 112, yAxisId: 'price' },
  ],
  options: { fullCircles: true },
});
```
