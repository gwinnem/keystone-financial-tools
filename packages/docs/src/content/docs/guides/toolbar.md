---
title: Build a toolbar
description: The tool catalog, the toolbar state each package gives you, and the keyboard shortcuts that choose a tool.
---

The drawing tools come without a toolbar, so it looks like the rest of your application. What they give you is a model: a list of the tools, which one is active, which ones can be used, and the key that chooses each. You render it with your own buttons.

## The toolbar state

`state.toolbar` of the controller is an array with one entry for each tool, in the order below. Every package gives it to you directly: `toolbar` of `useDrawingTools` in Vue (a ref) and React, `toolbar` and `toolbar$` of `KeystoneDrawingToolsService` in Angular, and `tools.getState().toolbar` in plain TypeScript. It is the same array until an entry changes, so it is cheap to render.

An entry has these fields:

| Field | What it is |
| --- | --- |
| `id` | The drawing kind. Pass it to `activate`. |
| `labelKey` | The key of the label in your own translations, `tool.` and the kind. |
| `group` | `lines`, `shapes`, `fibonacci` or `annotations`, for grouping the buttons. |
| `icon` | The name of the icon, the kind. Map it to your own icons. |
| `shortcut` | The key that chooses the tool, for example `Alt+T`, or `null` when it has none. |
| `tier` | `community` or `professional`. |
| `active` | `true` for the tool that places drawings now. |
| `enabled` | `true` when the tool can be activated. |

The static list without `active` and `enabled` is `TOOL_CATALOG`, exported by every package. It is useful for building a menu before the tools exist.

## The tools

| Tool | Group | Shortcut | Tier |
| --- | --- | --- | --- |
| `trend-line` | lines | Alt+T | community |
| `horizontal-line` | lines | Alt+H | community |
| `rectangle` | shapes | Alt+R | community |
| `fibonacci-retracement` | fibonacci | Alt+F | professional |
| `fibonacci-arcs` | fibonacci | none | professional |
| `fibonacci-fans` | fibonacci | none | professional |
| `fibonacci-time-zones` | fibonacci | none | professional |
| `text-note` | annotations | Alt+N | community |

The tier is a proposal until the licensing is decided. The toolbar does not check a licence yet: `enabled` follows the `tools` option, so a tool you leave out of `tools` is shown disabled and `activate` refuses it. Change it at run time with `setOptions({ tools })`.

## Render it

A button for each entry, disabled when the tool is not enabled, and pressed when it is active:

```ts
for (const tool of tools.getState().toolbar) {
  const button = document.createElement('button');
  button.disabled = !tool.enabled;
  button.setAttribute('aria-pressed', String(tool.active));
  button.title = tool.shortcut ?? '';
  button.onclick = () => tools.activate(tool.id);
  button.textContent = translate(tool.labelKey);
  bar.append(button);
}
```

Render again on the `state` event. The getting started page of your framework has the same toolbar with its own bindings: [TypeScript](/getting-started/typescript/), [Vue](/getting-started/vue/), [React](/getting-started/react/) and [Angular](/getting-started/angular/).

## Keyboard shortcuts

While the chart has the focus the tools react to the keys of the table above, and to undo and redo, as the host passes keys on through `onKey` (see the [host guide](/guides/host/)). A shortcut chooses its tool also while another tool is placing, and starts that tool over. It does nothing while a drawing is dragged or a note is edited, and the host keeps the key.

| Keys | What it does |
| --- | --- |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y | Redo |

Undo and redo leave the key to the host when there is nothing to undo or redo. All the keys are in the [keyboard reference](/guides/keyboard/).

### Change the shortcuts

The `shortcuts` option maps a drawing kind to a shortcut. A tool you leave out keeps its default, and `null` turns its shortcut off.

```ts
const tools = createDrawingTools(host, {
  shortcuts: { 'trend-line': 'Ctrl+Alt+L', rectangle: null },
});
```

A shortcut is Ctrl (or Cmd), Alt and Shift joined with `+`, then a letter or a digit, with Ctrl or Alt among the modifiers. Case does not matter. Creating the tools throws a `RangeError` for a shortcut that is not valid, that two tools share, or that is one the tools use themselves: Ctrl or Cmd with A, D, Z or Y. A name that is not a drawing kind is a `KFT-E-KIND` error. The toolbar shows the shortcuts in use.

### Option and Alt on a Mac

With Option held, a Mac types another character for a letter. The tools therefore also read the physical key, from the optional `code` of the key event (`KeyT`, `Digit1`), when the host passes it on. Pass `event.code` along with `event.key` in your `onKey` bridge.
