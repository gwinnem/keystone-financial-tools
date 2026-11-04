---
title: Horizontal line
description: A line across the pane at one price, with a price label.
---

A horizontal line has one anchor. It runs across the pane at the price of the anchor, and has a label with that price.

## Place it

```ts
tools.activate('horizontal-line');
```

Click where the line should be. With the keyboard, move the keyboard cursor with the arrow keys and place the anchor with Enter. See the [keyboard reference](/guides/keyboard/).

## Options

A horizontal line has no options of its own. The label shows the price with two decimals; pass `priceFormatter` to `createDrawingTools` to format it your way.

## Example

```ts
import { createId } from 'keystone-financial-tools-core';

store.add({
  id: createId(),
  kind: 'horizontal-line',
  anchors: [{ time: Date.UTC(2026, 9, 1), price: 104.5, yAxisId: 'price' }],
  style: { color: '#2962ff', lineStyle: 'dotted' },
});
```

Colors, line width and line style come from the theme. Override them for one drawing with `style`.
