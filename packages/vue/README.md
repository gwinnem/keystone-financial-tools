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
  `canRedo`, `magnet`, `toolbar`).
- `toolbar`: a ref with one entry for each tool (`id`, `labelKey`, `group`, `icon`, `shortcut`, `tier`, and
  `active` and `enabled`); the same array until an entry changes. See [A toolbar](#a-toolbar).
- `messages`: every user-visible text, the English ones with the `messages` option over them (a plain object).
  See [Translate the texts](#translate-the-texts).
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

### A toolbar

Render a button for each entry of `toolbar` and call `activate(tool.id)`. Alt with T, H, R, F or N
chooses a tool (change them with the `shortcuts` option, `null` turns one off), and Ctrl or Cmd with Z
undoes. `enabled` follows the `tools` option. `TOOL_CATALOG` and the types `ToolbarEntry`,
`ToolCatalogEntry`, `ToolGroup`, `ToolTier` and `ShortcutOptions` are exported from this package.

```vue
<button v-for="tool in toolbar" :key="tool.id" :disabled="!tool.enabled" :aria-pressed="tool.active" :title="tool.shortcut ?? ''" @click="activate(tool.id)">
  {{ messages[tool.labelKey] }}
</button>
```

### Translate the texts

Every text comes from one table (NFR-I18N-001): `DEFAULT_MESSAGES` has the English text of the tool
labels (`tool.<kind>`), the toolbar groups (`group.<group>`), `toolbar.label`, and the note editor
(`editor.note`, `editor.confirm`, `editor.cancel`). Put your texts over them with the `messages` option; a
key that is not in the table, or an empty text, throws a `RangeError`. Read the result from `messages`:

```vue
<script setup lang="ts">
const { toolbar, messages, textEdit } = useDrawingTools(props.host, { messages: { 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' } });
</script>

<template>
  <KeystoneTextEditor :session="textEdit" :label="messages['editor.note']" />
</template>
```

### The public API of the core

This package exports everything of the core that an application needs (types, constants, validation,
document import, shortcut and message helpers, `DrawingStore`, `createDrawingTools` and more), so you
never import from `keystone-financial-tools-core`. What it leaves out is the engine behind the tools
(geometry, hit-testing, the interaction machine, snapping and the history internals); a test of the
repository (FR-FW-050) fails when the core gets an export that this package neither exports nor lists
as left out.

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
- `label` on the component sets the accessible name of the textarea; it is `messages['editor.note']` for
  your own texts.

## `useDrawings(store?)`

Returns `{ store, drawings }`: `drawings` is a ref with the current list, replaced on every store
change. Without a store argument it creates an empty one. The subscription ends when the component
(effect scope) is disposed. `useDrawingTools` uses it for `store` and `drawings`.
