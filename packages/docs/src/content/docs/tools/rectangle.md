---
title: Rectangle
description: A rectangle between two opposite corners, with an optional fill.
---

A rectangle has two anchors, the opposite corners of the box.

## Place it

```ts
tools.activate('rectangle');
```

Click the first corner and then the opposite one, or press at the first, drag and release at the second. With the keyboard, move the keyboard cursor with the arrow keys and place each corner with Enter. See the [keyboard reference](/guides/keyboard/).

## Options

A rectangle has no options of its own. Its look comes from `style`: `color` and `lineWidth` for the border, `fillColor` and `fillOpacity` (0 to 1) for the fill. A rectangle can only be hit inside its body when `fillOpacity` is above 0; otherwise you select it by its border.

## Example

```ts
import { createId } from 'keystone-financial-tools-core';

store.add({
  id: createId(),
  kind: 'rectangle',
  anchors: [
    { time: Date.UTC(2026, 9, 1), price: 98, yAxisId: 'price' },
    { time: Date.UTC(2026, 9, 9), price: 108, yAxisId: 'price' },
  ],
  style: { fillColor: '#2962ff', fillOpacity: 0.15 },
});
```
