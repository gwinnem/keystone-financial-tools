import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  createDrawingTools,
  IDLE_STATE,
  IDLE_TOOLBAR,
  liveRegionText,
  resolveMessages,
  TextEditor,
  type Drawing,
  type DrawingHost,
  type DrawingKind,
  type DrawingStore,
  type DrawingTheme,
  type DrawingTools,
  type DrawingToolsOptions,
  type DrawingToolsRuntimeOptions,
  type DrawingToolsState,
  type MagnetMode,
  type Messages,
  type TextEditSession,
  type ToolbarEntry,
} from 'keystone-financial-tools-core';
import { useDrawings } from './use-drawings';

/** The options of `createDrawingTools`, except that `editText` can also be `false`. */
export interface UseDrawingToolsOptions extends Omit<DrawingToolsOptions, 'editText'> {
  /**
   * The editor of text notes for a host that has none. Left out, the default editor is used: render
   * `KeystoneTextEditor` with `textEdit`. A function replaces it; `false` leaves new notes empty and
   * not editable.
   */
  readonly editText?: DrawingToolsOptions['editText'] | false;
  /**
   * Keep `announcement` up to date with the `announce` events of the tools (NFR-A11Y-001), for a live region
   * such as `KeystoneLiveRegion`. Default true; with `false` `announcement` stays empty. Read once, like the other options.
   */
  readonly announcements?: boolean;
}

/** What `useDrawingTools` returns. */
export interface UseDrawingTools {
  /** The controller: `getScene()` and `hitTest()` for the host, and `on()` for events. Null until there is a host. */
  readonly tools: DrawingTools | null;
  /** The store the tools draw into: the one given in the options, otherwise a new one kept across renders. */
  readonly store: DrawingStore;
  /** The state of the tools, a new object whenever a value in it changes. Idle until there is a host. */
  readonly state: DrawingToolsState;
  /**
   * The toolbar (FR-FW-040): every tool of `TOOL_CATALOG` with `active`, `enabled` and the shortcut in use.
   * The same array until an entry changes; every entry is disabled until there is a host.
   * Render a button per entry and call `activate(entry.id)`.
   */
  readonly toolbar: readonly ToolbarEntry[];
  /**
   * Every user-visible text (NFR-I18N-001): the English ones with the `messages` option on top, also before
   * there is a host. Use `messages[entry.labelKey]` for the label of a toolbar entry and `messages['editor.note']`
   * for the `label` of `KeystoneTextEditor`. Read once, like the other options.
   */
  readonly messages: Messages;
  /** The drawings; the component re-renders on every store change. */
  readonly drawings: readonly Drawing[];
  /** The note editor that is open, or null. Show it with `KeystoneTextEditor` or your own editor. */
  readonly textEdit: TextEditSession | null;
  /**
   * What a screen reader is to be told (NFR-A11Y-001): the last `announce` message of the tools, in the language of the
   * `messages` option; a message that repeats the one before it has a no-break space added so that it is read again. Empty
   * until the first one, and again when the tools are destroyed. Show it with `KeystoneLiveRegion`, or in a polite live region of your own.
   */
  readonly announcement: string;
  /** The actions do nothing, and `undo` and `redo` give false, until there is a host. */
  activate(kind: DrawingKind): void;
  deactivate(): void;
  select(ids: readonly string[]): void;
  clearSelection(): void;
  remove(ids: readonly string[]): void;
  undo(): boolean;
  redo(): boolean;
  setMagnet(mode: MagnetMode): void;
  setTheme(theme: DrawingTheme): void;
  setOptions(options: DrawingToolsRuntimeOptions): void;
}

const NO_SUBSCRIPTION = (): void => undefined;

