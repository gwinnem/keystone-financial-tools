import { describe, expect, it } from 'vitest';
import { TOOL_CATALOG } from '../src/catalog';
import { DRAWING_KINDS } from '../src/kinds';
import { DEFAULT_MESSAGES, formatMessage, resolveMessages, type MessageKey } from '../src/messages';
import { TEXT_EDITOR_LABEL } from '../src/text-editor';

// NFR-I18N-001: the message table of every user-visible text, and the merge of the overrides.
const KEYS = Object.keys(DEFAULT_MESSAGES) as MessageKey[];

describe('DEFAULT_MESSAGES', () => {
  it('has the English text of every tool, toolbar group, accessible name and editor button', () => {
    expect(DEFAULT_MESSAGES).toStrictEqual({
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
  });

  it('has the placeholders the announcements are filled with: {tool} for one drawing, {count} for several, none for undo and redo', () => {
    for (const key of ['announce.placed', 'announce.selected', 'announce.deleted', 'announce.blocked', 'announce.toolActive'] as const) expect(DEFAULT_MESSAGES[key], key).toContain('{tool}');
    for (const key of ['announce.selectedMany', 'announce.deletedMany', 'announce.blockedMany'] as const) expect(DEFAULT_MESSAGES[key], key).toContain('{count}');
    for (const key of ['announce.undone', 'announce.redone'] as const) expect(DEFAULT_MESSAGES[key], key).not.toContain('{');
    for (const key of ['announce.placeAnchor', 'announce.placeAnchorUpTo'] as const) {
      expect(DEFAULT_MESSAGES[key], key).toContain('{index}');
      expect(DEFAULT_MESSAGES[key], key).toContain('{count}');
    }
  });

  it('has a tool label for every drawing kind', () => {
    for (const kind of DRAWING_KINDS) expect(DEFAULT_MESSAGES[`tool.${kind}`], kind).toEqual(expect.any(String));
  });

  it('has the label of every entry of the tool catalog under its label key, and a name for its group', () => {
    for (const entry of TOOL_CATALOG) {
      expect(entry.labelKey).toBe(`tool.${entry.id}`);
      expect(KEYS).toContain(entry.labelKey);
      expect(KEYS, entry.group).toContain(`group.${entry.group}`);
    }
  });

  it('has no empty text, no text with spaces around it and no text twice', () => {
    for (const key of KEYS) {
      const text = DEFAULT_MESSAGES[key];
      expect(text.length, key).toBeGreaterThan(0);
      expect(text.trim(), key).toBe(text);
    }
    expect(new Set(Object.values(DEFAULT_MESSAGES)).size).toBe(KEYS.length);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_MESSAGES)).toBe(true);
  });

  it('gives the default accessible name of the note editor', () => {
    expect(TEXT_EDITOR_LABEL).toBe(DEFAULT_MESSAGES['editor.note']);
  });
});

