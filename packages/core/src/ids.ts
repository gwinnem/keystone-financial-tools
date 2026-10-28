/** Where an id generator gets its randomness and time from. Tests inject these. */
export interface IdSource {
  /**
   * UUID source. `undefined` (the default) uses `globalThis.crypto.randomUUID` when the runtime has
   * it, looked up on every call; `null` always uses the fallback.
   */
  readonly randomUUID?: (() => string) | null;
  /** Clock for the fallback, in epoch milliseconds. Default `Date.now`. */
  readonly now?: () => number;
  /** Random number in [0, 1) for the fallback suffix. Default `Math.random`. */
  readonly random?: () => number;
}

interface CryptoLike {
  randomUUID?: unknown;
}

/** `globalThis.crypto.randomUUID`, bound to its object, or undefined when the runtime lacks it. */
function runtimeRandomUUID(): (() => string) | undefined {
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto;
  const randomUUID = crypto?.randomUUID;
  return typeof randomUUID === 'function' ? () => String(randomUUID.call(crypto)) : undefined;
}

/** 2^32: the fallback suffix is a random 32-bit value. */
const SUFFIX_RANGE = 0x1_0000_0000;
/** 36^7 > 2^32, so seven base-36 digits always hold the suffix. */
const SUFFIX_DIGITS = 7;

/**
 * Makes an id generator. Each generator has its own counter, so the fallback ids it returns are
 * unique even when the clock does not move between calls.
 *
 * Fallback ids look like `<time base36>-<counter base36>-<7 random base36 digits>`.
 *
 * @example
 * ```ts
 * const nextId = createIdGenerator({ randomUUID: null, now: () => 0, random: () => 0 });
 * nextId(); // '0-0-0000000'
 * nextId(); // '0-1-0000000'
 * ```
 */
export function createIdGenerator(source: IdSource = {}): () => string {
  const now = source.now ?? Date.now;
  const random = source.random ?? Math.random;
  let counter = 0;
  return () => {
    const randomUUID = source.randomUUID === undefined ? runtimeRandomUUID() : source.randomUUID;
    if (randomUUID) return randomUUID();
    const suffix = Math.floor(random() * SUFFIX_RANGE)
      .toString(36)
      .padStart(SUFFIX_DIGITS, '0');
    const id = `${now().toString(36)}-${counter.toString(36)}-${suffix}`;
    counter++;
    return id;
  };
}

/**
 * Returns a new collision-safe drawing id: `crypto.randomUUID()` when the runtime has it, otherwise a
 * time, per-process counter and random suffix.
 *
 * @example
 * ```ts
 * store.add({ id: createId(), kind: 'horizontal-line', anchors: [{ time, price: 100, yAxisId: 'price' }] });
 * ```
 */
export const createId: () => string = createIdGenerator();
