import { createDrawingTools, DrawingStore, TextEditor, type DrawingKind } from 'keystone-financial-tools-typescript';
import { ACTION_LABELS, button, CHART_LABEL, createSurface, element } from './demo';
import { toolFromSearch, unknownToolMessage } from './embed-params';
import { mountLiveRegion } from './live-region-dom';
import { mountTextEditor } from './text-editor-dom';
import { nextMagnet, statusText } from './toolbar';

// The page the docs site embeds in the page of each tool (E09-F01-S03): the chart with only the tool of `?tool=` enabled and already
// active, and Undo, Redo, Delete and Magnet. Drawings are kept in memory only, so embeds on different pages do not share them.
function start(kind: DrawingKind): void {
  const surface = createSurface();
  const store = new DrawingStore();
  const editor = new TextEditor();
  // The tool stays active after a drawing is placed, so a visitor can place several in a row.
  const controller = createDrawingTools(surface.host, { store, magnet: 'off', stayInTool: true, tools: [kind], editText: editor.edit });
  controller.on('error', ({ source, message }) => console.error(`${source}: ${message}`));

  const chart = element<HTMLDivElement>('chart');
  chart.hidden = false;
  chart.setAttribute('aria-label', CHART_LABEL);
  const toolbar = element<HTMLDivElement>('toolbar');
  toolbar.hidden = false;
  toolbar.setAttribute('aria-label', controller.messages['toolbar.label']);
  const toolButtons = new Map<DrawingKind, HTMLButtonElement>();
  // Only the enabled tool gets a button: the others cannot be used here.
  for (const entry of controller.getState().toolbar.filter(({ enabled }) => enabled)) {
    const created = button(controller.messages[entry.labelKey], `tool-${entry.id}`, () => (controller.getState().activeTool === entry.id ? controller.deactivate() : controller.activate(entry.id)));
    created.dataset.tool = entry.id;
    toolButtons.set(entry.id, created);
    toolbar.append(created);
  }
  const undo = button(ACTION_LABELS.undo, 'undo', () => controller.undo());
  const redo = button(ACTION_LABELS.redo, 'redo', () => controller.redo());
  const remove = button(ACTION_LABELS.delete, 'delete', () => controller.remove(controller.getState().selection));
  const magnet = button(ACTION_LABELS.magnet, 'magnet', () => controller.setMagnet(nextMagnet(controller.getState().magnet)));
  toolbar.append(undo, redo, remove, magnet);

  const status = element<HTMLOutputElement>('status');
  const sync = (): void => {
    const state = controller.getState();
    for (const entry of state.toolbar) toolButtons.get(entry.id)?.setAttribute('aria-pressed', String(entry.active));
    undo.disabled = !state.canUndo;
    redo.disabled = !state.canRedo;
    remove.disabled = state.selection.length === 0;
    magnet.setAttribute('aria-pressed', String(state.magnet !== 'off'));
    status.textContent = statusText(state, store.list().length);
  };
  controller.on('state', sync);
  store.subscribe(sync);
  sync();

  surface.mount(chart, () => controller.getScene());
  mountTextEditor(chart, editor, controller.messages['editor.note']);
  mountLiveRegion(document.body, controller);
  controller.activate(kind);
  window.playground = { host: surface.host, tools: controller, store, bars: surface.bars };
}

const kind = toolFromSearch(window.location.search);
if (kind === null) element<HTMLOutputElement>('status').textContent = unknownToolMessage();
else start(kind);
