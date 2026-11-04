import { toolbarEntries, type ToolbarEntry } from './catalog';
import { Disposables } from './disposables';
import { DrawingError } from './errors';
import { assertHost } from './host-check';
import { connectHost } from './host-connection';
import type { PriceFormatter } from './geometry/types';
import { GeometryCache } from './hit/geometry-cache';
import { hitTest, type HitResult } from './hit/hit-test';
import type { DrawingHost, HostKeyEvent, HostPointerEvent, Point, PointerType, TextEditRequest } from './host';
import { History, type HistoryOptions, type HistoryTransaction } from './history';
import { cursorFor, CursorSync } from './interaction/cursor';
import { duplicateDrawing } from './interaction/duplicate';
import type { Gesture, GestureOptions } from './interaction/gesture';
import { GestureRecogniser } from './interaction/gesture';
import { reduceInteraction } from './interaction/machine';
import { dragHandle, handleSnap, keyboardCursorStart, moveDrawings, moveKeyboardCursor, nudgeAnchors } from './interaction/move';
import { lockAngle, PLACEMENT_START, placementPreview, placementSnap, reducePlacement, type PlacementInput, type PlacementProgress } from './interaction/placement';
import { effectiveMagnet, type MagnetMode } from './interaction/snap';
import { IDLE_STATE, type InteractionContext, type InteractionEffect, type InteractionInput, type InteractionResult, type InteractionState } from './interaction/types';
import { createId as defaultCreateId } from './ids';
import { DRAWING_KINDS, isDrawingKind } from './kinds';
import { resolveMessages, type MessageOverrides, type Messages } from './messages';
import { anchorToPoint } from './projection';
import { SceneCache } from './scene/scene-cache';
import type { SceneItem, SceneOptions } from './scene/types';
import { resolveShortcuts, shortcutAction, type ShortcutAction, type ShortcutBinding, type ShortcutOptions, type ToolShortcuts } from './shortcuts';
import { DrawingStore } from './store';
import { resolveStyle, type DrawingTheme } from './theme';
import type { Anchor, Drawing, DrawingKind, StoreChange } from './types';

/**
 * Options of `createDrawingTools`. Everything is optional.
 *
 * @example
 * ```ts
 * const tools = createDrawingTools(host, { magnet: 'weak', stayInTool: true, tools: ['trend-line', 'rectangle'] });
 * ```
 */
export interface DrawingToolsOptions {
  /** The store to draw into. Default: a new empty store. */
  readonly store?: DrawingStore;
  /** Undo history options (`limit`, `coalesceKeys`, `coalesceMs`). */
  readonly history?: HistoryOptions;
  /** The magnet mode; the user can invert it with Ctrl/Cmd. Default `off`. */
  readonly magnet?: MagnetMode;
  /** The theme of the scene and of hit-testing. Default `LIGHT_THEME`. */
  readonly theme?: DrawingTheme;
  /** Keep the tool active after a drawing is placed. Default false. */
  readonly stayInTool?: boolean;
  /** The drawing kinds that can be activated. Default: all. */
  readonly tools?: readonly DrawingKind[];
  /**
   * The keyboard shortcut of each tool, for example `{ 'trend-line': 'Alt+L', rectangle: null }`: a tool left
   * out keeps its default from `TOOL_CATALOG`, `null` turns one off (FR-FW-041). Invalid shortcuts are an
   * error at creation, see `resolveShortcuts`. Ctrl or Cmd with Z, Shift and Z, or Y is always undo and redo.
   */
  readonly shortcuts?: ShortcutOptions;
  /**
   * Texts to replace, for example `{ 'tool.trend-line': 'Trendlinie' }` (NFR-I18N-001): a key left out keeps
   * its English text from `DEFAULT_MESSAGES`. An unknown key or an empty text is an error at creation, see
   * `resolveMessages`. The result is `DrawingTools.messages`.
   */
  readonly messages?: MessageOverrides;
  /** Thresholds and clock of the gesture recogniser. */
  readonly gestures?: GestureOptions;
  /** Formats the price on the label of a horizontal line (FR-SC-001). Default: 2 decimals. */
  readonly priceFormatter?: PriceFormatter;
  /** The y-axis a keyboard cursor starts on before the first anchor is placed. Default `price`. */
  readonly defaultYAxisId?: string;
  /** Makes the ids of new drawings. Default `createId`. */
  readonly createId?: () => string;
  /** Called with a message for every input the state machine ignores (debug level only). */
  readonly debug?: (message: string) => void;
  /**
   * The editor of text notes for a host that has no `editText` (FR-INT-050); a host's own editor is
   * used when it has one. It resolves with the new text, or null when the editing is cancelled. The
   * adapters pass the `edit` of a `TextEditor` here.
   */
  readonly editText?: (request: TextEditRequest) => Promise<string | null>;
}

