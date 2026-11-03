import { onScopeDispose, shallowRef, type Ref } from 'vue';
import {
  createDrawingTools,
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
  type TextEditSession,
} from 'keystone-financial-tools-core';
import { useDrawings } from './use-drawings';

/** The options of `createDrawingTools`, except that `editText` can also be `false`. */
export interface UseDrawingToolsOptions extends Omit<DrawingToolsOptions, 'editText'> {
  /**
   * The editor of text notes for a host that has none. Left out, the default editor is used: render
   * `KeystoneTextEditor` with `textEdit` inside the chart's element. A function replaces it; `false`
   * leaves new notes empty and not editable.
   */
  readonly editText?: DrawingToolsOptions['editText'] | false;
}

/** What `useDrawingTools` returns. */
export interface UseDrawingTools {
  /** The controller: `getScene()` and `hitTest()` for the host, and `on()` for events. */
  readonly tools: DrawingTools;
  /** The store the tools draw into: the one given in the options, otherwise a new one. */
  readonly store: DrawingStore;
  /** The state of the tools, replaced whenever a value in it changes. */
  readonly state: Readonly<Ref<DrawingToolsState>>;
  /** The drawings, replaced on every store change. */
  readonly drawings: Readonly<Ref<readonly Drawing[]>>;
  /** The note editor that is open, or null. Show it with `KeystoneTextEditor` or your own editor. */
  readonly textEdit: Readonly<Ref<TextEditSession | null>>;
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

/**
 * The drawing tools for a Vue component (FR-FW-010): creates the controller for `host`, and keeps
 * `state`, `drawings` and the open note editor in refs. It only maps the controller's events to
 * refs; everything else is the core's. The controller is destroyed, and the host's listeners removed,
 * when the calling effect scope (for example the component) is disposed.
 *
 * @example
 * ```ts
 * const { tools, state, drawings, textEdit, activate, undo } = useDrawingTools(host, { magnet: 'weak' });
 * // in the host's overlay render pass:
 * for (const item of tools.getScene()) paint(item);
 * // in the template: <KeystoneTextEditor :session="textEdit" />
 * ```
 */
export function useDrawingTools(host: DrawingHost, options?: UseDrawingToolsOptions): UseDrawingTools {
  const { store, drawings } = useDrawings(options?.store);
  const editor = new TextEditor();
  const editText = options?.editText === undefined ? editor.edit : options.editText === false ? undefined : options.editText;
  const tools = createDrawingTools(host, { ...options, store, editText });
  const state = shallowRef(tools.getState());
  const textEdit = shallowRef<TextEditSession | null>(null);
  tools.on('state', (next) => {
    state.value = next;
  });
  editor.subscribe((session) => {
    textEdit.value = session;
  });
  onScopeDispose(() => {
    // Destroyed first: the answer of an editor that is cancelled now is dropped, not applied.
    // The subscriptions belong to objects that go with the scope, so they need no unsubscribing.
    tools.destroy();
    editor.cancel();
  });
  return {
    tools,
    store,
    state,
    drawings,
    textEdit,
    activate: (kind) => tools.activate(kind),
    deactivate: () => tools.deactivate(),
    select: (ids) => tools.select(ids),
    clearSelection: () => tools.clearSelection(),
    remove: (ids) => tools.remove(ids),
    undo: () => tools.undo(),
    redo: () => tools.redo(),
    setMagnet: (mode) => tools.setMagnet(mode),
    setTheme: (theme) => tools.setTheme(theme),
    setOptions: (runtime) => tools.setOptions(runtime),
  };
}
