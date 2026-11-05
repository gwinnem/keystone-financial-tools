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
- `tools.getState().toolbar`: the model of a toolbar, see below.
- `tools.getState()` and the events `change`, `selection`, `tool`, `interaction`, `state`, `blocked` and `error`.
- `tools.getScene()` and `tools.hitTest(x, y)` for the overlay of the chart.
- The tools never throw into the host: failures arrive as `error` events and leave the store unchanged.

## Build a toolbar

`state.toolbar` has one entry for each tool with its `active` and `enabled` flags and its shortcut. Render a button for each and render again on the `state` event.

```ts
function renderToolbar(): void {
  bar.replaceChildren(
    ...tools.getState().toolbar.map((tool) => {
      const button = document.createElement('button');
      button.textContent = tool.id;
      button.disabled = !tool.enabled;
      button.setAttribute('aria-pressed', String(tool.active));
      button.onclick = () => tools.activate(tool.id);
      return button;
    })
  );
}

tools.on('state', renderToolbar);
renderToolbar();
```

Alt with T, H, R, F or N chooses a tool, and Ctrl or Cmd with Z undoes. The [toolbar guide](/guides/toolbar/) has the catalog and the `shortcuts` option.

## Try the demo

The playground in `apps/playground` has this page as a working chart with two panes, zoom and scroll, a toolbar built from the toolbar state, undo and redo, the magnet and drawings that survive a reload. Run `pnpm --filter keystone-financial-tools-playground dev` and open `http://localhost:4173/`; the code is in `apps/playground/src/main.ts`. The same page exists for [Vue](/getting-started/vue/), [React](/getting-started/react/) and [Angular](/getting-started/angular/).

## Next

- [Implement a host](/guides/host/) for your chart.
- [Save and load drawings](/guides/persistence/) with a repository.
- [Build a toolbar](/guides/toolbar/) from the tool catalog.
- The [keyboard reference](/guides/keyboard/) lists every key.
- Each tool has a page, for example the [trend line](/tools/trend-line/).