/** The options `setOptions` can change while the tools run. */
export interface DrawingToolsRuntimeOptions {
  readonly stayInTool?: boolean;
  readonly tools?: readonly DrawingKind[];
}

/**
 * The state of the tools as an immutable snapshot (FR-INT-061): the same object until a value
 * changes, so adapters can compare by reference.
 */
export interface DrawingToolsState {
  /** The tool being used to place drawings, or null. */
  readonly activeTool: DrawingKind | null;
  readonly interaction: InteractionState;
  /** The selected drawings (also while one is dragged or edited). */
  readonly selection: readonly string[];
  /** The drawing under the pointer, while idle or selected. */
  readonly hover: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly magnet: MagnetMode;
  /**
   * The toolbar (FR-FW-040): every tool of `TOOL_CATALOG` with `active` and `enabled` and the shortcut in
   * use. The same array until an entry changes, so a toolbar re-renders only when it has to.
   */
  readonly toolbar: readonly ToolbarEntry[];
}

/** Locked drawings were asked to change (`KFT-E-LOCKED`). */
export interface DrawingToolsBlocked {
  readonly code: 'KFT-E-LOCKED';
  readonly ids: readonly string[];
}

/** Where a caught error came from. */
export type DrawingToolsErrorSource = 'pointer' | 'key' | 'viewport' | 'store' | 'history' | 'action' | 'scene' | 'text-editor' | 'listener';

/** An exception the tools caught instead of throwing it into the host (NFR-REL-001). */
export interface DrawingToolsError {
  readonly source: DrawingToolsErrorSource;
  readonly message: string;
  /** What was thrown. */
  readonly error: unknown;
}

/** The payload of each event of `DrawingTools.on`. */
export interface DrawingToolsEvents {
  /** The store changed. */
  change: StoreChange;
  /** The selection changed. */
  selection: readonly string[];
  /** The active tool changed. */
  tool: DrawingKind | null;
  /** The interaction state changed. */
  interaction: InteractionState;
  /** Any value of the state changed. */
  state: DrawingToolsState;
  blocked: DrawingToolsBlocked;
  error: DrawingToolsError;
}

export type DrawingToolsEventName = keyof DrawingToolsEvents;

/**
 * The controller: the host, the store, the history and the tools behind one small API
 * (SDS 9.7). Create it with `createDrawingTools`.
 */
export interface DrawingTools {
  /** Every user-visible text: `DEFAULT_MESSAGES` with the `messages` option on top (NFR-I18N-001). Use `messages[entry.labelKey]` for the label of a toolbar entry. */
  readonly messages: Messages;
  /** Starts placing drawings of `kind`. Throws `KFT-E-KIND` for a kind that is unknown or not in the `tools` option. */
  activate(kind: DrawingKind): void;
  /** Stops placing; a drawing in progress is dropped. */
  deactivate(): void;
  /** Selects exactly these drawings (those that exist). */
  select(ids: readonly string[]): void;
  clearSelection(): void;
  /** Removes drawings, locked ones too (locks only stop interaction). One history entry. */
  remove(ids: readonly string[]): void;
  /** Returns false when there is nothing to undo. */
  undo(): boolean;
  redo(): boolean;
  /** Sets the stored magnet mode (`off`, `weak` or `strong`). */
  setMagnet(mode: MagnetMode): void;
  setTheme(theme: DrawingTheme): void;
  setOptions(options: DrawingToolsRuntimeOptions): void;
  getState(): DrawingToolsState;
  /** Subscribes to an event; returns the unsubscribe function. */
  on<E extends DrawingToolsEventName>(event: E, listener: (payload: DrawingToolsEvents[E]) => void): () => void;
  /** The scene the host draws now; the same array until something changes. Empty after `destroy`. */
  getScene(): readonly SceneItem[];
  /** What is under a plot point, or null. */
  hitTest(x: number, y: number): HitResult | null;
  /** Unsubscribes from the host and releases everything. Safe to call twice. */
  destroy(): void;
}

const EMPTY_IDS: readonly string[] = Object.freeze([]);
const EMPTY_SCENE: readonly SceneItem[] = Object.freeze([]);
const MAGNET_MODES: readonly MagnetMode[] = ['off', 'weak', 'strong'];

type Placing = Extract<InteractionState, { type: 'placing' }>;
type Listeners = { [E in DrawingToolsEventName]: Set<(payload: DrawingToolsEvents[E]) => void> };

function createListeners(): Listeners {
  return { change: new Set(), selection: new Set(), tool: new Set(), interaction: new Set(), state: new Set(), blocked: new Set(), error: new Set() };
}

interface DragBase {
  readonly origin: Point;
  readonly tx: HistoryTransaction;
}

