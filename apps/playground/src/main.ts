import { createDrawingTools, type DrawingKind, type DrawingStore, type DrawingTools } from 'keystone-financial-tools-typescript';
import type { Bar } from './data';
import { ACTION_LABELS, CHART_LABEL, createSurface, openStore } from './demo';
import type { PlotHost } from './plot-host';
import { nextMagnet, statusText } from './toolbar';

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

// The plain TypeScript page: the toolbar is built once from the tools' own toolbar state (FR-FW-040) and its attributes follow the state.
async function start(): Promise<void> {
  const surface = createSurface();
  const store = await openStore();
  const controller = createDrawingTools(surface.host, { store, magnet: 'off' });
  controller.on('error', ({ source, message }) => console.error(`${source}: ${message}`));

  const chart = element<HTMLDivElement>('chart');
  chart.setAttribute('aria-label', CHART_LABEL);
  const toolbar = element<HTMLDivElement>('toolbar');
  toolbar.setAttribute('aria-label', controller.messages['toolbar.label']);
  const toolButtons = new Map<DrawingKind, HTMLButtonElement>();
  for (const entry of controller.getState().toolbar) {
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
    for (const entry of state.toolbar) {
      const created = toolButtons.get(entry.id) as HTMLButtonElement;
      created.setAttribute('aria-pressed', String(entry.active));
      created.disabled = !entry.enabled;
      created.title = entry.shortcut ?? '';
    }
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
  window.playground = { host: surface.host, tools: controller, store, bars: surface.bars };
}

void start();
