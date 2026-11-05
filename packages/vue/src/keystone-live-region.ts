import { defineComponent, h } from 'vue';
import { LIVE_REGION_ATTRIBUTES, VISUALLY_HIDDEN_STYLE } from 'keystone-financial-tools-core';

/**
 * The live region of the announcements (NFR-A11Y-001): an element a screen reader reads the `message` of
 * politely when it changes (`useDrawingTools().announcement`), that nobody sees. It has no `role`, so a
 * status line of your own next to it does not clash with it. Place it anywhere on the page, once for each chart.
 *
 * @example
 * ```vue
 * <KeystoneLiveRegion :message="announcement" />
 * ```
 */
export const KeystoneLiveRegion = defineComponent({
  props: {
    /** `useDrawingTools().announcement`: the text to read out. */
    message: String,
  },
  setup(props) {
    return () => h('div', { ...LIVE_REGION_ATTRIBUTES, style: VISUALLY_HIDDEN_STYLE }, props.message);
  },
});
