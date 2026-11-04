import { describe, expect, it } from 'vitest';
import { DrawingError } from '../src/errors';
import type { HostKeyEvent } from '../src/host';
import { formatShortcut, matchShortcut, parseShortcut, resolveShortcuts, shortcutAction, shortcutKey, type Shortcut, type ShortcutBinding } from '../src/shortcuts';

// FR-FW-041: reading, writing and matching shortcuts, and what a key event asks for.
const NONE = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
const event = (key: string, modifiers: Partial<typeof NONE> = {}, code?: string): HostKeyEvent => ({ key, ...(code === undefined ? {} : { code }), ...NONE, ...modifiers });
const ALT_T: Shortcut = { ctrl: false, alt: true, shift: false, key: 'T' };

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected an error.');
}

describe('parseShortcut', () => {
  it('reads Alt and a letter, in any case', () => {
    expect(parseShortcut('Alt+T')).toStrictEqual(ALT_T);
    expect(parseShortcut('alt+t')).toStrictEqual(ALT_T);
    expect(parseShortcut('ALT+T')).toStrictEqual(ALT_T);
  });

  it('reads Ctrl, Alt and Shift in any order, each once', () => {
    expect(parseShortcut('Ctrl+Alt+Shift+9')).toStrictEqual({ ctrl: true, alt: true, shift: true, key: '9' });
    expect(parseShortcut('Shift+Alt+Ctrl+9')).toStrictEqual({ ctrl: true, alt: true, shift: true, key: '9' });
    expect(parseShortcut('Ctrl+K')).toStrictEqual({ ctrl: true, alt: false, shift: false, key: 'K' });
    expect(parseShortcut('Alt+Shift+k')).toStrictEqual({ ctrl: false, alt: true, shift: true, key: 'K' });
    expect(parseShortcut('Ctrl+Shift+K')).toStrictEqual({ ctrl: true, alt: false, shift: true, key: 'K' });
  });

  it('reads Cmd as Ctrl', () => {
    expect(parseShortcut('Cmd+K')).toStrictEqual({ ctrl: true, alt: false, shift: false, key: 'K' });
    expect(parseShortcut('cmd+alt+k')).toStrictEqual({ ctrl: true, alt: true, shift: false, key: 'K' });
  });

  it('refuses a modifier given twice, also as Ctrl and Cmd', () => {
    expect(parseShortcut('Alt+Alt+T')).toBeNull();
    expect(parseShortcut('Ctrl+Cmd+T')).toBeNull();
    expect(parseShortcut('Shift+Shift+Alt+T')).toBeNull();
  });

  it('refuses a shortcut without Ctrl or Alt, so the keys the user types with stay free', () => {
    expect(parseShortcut('T')).toBeNull();
    expect(parseShortcut('Shift+T')).toBeNull();
    expect(parseShortcut('5')).toBeNull();
    expect(parseShortcut('Alt+Shift+T')).not.toBeNull();
    expect(parseShortcut('Ctrl+Shift+T')).not.toBeNull();
  });

  it('refuses text that is not Ctrl, Alt, Shift and then one letter or digit', () => {
    for (const text of ['', '+', 'Alt+', 'Alt+TT', 'Alt+Esc', 'Alt+ T', ' Alt+T', 'Alt +T', 'Alt+-', 'Alt+é', 'Meta+T', 'Win+T', 'Option+T', 'Alt+T+', 'Alt++T', '+Alt+T', 'Alt-T', 'AltT']) {
      expect(parseShortcut(text), text).toBeNull();
    }
  });
});

