# keystone-financial-tools-vue

Vue 3 composables and a component for the Keystone drawing tools.

## `useDrawingTools(host, options?)`

Creates the drawing tools for a chart that implements `DrawingHost` and keeps their state in refs.
It takes the options of `createDrawingTools` and returns:

- `tools`: the controller. Call `tools.getScene()` and `tools.hitTest()` from the chart's overlay,
  and `tools.on(...)` for events.
- `store` and `drawings`: the store (the one in `options.store`, or a new one) and a ref with its
  drawings.
- `state`: a ref with the tools' state (`activeTool`, `interaction`, `selection`, `hover`, `canUndo`,
  `canRedo`, `magnet`).
- `textEdit`: a ref with the text editor that is open, or `null`.
- The actions `activate`, `deactivate`, `select`, `clearSelection`, `remove`, `undo`, `redo`,
  `setMagnet`, `setTheme` and `setOptions`.

The tools are destroyed, and the listeners on the host removed, when the component (effect scope)
is disposed.

```vue
<script setup lang="ts">
import { KeystoneTextEditor, useDrawingTools } from 'keystone-financial-tools-vue';

const props = defineProps<{ host: DrawingHost }>();
const { state, drawings, textEdit, activate, undo } = useDrawingTools(props.host, { magnet: 'weak' });
</script>

<template>
  <div class="chart" style="position: relative">
    <!-- the chart -->
    <button :disabled="!state.canUndo" @click="undo()">Undo</button>
    <button @click="activate('trend-line')">Trend line</button>
    <KeystoneTextEditor :session="textEdit" />
  </div>
</template>
```

### The text editor

A text note is edited in a textarea. A host that has its own `editText` is used as it is. For a host
without one, `useDrawingTools` has a default editor: render `KeystoneTextEditor` with `textEdit`
inside the element that holds the chart (give it `position: relative`). Ctrl or Cmd with Enter
confirms, Escape cancels, and leaving the textarea confirms. Key and pointer events in the textarea
do not reach the chart.

- `editText: (request) => Promise<string | null>` in the options replaces the default editor.
- `editText: false` means no editor: a new note stays empty.
- To build your own editor, show `textEdit.value` (its `request` has the text and the position) and
  call `confirm(text)` or `cancel()` on it.
- `label` on the component sets the accessible name of the textarea.

## `useDrawings(store?)`

Returns `{ store, drawings }`: `drawings` is a ref with the current list, replaced on every store
change. Without a store argument it creates an empty one. The subscription ends when the component
(effect scope) is disposed. `useDrawingTools` uses it for `store` and `drawings`.
