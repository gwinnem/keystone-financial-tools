/** A key the tools react to: what it does, and in which situation. The keyboard reference page shows one table row for each. */
export interface Shortcut {
  readonly keys: string;
  readonly when: string;
  readonly action: string;
}

/** Every key binding of the interaction engine (SDS 9.1) and of the default text editor. */
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Escape', when: 'Placing a drawing', action: 'Cancel the drawing and leave the tool' },
  { keys: 'Enter', when: 'Placing a drawing', action: 'Place an anchor at the keyboard cursor' },
  { keys: 'Arrow keys', when: 'Placing a drawing', action: 'Move the keyboard cursor one bar sideways or one pixel up or down' },
  { keys: 'Shift + Arrow keys', when: 'Placing a drawing', action: 'Move the keyboard cursor ten bars or ten pixels' },
  { keys: 'Ctrl/Cmd + A', when: 'Nothing selected, or drawings selected', action: 'Select all visible drawings' },
  { keys: 'Ctrl/Cmd + D', when: 'Drawings selected', action: 'Duplicate the selected drawings' },
  { keys: 'Arrow keys', when: 'Drawings selected', action: 'Move the selected drawings one bar sideways or one pixel up or down' },
  { keys: 'Shift + Arrow keys', when: 'Drawings selected', action: 'Move the selected drawings ten bars or ten pixels' },
  { keys: 'Escape', when: 'Drawings selected', action: 'Clear the selection' },
  { keys: 'Delete or Backspace', when: 'Drawings selected', action: 'Delete the selected drawings that are not locked' },
  { keys: 'Enter', when: 'One text note selected', action: 'Edit the text of the note' },
  { keys: 'Escape', when: 'Dragging a drawing or a handle', action: 'Cancel the drag and put the drawing back' },
  { keys: 'Ctrl/Cmd + Enter', when: 'Editing a text note', action: 'Confirm the text' },
  { keys: 'Escape', when: 'Editing a text note', action: 'Cancel the editing' },
];