describe('formatShortcut', () => {
  it('writes Ctrl, Alt and Shift in that order and then the key', () => {
    expect(formatShortcut(ALT_T)).toBe('Alt+T');
    expect(formatShortcut({ ctrl: true, alt: true, shift: true, key: '9' })).toBe('Ctrl+Alt+Shift+9');
    expect(formatShortcut({ ctrl: true, alt: false, shift: false, key: 'K' })).toBe('Ctrl+K');
    expect(formatShortcut({ ctrl: false, alt: true, shift: true, key: 'K' })).toBe('Alt+Shift+K');
    expect(formatShortcut({ ctrl: true, alt: false, shift: true, key: 'K' })).toBe('Ctrl+Shift+K');
  });

  it('writes what parseShortcut reads, in the same form', () => {
    for (const text of ['Alt+T', 'Ctrl+K', 'Ctrl+Alt+Shift+9', 'Alt+Shift+Q']) expect(formatShortcut(parseShortcut(text) as Shortcut), text).toBe(text);
    expect(formatShortcut(parseShortcut('shift+cmd+x') as Shortcut)).toBe('Ctrl+Shift+X');
  });
});

describe('shortcutKey', () => {
  it('is the key when that is a letter or a digit, in upper case', () => {
    expect(shortcutKey(event('t'))).toBe('T');
    expect(shortcutKey(event('T'))).toBe('T');
    expect(shortcutKey(event('5'))).toBe('5');
    expect(shortcutKey(event('a'))).toBe('A');
    expect(shortcutKey(event('z'))).toBe('Z');
    expect(shortcutKey(event('0'))).toBe('0');
    expect(shortcutKey(event('9'))).toBe('9');
  });

  it('prefers the key to the code, as a keyboard layout decides what a physical key is', () => {
    expect(shortcutKey(event('a', {}, 'KeyQ'))).toBe('A');
    expect(shortcutKey(event('1', {}, 'KeyQ'))).toBe('1');
    expect(shortcutKey(event('1', {}, 'Numpad1'))).toBe('1');
  });

  it('is the letter or digit of the code when the key is something else, as with Option on a Mac', () => {
    expect(shortcutKey(event('†', { altKey: true }, 'KeyT'))).toBe('T');
    expect(shortcutKey(event('Dead', {}, 'KeyZ'))).toBe('Z');
    expect(shortcutKey(event('%', { shiftKey: true }, 'Digit5'))).toBe('5');
    expect(shortcutKey(event('', {}, 'Digit0'))).toBe('0');
  });

  it('is null for a key that is no letter or digit and has no such code', () => {
    expect(shortcutKey(event('Escape'))).toBeNull();
    expect(shortcutKey(event('Enter', {}, 'Enter'))).toBeNull();
    expect(shortcutKey(event('†'))).toBeNull();
    expect(shortcutKey(event('-'))).toBeNull();
    expect(shortcutKey(event('é'))).toBeNull();
    expect(shortcutKey(event('ab'))).toBeNull();
    expect(shortcutKey(event('F5', {}, 'F5'))).toBeNull();
    expect(shortcutKey(event('Clear', {}, 'Numpad1'))).toBeNull();
  });

  it('looks for exactly a letter or digit key in the code', () => {
    for (const code of ['Key1', 'DigitA', 'KeyAB', 'Digit12', 'XKeyA', 'KeyA ', 'keyA', 'digit1', 'Key', 'Digit', '']) {
      expect(shortcutKey(event('Dead', {}, code)), code).toBeNull();
    }
  });
});

