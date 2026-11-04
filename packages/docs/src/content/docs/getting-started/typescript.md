---
title: TypeScript
description: Use the drawing tools from plain TypeScript or JavaScript with keystone-financial-tools-typescript.
---

`keystone-financial-tools-typescript` is the framework-free package. It re-exports `keystone-financial-tools-core` (the drawing model, the store and the controller) and adds persistence.

## Install

The packages are published to npm by hand at release time. Until the first release they are private: inside this repository, add `"keystone-financial-tools-typescript": "workspace:*"` to your package.

## Create the tools

You need a chart that implements the [host contract](/guides/host/). Give it to `createDrawingTools` and the controller is ready.

```ts
import { createDrawingTools, DrawingStore } from 'keystone-financial-tools-typescript';

const store = new DrawingStore();
const tools = createDrawingTools(host, { store, magnet: 'weak' });

// The state is a new object whenever a value in it changes.
tools.on('state', (state) => {
  undoButton.disabled = !state.canUndo;
});

tools.activate('trend-line');
```

Then draw what the controller says. When the host asks for a redraw of its overlay, paint the scene:

```ts
for (const item of tools.getScene()) paint(item);
```

When the chart goes away, release the host:

```ts
tools.destroy();
```

## What you get

- `tools.activate(kind)`, `deactivate()`, `select(ids)`, `clearSelection()`, `remove(ids)`, `undo()`, `redo()`, `setMagnet(mode)`, `setTheme(theme)` and `setOptions(options)`.
- `tools.getState()` and the events `change`, `selection`, `tool`, `interaction`, `state`, `blocked` and `error`.
- `tools.getScene()` and `tools.hitTest(x, y)` for the overlay of the chart.
- The tools never throw into the host: failures arrive as `error` events and leave the store unchanged.

## Next

- [Implement a host](/guides/host/) for your chart.
- [Save and load drawings](/guides/persistence/) with a repository.
- The [keyboard reference](/guides/keyboard/) lists every key.
- Each tool has a page, for example the [trend line](/tools/trend-line/).
