import { autoSave, loadStore, WebStorageRepository, type DrawingStore, type SceneItem } from 'keystone-financial-tools-typescript';
import { BAR_INTERVAL_MS, generateBars, type Bar } from './data';
import { bindInput } from './dom';
import { createPlotHost, type PlotHost } from './plot-host';
import { fitCanvas, renderBase, renderOverlay } from './render';

// The browser glue the four demo pages share: the localStorage store and the chart surface (host, canvases, input).
// It needs a DOM, so it is covered by the end-to-end tests, not by the unit tests.

export const WIDTH = 800;
export const HEIGHT = 400;
export const BAR_COUNT = 100;
export const SCOPE = { symbol: 'PLAYGROUND' };

/** The accessible name of the chart: how to draw and how to move around in it. */
export const CHART_LABEL = 'Price chart. Choose a tool, then click to place anchors. Delete removes the selection. Plus and minus zoom; Home, End, Page Up and Page Down scroll.';

/** The labels of the buttons next to the tools. The packages have no text for them (only the tools and the editor have one), so the demo owns them. */
export const ACTION_LABELS = { undo: 'Undo', redo: 'Redo', delete: 'Delete', magnet: 'Magnet' } as const;

/**
 * Loads the drawings from localStorage and keeps saving them shortly after every change, so they survive a reload (FR-PER-010).
 * A document that cannot be read is reported on the console and the page starts empty.
 */
export async function openStore(): Promise<DrawingStore> {
  const repository = new WebStorageRepository(localStorage);
  const { store, report } = await loadStore(repository, SCOPE);
  if (report.issue !== undefined) console.warn(report.issue.message);
  autoSave(store, repository, SCOPE, { debounceMs: 100, onError: (error) => console.error(error) });
  return store;
}

/** The chart of a demo page: the host the tools draw on, and the way to put it on the page. */
export interface Surface {
  readonly host: PlotHost;
  readonly bars: readonly Bar[];
  /**
   * Puts the canvases into `element` (which must be positioned) and sends its pointer, wheel and key events to the host. `scene`
   * is asked for the items to draw whenever the overlay is painted. Returns the function that takes it all out again.
   */
  mount(element: HTMLElement, scene: () => readonly SceneItem[]): () => void;
  /** Paints the candles and the overlay again. */
  redraw(): void;
}

function canvas(id: string): HTMLCanvasElement {
  const created = document.createElement('canvas');
  created.id = id;
  return created;
}

/** The chart of a page. The host exists at once, before there is anything on the page, so a framework can hand it to the tools in its own time. */
export function createSurface(): Surface {
  const bars = generateBars(BAR_COUNT);
  let view: { readonly element: HTMLElement; readonly base: CanvasRenderingContext2D; readonly overlay: CanvasRenderingContext2D; readonly scene: () => readonly SceneItem[] } | null = null;

  const paintOverlay = (): void => {
    if (view !== null) renderOverlay(view.overlay, host, view.scene());
  };
  const redraw = (): void => {
    if (view === null) return;
    renderBase(view.base, host, bars);
    paintOverlay();
  };
  const host = createPlotHost({
    width: WIDTH,
    height: HEIGHT,
    bars,
    barInterval: BAR_INTERVAL_MS,
    onRender: paintOverlay,
    onCursor: (cursor) => {
      if (view !== null) view.element.style.cursor = cursor;
    },
  });

  return {
    host,
    bars,
    redraw,
    mount: (element, scene) => {
      const base = canvas('base');
      const overlay = canvas('overlay');
      // In front of whatever else is in the element (the note editor), so the editor stays on top.
      element.prepend(base, overlay);
      view = { element, base: fitCanvas(base, WIDTH, HEIGHT), overlay: fitCanvas(overlay, WIDTH, HEIGHT), scene };
      const unbind = bindInput(element, host);
      const stopViewport = host.onViewportChange(redraw);
      redraw();
      return () => {
        stopViewport();
        unbind();
        base.remove();
        overlay.remove();
        view = null;
      };
    },
  };
}