/**
 * The drawing tools for a React component (FR-FW-010): creates the controller for `host` and keeps
 * `state`, `toolbar`, `drawings`, the open note editor and the `announcement` in the component's state, and gives the `messages`. It only maps the
 * controller's events to React; everything else is the core's.
 *
 * The controller is created when the component has mounted and `host` is given (a chart is often
 * only there after its first render, so pass null or undefined until it is), and destroyed, with the
 * listeners on the host removed, when the component unmounts or `host` or the store change. It is
 * created once per mount, also in `StrictMode`. The options are read when the controller is created;
 * change them later with `setMagnet`, `setTheme` and `setOptions`.
 *
 * @example
 * ```tsx
 * const { tools, state, toolbar, messages, drawings, textEdit, announcement, activate, undo } = useDrawingTools(host, { magnet: 'weak', messages: { 'tool.trend-line': 'Trendlinie' } });
 * // in the host's overlay render pass:
 * for (const item of tools?.getScene() ?? []) paint(item);
 * // in the JSX:
 * // {toolbar.map((tool) => <button key={tool.id} disabled={!tool.enabled} aria-pressed={tool.active} onClick={() => activate(tool.id)}>{messages[tool.labelKey]}</button>)}
 * // <KeystoneTextEditor session={textEdit} label={messages['editor.note']} />
 * // <KeystoneLiveRegion message={announcement} />
 * ```
 */
export function useDrawingTools(host: DrawingHost | null | undefined, options?: UseDrawingToolsOptions): UseDrawingTools {
  const { store, drawings } = useDrawings(options?.store);
  // `subscribe` uses `this`, so it is bound once here and handed to React as it is.
  const [{ editor, subscribeEditor }] = useState(() => {
    const created = new TextEditor();
    return { editor: created, subscribeEditor: created.subscribe.bind(created) };
  });
  const [tools, setTools] = useState<DrawingTools | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // Resolved once, so a bad key is an error on the first render and the texts do not change under the toolbar.
  const [messages] = useState(() => resolveMessages(options?.messages));
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    if (host === null || host === undefined) return undefined;
    const given = optionsRef.current;
    const editText = given?.editText === undefined ? editor.edit : given.editText === false ? undefined : given.editText;
    const created = createDrawingTools(host, { ...given, store, editText });
    // The listener goes with the controller: `destroy` clears them all.
    if (given?.announcements !== false) created.on('announce', (message) => setAnnouncement((previous) => liveRegionText(previous, message)));
    setTools(created);
    return () => {
      // Destroyed first: the answer of an editor that is cancelled now is dropped, not applied.
      created.destroy();
      editor.cancel();
      setTools(null);
      setAnnouncement('');
    };
  }, [host, store, editor]);

  const magnet = options?.magnet ?? 'off';
  const idle = useMemo<DrawingToolsState>(() => ({ activeTool: null, interaction: IDLE_STATE, selection: [], hover: null, canUndo: false, canRedo: false, magnet, toolbar: IDLE_TOOLBAR }), [magnet]);
  const state = useSyncExternalStore(
    useCallback((onChange) => (tools === null ? NO_SUBSCRIPTION : tools.on('state', () => onChange())), [tools]),
    useCallback(() => (tools === null ? idle : tools.getState()), [tools, idle])
  );
  const textEdit = useSyncExternalStore(subscribeEditor, () => editor.session);

  const activate = useCallback((kind: DrawingKind) => tools?.activate(kind), [tools]);
  const deactivate = useCallback(() => tools?.deactivate(), [tools]);
  const select = useCallback((ids: readonly string[]) => tools?.select(ids), [tools]);
  const clearSelection = useCallback(() => tools?.clearSelection(), [tools]);
  const remove = useCallback((ids: readonly string[]) => tools?.remove(ids), [tools]);
  const undo = useCallback(() => tools?.undo() ?? false, [tools]);
  const redo = useCallback(() => tools?.redo() ?? false, [tools]);
  const setMagnet = useCallback((mode: MagnetMode) => tools?.setMagnet(mode), [tools]);
  const setTheme = useCallback((theme: DrawingTheme) => tools?.setTheme(theme), [tools]);
  const setOptions = useCallback((runtime: DrawingToolsRuntimeOptions) => tools?.setOptions(runtime), [tools]);

  return { tools, store, state, toolbar: state.toolbar, messages, drawings, textEdit, announcement, activate, deactivate, select, clearSelection, remove, undo, redo, setMagnet, setTheme, setOptions };
}
