import { DestroyRef, Injectable, computed, inject, type Signal } from '@angular/core';
import { distinctUntilChanged, map, type Observable } from 'rxjs';
import {
  createDrawingTools,
  DrawingStore,
  IDLE_STATE,
  IDLE_TOOLBAR,
  TextEditor,
  type Drawing,
  type DrawingHost,
  type DrawingKind,
  type DrawingTheme,
  type DrawingTools,
  type DrawingToolsOptions,
  type DrawingToolsRuntimeOptions,
  type DrawingToolsState,
  type MagnetMode,
  type TextEditSession,
  type ToolbarEntry,
} from 'keystone-financial-tools-core';
import { Channel } from './channel';

/** The options of `createDrawingTools`, except that `editText` can also be `false`. */
export interface KeystoneDrawingToolsOptions extends Omit<DrawingToolsOptions, 'editText'> {
  /**
   * The editor of text notes for a host that has none. Left out, the default editor is used: show
   * `textEdit` with `KeystoneTextEditorComponent`. A function replaces it; `false` leaves new notes
   * empty and not editable.
   */
  readonly editText?: DrawingToolsOptions['editText'] | false;
}

/** The state before a host is attached and after it is detached. */
const IDLE_TOOLS_STATE: DrawingToolsState = Object.freeze({
  activeTool: null,
  interaction: IDLE_STATE,
  selection: [],
  hover: null,
  canUndo: false,
  canRedo: false,
  magnet: 'off',
  toolbar: IDLE_TOOLBAR,
});

/**
 * The drawing tools for one chart (FR-FW-030): `attach` creates the controller for a host and the
 * service keeps `state`, `toolbar`, `drawings` and the open note editor in signals and observables. It only maps
 * the controller's events to Angular; everything else is the core's.
 *
 * Provide it where the chart is, so every chart has its own and it is destroyed with the chart:
 * `providers: [KeystoneDrawingToolsService]` on the component. It works with zone.js and without it,
 * as the values are signals. The controller is destroyed, with the listeners on the host removed, by
 * `detach`, by the next `attach`, and when the service is destroyed (`DestroyRef`).
 *
 * @example
 * ```ts
 * @Component({
 *   selector: 'app-chart',
 *   imports: [KeystoneTextEditorComponent],
 *   providers: [KeystoneDrawingToolsService],
 *   template: `
 *     @for (tool of tools.toolbar(); track tool.id) {
 *       <button [disabled]="!tool.enabled" [attr.aria-pressed]="tool.active" (click)="tools.activate(tool.id)">{{ tool.id }}</button>
 *     }
 *     <keystone-text-editor [session]="tools.textEdit()" />`,
 * })
 * export class ChartComponent {
 *   readonly tools = inject(KeystoneDrawingToolsService);
 *   ngAfterViewInit(): void {
 *     this.tools.attach(this.host, { magnet: 'weak' });
 *   }
 * }
 * ```
 */
@Injectable()
export class KeystoneDrawingToolsService {
  private readonly editor = new TextEditor();
  private readonly owned = new DrawingStore();
  private readonly toolsChannel = new Channel<DrawingTools | null>(null);
  private readonly stateChannel = new Channel<DrawingToolsState>(IDLE_TOOLS_STATE);
  private readonly drawingsChannel = new Channel<readonly Drawing[]>(this.owned.list());
  private readonly editChannel = new Channel<TextEditSession | null>(null);
  private attached = this.owned;
  private stopStore = this.follow(this.owned);

  /** The controller: `getScene()` and `hitTest()` for the host, and `on()` for events. Null until a host is attached. */
  readonly tools: Signal<DrawingTools | null> = this.toolsChannel.value;
  /** The state of the tools, a new object whenever a value in it changes. Idle until a host is attached. */
  readonly state: Signal<DrawingToolsState> = this.stateChannel.value;
  /**
   * The toolbar (FR-FW-040): every tool of `TOOL_CATALOG` with `active`, `enabled` and the shortcut in use.
   * The same array until an entry changes; every entry is disabled until a host is attached.
   * Render a button per entry and call `activate(entry.id)`.
   */
  readonly toolbar: Signal<readonly ToolbarEntry[]> = computed(() => this.state().toolbar);
  /** The drawings of the store; changes with every store change. */
  readonly drawings: Signal<readonly Drawing[]> = this.drawingsChannel.value;
  /** The note editor that is open, or null. Show it with `KeystoneTextEditorComponent` or your own editor. */
  readonly textEdit: Signal<TextEditSession | null> = this.editChannel.value;

