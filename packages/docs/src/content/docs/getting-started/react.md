---
title: React
description: Use the drawing tools in a React chart with the useDrawingTools hook.
---

`keystone-financial-tools-react` has hooks and a text editor component for React. It shows what the core decides and has no drawing logic of its own.

## Install

The packages are published to npm by hand at release time. Until the first release they are private: inside this repository, add `"keystone-financial-tools-react": "workspace:*"` to your package.

## Use the hook

`useDrawingTools(host, options?)` creates the tools for a chart host and re-renders on every change of state, drawings or text editing. `host` can be `null` or `undefined` until the chart exists.

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

## What you get

- `tools` (the controller, `null` until a host exists), `store`, `state`, `drawings` and `textEdit`.
- The actions `activate`, `deactivate`, `select`, `clearSelection`, `remove`, `undo`, `redo`, `setMagnet`, `setTheme` and `setOptions`. Without a host the state is idle and the actions do nothing.
- A new host gets a new controller and the old one is destroyed. The controller is created in an effect, so React StrictMode leaves no listeners on the host.
- `options` are those of `createDrawingTools` and are read when the controller is created; change them later with `setTheme`, `setMagnet` and `setOptions`.

## Text notes

`KeystoneTextEditor` is a textarea at the position of the note being edited. Place it inside the element that holds the chart. Ctrl or Cmd with Enter confirms, Escape cancels and leaving the textarea confirms. Pass `editText` in the options to use your own editor, or `editText: false` for none. A host that has its own `editText` always wins.

## Next

- [Implement a host](/guides/host/) for your chart.
- [Save and load drawings](/guides/persistence/) with a repository.
- The [keyboard reference](/guides/keyboard/) lists every key.
- Each tool has a page, for example the [rectangle](/tools/rectangle/).
