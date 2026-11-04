import { TOOL_CATALOG } from './catalog';
import { DrawingError } from './errors';
import type { HostKeyEvent } from './host';
import { isDrawingKind } from './kinds';
import type { DrawingKind } from './types';

/**
 * A key combination: Ctrl (which is also Cmd), Alt and Shift, and one letter or digit.
 *
 * @example
 * ```ts
 * const shortcut: Shortcut = { ctrl: false, alt: true, shift: false, key: 'T' }; // Alt+T
 * ```
 */
export interface Shortcut {
  /** Ctrl or Cmd: the host's `ctrlKey` or `metaKey`. */
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  /** One upper-case letter or one digit. */
  readonly key: string;
}

/** The shortcut of each tool, written `Alt+T`; null when the tool has none. */
export type ToolShortcuts = { readonly [K in DrawingKind]: string | null };

/**
 * The `shortcuts` option: the shortcut of the tools to change. A tool left out (or `undefined`) keeps
 * its default from `TOOL_CATALOG`; `null` turns it off.
 *
 * @example
 * ```ts
 * const shortcuts: ShortcutOptions = { 'trend-line': 'Ctrl+Alt+L', 'fibonacci-arcs': 'Alt+A', 'text-note': null };
 * ```
 */
export type ShortcutOptions = { readonly [K in DrawingKind]?: string | null };

/** A tool and the key combination that activates it. */
export interface ShortcutBinding {
  readonly tool: DrawingKind;
  readonly shortcut: Shortcut;
}

/** What `resolveShortcuts` makes of the `shortcuts` option: the text of each tool's shortcut, and the combinations to listen for. */
export interface ResolvedShortcuts {
  readonly shortcuts: ToolShortcuts;
  readonly bindings: readonly ShortcutBinding[];
}

/** What a key event asks for. */
export type ShortcutAction = { readonly type: 'undo' } | { readonly type: 'redo' } | { readonly type: 'tool'; readonly tool: DrawingKind };

const UNDO_KEY: Shortcut = { ctrl: true, alt: false, shift: false, key: 'Z' };
const REDO_KEYS: readonly Shortcut[] = [
  { ctrl: true, alt: false, shift: true, key: 'Z' },
  { ctrl: true, alt: false, shift: false, key: 'Y' },
];
const UNDO: ShortcutAction = Object.freeze({ type: 'undo' });
const REDO: ShortcutAction = Object.freeze({ type: 'redo' });
/** The letters Ctrl or Cmd already means something for: undo, redo (Z, Y), select all (A) and duplicate (D). */
const RESERVED_KEYS: readonly string[] = ['A', 'D', 'Z', 'Y'];
const MODIFIERS: readonly string[] = ['ctrl', 'cmd', 'alt', 'shift'];
const LETTER_OR_DIGIT = /^[a-z0-9]$/i;
const PHYSICAL_KEY = /^(?:Key[A-Z]|Digit[0-9])$/;

/**
 * Reads a shortcut such as `Alt+T` or `ctrl+shift+9`: any of `Ctrl` (or `Cmd`, the same), `Alt` and
 * `Shift`, each at most once and in any case, then one letter or digit. It needs Ctrl or Alt, so a
 * shortcut never takes the keys the user types with. Returns null for anything else.
 *
 * @example
 * ```ts
 * parseShortcut('alt+t'); // { ctrl: false, alt: true, shift: false, key: 'T' }
 * parseShortcut('T'); // null: needs Ctrl or Alt
 * ```
 */
export function parseShortcut(text: string): Shortcut | null {
  const parts = text.split('+');
  const key = parts.pop() as string;
  if (!LETTER_OR_DIGIT.test(key)) return null;
  const held = new Set<string>();
  for (const part of parts) {
    const name = part.toLowerCase();
    if (!MODIFIERS.includes(name)) return null;
    const modifier = name === 'cmd' ? 'ctrl' : name;
    if (held.has(modifier)) return null;
    held.add(modifier);
  }
  if (!held.has('ctrl') && !held.has('alt')) return null;
  return { ctrl: held.has('ctrl'), alt: held.has('alt'), shift: held.has('shift'), key: key.toUpperCase() };
}

/**
 * The text of a shortcut: `Ctrl`, `Alt` and `Shift` in that order, then the key; the form `parseShortcut`
 * accepts and `ToolShortcuts` holds.
 *
 * @example
 * ```ts
 * formatShortcut({ ctrl: true, alt: false, shift: true, key: 'K' }); // 'Ctrl+Shift+K'
 * ```
 */
export function formatShortcut(shortcut: Shortcut): string {
  const names: string[] = [];
  if (shortcut.ctrl) names.push('Ctrl');
  if (shortcut.alt) names.push('Alt');
  if (shortcut.shift) names.push('Shift');
  names.push(shortcut.key);
  return names.join('+');
}