describe('matchShortcut', () => {
  it('matches the key with the modifiers of the shortcut', () => {
    expect(matchShortcut(ALT_T, event('t', { altKey: true }))).toBe(true);
    expect(matchShortcut(ALT_T, event('T', { altKey: true }))).toBe(true);
  });

  it('matches by the code where the key is not the letter', () => {
    expect(matchShortcut(ALT_T, event('†', { altKey: true }, 'KeyT'))).toBe(true);
    expect(matchShortcut(ALT_T, event('†', { altKey: true }))).toBe(false);
    expect(matchShortcut({ ctrl: false, alt: true, shift: true, key: '5' }, event('%', { altKey: true, shiftKey: true }, 'Digit5'))).toBe(true);
  });

  it('does not match another key', () => {
    expect(matchShortcut(ALT_T, event('h', { altKey: true }))).toBe(false);
    expect(matchShortcut(ALT_T, event('Escape', { altKey: true }))).toBe(false);
  });

  it('does not match when a modifier is missing or one too many is held', () => {
    expect(matchShortcut(ALT_T, event('t'))).toBe(false);
    expect(matchShortcut(ALT_T, event('t', { altKey: true, shiftKey: true }))).toBe(false);
    expect(matchShortcut(ALT_T, event('t', { altKey: true, ctrlKey: true }))).toBe(false);
    expect(matchShortcut(ALT_T, event('t', { altKey: true, metaKey: true }))).toBe(false);
    const withShift: Shortcut = { ctrl: false, alt: true, shift: true, key: 'T' };
    expect(matchShortcut(withShift, event('t', { altKey: true }))).toBe(false);
    expect(matchShortcut(withShift, event('t', { altKey: true, shiftKey: true }))).toBe(true);
  });

  it('takes Ctrl and Cmd as one modifier', () => {
    const ctrlZ: Shortcut = { ctrl: true, alt: false, shift: false, key: 'Z' };
    expect(matchShortcut(ctrlZ, event('z', { ctrlKey: true }))).toBe(true);
    expect(matchShortcut(ctrlZ, event('z', { metaKey: true }))).toBe(true);
    expect(matchShortcut(ctrlZ, event('z', { ctrlKey: true, metaKey: true }))).toBe(true);
    expect(matchShortcut(ctrlZ, event('z'))).toBe(false);
  });
});

describe('shortcutAction', () => {
  const bindings: readonly ShortcutBinding[] = [
    { tool: 'trend-line', shortcut: ALT_T },
    { tool: 'rectangle', shortcut: { ctrl: true, alt: true, shift: false, key: 'K' } },
  ];

  it('is undo for Ctrl or Cmd with Z', () => {
    expect(shortcutAction(event('z', { ctrlKey: true }), bindings)).toStrictEqual({ type: 'undo' });
    expect(shortcutAction(event('Z', { metaKey: true }), bindings)).toStrictEqual({ type: 'undo' });
  });

  it('is redo for Ctrl or Cmd with Shift and Z, and for Ctrl or Cmd with Y', () => {
    expect(shortcutAction(event('Z', { ctrlKey: true, shiftKey: true }), bindings)).toStrictEqual({ type: 'redo' });
    expect(shortcutAction(event('z', { metaKey: true, shiftKey: true }), bindings)).toStrictEqual({ type: 'redo' });
    expect(shortcutAction(event('y', { ctrlKey: true }), bindings)).toStrictEqual({ type: 'redo' });
    expect(shortcutAction(event('y', { metaKey: true }), bindings)).toStrictEqual({ type: 'redo' });
  });

  it('is nothing for undo and redo keys with another modifier too, or without Ctrl or Cmd', () => {
    expect(shortcutAction(event('z'), [])).toBeNull();
    expect(shortcutAction(event('y'), [])).toBeNull();
    expect(shortcutAction(event('z', { ctrlKey: true, altKey: true }), [])).toBeNull();
    expect(shortcutAction(event('y', { ctrlKey: true, shiftKey: true }), [])).toBeNull();
    expect(shortcutAction(event('y', { ctrlKey: true, altKey: true }), [])).toBeNull();
  });

  it('is the tool of the binding that matches', () => {
    expect(shortcutAction(event('t', { altKey: true }), bindings)).toStrictEqual({ type: 'tool', tool: 'trend-line' });
    expect(shortcutAction(event('k', { altKey: true, ctrlKey: true }), bindings)).toStrictEqual({ type: 'tool', tool: 'rectangle' });
  });

  it('is nothing for a key no binding matches, and nothing without bindings', () => {
    expect(shortcutAction(event('h', { altKey: true }), bindings)).toBeNull();
    expect(shortcutAction(event('t', { altKey: true }), [])).toBeNull();
    expect(shortcutAction(event('Escape'), bindings)).toBeNull();
  });

  it('gives the same frozen action for every undo and every redo', () => {
    const undo = shortcutAction(event('z', { ctrlKey: true }), []);
    expect(shortcutAction(event('z', { metaKey: true }), [])).toBe(undo);
    expect(Object.isFrozen(undo)).toBe(true);
    const redo = shortcutAction(event('y', { ctrlKey: true }), []);
    expect(shortcutAction(event('z', { ctrlKey: true, shiftKey: true }), [])).toBe(redo);
    expect(Object.isFrozen(redo)).toBe(true);
  });
});

