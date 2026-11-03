import { useLayoutEffect, useRef, type ReactElement } from 'react';
import { shouldRestoreFocus, TEXT_EDITOR_LABEL, textEditorKeyAction, type TextEditSession } from 'keystone-financial-tools-core';

/** Keeps pointer events in the editor from reaching the chart, which would take them for clicks on the plot. */
const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;

const stopPropagation = (event: Event): void => event.stopPropagation();

export interface KeystoneTextEditorProps {
  /** `useDrawingTools().textEdit`: the open editing session, or null. */
  readonly session?: TextEditSession | null;
  /** The accessible name of the textarea. */
  readonly label?: string;
}

/**
 * The default editor of text notes (FR-INT-050): a textarea at the note's position while `session`
 * is open (`useDrawingTools().textEdit`). Ctrl or Cmd with Enter confirms, Escape cancels and leaving
 * the textarea confirms. It takes focus when it opens and gives it back when it closes, unless the
 * user has moved it to something else.
 *
 * Place it inside the element that holds the chart, which must be positioned (for example
 * `position: relative`), as the textarea is placed with the note's plot coordinates. Key and pointer
 * events inside it do not reach the chart. The text is only ever a `value` (NFR-SEC-002). To use your
 * own editor instead, do not render this component: show `textEdit` yourself and call `confirm` or
 * `cancel` on it.
 *
 * @example
 * ```tsx
 * <div className="chart" style={{ position: 'relative' }}>
 *   <canvas ref={canvas} />
 *   <KeystoneTextEditor session={textEdit} label="Notiztext" />
 * </div>
 * ```
 */
export function KeystoneTextEditor({ session = null, label = TEXT_EDITOR_LABEL }: KeystoneTextEditorProps): ReactElement | null {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (session === null) return undefined;
    const field = ref.current as HTMLTextAreaElement;
    const previous = document.activeElement as HTMLElement | null;
    // The text goes in as the textarea's value once per session, so a render while the user types never puts it back.
    field.value = session.request.text;
    field.focus();
    field.select();
    // Listeners on the element itself, not React props: those run at the root, after the chart's own listeners have seen the event.
    const controller = new AbortController();
    const options = { signal: controller.signal };
    field.addEventListener(
      'keydown',
      (event) => {
        // Typing must not reach the chart's key handling: Delete would delete the selected note.
        event.stopPropagation();
        const action = textEditorKeyAction(event);
        if (action === null) return;
        event.preventDefault();
        if (action === 'confirm') session.confirm(field.value);
        else session.cancel();
      },
      options
    );
    field.addEventListener('blur', () => session.confirm(field.value), options);
    for (const type of POINTER_EVENTS) field.addEventListener(type, stopPropagation, options);
    return () => {
      controller.abort();
      if (shouldRestoreFocus(document.activeElement, field, document.body)) previous?.focus();
    };
  }, [session]);
  if (session === null) return null;
  const { x, y, fontSize } = session.request;
  return <textarea ref={ref} aria-label={label} style={{ position: 'absolute', left: `${x}px`, top: `${y}px`, fontSize: `${fontSize}px` }} />;
}
