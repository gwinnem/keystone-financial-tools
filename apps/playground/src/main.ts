import { autoSave, createDrawingTools, DRAWING_KINDS, loadStore, WebStorageRepository, type DrawingKind, type DrawingStore, type DrawingTools } from 'keystone-financial-tools-typescript';
import { BAR_INTERVAL_MS, generateBars, type Bar } from './data';
import { bindInput } from './dom';
import { createPlotHost, type PlotHost } from './plot-host';
import { fitCanvas, renderBase, renderOverlay } from './render';
import { statusText, toolLabel } from './toolbar';

const WIDTH = 800;
const HEIGHT = 400;
const BAR_COUNT = 100;
const SCOPE = { symbol: 'PLAYGROUND' };

/** What the page exposes as `window.playground`, so the end-to-end tests can ask where things are and what the store holds. */
export interface Playground {
  readonly host: PlotHost;
  readonly tools: DrawingTools;
  readonly store: DrawingStore;
  readonly bars: readonly Bar[];
}

declare global {
  interface Window {
    playground?: Playground;
  }
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`The page has no element #${id}.`);
  return found as T;
}

function button(label: string, id: string, onClick: () => void): HTMLButtonElement {
  const created = document.createElement('button');
  created.type = 'button';
  created.id = id;
  created.textContent = label;
  created.addEventListener('click', onClick);
  return created;
}

async function start(): Promise<void> {
  const bars = generateBars(BAR_COUNT);
  const chart = element<HTMLDivElement>('chart');
  const baseContext = fitCanvas(element<HTMLCanvasElement>('base'), WIDTH, HEIGHT);
  const overlayContext = fitCanvas(element<HTMLCanvasElement>('overlay'), WIDTH, HEIGHT);

  // The host asks for a redraw before the tools exist (and the tools need the host), so the callback looks them up here.
  const current: { tools?: DrawingTools } = {};
  const host = createPlotHost({
    width: WIDTH,
    height: HEIGHT,
    bars,
    barInterval: BAR_INTERVAL_MS,
    onRender: () => {
      if (current.tools !== undefined) renderOverlay(overlayContext, host, current.tools.getScene());
    },
    onCursor: (cursor) => {
      chart.style.cursor = cursor;
    },
  });

  // Drawings survive a reload: they are loaded from localStorage and saved shortly after every change.
  const repository = new WebStorageRepository(localStorage);
  const { store, report } = await loadStore(repository, SCOPE);
  if (report.issue !== undefined) console.warn(report.issue.message);
  autoSave(store, repository, SCOPE, { debounceMs: 100, onError: (error) => console.error(error) });

  const controller = createDrawingTools(host, { store, magnet: 'off' });
  current.tools = controller;
  controller.on('error', ({ source, message }) => console.error(`${source}: ${message}`));

  const toolbar = element<HTMLDivElement>('toolbar');
  const toolButtons = new Map<DrawingKind, HTMLButtonElement>();
  for (const kind of DRAWING_KINDS) {
    const created = button(toolLabel(kind), `tool-${kind}`, () => (controller.getState().activeTool === kind ? controller.deactivate() : controller.activate(kind)));
    created.dataset.tool = kind;
    toolButtons.set(kind, created);
    toolbar.append(created);
  }
  const undo = button('Undo', 'undo', () => controller.undo());
  const redo = button('Redo', 'redo', () => controller.redo());
  const remove = button('Delete', 'delete', () => controller.remove(controller.getState().selection));
  const magnet = button('Magnet', 'magnet', () => controller.setMagnet(controller.getState().magnet === 'off' ? 'weak' : 'off'));
  toolbar.append(undo, redo, remove, magnet);

  const status = element<HTMLOutputElement>('status');
  const sync = (): void => {
    const state = controller.getState();
    for (const [kind, created] of toolButtons) created.setAttribute('aria-pressed', String(state.activeTool === kind));
    undo.disabled = !state.canUndo;
    redo.disabled = !state.canRedo;
    remove.disabled = state.selection.length === 0;
    magnet.setAttribute('aria-pressed', String(state.magnet !== 'off'));
    status.textContent = statusText(state, store.list().length);
  };
  controller.on('state', sync);
  store.subscribe(sync);
  sync();

  bindInput(chart, host);
  renderBase(baseContext, host, bars);
  renderOverlay(overlayContext, host, controller.getScene());
  window.playground = { host, tools: controller, store, bars };
}

void start();
