/**
 * Collects clean-up functions (for example the unsubscribe functions a host returns) and runs each
 * exactly once. `dispose()` runs all of them even when some throw and returns the errors instead
 * of throwing, so tearing down never throws into the host.
 *
 * @example
 * ```ts
 * const subscriptions = new Disposables();
 * subscriptions.add(host.onPointer(handlePointer));
 * subscriptions.add(host.onKey(handleKey));
 * const errors = subscriptions.dispose(); // [] when every unsubscribe worked
 * ```
 */
export class Disposables {
  private items: (() => void)[] = [];
  private done = false;

  /** True after `dispose()`. */
  get disposed(): boolean {
    return this.done;
  }

  /** Adds a clean-up function. After `dispose()` it runs at once (its error is thrown to the caller). */
  add(dispose: () => void): void {
    if (this.done) dispose();
    else this.items.push(dispose);
  }

  /** Runs every clean-up function once, newest first; returns the errors. Later calls do nothing. */
  dispose(): unknown[] {
    const items = this.items;
    this.items = [];
    this.done = true;
    const errors: unknown[] = [];
    for (const dispose of items.reverse()) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }
}
