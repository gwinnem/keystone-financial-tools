# keystone-financial-tools-react

React adapter for the Keystone drawing tools. It only shows what `keystone-financial-tools-core`
decides (the controller and its state); it has no drawing logic of its own.

## `useDrawingTools(host, options?)`

Creates the drawing tools for a chart host and re-renders on every change of state, drawings or text
editing.

```tsx
import { KeystoneTextEditor, useDrawingTools } from 'keystone-financial-tools-react';

export function Toolbar({ host }: { host: DrawingHost | null }): JSX.Element {
  const { state, drawings, activate, undo, redo, textEdit } = useDrawingTools(host);
  return (
    <div>
      <button onClick={() => activate('trend-line')}>Trend line</button>
      <button disabled={!state.canUndo} onClick={() => undo()}>Undo</button>
      <button disabled={!state.canRedo} onClick={() => redo()}>Redo</button>
      <span>{drawings.length} drawings</span>
      <KeystoneTextEditor session={textEdit} />
    </div>
  );
}
```

- It returns `tools` (the controller, `null` until a host exists), `store`, `state`, `toolbar`, `messages`,
  `drawings`, `textEdit`, `announcement` and the actions `activate`, `deactivate`, `select`, `clearSelection`, `remove`, `undo`,
  `redo`, `setMagnet`, `setTheme` and `setOptions`. Without a host the state is idle and the actions
  do nothing (`undo` and `redo` return `false`).
- `host` can be `null` or `undefined`. A new host gets a new controller; the old one is destroyed.
- The controller is created in an effect, so React StrictMode creates and destroys one per mount and
  leaves no listeners on the host.
- `options` are those of `createDrawingTools`. They are read when the controller is created; change
  them later with `setTheme`, `setMagnet` and `setOptions`.
- `editText` left out gives the default text editor (show it with `KeystoneTextEditor`), a function
  replaces it and `false` means no editor. A host that has its own `editText` always wins.

### A toolbar

`toolbar` has one entry for each tool (`id`, `labelKey`, `group`, `icon`, `shortcut`, `tier`, and `active` and
`enabled`); it is the same array until an entry changes, and every entry is disabled until there is a host.
Render a button for each and call `activate(tool.id)`. Alt with T, H, R, F or N chooses a tool (change them
with the `shortcuts` option, `null` turns one off), and Ctrl or Cmd with Z undoes. `enabled` follows the
`tools` option. `TOOL_CATALOG` and the types `ToolbarEntry`, `ToolCatalogEntry`, `ToolGroup`, `ToolTier` and
`ShortcutOptions` are exported from this package.

```tsx
{toolbar.map((tool) => (
  <button key={tool.id} disabled={!tool.enabled} aria-pressed={tool.active} title={tool.shortcut ?? ''} onClick={() => activate(tool.id)}>
    {messages[tool.labelKey]}
  </button>
))}
```

### Translate the texts

Every text comes from one table (NFR-I18N-001): `DEFAULT_MESSAGES` has the English text of the tool labels
(`tool.<kind>`), the toolbar groups (`group.<group>`), `toolbar.label`, and the note editor (`editor.note`,
`editor.confirm`, `editor.cancel`). Put your texts over them with the `messages` option; a key that is not in the
table, or an empty text, throws a `RangeError`. `messages` is the result, a plain object that is there from the
first render, also before there is a host, and that is read once like the other options:

```tsx
const { toolbar, messages, textEdit } = useDrawingTools(host, { messages: { 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' } });
// ...
<KeystoneTextEditor session={textEdit} label={messages['editor.note']} />
```

### Announcements

The tools say what the person did (a drawing placed, selected, deleted, undone or redone) so that a screen reader
user knows (NFR-A11Y-001). `useDrawingTools` returns the latest message as `announcement` (an empty string until
there is one); render it once with `KeystoneLiveRegion`, a visually hidden polite live region (`aria-live="polite"`,
`aria-atomic="true"`). A message that repeats is read again. The texts are the `announce.*` keys of the messages, so
they can be translated. Turn it off with `announcements: false`. `LIVE_REGION_ATTRIBUTES`, `VISUALLY_HIDDEN_STYLE`,
`liveRegionText` and `formatMessage` are exported for your own region.

```tsx
<KeystoneLiveRegion message={announcement} />
```

### The public API of the core

This package exports everything of the core that an application needs (types, constants, validation, document
import, shortcut and message helpers, `DrawingStore`, `createDrawingTools` and more), so you never import from
`keystone-financial-tools-core`. What it leaves out is the engine behind the tools (geometry, hit-testing, the
interaction machine, snapping and the history internals); a test of the repository (FR-FW-050) fails when the core
gets an export that this package neither exports nor lists as left out.

## `KeystoneTextEditor`

A textarea at the position of the note being edited. Place it inside the chart's positioned element.
Ctrl or Cmd with Enter confirms, Escape cancels and leaving the textarea confirms. Keys and pointer
events stop at the textarea, so they do not reach the chart. The text is never read as HTML. It has
the accessible name `Note text` (`DEFAULT_MESSAGES['editor.note']`); pass `label` to change it, for example
`messages['editor.note']`. Focus moves into the textarea and goes
back when it closes.

## `useDrawings(store?)`

Returns `{ store, drawings }` and re-renders on every store change. Without a store argument it
creates an empty one and keeps it across renders.

```tsx
const { drawings } = useDrawings();
```