/** A drag in progress: the drawings as they were at pointer down, where it went down, and the history transaction. A handle drag has one drawing and the handle, a move has the drawings. */
type DragSession = (DragBase & { readonly drawing: Drawing; readonly handle: number }) | (DragBase & { readonly drawings: readonly Drawing[] });

function assertMagnet(mode: unknown): asserts mode is MagnetMode {
  if (!MAGNET_MODES.includes(mode as MagnetMode)) throw new RangeError(`The magnet must be one of ${MAGNET_MODES.join(', ')}.`);
}

function toolSet(tools: readonly DrawingKind[]): ReadonlySet<DrawingKind> {
  const unknown = tools.filter((tool) => !isDrawingKind(tool));
  if (unknown.length > 0) throw new DrawingError([{ code: 'KFT-E-KIND', message: `Unknown drawing kinds in tools: ${unknown.join(', ')}.` }]);
  return new Set(tools);
}

/** The tool placing drawings: the one being placed, or the one a note returns to after its text is edited. */
function toolOf(state: InteractionState): DrawingKind | null {
  switch (state.type) {
    case 'placing':
      return state.tool;
    case 'editing-text':
      return state.resume ?? null;
    default:
      return null;
  }
}

function selectionOf(state: InteractionState): readonly string[] {
  switch (state.type) {
    case 'selected':
      return state.ids;
    case 'dragging-handle':
    case 'moving':
      return state.selection;
    case 'editing-text':
      return [state.drawingId];
    default:
      return EMPTY_IDS;
  }
}