  /** `tools` as an observable; it emits the current value on subscribe and completes when the service is destroyed. */
  readonly tools$: Observable<DrawingTools | null> = this.toolsChannel.changes;
  readonly state$: Observable<DrawingToolsState> = this.stateChannel.changes;
  /** `toolbar` as an observable; it emits only when an entry changes. */
  readonly toolbar$: Observable<readonly ToolbarEntry[]> = this.state$.pipe(
    map((state) => state.toolbar),
    distinctUntilChanged()
  );
  readonly drawings$: Observable<readonly Drawing[]> = this.drawingsChannel.changes;
  readonly textEdit$: Observable<TextEditSession | null> = this.editChannel.changes;

  constructor() {
    // The editor belongs to the service and goes with it, so there is nothing to unsubscribe from.
    this.editor.subscribe((session) => this.editChannel.set(session));
    inject(DestroyRef).onDestroy(() => {
      this.detach();
      this.stopStore();
      this.toolsChannel.complete();
      this.stateChannel.complete();
      this.drawingsChannel.complete();
      this.editChannel.complete();
    });
  }

  /** The store the tools draw into: the one given to `attach`, otherwise one that belongs to the service. */
  get store(): DrawingStore {
    return this.attached;
  }

  /**
   * Creates the controller for `host` (the one attached before is destroyed first). The options are
   * those of `createDrawingTools`; they are read now, change them later with `setMagnet`, `setTheme`
   * and `setOptions`. `editText` left out gives the default editor, a function replaces it and
   * `false` means no editor; a host that has its own `editText` always wins.
   */
  attach(host: DrawingHost, options?: KeystoneDrawingToolsOptions): void {
    this.detach();
    this.stopStore();
    this.stopStore = this.follow(options?.store ?? this.owned);
    const given = options?.editText;
    const editText = given === undefined ? this.editor.edit : given === false ? undefined : given;
    const created = createDrawingTools(host, { ...options, store: this.attached, editText });
    created.on('state', (state) => this.stateChannel.set(state));
    this.toolsChannel.set(created);
    this.stateChannel.set(created.getState());
  }

  /** Destroys the controller and removes its listeners from the host. The store and its drawings stay. */
  detach(): void {
    const current = this.toolsChannel.value();
    if (current === null) return;
    // Destroyed first: the answer of an editor that is cancelled now is dropped, not applied.
    current.destroy();
    this.editor.cancel();
    this.toolsChannel.set(null);
    this.stateChannel.set(IDLE_TOOLS_STATE);
  }

  /** The actions do nothing, and `undo` and `redo` give false, until a host is attached. */
  activate(kind: DrawingKind): void {
    this.tools()?.activate(kind);
  }

  deactivate(): void {
    this.tools()?.deactivate();
  }

  select(ids: readonly string[]): void {
    this.tools()?.select(ids);
  }

  clearSelection(): void {
    this.tools()?.clearSelection();
  }

  remove(ids: readonly string[]): void {
    this.tools()?.remove(ids);
  }

  undo(): boolean {
    return this.tools()?.undo() ?? false;
  }

  redo(): boolean {
    return this.tools()?.redo() ?? false;
  }

  setMagnet(mode: MagnetMode): void {
    this.tools()?.setMagnet(mode);
  }

  setTheme(theme: DrawingTheme): void {
    this.tools()?.setTheme(theme);
  }

  setOptions(options: DrawingToolsRuntimeOptions): void {
    this.tools()?.setOptions(options);
  }

  /** Keeps `drawings` as the drawings of `store`; returns what stops it. */
  private follow(store: DrawingStore): () => void {
    this.attached = store;
    this.drawingsChannel.set(store.list());
    return store.subscribe((drawings) => this.drawingsChannel.set(drawings));
  }
}
