import type { DrawingDocument } from 'keystone-financial-tools-core';
import { parseStored, type DrawingRepository, type DrawingScope, type RepositoryLoad } from './repository';
import { scopeKey } from './scope';

/**
 * Keeps documents in memory, as JSON text so that what is loaded is always a copy, like with every
 * other repository. For tests and server-side rendering; nothing survives the page.
 *
 * @example
 * ```ts
 * const repository = new MemoryRepository();
 * await repository.save({ symbol: 'AAPL' }, store.toJSON());
 * const { document } = await repository.load({ symbol: 'AAPL' });
 * ```
 */
export class MemoryRepository implements DrawingRepository {
  private readonly items = new Map<string, string>();

  async load(scope: DrawingScope): Promise<RepositoryLoad> {
    const key = scopeKey(scope);
    return parseStored(this.items.get(key) ?? null, key);
  }

  async save(scope: DrawingScope, document: DrawingDocument): Promise<void> {
    this.items.set(scopeKey(scope), JSON.stringify(document));
  }

  async remove(scope: DrawingScope): Promise<void> {
    this.items.delete(scopeKey(scope));
  }
}