function hoverOf(state: InteractionState): string | null {
  return state.type === 'idle' || state.type === 'selected' ? state.hover : null;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Remembers the value for the last key, so an unchanged key gives the same object (the scene cache compares by reference). */
function memoOne<K, V>(compute: (key: K) => V): (key: K) => V {
  let last: { readonly key: K; readonly value: V } | null = null;
  return (key) => {
    if (last === null || last.key !== key) last = { key, value: compute(key) };
    return last.value;
  };
}

class DrawingToolsController implements DrawingTools {
  readonly messages: Messages;
  private readonly store: DrawingStore;
  private readonly history: History;
  private readonly scenes: SceneCache;
  private readonly recogniser: GestureRecogniser;
  private readonly cursors: CursorSync;
  private readonly subscriptions = new Disposables();
  private listeners = createListeners();
  private readonly newId: () => string;
  private readonly defaultYAxisId: string;
  private readonly debug: ((message: string) => void) | undefined;
  private readonly fallbackEditText: ((request: TextEditRequest) => Promise<string | null>) | undefined;
  private readonly context: InteractionContext;
  private readonly selectedFor = memoOne((ids: readonly string[]): ReadonlySet<string> => new Set(ids));
  private readonly activeFor = memoOne((state: InteractionState) => (state.type === 'dragging-handle' ? { drawingId: state.drawingId, index: state.handle } : null));
  // The id of the preview drawing is never looked at: the tool's name will do.
  private readonly previewFor = memoOne((progress: PlacementProgress) => {
    const tool = toolOf(this.interaction) as DrawingKind;
    return placementPreview(tool, progress, tool);
  });
  private cache: GeometryCache;
  private theme: DrawingTheme | undefined;
  private readonly priceFormatter: PriceFormatter | undefined;
  private magnet: MagnetMode;
  private stayInTool: boolean;
  private allowed: ReadonlySet<DrawingKind>;
  private readonly shortcuts: ToolShortcuts;
  private readonly bindings: readonly ShortcutBinding[];
  private toolbar: readonly ToolbarEntry[];
  private interaction: InteractionState = IDLE_STATE;
  private progress: PlacementProgress = PLACEMENT_START;
  private snap: Point | null = null;
  private keyboardCursor: Point | null = null;
  private session: DragSession | null = null;
  // The history transaction of the last new text note: it is open while the editor is, so the note and its text are one entry and a cancelled editor takes the note back without one.
  private note: HistoryTransaction | null = null;
  // Set from every pointer and key event before anything reads it.
  private modifiers = {} as { shift: boolean; invert: boolean };
  private state: DrawingToolsState;
  private destroyed = false;

  constructor(
    private readonly host: DrawingHost,
    options: DrawingToolsOptions
  ) {
    assertHost(host);
    const magnet = options.magnet ?? 'off';
    assertMagnet(magnet);
    this.magnet = magnet;
    this.allowed = options.tools === undefined ? new Set(DRAWING_KINDS) : toolSet(options.tools);
    const resolved = resolveShortcuts(options.shortcuts);
    this.shortcuts = resolved.shortcuts;
    this.bindings = resolved.bindings;
    this.messages = resolveMessages(options.messages);
    this.toolbar = toolbarEntries(null, this.allowed, this.shortcuts);
    this.stayInTool = options.stayInTool === true;
    this.theme = options.theme;
    this.priceFormatter = options.priceFormatter;
    this.newId = options.createId ?? defaultCreateId;
    this.defaultYAxisId = options.defaultYAxisId ?? 'price';
    this.debug = options.debug;
    this.fallbackEditText = options.editText;
    this.store = options.store ?? new DrawingStore();
    this.context = {
      lookup: (id) => {
        const drawing = this.store.get(id);
        return drawing === undefined ? undefined : { kind: drawing.kind, locked: drawing.locked === true };
      },
    };
    this.history = new History(this.store, options.history);
    this.cache = new GeometryCache(host, { store: this.store, theme: this.theme, priceFormatter: this.priceFormatter });
    this.scenes = new SceneCache(host);
    this.recogniser = new GestureRecogniser(options.gestures);
    this.cursors = new CursorSync(host);
    this.state = { activeTool: null, interaction: IDLE_STATE, selection: EMPTY_IDS, hover: null, canUndo: false, canRedo: false, magnet, toolbar: this.toolbar };
    try {
      this.subscriptions.add(this.store.subscribe((_drawings, change) => this.onStoreChange(change)));
      this.subscriptions.add(this.history.onError((issue) => this.fail('history', new DrawingError([issue]))));
      const connection = connectHost(host, {
        pointer: (event) => this.run('pointer', () => this.handlePointer(event), undefined),
        key: (event) => this.run('key', () => this.handleKey(event), false),
        viewport: () => this.run('viewport', () => this.dropSnap(), undefined),
      });
      this.subscriptions.add(() => {
        connection.dispose();
      });
    } catch (error) {
      this.release();
      throw error;
    }
  }

  activate(kind: DrawingKind): void {
    if (this.destroyed) return;
    if (!this.allowed.has(kind)) throw new DrawingError([{ code: 'KFT-E-KIND', message: `The tool ${String(kind)} is not available.` }]);
    this.run('action', () => this.feed({ type: 'activate', tool: kind }), undefined);
  }

  deactivate(): void {
    this.run('action', () => this.feed({ type: 'deactivate' }), undefined);
  }

  select(ids: readonly string[]): void {
    this.run('action', () => this.feed({ type: 'select', ids }), undefined);
  }

  clearSelection(): void {
    this.select(EMPTY_IDS);
  }

  remove(ids: readonly string[]): void {
    this.run(
      'action',
      () =>
        this.store.batch(() => {
          for (const id of ids) this.store.remove(id);
        }),
      undefined
    );
  }

  undo(): boolean {
    return this.run('action', () => this.history.undo(), false);
  }

  redo(): boolean {
    return this.run('action', () => this.history.redo(), false);
  }

  setMagnet(mode: MagnetMode): void {
    if (this.destroyed) return;
    assertMagnet(mode);
    this.run(
      'action',
      () => {
        this.magnet = mode;
        this.snap = null;
      },
      undefined
    );
  }

  setTheme(theme: DrawingTheme): void {
    this.run(
      'action',
      () => {
        this.theme = theme;
        this.cache.destroy();
        this.cache = new GeometryCache(this.host, { store: this.store, theme, priceFormatter: this.priceFormatter });
      },
      undefined
    );
  }

  setOptions(options: DrawingToolsRuntimeOptions): void {
    if (this.destroyed) return;
    const allowed = options.tools === undefined ? this.allowed : toolSet(options.tools);
    this.run(
      'action',
      () => {
        this.allowed = allowed;
        this.stayInTool = options.stayInTool ?? this.stayInTool;
        if (this.interaction.type === 'placing' && !allowed.has(this.interaction.tool)) this.feed({ type: 'deactivate' });
      },
      undefined
    );
  }

  getState(): DrawingToolsState {
    return this.state;
  }

  on<E extends DrawingToolsEventName>(event: E, listener: (payload: DrawingToolsEvents[E]) => void): () => void {
    const set = this.listeners[event];
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  getScene(): readonly SceneItem[] {
    return this.read('scene', () => this.scenes.get(this.sceneOptions()), EMPTY_SCENE);
  }

  hitTest(x: number, y: number): HitResult | null {
    return this.read('action', () => this.hit({ x, y }, 'mouse'), null);
  }

  destroy(): void {
    // Safe to repeat: everything below does nothing the second time.
    this.destroyed = true;
    // A drag in progress is reverted: the store is not left half moved.
    this.session?.tx.cancel();
    this.session = null;
    this.cursors.set('default');
    this.release();
    this.listeners = createListeners();
  }

  /** Everything the constructor and `destroy` set up, undone; safe to repeat. */
  private release(): void {
    this.subscriptions.dispose();
    this.history.destroy();
    this.cache.destroy();
    this.scenes.destroy();
  }

  // ---- error isolation (NFR-REL-001) ----------------------------------------------------------------

  /**
   * Runs one entry point (a host event or an action): an exception is caught and reported as an
   * `error` event, a drag in progress is cancelled so nothing is left half done, and the state is
   * published and a render requested afterwards either way.
   */
  private run<T>(source: DrawingToolsErrorSource, fn: () => T, fallback: T): T {
    if (this.destroyed) return fallback;
    try {
      return fn();
    } catch (error) {
      this.recover(source);
      this.fail(source, error);
      return fallback;
    } finally {
      this.settle(source);
    }
  }

  /** Reads without changing anything: an exception becomes an `error` event and the fallback. */
  private read<T>(source: DrawingToolsErrorSource, fn: () => T, fallback: T): T {
    if (this.destroyed) return fallback;
    try {
      return fn();
    } catch (error) {
      this.fail(source, error);
      return fallback;
    }
  }

  private settle(source: DrawingToolsErrorSource): void {
    if (this.destroyed) return;
    try {
      this.publish();
      // A listener may have destroyed the tools while the state was published.
      if (!this.destroyed) this.host.requestRender();
    } catch (error) {
      this.fail(source, error);
    }
  }

  /** After a failure: a drag in progress is cancelled (the machine and the history transaction), so the tools are usable again. */
  private recover(source: DrawingToolsErrorSource): void {
    this.interaction = reduceInteraction(this.interaction, { type: 'cancel' }, this.context).state;
    const session = this.session;
    this.session = null;
    this.snap = null;
    try {
      session?.tx.cancel();
    } catch (error) {
      this.fail(source, error);
    }
  }

  private fail(source: DrawingToolsErrorSource, error: unknown): void {
    this.emit('error', { source, message: messageOf(error), error });
  }

  // ---- events and state -------------------------------------------------------------------------------

  private emit<E extends DrawingToolsEventName>(event: E, payload: DrawingToolsEvents[E]): void {
    for (const listener of [...this.listeners[event]]) {
      if (this.destroyed) return;
      try {
        listener(payload);
      } catch (error) {
        // A listener of `error` that throws is not reported again: that would never end.
        if (event !== 'error') this.fail('listener', error);
      }
    }
  }

  /** Makes the next state snapshot (the same object when nothing changed) and raises the events for what changed. */
  private publish(): void {
    const previous = this.state;
    const interaction = this.interaction;
    const { canUndo, canRedo } = this.history;
    const activeTool = toolOf(interaction);
    const toolbar = this.toolbarFor(activeTool);
    if (previous.interaction === interaction && previous.canUndo === canUndo && previous.canRedo === canRedo && previous.magnet === this.magnet && previous.toolbar === toolbar) return;
    const ids = selectionOf(interaction);
    const next: DrawingToolsState = {
      activeTool,
      interaction,
      selection: sameIds(previous.selection, ids) ? previous.selection : ids,
      hover: hoverOf(interaction),
      canUndo,
      canRedo,
      magnet: this.magnet,
      toolbar,
    };
    this.state = next;
    if (next.activeTool !== previous.activeTool) this.emit('tool', next.activeTool);
    if (next.selection !== previous.selection) this.emit('selection', next.selection);
    if (next.interaction !== previous.interaction) this.emit('interaction', next.interaction);
    this.emit('state', next);
  }

  /** The toolbar for the tool placing drawings now and the tools allowed now: the one the state has while no entry changed. */
  private toolbarFor(activeTool: DrawingKind | null): readonly ToolbarEntry[] {
    const stale = this.toolbar.some((entry) => entry.active !== (entry.id === activeTool) || entry.enabled !== this.allowed.has(entry.id));
    if (stale) this.toolbar = toolbarEntries(activeTool, this.allowed, this.shortcuts);
    return this.toolbar;
  }

  private onStoreChange(change: StoreChange): void {
    this.run(
      'store',
      () => {
        this.emit('change', change);
        this.feed({ type: 'sync' });
      },
      undefined
    );
  }

  // ---- the state machine ------------------------------------------------------------------------------

  /** Gives the machine an input, keeps its state and carries out its effects. */
  private feed(input: InteractionInput): InteractionResult {
    const before = this.interaction;
    const result = reduceInteraction(before, input, this.context);
    if (result.ignored) this.debug?.(`Ignored ${input.type} while ${before.type}.`);
    this.interaction = result.state;
    if (toolOf(before) !== toolOf(result.state)) this.cursors.set(cursorFor(toolOf(result.state), null, undefined, this.host));
    for (const effect of result.effects) this.perform(effect);
    return result;
  }

  private perform(effect: InteractionEffect): void {
    switch (effect.type) {
      case 'remove':
        this.store.batch(() => {
          for (const id of effect.ids) this.store.remove(id);
        });
        return;
      case 'blocked':
        this.emit('blocked', { code: 'KFT-E-LOCKED', ids: effect.ids });
        return;
      case 'drag-start':
        this.startDrag(effect);
        return;
      case 'drag-update':
        this.dragTo(effect.point);
        return;
      case 'drag-commit':
        this.dragTo(effect.point);
        this.endDrag(true);
        return;
      case 'drag-revert':
        this.endDrag(false);
        return;
      case 'edit-text':
        void this.edit(effect.drawingId);
        return;
      case 'apply-text':
        this.store.update(effect.drawingId, { text: effect.text });
        return;
      case 'cancel-placement':
        this.progress = PLACEMENT_START;
        this.snap = null;
        this.keyboardCursor = null;
        return;
      case 'select-all':
        this.feed({
          type: 'select',
          ids: this.store
            .list()
            .filter((drawing) => drawing.hidden !== true)
            .map((drawing) => drawing.id),
        });
        return;
      case 'duplicate':
        this.duplicate(effect.ids);
        return;
      case 'nudge':
        this.nudge(effect.ids, effect.bars, effect.pixels);
        return;
      case 'keyboard-move':
        this.keyboardMove(effect.bars, effect.pixels);
        return;
      case 'keyboard-place':
        this.keyboardPlace();
        return;
    }
  }

  // ---- host events ------------------------------------------------------------------------------------

  private handlePointer(event: HostPointerEvent): void {
    this.modifiers = { shift: event.shiftKey, invert: event.ctrlKey || event.metaKey };
    for (const gesture of this.recogniser.handle(event)) this.route(gesture);
  }

  private handleKey(event: HostKeyEvent): boolean {
    const ctrl = event.ctrlKey || event.metaKey;
    this.modifiers = { shift: event.shiftKey, invert: ctrl };
    const action = shortcutAction(event, this.bindings);
    if (action !== null) return this.shortcut(action);
    return !this.feed({ type: 'key', key: event.key, ctrl, shift: event.shiftKey }).ignored;
  }

  /** A tool, undo or redo shortcut: handled when it did something (a tool that is not allowed, or a state that cannot change tool, leaves the key to the host). */
  private shortcut(action: ShortcutAction): boolean {
    switch (action.type) {
      case 'undo':
        return this.history.undo();
      case 'redo':
        return this.history.redo();
      case 'tool':
        return this.allowed.has(action.tool) && !this.feed({ type: 'activate', tool: action.tool }).ignored;
    }
  }

  /** A zoom or scroll moves everything on the screen: the snap point (in pixels) is out of date. */
  private dropSnap(): void {
    this.snap = null;
  }

  private route(gesture: Gesture): void {
    if (this.interaction.type === 'placing') this.routePlacing(this.interaction, gesture);
    else this.routeSelecting(gesture);
  }

  private routePlacing(state: Placing, gesture: Gesture): void {
    // The pointer takes over from the keyboard cursor.
    this.keyboardCursor = null;
    switch (gesture.type) {
      case 'move':
        this.place(state.tool, { type: 'move', point: gesture.point }, gesture.point, this.modifiers.shift);
        return;
      case 'click':
        // The right button cancels (the machine); the left button places.
        if (gesture.button === 2) this.feed({ type: 'click', button: gesture.button, shiftKey: gesture.shiftKey, target: null });
        else this.place(state.tool, { type: 'click', point: gesture.point, button: gesture.button }, gesture.point, this.modifiers.shift);
        return;
      case 'drag-start':
        this.place(state.tool, { type: 'drag-start', origin: gesture.origin, button: gesture.button }, gesture.origin, this.modifiers.shift);
        this.place(state.tool, { type: 'drag', point: gesture.point }, gesture.point, this.modifiers.shift);
        return;
      case 'drag':
        this.place(state.tool, { type: 'drag', point: gesture.point }, gesture.point, this.modifiers.shift);
        return;
      case 'drag-end':
        this.place(state.tool, { type: 'drag-end', point: gesture.point }, gesture.point, this.modifiers.shift);
        return;
      case 'cancel':
        this.place(state.tool, { type: 'cancel' }, null, this.modifiers.shift);
        return;
      default:
        // `leave`, and a double-click, which a placement has no use for: the snap point is out of date.
        this.snap = null;
        return;
    }
  }

  private routeSelecting(gesture: Gesture): void {
    switch (gesture.type) {
      case 'move':
        this.hover(gesture.point, gesture.pointerType);
        return;
      case 'click':
        this.feed({ type: 'click', button: gesture.button, shiftKey: gesture.shiftKey, target: this.hit(gesture.point, gesture.pointerType) });
        return;
      case 'double-click':
        this.feed({ type: 'double-click', target: this.hit(gesture.point, gesture.pointerType) });
        return;
      case 'drag-start':
        this.feed({ type: 'drag-start', origin: gesture.origin, target: this.hit(gesture.origin, gesture.pointerType) });
        // A drag that started also moved: follow the pointer to where it is now.
        if (this.session !== null) this.feed({ type: 'drag', point: gesture.point });
        return;
      case 'drag':
        this.feed({ type: 'drag', point: gesture.point });
        return;
      case 'drag-end':
        this.feed({ type: 'drag-end', point: gesture.point });
        return;
      case 'cancel':
        this.feed({ type: 'cancel' });
        return;
      case 'leave':
        this.feed({ type: 'hover', id: null });
        return;
    }
  }

  private hover(point: Point, pointerType: PointerType): void {
    const hit = this.hit(point, pointerType);
    this.feed({ type: 'hover', id: hit === null ? null : hit.id });
    this.cursors.set(cursorFor(null, hit, hit === null ? undefined : this.store.get(hit.id), this.host));
  }

  private hit(point: Point, pointerType: PointerType): HitResult | null {
    return hitTest(point, { drawings: this.store.list(), cache: this.cache, selected: this.selectedFor(selectionOf(this.interaction)), pointerType, theme: this.theme });
  }

  // ---- placing ----------------------------------------------------------------------------------------

  /**
   * One placement input with the effective magnet; `point` is where the snap indicator is looked for (null: none).
   * With `shift` the second anchor of a trend line or fans keeps to 45 degree angles and does not snap (FR-INT-031).
   */
  private place(tool: DrawingKind, input: PlacementInput, point: Point | null, shift: boolean): void {
    const aimed = lockAngle(tool, this.progress, input, shift, this.host);
    const magnet = aimed === input ? effectiveMagnet(this.magnet, this.modifiers.invert) : 'off';
    const result = reducePlacement(tool, this.progress, aimed, this.host, magnet);
    if (result.ignored) this.debug?.(`Ignored placement ${input.type}.`);
    this.progress = result.progress;
    this.snap = point === null ? null : placementSnap(result.progress, point, magnet, this.host);
    if (result.anchors !== null) this.create(tool, result.anchors);
  }

  /** The placement is complete: the drawing goes into the store (one change, one history entry; a text note's entry is closed when its editor is). */
  private create(tool: DrawingKind, anchors: readonly Anchor[]): void {
    const id = this.newId();
    const note = tool === 'text-note';
    this.note = note ? this.history.transaction() : null;
    try {
      this.store.add(note ? { id, kind: tool, anchors, text: '' } : { id, kind: tool, anchors });
    } catch (error) {
      // Nothing was added: the entry only needs closing.
      this.note?.cancel();
      throw error;
    }
    this.feed({ type: 'placement-complete', id, stay: this.stayInTool, edit: note });
  }

  /** The y-axis of a keyboard cursor: the one of the first anchor once there is one. */
  private keyboardAxis(): string {
    return this.progress.type === 'anchored' ? this.progress.first.yAxisId : this.defaultYAxisId;
  }

  private keyboardMove(bars: number, pixels: number): void {
    const yAxisId = this.keyboardAxis();
    const from = this.keyboardCursor ?? keyboardCursorStart(yAxisId, this.host);
    // Without a pane there is no start and no move (it is checked before `from` is read).
    const cursor = moveKeyboardCursor(from as Point, bars, pixels, yAxisId, this.host);
    if (cursor === null) return;
    this.keyboardCursor = cursor;
    this.place((this.interaction as Placing).tool, { type: 'move', point: cursor }, cursor, false);
  }

  private keyboardPlace(): void {
    const cursor = this.keyboardCursor ?? keyboardCursorStart(this.keyboardAxis(), this.host);
    if (cursor === null) return;
    this.keyboardCursor = cursor;
    this.place((this.interaction as Placing).tool, { type: 'click', point: cursor, button: 0 }, cursor, false);
  }

  // ---- dragging, nudging, duplicating, editing --------------------------------------------------------

  private startDrag(effect: Extract<InteractionEffect, { type: 'drag-start' }>): void {
    const tx = this.history.transaction('drag');
    this.session =
      effect.mode === 'handle'
        ? { drawing: this.store.get(effect.drawingId) as Drawing, handle: effect.handle, origin: effect.origin, tx }
        : { drawings: effect.ids.map((id) => this.store.get(id) as Drawing), origin: effect.origin, tx };
  }

  /** Applies the pointer's travel since pointer down to the drawings as they were then: one store change. */
  private dragTo(point: Point): void {
    const session = this.session as DragSession;
    const shift = this.modifiers.shift;
    const magnet = effectiveMagnet(this.magnet, this.modifiers.invert);
    if ('drawings' in session) {
      this.store.batch(() => {
        for (const moved of moveDrawings(session.drawings, session.origin, point, shift, this.host)) this.store.update(moved.id, { anchors: moved.anchors });
      });
      return;
    }
    const anchors = dragHandle(session.drawing, session.handle, session.origin, point, shift, this.host, magnet);
    if (anchors !== null) this.store.update(session.drawing.id, { anchors });
    this.snap = handleSnap(session.drawing, session.handle, session.origin, point, shift, this.host, magnet);
  }

  /** The drag is over: one history entry, or none when it is reverted (listeners see the restore as the last change). */
  private endDrag(commit: boolean): void {
    const session = this.session as DragSession;
    this.session = null;
    this.snap = null;
    if (commit) session.tx.commit();
    else session.tx.cancel();
  }

  /** Arrow keys: one `nudge` transaction, so quick nudges are one history entry. */
  private nudge(ids: readonly string[], bars: number, pixels: number): void {
    const moves = ids.flatMap((id) => {
      const anchors = nudgeAnchors(this.store.get(id) as Drawing, bars, pixels, this.host);
      return anchors === null ? [] : [{ id, anchors }];
    });
    const tx = this.history.transaction('nudge');
    try {
      this.store.batch(() => {
        for (const move of moves) this.store.update(move.id, { anchors: move.anchors });
      });
    } finally {
      // When the batch threw, it rolled back and nothing was recorded: committing closes the transaction.
      tx.commit();
    }
  }

  private duplicate(ids: readonly string[]): void {
    const copies = ids.flatMap((id) => {
      const copy = duplicateDrawing(this.store.get(id) as Drawing, this.newId(), this.host);
      return copy === null ? [] : [copy];
    });
    this.store.batch(() => {
      for (const copy of copies) this.store.add(copy);
    });
    this.feed({ type: 'select', ids: copies.map((copy) => copy.id) });
  }

  /** Edits a note's text with the host's editor; without one (or when it fails) the text is left as it is. Cancelling the editor of a new note removes the note. */
  private async edit(drawingId: string): Promise<void> {
    // What the editor answered: the text, null when it was cancelled, undefined when the host has no editor or it failed.
    let answer: string | null | undefined;
    try {
      const drawing = this.store.get(drawingId) as Drawing;
      const origin = anchorToPoint(drawing.anchors[0] as Anchor, this.host);
      const request: TextEditRequest = { drawingId, text: drawing.text as string, x: origin.x, y: origin.y, fontSize: resolveStyle(drawing, this.theme).fontSize };
      answer = this.host.editText === undefined ? await this.fallbackEditText?.(request) : await this.host.editText(request);
    } catch (error) {
      this.fail('text-editor', error);
    }
    this.run(
      'text-editor',
      () => {
        this.feed({ type: 'edit-result', text: answer ?? null });
        this.endNote(answer === null);
      },
      undefined
    );
  }

  /** The editor of a note closed: a new note keeps its text as one history entry, or is taken back without one when `cancel` (a note that is being edited again has no open entry: nothing happens). */
  private endNote(cancel: boolean): void {
    if (cancel) this.note?.cancel();
    else this.note?.commit();
  }

  // ---- scene ------------------------------------------------------------------------------------------

  private sceneOptions(): SceneOptions {
    const state = this.state;
    return {
      drawings: this.store.list(),
      cache: this.cache,
      theme: this.theme,
      selected: this.selectedFor(state.selection),
      hover: state.hover,
      active: this.activeFor(state.interaction),
      preview: this.previewFor(this.progress),
      snap: this.snap,
    };
  }
}

/**
 * Wires a host, a store, an undo history and the drawing tools together and returns the controller
 * (SDS 9.7): `activate` a tool, and the host's pointer and key events place, select, move, resize
 * and delete drawings; `getScene()` is what the host draws. Throws `KFT-E-HOST` for a host that does
 * not satisfy the contract, `KFT-E-KIND` for an unknown kind in `tools` and `RangeError` for a bad
 * `magnet` or history limit. After that it never throws into the host: failures arrive as `error`
 * events and leave the store unchanged.
 *
 * @example
 * ```ts
 * const tools = createDrawingTools(host, { magnet: 'weak' });
 * tools.on('selection', (ids) => toolbar.show(ids));
 * tools.on('error', ({ message }) => console.warn(message));
 * tools.activate('trend-line');
 * // in the host's overlay render pass:
 * for (const item of tools.getScene()) paint(item);
 * // when the chart goes away:
 * tools.destroy();
 * ```
 */
export function createDrawingTools(host: DrawingHost, options: DrawingToolsOptions = {}): DrawingTools {
  return new DrawingToolsController(host, options);
}
