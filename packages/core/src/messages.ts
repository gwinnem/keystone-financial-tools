import { deepFreeze, hasOwn } from './object';
import type { DrawingKind } from './types';

/**
 * The key of a user-visible text (NFR-I18N-001): `tool.<kind>` is the name of a tool (the `labelKey` of
 * its `TOOL_CATALOG` entry), `group.<group>` the name of a toolbar group, `toolbar.label` the accessible
 * name of the toolbar, `editor.*` the texts of a note editor and `announce.*` the screen-reader announcements
 * (NFR-A11Y-001): templates with `{tool}` (the name of a tool), `{count}` (a number) or `{index}` (the number of the anchor to place next) in them, see `formatMessage`.
 */
export type MessageKey =
  | `tool.${DrawingKind}`
  | 'group.lines'
  | 'group.shapes'
  | 'group.fibonacci'
  | 'group.annotations'
  | 'toolbar.label'
  | 'editor.note'
  | 'editor.confirm'
  | 'editor.cancel'
  | 'announce.placed'
  | 'announce.placeAnchor'
  | 'announce.placeAnchorUpTo'
  | 'announce.selected'
  | 'announce.selectedMany'
  | 'announce.deleted'
  | 'announce.deletedMany'
  | 'announce.undone'
  | 'announce.redone'
  | 'announce.blocked'
  | 'announce.blockedMany'
  | 'announce.toolActive';

/** Every message: a text for each key. */
export type Messages = Readonly<Record<MessageKey, string>>;

/** The messages to replace: any of the keys, each with its new text. A key left out keeps its English text. */
export type MessageOverrides = Readonly<Partial<Record<MessageKey, string>>>;

/**
 * Every user-visible text of the tools in English (NFR-I18N-001): the names of the tools and of the
 * toolbar groups, the accessible name of the toolbar, the accessible name and the buttons of a note
 * editor, and the screen-reader announcements. No other text is shown anywhere in the packages. Replace some or all with the `messages`
 * option, or with `resolveMessages`.
 *
 * @example
 * ```ts
 * const label = DEFAULT_MESSAGES['tool.trend-line']; // 'Trend line'
 * ```
 */
export const DEFAULT_MESSAGES: Messages = deepFreeze<Messages>({
  'tool.trend-line': 'Trend line',
  'tool.horizontal-line': 'Horizontal line',
  'tool.rectangle': 'Rectangle',
  'tool.fibonacci-retracement': 'Fibonacci retracement',
  'tool.fibonacci-arcs': 'Fibonacci arcs',
  'tool.fibonacci-fans': 'Fibonacci fans',
  'tool.fibonacci-time-zones': 'Fibonacci time zones',
  'tool.text-note': 'Text note',
  'tool.fibonacci-trend-based': 'Fibonacci trend-based extension',
  'tool.fibonacci-channel': 'Fibonacci channel',
  'tool.fibonacci-time-extension': 'Fibonacci time extension',
  'tool.fibonacci-circles': 'Fibonacci circles',
  'tool.fibonacci-spiral': 'Fibonacci spiral',
  'tool.fibonacci-wedge': 'Fibonacci wedge',
  'group.lines': 'Lines',
  'group.shapes': 'Shapes',
  'group.fibonacci': 'Fibonacci',
  'group.annotations': 'Annotations',
  'toolbar.label': 'Drawing tools',
  'editor.note': 'Note text',
  'editor.confirm': 'Confirm',
  'editor.cancel': 'Cancel',
  'announce.placed': '{tool} placed',
  'announce.placeAnchor': 'Place anchor {index} of {count}',
  'announce.placeAnchorUpTo': 'Place anchor {index} of up to {count}',
  'announce.selected': '{tool} selected',
  'announce.selectedMany': '{count} drawings selected',
  'announce.deleted': '{tool} deleted',
  'announce.deletedMany': '{count} drawings deleted',
  'announce.undone': 'Undone',
  'announce.redone': 'Redone',
  'announce.blocked': '{tool} is locked',
  'announce.blockedMany': '{count} drawings are locked',
  'announce.toolActive': '{tool} tool active',
});

/**
 * Fills the `{name}` placeholders of a message (NFR-I18N-001, NFR-A11Y-001): `{tool}` and `{count}` in the
 * `announce.*` messages. A placeholder `values` has no value for stays as it is, and a translation may leave a
 * placeholder out or use it more than once. Values are put in as text, never read as a pattern.
 *
 * @example
 * ```ts
 * formatMessage(DEFAULT_MESSAGES['announce.deletedMany'], { count: 3 }); // '3 drawings deleted'
 * formatMessage(DEFAULT_MESSAGES['announce.placeAnchor'], { index: 3, count: 5 }); // 'Place anchor 3 of 5'
 * formatMessage('{tool} platziert', { tool: 'Trendlinie' }); // 'Trendlinie platziert'
 * ```
 */
export function formatMessage(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => (hasOwn(values, name) ? String(values[name]) : placeholder));
}

/**
 * The messages to use: `DEFAULT_MESSAGES` with `overrides` on top (NFR-I18N-001). A key set to `undefined`
 * keeps its English text. Throws a `RangeError` for a key that is not a message key (a typo would
 * otherwise leave a text untranslated without a word) and for a text that is not a string or is empty
 * (an empty accessible name is no name). The result is frozen and does not change when `overrides` does.
 *
 * @example
 * ```ts
 * const messages = resolveMessages({ 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' });
 * messages['tool.trend-line']; // 'Trendlinie'
 * messages['tool.rectangle']; // 'Rectangle'
 * ```
 */
export function resolveMessages(overrides?: MessageOverrides | null): Messages {
  const merged: Record<string, string> = { ...DEFAULT_MESSAGES };
  // What a JavaScript caller passes is not checked by the types: any value can be there.
  for (const [key, text] of Object.entries(overrides ?? {}) as [string, unknown][]) {
    if (!hasOwn(DEFAULT_MESSAGES, key)) throw new RangeError(`Unknown message key ${key}.`);
    if (text === undefined) continue;
    if (typeof text !== 'string' || text.trim() === '') throw new RangeError(`The message ${key} must be a text that is not empty.`);
    merged[key] = text;
  }
  return deepFreeze(merged as Messages);
}
