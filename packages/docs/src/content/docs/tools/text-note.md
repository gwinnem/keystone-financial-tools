---
title: Text note
description: A text label at one point on the chart, edited in place.
---

A text note has one anchor and a `text`. Its text is shown as text, never read as HTML.

## Place it

```ts
tools.activate('text-note');
```

Click where the note should be. The editor for its text opens at that point; a note that is cancelled before it has any text is taken back, without an entry in the undo history. With the keyboard, move the keyboard cursor with the arrow keys and place the note with Enter. See the [keyboard reference](/guides/keyboard/).

## Edit the text

Double-click a selected note, or select it and press Enter, to edit its text again. A locked note cannot be edited.

The editor comes from the first of these that exists:

- the host's own `editText` (see the [host guide](/guides/host/));
- the `editText` function in the options of `createDrawingTools`, which resolves with the new text or `null` when cancelled;
- the default editor of your framework package, a textarea at the position of the note. Ctrl or Cmd with Enter confirms, Escape cancels and leaving the textarea confirms.

Pass `editText: false` to the framework package to have no editor: a new note then stays empty.

## Try it

The chart below has only the text note enabled, and the tool is already active. Click to place a note and type its text (Ctrl or Cmd with Enter confirms, Escape cancels), or Tab to the chart and use the keyboard. It works with touch too.

<iframe src="/playground/embed.html?tool=text-note" title="Text note example" width="100%" height="560" loading="lazy"></iframe>

## Options

A text note has no options of its own. Its look comes from `style`: `textColor` and `fontSize` (8 to 72 pixels).

## Example

```ts
import { createId } from 'keystone-financial-tools-core';

store.add({
  id: createId(),
  kind: 'text-note',
  anchors: [{ time: Date.UTC(2026, 9, 5), price: 110, yAxisId: 'price' }],
  text: 'Breakout',
  style: { textColor: '#2962ff', fontSize: 14 },
});
```