/**
 * The letter or digit a key event stands for, upper-case, or null. It is `key` when that is a letter
 * or a digit, and otherwise the physical key in `code`: Option+T on a Mac gives the key `'†'` but the
 * code `'KeyT'`, and Shift+5 the key `'%'` but the code `'Digit5'`.
 *
 * @example
 * ```ts
 * shortcutKey({ key: '†', code: 'KeyT', shiftKey: false, ctrlKey: false, altKey: true, metaKey: false }); // 'T'
 * ```
 */
export function shortcutKey(event: HostKeyEvent): string | null {
  if (LETTER_OR_DIGIT.test(event.key)) return event.key.toUpperCase();
  const code = event.code;
  // A missing code is the text `undefined`, which is not a physical key either.
  return PHYSICAL_KEY.test(String(code)) ? (code as string).slice(-1) : null;
}

/**
 * True when a key event is exactly this shortcut: the same modifiers and the same key (Ctrl and Cmd
 * count as one).
 *
 * @example
 * ```ts
 * matchShortcut({ ctrl: false, alt: true, shift: false, key: 'T' }, { key: 't', shiftKey: false, ctrlKey: false, altKey: true, metaKey: false }); // true
 * ```
 */
export function matchShortcut(shortcut: Shortcut, event: HostKeyEvent): boolean {
  return (event.ctrlKey || event.metaKey) === shortcut.ctrl && event.altKey === shortcut.alt && event.shiftKey === shortcut.shift && shortcutKey(event) === shortcut.key;
}

/**
 * What a key event asks for: undo (Ctrl or Cmd with Z), redo (Ctrl or Cmd with Shift and Z, or with Y),
 * the tool of a binding, or null.
 *
 * @example
 * ```ts
 * shortcutAction(event, resolveShortcuts().bindings); // { type: 'tool', tool: 'trend-line' } for Alt+T
 * ```
 */
export function shortcutAction(event: HostKeyEvent, bindings: readonly ShortcutBinding[]): ShortcutAction | null {
  if (matchShortcut(UNDO_KEY, event)) return UNDO;
  if (REDO_KEYS.some((shortcut) => matchShortcut(shortcut, event))) return REDO;
  const found = bindings.find((binding) => matchShortcut(binding.shortcut, event));
  return found === undefined ? null : { type: 'tool', tool: found.tool };
}

/**
 * Reads the `shortcuts` option over the defaults of `TOOL_CATALOG`. Throws `KFT-E-KIND` for a name that
 * is not a drawing kind, and `RangeError` for a shortcut that is not valid (`parseShortcut`), that is
 * one of the keys the tools use themselves (Ctrl or Cmd with A, D, Z or Y) or that two tools share.
 * `createDrawingTools` calls it, so an invalid option is an error at creation.
 *
 * @example
 * ```ts
 * const { shortcuts } = resolveShortcuts({ 'trend-line': 'alt+l', rectangle: null });
 * shortcuts['trend-line']; // 'Alt+L'
 * shortcuts.rectangle; // null
 * ```
 */
export function resolveShortcuts(options: ShortcutOptions = {}): ResolvedShortcuts {
  const unknown = Object.keys(options).filter((name) => !isDrawingKind(name));
  if (unknown.length > 0) throw new DrawingError([{ code: 'KFT-E-KIND', message: `Unknown drawing kinds in shortcuts: ${unknown.join(', ')}.` }]);
  const shortcuts = {} as Record<DrawingKind, string | null>;
  const bindings: ShortcutBinding[] = [];
  const owners = new Map<string, DrawingKind>();
  for (const { id, shortcut: standard } of TOOL_CATALOG) {
    const given = options[id];
    const wanted = given === undefined ? standard : given;
    if (wanted === null) {
      shortcuts[id] = null;
      continue;
    }
    const parsed = typeof wanted === 'string' ? parseShortcut(wanted) : null;
    if (parsed === null) {
      throw new RangeError(`The shortcut of ${id} must be Ctrl, Alt and Shift joined with + before a letter or a digit, with Ctrl or Alt among them (for example Alt+T), or null.`);
    }
    const text = formatShortcut(parsed);
    if (parsed.ctrl && !parsed.alt && RESERVED_KEYS.includes(parsed.key)) {
      throw new RangeError(`The shortcut ${text} of ${id} is used by undo, redo, select all or duplicate.`);
    }
    const owner = owners.get(text);
    if (owner !== undefined) throw new RangeError(`The shortcut ${text} is given to both ${owner} and ${id}.`);
    owners.set(text, id);
    shortcuts[id] = text;
    bindings.push({ tool: id, shortcut: parsed });
  }
  return Object.freeze({ shortcuts: Object.freeze(shortcuts), bindings: Object.freeze(bindings) });
}
