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

- It returns `tools` (the controller, `null` until a host exists), `store`, `state`, `drawings`,
  `textEdit` and the actions `activate`, `deactivate`, `select`, `clearSelection`, `remove`, `undo`,
  `redo`, `setMagnet`, `setTheme` and `setOptions`. Without a host the state is idle and the actions
  do nothing (`undo` and `redo` return `false`).
- `host` can be `null` or `undefined`. A new host gets a new controller; the old one is destroyed.
- The controller is created in an effect, so React StrictMode creates and destroys one per mount and
  leaves no listeners on the host.
- `options` are those of `createDrawingTools`. They are read when the controller is created; change
  them later with `setTheme`, `setMagnet` and `setOptions`.
- `editText` left out gives the default text editor (show it with `KeystoneTextEditor`), a function
  replaces it and `false` means no editor. A host that has its own `editText` always wins.

## `KeystoneTextEditor`

A textarea at the position of the note being edited. Place it inside the chart's positioned element.
Ctrl or Cmd with Enter confirms, Escape cancels and leaving the textarea confirms. Keys and pointer
events stop at the textarea, so they do not reach the chart. The text is never read as HTML. It has
the accessible name `Note text`; pass `label` to change it. Focus moves into the textarea and goes
back when it closes.

## `useDrawings(store?)`

Returns `{ store, drawings }` and re-renders on every store change. Without a store argument it
creates an empty one and keeps it across renders.

```tsx
const { drawings } = useDrawings();
```
