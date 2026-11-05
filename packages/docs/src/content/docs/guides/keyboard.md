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
| Alt + T | Not dragging a drawing or editing a note | Choose the trend line tool |
| Alt + H | Not dragging a drawing or editing a note | Choose the horizontal line tool |
| Alt + R | Not dragging a drawing or editing a note | Choose the rectangle tool |
| Alt + F | Not dragging a drawing or editing a note | Choose the Fibonacci retracement tool |
| Alt + N | Not dragging a drawing or editing a note | Choose the text note tool |
| Ctrl/Cmd + Z | Something to undo | Undo the last change |
| Ctrl/Cmd + Shift + Z | Something to redo | Redo the change that was undone |
| Ctrl/Cmd + Y | Something to redo | Redo the change that was undone |
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

## Keyboard-only walkthrough

Every tool can be used without a pointer. The e2e suite (`keyboard-walkthrough.spec.ts`) runs these steps for all eight tools.

1. Tab to the tool's toolbar button and press Enter. For the trend line, horizontal line, rectangle, Fibonacci retracement and text note you can instead press Alt with T, H, R, F or N while the chart has the focus.
2. Tab to the chart.
3. Press Enter to place the first anchor at the keyboard cursor. A horizontal line and a text note need only this one. For a text note the editor opens: type the text and press Ctrl+Enter, or Escape to cancel.
4. For a tool with two anchors, move the cursor with the arrow keys (Shift for ten steps) and press Enter again. Escape before that cancels the drawing.
5. Press Ctrl+A to select, then arrow keys to move the drawing, Enter to edit a note, Ctrl+D to duplicate, Delete or Backspace to delete, Ctrl+Z and Ctrl+Y to undo and redo.

The Fibonacci arcs, fans and time zones tools are chosen with their toolbar button (see Tool shortcuts below).

## Locked drawings

A locked drawing can be selected but not moved, resized, edited or deleted by interaction. When Delete, an arrow key or a drag would change one, the tools leave it alone and raise the `blocked` event with its id.

## Pointer actions

- Choose a tool with `activate(kind)`. Click to place each anchor, or press at the first anchor, drag and release at the last one. The right button cancels.
- Click a drawing to select it. Shift and click adds it to the selection or takes it out. A click on empty space clears the selection.
- Drag the body of a selected drawing to move it, or one of its handles to change an anchor. Hold Shift while you place a trend line or fans to keep the angle to 45 degree steps.
- Double-click a text note to edit it.
- With the magnet on, anchors snap to the nearest bar. Ctrl or Cmd inverts the magnet while you hold it.

## Undo and redo

Ctrl or Cmd with Z undoes, and Ctrl or Cmd with Shift and Z, or with Y, redoes. The tools handle these keys only when there is something to undo or redo, so the host keeps the key otherwise. A note whose text is still being edited is not undone. `undo()` and `redo()` do the same from your own buttons.

## Tool shortcuts

Alt with T, H, R, F or N chooses the trend line, horizontal line, rectangle, Fibonacci retracement or text note tool. You can change them or turn them off with the `shortcuts` option, see [Build a toolbar](/guides/toolbar/). A shortcut for a tool that is not in the `tools` option is not handled.

The Fibonacci arcs, Fibonacci fans and Fibonacci time zones tools have no default shortcut. Choose them with their toolbar button (Tab to it and press Enter), or give them a key with the `shortcuts` option.

## Announcements for screen readers

The controller raises the `announce` event with a short message after what the person did: a drawing placed ("Trend line placed"), selected ("Trend line selected", "2 drawings selected"), deleted ("Trend line deleted", "2 drawings deleted"), and "Undone" or "Redone". A text note is announced when its editor confirms it. Moving, nudging, hovering and choosing a tool say nothing. The messages are in the `messages` option (`announce.*`), so they can be translated.

The adapters turn the event into an `announcement` value and a live region component (`KeystoneLiveRegion` in Vue and React, `keystone-live-region` in Angular). Render it once on the page. With the TypeScript package, use `LIVE_REGION_ATTRIBUTES`, `VISUALLY_HIDDEN_STYLE` and `liveRegionText` from the core. Turn the announcements off with `announcements: false` in the adapters. A locked drawing that blocks a key is not announced yet; listen to `blocked` if you need it.
