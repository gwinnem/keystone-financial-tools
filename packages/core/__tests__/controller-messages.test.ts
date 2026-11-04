import { describe, expect, it } from 'vitest';
import { DEFAULT_MESSAGES } from '../src/messages';
import { rig } from './controller-rig';

// NFR-I18N-001 through the controller: the `messages` option and `DrawingTools.messages`.
describe('the messages option', () => {
  it('gives the English texts when there is none', () => {
    const { tools } = rig();
    expect(tools.messages).toStrictEqual(DEFAULT_MESSAGES);
  });

  it('merges the texts it is given over the English ones', () => {
    const { tools } = rig({ messages: { 'tool.rectangle': 'Rechteck', 'editor.cancel': 'Abbrechen' } });
    expect(tools.messages).toStrictEqual({ ...DEFAULT_MESSAGES, 'tool.rectangle': 'Rechteck', 'editor.cancel': 'Abbrechen' });
  });

  it('gives the label of every toolbar entry through its label key', () => {
    const { tools } = rig({ messages: { 'tool.text-note': 'Notiz' } });
    const labels = tools.getState().toolbar.map((entry) => tools.messages[entry.labelKey]);
    expect(labels).toStrictEqual(['Trend line', 'Horizontal line', 'Rectangle', 'Fibonacci retracement', 'Fibonacci arcs', 'Fibonacci fans', 'Fibonacci time zones', 'Notiz']);
  });

  it('is the same object whenever it is read, and frozen', () => {
    const { tools } = rig({ messages: { 'toolbar.label': 'Zeichnen' } });
    expect(tools.messages).toBe(tools.messages);
    expect(Object.isFrozen(tools.messages)).toBe(true);
  });

  it('does not change the state', () => {
    const plain = rig().tools.getState();
    const translated = rig({ messages: { 'tool.rectangle': 'Rechteck' } }).tools.getState();
    expect(translated).toStrictEqual(plain);
  });

  it('is an error at creation for an unknown key or an empty text', () => {
    expect(() => rig({ messages: { 'tool.circle': 'Kreis' } as never })).toThrow(new RangeError('Unknown message key tool.circle.'));
    expect(() => rig({ messages: { 'editor.note': '' } })).toThrow(new RangeError('The message editor.note must be a text that is not empty.'));
  });
});
