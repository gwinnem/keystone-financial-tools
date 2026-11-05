import { computed, onScopeDispose, shallowRef, type Ref } from 'vue';
import {
  createDrawingTools,
  liveRegionText,
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
   * `KeystoneTextEditor` with `textEdit` inside the chart's element. A function replaces it; `false`
   * leaves new notes empty and not editable.
   */
  readonly editText?: DrawingToolsOptions['editText'] | false;
  /**
   * Keep `announcement` up to date with the `announce` events of the tools (NFR-A11Y-001), for a live region
   * such as `KeystoneLiveRegion`. Default true; with `false` `announcement` stays empty.
   */
  readonly announcements?: boolean;
}

/** What `useDrawingTools` returns. */
export interface UseDrawingTools {
  /** The controller: `getScene()` and `hitTest()` for the host, and `on()` for events. */
  readonly tools: DrawingTools;
  /** The store the tools draw into: the one given in the options, otherwise a new one. */
  readonly store: DrawingStore;
  /** The state of the tools, replaced whenever a value in it changes. */
  readonly state: Readonly<Ref<DrawingToolsState>>;
  /**
   * The toolbar (FR-FW-040): every tool of `TOOL_CATALOG` with `active`, `enabled` and the shortcut in use.
   * The same array until an entry changes. Render a button per entry and call `activate(entry.id)`.
   */
  readonly toolbar: Readonly<Ref<readonly ToolbarEntry[]>>;
  /**
   * Every user-visible text (NFR-I18N-001): the English ones with the `messages` option on top. Use
   * `messages[entry.labelKey]` for the label of a toolbar entry and `messages['editor.note']` for the
   * `label` of `KeystoneTextEditor`.
   */
  readonly messages: Messages;
  /** The drawings, replaced on every store change. */
  readonly drawings: Readonly<Ref<readonly Drawing[]>>;
  /** The note editor that is open, or null. Show it with `KeystoneTextEditor` or your own editor. */
  readonly textEdit: Readonly<Ref<TextEditSession | null>>;
  /**
   * What a screen reader is to be told (NFR-A11Y-001): the last `announce` message of the tools, in the language of the
   * `messages` option; a message that repeats the one before it has a no-break space added so that it is read again. Empty
   * until the first one. Show it with `KeystoneLiveRegion`, or in a polite live region of your own.
   */
  readonly announcement: Readonly<Ref<string>>;
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
 * `state`, `toolbar`, `drawings`, the open note editor and the `announcement` in refs, and gives the `messages`. It only maps the controller's events to
 * refs; everything else is the core's. The controller is destroyed, and the host's listeners removed,
 * when the calling effect scope (for example the component) is disposed.
 *
 * @example
 * ```ts
 * const { tools, state, toolbar, messages, drawings, textEdit, announcement, activate, undo } = useDrawingTools(host, { magnet: 'weak', messages: { 'tool.trend-line': 'Trendlinie' } });
 * // in the host's overlay render pass:
 * for (const item of tools.getScene()) paint(item);
 * // in the template:
 * // <button v-for="tool in toolbar" :key="tool.id" :disabled="!tool.enabled" :aria-pressed="tool.active" @click="activate(tool.id)">{{ messages[tool.labelKey] }}</button>
 * // <KeystoneTextEditor :session="textEdit" :label="messages['editor.note']" />
 * // <KeystoneLiveRegion :message="announcement" />
 * ```
 */
export function useDrawingTools(host: DrawingHost, options?: UseDrawingToolsOptions): UseDrawingTools {
  const { store, drawings } = useDrawings(options?.store);
  const editor = new TextEditor();
  const editText = options?.editText === undefined ? editor.edit : options.editText === false ? undefined : options.editText;
  const tools = createDrawingTools(host, { ...options, store, editText });
  const state = shallowRef(tools.getState());
  const toolbar = computed(() => state.value.toolbar);
  const textEdit = shallowRef<TextEditSession | null>(null);
  const announcement = shallowRef('');
  tools.on('state', (next) => {
    state.value = next;
  });
  if (options?.announcements !== false) {
    tools.on('announce', (message) => {
      announcement.value = liveRegionText(announcement.value, message);
    });
  }
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
    toolbar,
    messages: tools.messages,
    drawings,
    textEdit,
    announcement,
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
