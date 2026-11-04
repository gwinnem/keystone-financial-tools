import { deepFreeze, hasOwn } from './object';
import type { DrawingKind } from './types';

/**
 * The key of a user-visible text (NFR-I18N-001): `tool.<kind>` is the name of a tool (the `labelKey` of
 * its `TOOL_CATALOG` entry), `group.<group>` the name of a toolbar group, `toolbar.label` the accessible
 * name of the toolbar, and `editor.*` the texts of a note editor.
 */
export type MessageKey = `tool.${DrawingKind}` | 'group.lines' | 'group.shapes' | 'group.fibonacci' | 'group.annotations' | 'toolbar.label' | 'editor.note' | 'editor.confirm' | 'editor.cancel';

/** Every message: a text for each key. */
export type Messages = Readonly<Record<MessageKey, string>>;

/** The messages to replace: any of the keys, each with its new text. A key left out keeps its English text. */
export type MessageOverrides = Readonly<Partial<Record<MessageKey, string>>>;

/**
 * Every user-visible text of the tools in English (NFR-I18N-001): the names of the tools and of the
 * toolbar groups, the accessible name of the toolbar, and the accessible name and the buttons of a note
 * editor. No other text is shown anywhere in the packages. Replace some or all with the `messages`
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
  'group.lines': 'Lines',
  'group.shapes': 'Shapes',
  'group.fibonacci': 'Fibonacci',
  'group.annotations': 'Annotations',
  'toolbar.label': 'Drawing tools',
  'editor.note': 'Note text',
  'editor.confirm': 'Confirm',
  'editor.cancel': 'Cancel',
});

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
