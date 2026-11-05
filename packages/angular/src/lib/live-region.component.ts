import { ChangeDetectionStrategy, Component, ElementRef, Input, inject } from '@angular/core';
import { LIVE_REGION_ATTRIBUTES, VISUALLY_HIDDEN_STYLE } from 'keystone-financial-tools-core';

/**
 * The live region of the announcements (NFR-A11Y-001): an element a screen reader reads the `message` of
 * politely when it changes (`KeystoneDrawingToolsService.announcement()`), that nobody sees. It has no
 * `role`, so a status line of your own next to it does not clash with it. Place it anywhere on the page,
 * once for each chart.
 *
 * @example
 * ```html
 * <keystone-live-region [message]="tools.announcement()" />
 * ```
 */
@Component({
  selector: 'keystone-live-region',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeystoneLiveRegionComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    for (const [name, value] of Object.entries(LIVE_REGION_ATTRIBUTES)) this.host.setAttribute(name, value);
    Object.assign(this.host.style, VISUALLY_HIDDEN_STYLE);
  }

  /** `KeystoneDrawingToolsService.announcement()`: the text to read out. */
  @Input() set message(value: string | null | undefined) {
    this.host.textContent = value ?? '';
  }
}