describe('resolveShortcuts', () => {
  it('gives the default shortcuts of the catalog, and a binding for each of them in catalog order', () => {
    const { shortcuts, bindings } = resolveShortcuts();
    expect(shortcuts).toStrictEqual({
      'trend-line': 'Alt+T',
      'horizontal-line': 'Alt+H',
      rectangle: 'Alt+R',
      'fibonacci-retracement': 'Alt+F',
      'fibonacci-arcs': null,
      'fibonacci-fans': null,
      'fibonacci-time-zones': null,
      'text-note': 'Alt+N',
    });
    expect(bindings.map((binding) => binding.tool)).toStrictEqual(['trend-line', 'horizontal-line', 'rectangle', 'fibonacci-retracement', 'text-note']);
    expect(bindings[0]).toStrictEqual({ tool: 'trend-line', shortcut: ALT_T });
    expect(bindings[4]).toStrictEqual({ tool: 'text-note', shortcut: { ctrl: false, alt: true, shift: false, key: 'N' } });
  });

  it('is the same with an empty option, and with a tool set to undefined', () => {
    expect(resolveShortcuts({})).toStrictEqual(resolveShortcuts());
    expect(resolveShortcuts({ rectangle: undefined })).toStrictEqual(resolveShortcuts());
  });

  it('writes a shortcut that is given in the form of formatShortcut', () => {
    const { shortcuts, bindings } = resolveShortcuts({ 'trend-line': 'ctrl+alt+l', 'fibonacci-arcs': 'cmd+shift+q' });
    expect(shortcuts['trend-line']).toBe('Ctrl+Alt+L');
    expect(shortcuts['fibonacci-arcs']).toBe('Ctrl+Shift+Q');
    expect(bindings.find((binding) => binding.tool === 'trend-line')?.shortcut).toStrictEqual({ ctrl: true, alt: true, shift: false, key: 'L' });
    expect(shortcuts['horizontal-line']).toBe('Alt+H');
  });

  it('turns a shortcut off with null, in the shortcuts and in the bindings', () => {
    const { shortcuts, bindings } = resolveShortcuts({ rectangle: null, 'trend-line': null });
    expect(shortcuts.rectangle).toBeNull();
    expect(shortcuts['trend-line']).toBeNull();
    expect(bindings.map((binding) => binding.tool)).toStrictEqual(['horizontal-line', 'fibonacci-retracement', 'text-note']);
  });

  it('can give a tool a key that another tool has by default, once that tool has moved on', () => {
    const { shortcuts } = resolveShortcuts({ 'trend-line': 'Alt+H', 'horizontal-line': 'Alt+T' });
    expect(shortcuts['trend-line']).toBe('Alt+H');
    expect(shortcuts['horizontal-line']).toBe('Alt+T');
    expect(resolveShortcuts({ 'trend-line': 'Alt+H', 'horizontal-line': null }).shortcuts['trend-line']).toBe('Alt+H');
  });

  it('gives a shortcut to a tool that has none by default', () => {
    expect(resolveShortcuts({ 'fibonacci-time-zones': 'Alt+Z' }).shortcuts['fibonacci-time-zones']).toBe('Alt+Z');
  });

  it('is frozen', () => {
    const resolved = resolveShortcuts();
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.shortcuts)).toBe(true);
    expect(Object.isFrozen(resolved.bindings)).toBe(true);
  });

  it('rejects a name that is not a drawing kind with KFT-E-KIND, listing all of them', () => {
    const error = thrown(() => resolveShortcuts({ pitchfork: 'Alt+P', 'trend-line': 'Alt+L', arrow: null } as never));
    expect(error).toBeInstanceOf(DrawingError);
    expect((error as DrawingError).issues).toStrictEqual([{ code: 'KFT-E-KIND', message: 'Unknown drawing kinds in shortcuts: pitchfork, arrow.' }]);
  });

  it('rejects a shortcut that is not valid, naming the tool', () => {
    const message = 'The shortcut of rectangle must be Ctrl, Alt and Shift joined with + before a letter or a digit, with Ctrl or Alt among them (for example Alt+T), or null.';
    for (const bad of ['T', '', 'Alt+', 'Shift+R', 'Alt+Alt+R', 'F5', 5, true, {}, []]) {
      expect(
        thrown(() => resolveShortcuts({ rectangle: bad as never })),
        String(bad)
      ).toStrictEqual(new RangeError(message));
    }
    expect(thrown(() => resolveShortcuts({ rectangle: 'x' as never }))).toBeInstanceOf(RangeError);
  });

  it('rejects the keys the tools use themselves: Ctrl or Cmd with A, D, Z or Y', () => {
    for (const [text, written] of [
      ['Ctrl+A', 'Ctrl+A'],
      ['cmd+d', 'Ctrl+D'],
      ['Ctrl+Z', 'Ctrl+Z'],
      ['Ctrl+Shift+Z', 'Ctrl+Shift+Z'],
      ['Cmd+Y', 'Ctrl+Y'],
      ['ctrl+shift+a', 'Ctrl+Shift+A'],
    ] as const) {
      expect(
        thrown(() => resolveShortcuts({ 'fibonacci-arcs': text })),
        text
      ).toStrictEqual(new RangeError(`The shortcut ${written} of fibonacci-arcs is used by undo, redo, select all or duplicate.`));
    }
  });

  it('allows other Ctrl keys, and those four letters with Alt', () => {
    expect(resolveShortcuts({ 'fibonacci-arcs': 'Ctrl+Q' }).shortcuts['fibonacci-arcs']).toBe('Ctrl+Q');
    expect(resolveShortcuts({ 'fibonacci-arcs': 'Ctrl+B' }).shortcuts['fibonacci-arcs']).toBe('Ctrl+B');
    expect(resolveShortcuts({ 'fibonacci-arcs': 'Ctrl+Alt+Z' }).shortcuts['fibonacci-arcs']).toBe('Ctrl+Alt+Z');
    for (const letter of ['A', 'D', 'Z', 'Y']) expect(resolveShortcuts({ 'fibonacci-arcs': `Alt+${letter}` }).shortcuts['fibonacci-arcs']).toBe(`Alt+${letter}`);
    expect(resolveShortcuts({ 'fibonacci-arcs': 'Alt+Shift+Z' }).shortcuts['fibonacci-arcs']).toBe('Alt+Shift+Z');
  });

  it('rejects a shortcut that two tools share, naming both, whichever way it is written', () => {
    expect(thrown(() => resolveShortcuts({ 'trend-line': 'Alt+H' }))).toStrictEqual(new RangeError('The shortcut Alt+H is given to both trend-line and horizontal-line.'));
    expect(thrown(() => resolveShortcuts({ 'fibonacci-arcs': 'alt+n' }))).toStrictEqual(new RangeError('The shortcut Alt+N is given to both fibonacci-arcs and text-note.'));
    expect(thrown(() => resolveShortcuts({ 'fibonacci-arcs': 'Ctrl+Q', 'fibonacci-fans': 'cmd+q' }))).toStrictEqual(
      new RangeError('The shortcut Ctrl+Q is given to both fibonacci-arcs and fibonacci-fans.')
    );
  });

  it('checks the shortcuts in the order of the catalog', () => {
    // The unknown name comes first of all; after that the first tool of the catalog with a problem is the one named.
    expect(thrown(() => resolveShortcuts({ 'text-note': 'T', 'trend-line': 'Ctrl+Z' }))).toStrictEqual(
      new RangeError('The shortcut Ctrl+Z of trend-line is used by undo, redo, select all or duplicate.')
    );
  });
});
