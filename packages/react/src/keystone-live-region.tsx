import type { ReactElement } from 'react';
import { LIVE_REGION_ATTRIBUTES, VISUALLY_HIDDEN_STYLE } from 'keystone-financial-tools-core';

export interface KeystoneLiveRegionProps {
  /** `useDrawingTools().announcement`: the text to read out. */
  readonly message?: string;
}

/**
 * The live region of the announcements (NFR-A11Y-001): an element a screen reader reads the `message` of
 * politely when it changes (`useDrawingTools().announcement`), that nobody sees. It has no `role`, so a
 * status line of your own next to it does not clash with it. Place it anywhere on the page, once for each chart.
 *
 * @example
 * ```tsx
 * <KeystoneLiveRegion message={announcement} />
 * ```
 */
export function KeystoneLiveRegion({ message = '' }: KeystoneLiveRegionProps): ReactElement {
  return (
    <div {...LIVE_REGION_ATTRIBUTES} style={VISUALLY_HIDDEN_STYLE}>
      {message}
    </div>
  );
}
