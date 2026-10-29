import { Disposables } from '../disposables';
import type { DrawingHost } from '../host';
import { buildScene } from './build';
import type { SceneItem, SceneOptions } from './types';

const KEYS = ['drawings', 'cache', 'theme', 'selected', 'hover', 'active', 'preview', 'snap'] as const;

/**
 * Gives the host the same scene on every call until something changes: a store change (a new
 * `drawings` list), a state change (`selected`, `hover`, `active`, `preview`, `snap`), a new theme or
 * cache, or a viewport change. Options are compared by reference, so pass the same object for an
 * unchanged value (controller state snapshots do).
 *
 * @example
 * ```ts
 * const scenes = new SceneCache(host);
 * // in the host's overlay render pass:
 * for (const item of scenes.get({ drawings: store.list(), cache, selected, hover })) paint(item);
 * scenes.destroy();
 * ```
 */
export class SceneCache {
  private readonly host: DrawingHost;
  private readonly subscriptions = new Disposables();
  private last: { readonly options: SceneOptions; readonly scene: readonly SceneItem[] } | null = null;

  constructor(host: DrawingHost) {
    this.host = host;
    this.subscriptions.add(host.onViewportChange(() => this.invalidate()));
  }

  /** The scene for `options`: the previous one when nothing it depends on changed. */
  get(options: SceneOptions): readonly SceneItem[] {
    const last = this.last;
    if (last !== null && KEYS.every((key) => last.options[key] === options[key])) return last.scene;
    const scene = buildScene(this.host, options);
    this.last = { options, scene };
    return scene;
  }

  /** Forgets the scene, so the next `get` builds a new one. */
  invalidate(): void {
    this.last = null;
  }

  /** Stops following the host and forgets the scene. Safe to call twice. */
  destroy(): void {
    this.subscriptions.dispose();
    this.invalidate();
  }
}