describe('resolveMessages', () => {
  it('gives the English texts without overrides', () => {
    expect(resolveMessages()).toStrictEqual(DEFAULT_MESSAGES);
    expect(resolveMessages({})).toStrictEqual(DEFAULT_MESSAGES);
  });

  it('takes null as no overrides, for a caller that is not typed', () => {
    expect(resolveMessages(null)).toStrictEqual(DEFAULT_MESSAGES);
  });

  it('replaces the text of the keys it is given and keeps all others', () => {
    const messages = resolveMessages({ 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' });
    expect(messages).toStrictEqual({ ...DEFAULT_MESSAGES, 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' });
  });

  it('can replace every text', () => {
    const all = Object.fromEntries(KEYS.map((key) => [key, `[${key}]`])) as Record<MessageKey, string>;
    expect(resolveMessages(all)).toStrictEqual(all);
  });

  it('keeps the text as given, spaces included', () => {
    expect(resolveMessages({ 'toolbar.label': ' Zeichnen ' })['toolbar.label']).toBe(' Zeichnen ');
  });

  it('keeps the English text of a key that is set to undefined', () => {
    expect(resolveMessages({ 'tool.rectangle': undefined, 'tool.text-note': 'Notiz' })).toStrictEqual({ ...DEFAULT_MESSAGES, 'tool.text-note': 'Notiz' });
  });

  it('throws a RangeError for a key that is not a message key', () => {
    expect(() => resolveMessages({ 'tool.circle': 'Kreis' } as never)).toThrow(new RangeError('Unknown message key tool.circle.'));
  });

  it('does not take the name of an inherited property for a message key', () => {
    expect(() => resolveMessages({ toString: 'x' } as never)).toThrow(new RangeError('Unknown message key toString.'));
  });

  it.each<[string, unknown]>([
    ['an empty text', ''],
    ['a text of spaces', '   '],
    ['a number', 42],
    ['null', null],
    ['an object', {}],
    ['a boolean', false],
  ])('throws a RangeError for %s', (_name, value) => {
    expect(() => resolveMessages({ 'tool.rectangle': value } as never)).toThrow(new RangeError('The message tool.rectangle must be a text that is not empty.'));
  });

  it('checks the key before the text', () => {
    expect(() => resolveMessages({ nope: '' } as never)).toThrow(new RangeError('Unknown message key nope.'));
  });

  it('gives a frozen table that is a new object, so neither the defaults nor the overrides are shared', () => {
    const overrides = { 'tool.rectangle': 'Rechteck' };
    const messages = resolveMessages(overrides);
    expect(Object.isFrozen(messages)).toBe(true);
    expect(messages).not.toBe(DEFAULT_MESSAGES);
    overrides['tool.rectangle'] = 'Viereck';
    expect(messages['tool.rectangle']).toBe('Rechteck');
    expect(DEFAULT_MESSAGES['tool.rectangle']).toBe('Rectangle');
  });
});

describe('formatMessage', () => {
  it('puts the values in the placeholders', () => {
    expect(formatMessage(DEFAULT_MESSAGES['announce.placed'], { tool: 'Trend line' })).toBe('Trend line placed');
    expect(formatMessage(DEFAULT_MESSAGES['announce.deletedMany'], { count: 3 })).toBe('3 drawings deleted');
  });

  it('puts a value in every place of its placeholder, and fills several placeholders', () => {
    expect(formatMessage('{a}-{b}-{a}', { a: 'x', b: 2 })).toBe('x-2-x');
  });

  it('keeps a placeholder it has no value for, and text without placeholders as it is', () => {
    expect(formatMessage('{tool} of {count}', { tool: 'Line' })).toBe('Line of {count}');
    expect(formatMessage('Undone', { tool: 'Line' })).toBe('Undone');
    expect(formatMessage('', {})).toBe('');
  });

  it('gives a translation that leaves the placeholder out as it is', () => {
    expect(formatMessage('Platziert', { tool: 'Trendlinie' })).toBe('Platziert');
  });

  it('takes the value as text: a value with a $ pattern or a placeholder in it is not read again', () => {
    expect(formatMessage('{tool} placed', { tool: '$& {count}' })).toBe('$& {count} placed');
    expect(formatMessage('{tool}', { tool: '$1$$' })).toBe('$1$$');
  });

  it('does not take the name of an inherited property for a value', () => {
    expect(formatMessage('{toString} {constructor}', {})).toBe('{toString} {constructor}');
  });

  it('writes a zero and an empty text', () => {
    expect(formatMessage('{count} left', { count: 0 })).toBe('0 left');
    expect(formatMessage('[{tool}]', { tool: '' })).toBe('[]');
  });

  it('only reads {word} as a placeholder', () => {
    expect(formatMessage('{ tool } {} {tool-x} {{tool}}', { tool: 'T' })).toBe('{ tool } {} {tool-x} {T}');
  });
});
