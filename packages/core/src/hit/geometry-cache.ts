import { geometryOf } from '../geometry/index';
import type { DrawingGeometry, GeometryOptions, PriceFormatter } from '../geometry/types';
import type { DrawingHost } from '../host';
import type { DrawingStore } from '../store';
import type { Drawing } from '../types';
import { Disposables } from '../disposables';

/** Options of `GeometryCache`: the geometry options plus the store to follow. */
export interface GeometryCacheOptions extends GeometryOptions {
  /** Drops the geometry of drawings removed from this store, so the cache does not grow for ever. */
  readonly store?: DrawingStore;
}

interface Entry {
  readonly drawing: Drawing;
  readonly geometry: DrawingGeometry | null;
}

/**
 * Keeps the pixel geometry of drawings between pointer moves (FR-HIT-004). An entry is used only
 * while the drawing is the same object it was computed from, and the store replaces a drawing on
 * every change to it, so a changed drawing is recomputed and the others are not. A viewport change
 * (zoom, scroll, resize, pane layout, timeframe) clears everything. Geometry that depends on the
 * theme, `measureText` or `priceFormatter` needs a new cache when those change.
 *
 * @example
 * ```ts
 * const cache = new GeometryCache(host, { store });
 * const geometry = cache.get(store.list()[0]); // computed
 * cache.get(store.list()[0]); // the same object again
 * cache.destroy();
 * ```
 */
export class GeometryCache {
  private readonly host: DrawingHost;
  private readonly options: GeometryOptions;
  private readonly entries = new Map<string, Entry>();
  private readonly subscriptions = new Disposables();

  constructor(host: DrawingHost, options: GeometryCacheOptions = {}) {
    this.host = host;
    this.options = { theme: options.theme, measureText: options.measureText, priceFormatter: options.priceFormatter };
    this.subscriptions.add(host.onViewportChange(() => this.clear()));
    if (options.store !== undefined) {
      this.subscriptions.add(
        options.store.subscribe((_drawings, change) => {
          for (const operation of change.operations) {
            if (operation.type === 'remove') this.entries.delete(operation.id);
          }
        })
      );
    }
  }

  /** The formatter of the price labels; scene previews use it so they read like the drawings. */
  get priceFormatter(): PriceFormatter | undefined {
    return this.options.priceFormatter;
  }

  /** The geometry of a drawing, or null when its y-axis has no pane. Computed once per drawing object and viewport. */
  get(drawing: Drawing): DrawingGeometry | null {
    const entry = this.entries.get(drawing.id);
    if (entry !== undefined && entry.drawing === drawing) return entry.geometry;
    const geometry = geometryOf(drawing, this.host, this.options);
    this.entries.set(drawing.id, { drawing, geometry });
    return geometry;
  }

  /** Forgets every entry. */
  clear(): void {
    this.entries.clear();
  }

  /** How many drawings the cache holds geometry for. */
  get size(): number {
    return this.entries.size;
  }

  /** Stops following the host and the store and forgets every entry. Safe to call twice. */
  destroy(): void {
    this.subscriptions.dispose();
    this.clear();
  }
}
