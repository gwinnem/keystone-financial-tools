import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { DEFAULT_MESSAGES } from 'keystone-financial-tools-core';
import { createMockHost } from 'keystone-financial-tools-core/testing';
import { useDrawingTools, type UseDrawingTools, type UseDrawingToolsOptions } from '../src/use-drawing-tools';

// NFR-I18N-001: the texts the composable gives for a toolbar and for the note editor.
function setup(options?: UseDrawingToolsOptions): UseDrawingTools {
  const result = effectScope().run(() => useDrawingTools(createMockHost(), options));
  if (result === undefined) throw new Error('scope did not run');
  return result;
}

describe('useDrawingTools messages', () => {
  it('gives the English texts when there is no messages option', () => {
    expect(setup().messages).toStrictEqual(DEFAULT_MESSAGES);
  });

  it('merges the messages option over the English texts', () => {
    const { messages } = setup({ messages: { 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' } });
    expect(messages).toStrictEqual({ ...DEFAULT_MESSAGES, 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' });
  });

  it('is the table of the controller', () => {
    const result = setup({ messages: { 'toolbar.label': 'Zeichnen' } });
    expect(result.messages).toBe(result.tools.messages);
  });

  it('gives the label of every toolbar entry through its label key', () => {
    const { toolbar, messages } = setup({ messages: { 'tool.text-note': 'Notiz' } });
    expect(toolbar.value.map((entry) => messages[entry.labelKey])).toStrictEqual([
      'Trend line',
      'Horizontal line',
      'Rectangle',
      'Fibonacci retracement',
      'Fibonacci arcs',
      'Fibonacci fans',
      'Fibonacci time zones',
      'Notiz',
    ]);
  });

  it('throws a RangeError for a key that is not a message key', () => {
    expect(() => setup({ messages: { 'tool.circle': 'Kreis' } as never })).toThrow(new RangeError('Unknown message key tool.circle.'));
  });
});
