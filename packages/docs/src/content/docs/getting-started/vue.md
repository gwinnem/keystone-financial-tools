---
title: Vue
description: Use the drawing tools in a Vue 3 chart with the useDrawingTools composable.
---

`keystone-financial-tools-vue` has composables and a text editor component for Vue 3. It shows what the core decides in refs and has no drawing logic of its own.

## Install

The packages are published to npm by hand at release time. Until the first release they are private: inside this repository, add `"keystone-financial-tools-vue": "workspace:*"` to your package.

## Use the composable

`useDrawingTools(host, options?)` creates the tools for a chart that implements the [host contract](/guides/host/) and keeps their state in refs.

```vue
<script setup lang="ts">
import { KeystoneTextEditor, useDrawingTools } from 'keystone-financial-tools-vue';

const props = defineProps<{ host: DrawingHost }>();
const { state, drawings, textEdit, activate, undo } = useDrawingTools(props.host, { magnet: 'weak' });
</script>

<template>
  <div class="chart" style="position: relative">
    <!-- the chart -->
    <button @click="activate('trend-line')">Trend line</button>
    <button :disabled="!state.canUndo" @click="undo()">Undo</button>
    <span>{{ drawings.length }} drawings</span>
    <KeystoneTextEditor :session="textEdit" />
  </div>
</template>
```

## What you get

- `tools`: the controller, for `getScene()`, `hitTest()` and `on()`.
- `store` and `drawings`: the store (the one in `options.store`, or a new one) and a ref with its drawings.
- `state`: a ref with the state of the tools (`activeTool`, `interaction`, `selection`, `hover`, `canUndo`, `canRedo`, `magnet`, `toolbar`).
- `toolbar`: a ref with one entry for each tool, see below.
- `textEdit`: a ref with the text editor that is open, or `null`.
- The actions `activate`, `deactivate`, `select`, `clearSelection`, `remove`, `undo`, `redo`, `setMagnet`, `setTheme` and `setOptions`.

The tools are destroyed, and the listeners on the host removed, when the component is disposed.

## Text notes

A host that has its own `editText` is used as it is. For a host without one, show `KeystoneTextEditor` with `textEdit` inside the element that holds the chart (give it `position: relative`). Ctrl or Cmd with Enter confirms, Escape cancels and leaving the textarea confirms. Pass `editText` in the options to use your own editor, or `editText: false` for none.

## Build a toolbar

`toolbar` has one entry for each tool with its `active` and `enabled` flags and its shortcut. It is the same array until an entry changes.

```vue
<template>
  <div role="toolbar" aria-label="Drawing tools">
    <button v-for="tool in toolbar" :key="tool.id" :disabled="!tool.enabled" :aria-pressed="tool.active" :title="tool.shortcut ?? ''" @click="activate(tool.id)">
      {{ tool.id }}
    </button>
  </div>
</template>
```

Alt with T, H, R, F or N chooses a tool, and Ctrl or Cmd with Z undoes. The [toolbar guide](/guides/toolbar/) has the catalog and the `shortcuts` option.

## Next

- [Implement a host](/guides/host/) for your chart.
- [Save and load drawings](/guides/persistence/) with a repository.
- [Build a toolbar](/guides/toolbar/) from the tool catalog.
- The [keyboard reference](/guides/keyboard/) lists every key.
- Each tool has a page, for example the [text note](/tools/text-note/).
