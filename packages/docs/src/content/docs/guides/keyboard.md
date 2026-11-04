---
title: Keyboard reference
description: Every key the drawing tools react to, and the pointer actions that go with them.
---

Everything the tools do can be done with the keyboard. Keys reach the tools while the chart has the focus: the host passes them on through `onKey` (see the [host guide](/guides/host/)). Ctrl and Cmd work the same everywhere. Shift makes an arrow key move ten times as far.

| Keys | When | What it does |
| --- | --- | --- |
| Escape | Placing a drawing | Cancel the drawing and leave the tool |
| Enter | Placing a drawing | Place an anchor at the keyboard cursor |
| Arrow keys | Placing a drawing | Move the keyboard cursor one bar sideways or one pixel up or down |
| Shift + Arrow keys | Placing a drawing | Move the keyboard cursor ten bars or ten pixels |
| Ctrl/Cmd + A | Nothing selected, or drawings selected | Select all visible drawings |
| Ctrl/Cmd + D | Drawings selected | Duplicate the selected drawings |
| Arrow keys | Drawings selected | Move the selected drawings one bar sideways or one pixel up or down |
| Shift + Arrow keys | Drawings selected | Move the selected drawings ten bars or ten pixels |
| Escape | Drawings selected | Clear the selection |
| Delete or Backspace | Drawings selected | Delete the selected drawings that are not locked |
| Enter | One text note selected | Edit the text of the note |
| Escape | Dragging a drawing or a handle | Cancel the drag and put the drawing back |
| Ctrl/Cmd + Enter | Editing a text note | Confirm the text |
| Escape | Editing a text note | Cancel the editing |

## Locked drawings

A locked drawing can be selected but not moved, resized, edited or deleted by interaction. When Delete, an arrow key or a drag would change one, the tools leave it alone and raise the `blocked` event with its id.

## Pointer actions

- Choose a tool with `activate(kind)`. Click to place each anchor, or press at the first anchor, drag and release at the last one. The right button cancels.
- Click a drawing to select it. Shift and click adds it to the selection or takes it out. A click on empty space clears the selection.
- Drag the body of a selected drawing to move it, or one of its handles to change an anchor. Hold Shift while you place a trend line or fans to keep the angle to 45 degree steps.
- Double-click a text note to edit it.
- With the magnet on, anchors snap to the nearest bar. Ctrl or Cmd inverts the magnet while you hold it.

## Undo and redo

The core has no key binding for undo and redo. Call `undo()` and `redo()` from your own toolbar or key handling.
