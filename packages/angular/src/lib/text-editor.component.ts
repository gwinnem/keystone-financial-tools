import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Input, inject, type OnDestroy } from '@angular/core';
import { shouldRestoreFocus, TEXT_EDITOR_LABEL, textEditorKeyAction, type TextEditSession } from 'keystone-financial-tools-core';

/** Keeps pointer events in the editor from reaching the chart, which would take them for clicks on the plot. */
const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;

const stopPropagation = (event: Event): void => event.stopPropagation();

/**
 * The default editor of text notes (FR-INT-050): a textarea at the note's position while `session`
 * is open (`KeystoneDrawingToolsService.textEdit()`). Ctrl or Cmd with Enter confirms, Escape cancels
 * and leaving the textarea confirms. It takes focus when it opens and gives it back when it closes,
 * unless the user has moved it to something else.
 *
 * Place it inside the element that holds the chart, which must be positioned (for example
 * `position: relative`), as the textarea is placed with the note's plot coordinates. Key and pointer
 * events inside it do not reach the chart. The text is only ever the textarea's `value`
 * (NFR-SEC-002). To use your own editor instead, do not use this component: show `textEdit()`
 * yourself and call `confirm` or `cancel` on it.
 *
 * @example
 * ```html
 * <div class="chart" style="position: relative">
 *   <canvas #canvas></canvas>
 *   <keystone-text-editor [session]="tools.textEdit()" label="Notiztext" />
 * </div>
 * ```
 */
@Component({
  selector: 'keystone-text-editor',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeystoneTextEditorComponent implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private caption: string = TEXT_EDITOR_LABEL;
  private field: HTMLTextAreaElement | null = null;
  private close: (() => void) | null = null;

  /** The open editing session, or null (`KeystoneDrawingToolsService.textEdit()`). */
  @Input() set session(value: TextEditSession | null | undefined) {
    this.closeEditor();
    if (value) this.open(value);
  }

  /** The accessible name of the textarea. Default `TEXT_EDITOR_LABEL`. */
  @Input() set label(value: string | undefined) {
    this.caption = value ?? TEXT_EDITOR_LABEL;
    this.field?.setAttribute('aria-label', this.caption);
  }

  ngOnDestroy(): void {
    this.closeEditor();
  }

  private open(session: TextEditSession): void {
    const previous = this.document.activeElement as HTMLElement | null;
    const { x, y, fontSize, text } = session.request;
    const field = this.document.createElement('textarea');
    field.setAttribute('aria-label', this.caption);
    field.style.position = 'absolute';
    field.style.left = `${x}px`;
    field.style.top = `${y}px`;
    field.style.fontSize = `${fontSize}px`;
    // The text is a value, never markup. It is set once, so a change of the label never puts it back.
    field.value = text;
    this.host.append(field);
    field.focus();
    field.select();
    // Listeners on the element itself, so they run before the chart's own listeners further up see the event. They are removed one by
    // one, not with an `AbortSignal`: zone.js's patched `addEventListener` does not take one from every DOM implementation.
    const onKeydown = (event: KeyboardEvent): void => {
      // Typing must not reach the chart's key handling: Delete would delete the selected note.
      event.stopPropagation();
      const action = textEditorKeyAction(event);
      if (action === null) return;
      event.preventDefault();
      if (action === 'confirm') session.confirm(field.value);
      else session.cancel();
    };
    const onBlur = (): void => session.confirm(field.value);
    field.addEventListener('keydown', onKeydown);
    field.addEventListener('blur', onBlur);
    for (const type of POINTER_EVENTS) field.addEventListener(type, stopPropagation);
    this.field = field;
    this.close = () => {
      field.removeEventListener('keydown', onKeydown);
      field.removeEventListener('blur', onBlur);
      for (const type of POINTER_EVENTS) field.removeEventListener(type, stopPropagation);
      field.remove();
      if (shouldRestoreFocus(this.document.activeElement, field, this.document.body)) previous?.focus();
    };
  }

  private closeEditor(): void {
    this.close?.();
    this.close = null;
    this.field = null;
  }
}
