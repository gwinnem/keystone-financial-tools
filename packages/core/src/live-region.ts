/**
 * The attributes of the element an adapter shows the `announce` events in (NFR-A11Y-001): a polite live
 * region, read out when the user is idle, and read as a whole rather than as the part that changed.
 * It has no `role`, so a page can have a status line of its own next to it.
 *
 * @example
 * ```ts
 * const region = document.createElement('div');
 * for (const [name, value] of Object.entries(LIVE_REGION_ATTRIBUTES)) region.setAttribute(name, value);
 * ```
 */
export const LIVE_REGION_ATTRIBUTES: Readonly<{ 'aria-live': 'polite'; 'aria-atomic': 'true' }> = Object.freeze({ 'aria-live': 'polite', 'aria-atomic': 'true' } as const);

/**
 * The style that hides a live region from the eye but not from a screen reader (`display: none` would hide it
 * from both). The region is placed absolutely, so it takes no room and does not move the page.
 *
 * @example
 * ```ts
 * Object.assign(region.style, VISUALLY_HIDDEN_STYLE);
 * ```
 */
export const VISUALLY_HIDDEN_STYLE: Readonly<{
  position: 'absolute';
  width: '1px';
  height: '1px';
  margin: '-1px';
  padding: '0';
  overflow: 'hidden';
  clip: 'rect(0 0 0 0)';
  clipPath: 'inset(50%)';
  whiteSpace: 'nowrap';
  border: '0';
}> = Object.freeze({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: '0',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: '0',
} as const);

/** A no-break space (code point 160): it is not read out, but it makes the text of the region a different string. */
const REPEAT_MARK = String.fromCharCode(0xa0);

/**
 * The text to put in a live region for `message`, given the text it holds now (`previous`, '' at first). A
 * screen reader announces a change of the text, so the same message twice in a row (two lines placed one after
 * the other) would be silent the second time: it gets a no-break space after it, and loses it again the time
 * after, so the text always changes.
 *
 * @example
 * ```ts
 * let text = liveRegionText('', 'Trend line placed'); // 'Trend line placed'
 * text = liveRegionText(text, 'Trend line placed'); // the same text and a no-break space
 * text = liveRegionText(text, 'Trend line placed'); // 'Trend line placed'
 * ```
 */
export function liveRegionText(previous: string, message: string): string {
  return previous === message ? `${message}${REPEAT_MARK}` : message;
}
