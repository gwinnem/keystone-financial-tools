import { defineComponent, h, type ComponentPublicInstance, type PropType } from 'vue';
import { TEXT_EDITOR_LABEL, textEditorKeyAction, type TextEditSession } from 'keystone-financial-tools-core';

/** Keeps pointer events in the editor from reaching the chart, which would take them for clicks on the plot. */
const POINTER_EVENTS = ['onPointerdown', 'onPointermove', 'onPointerup', 'onPointercancel'] as const;

const keys = new WeakMap<TextEditSession, symbol>();
/** A key per session, so a new session gets a new textarea (with its own text and focus) even when it replaces another at once. */
function keyOf(session: TextEditSession): symbol {
  let key = keys.get(session);
  if (key === undefined) {
    key = Symbol('text-edit');
    keys.set(session, key);
  }
  return key;
}

/**
 * The default editor of text notes (FR-INT-050): a textarea at the note's position while `session`
 * is open (`useDrawingTools().textEdit`). Ctrl or Cmd with Enter confirms, Escape cancels and leaving
 * the textarea confirms. It takes focus when it opens and gives it back when it closes.
 *
 * Place it inside the element that holds the chart, which must be positioned (for example
 * `position: relative`), as the textarea is placed with the note's plot coordinates. Key and pointer
 * events inside it do not reach the chart. The text is a plain value and is never read as HTML
 * (NFR-SEC-002). To use your own editor instead, do not render this component: show `textEdit`
 * yourself and call `confirm` or `cancel` on it.
 *
 * @example
 * ```vue
 * <div class="chart" style="position: relative">
 *   <canvas ref="canvas" />
 *   <KeystoneTextEditor :session="textEdit" label="Notiztext" />
 * </div>
 * ```
 */
export const KeystoneTextEditor = defineComponent({
  props: {
    /** `useDrawingTools().textEdit`: the open editing session, or null. */
    session: Object as PropType<TextEditSession | null>,
    /** The accessible name of the textarea. */
    label: { type: String, default: TEXT_EDITOR_LABEL },
  },
  setup(props) {
    let previous: HTMLElement | null = null;
    // Called with the textarea when it appears and with null when it goes: focus moves in, and back out.
    const attach = (element: Element | ComponentPublicInstance | null): void => {
      if (element === null) {
        previous?.focus();
        previous = null;
        return;
      }
      const field = element as HTMLTextAreaElement;
      previous = document.activeElement as HTMLElement | null;
      field.focus();
      field.select();
    };
    return () => {
      const session = props.session ?? null;
      if (session === null) return null;
      const { x, y, fontSize, text } = session.request;
      const handlers: Record<string, (event: Event) => void> = {};
      for (const name of POINTER_EVENTS) handlers[name] = (event) => event.stopPropagation();
      // The text is the textarea's initial content (a text node), not its `value` binding: a render of the
      // component while the user types would otherwise put the initial text back.
      return h(
        'textarea',
        {
          ...handlers,
          key: keyOf(session),
          ref: attach,
          'aria-label': props.label,
          style: { position: 'absolute', left: `${x}px`, top: `${y}px`, fontSize: `${fontSize}px` },
          onKeydown: (event: KeyboardEvent) => {
            // Typing must not reach the chart's key handling: Delete would delete the selected note.
            event.stopPropagation();
            const action = textEditorKeyAction(event);
            if (action === null) return;
            event.preventDefault();
            if (action === 'confirm') session.confirm((event.target as HTMLTextAreaElement).value);
            else session.cancel();
          },
          onBlur: (event: FocusEvent) => session.confirm((event.target as HTMLTextAreaElement).value),
        },
        text
      );
    };
  },
});
